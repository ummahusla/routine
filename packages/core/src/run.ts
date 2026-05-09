import { randomUUID } from "node:crypto";
import { Agent } from "@cursor/sdk";
import { resolveConfig } from "./config.js";
import { mapToHarnessError } from "./errors.js";
import { normalize } from "./normalizer.js";
import { withRetry } from "./retry.js";
import { PluginHost } from "./plugin/host.js";
import type {
  Logger,
  RunOptions,
  RunResult,
  RunStatus,
  RuntimeContext,
  ToolCallSnapshot,
} from "./types.js";

type LiveRun = {
  agent: Awaited<ReturnType<typeof Agent.create>>;
  run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>;
};

async function startWithRetry(
  cfg: ReturnType<typeof resolveConfig>,
  prompt: string,
  signal: AbortSignal | undefined,
  logger: Logger | undefined,
): Promise<LiveRun> {
  return withRetry<LiveRun>(
    async () => {
      let agent;
      try {
        agent = await Agent.create({
          apiKey: cfg.apiKey,
          model: { id: cfg.model },
          local: { cwd: cfg.cwd, settingSources: ["project", "user"] },
        });
      } catch (e) {
        throw mapToHarnessError(e);
      }
      try {
        const run = await agent.send(prompt);
        return { agent, run };
      } catch (e) {
        try {
          await agent.close();
        } catch {
          /* ignore disposal failure during retry path */
        }
        throw mapToHarnessError(e);
      }
    },
    {
      attempts: cfg.retry.attempts,
      baseDelayMs: cfg.retry.baseDelayMs,
      ...(signal ? { signal } : {}),
      ...(logger ? { logger } : {}),
    },
  );
}

export async function runPrompt(opts: RunOptions): Promise<RunResult> {
  const cfg = resolveConfig(opts);
  const { signal, logger } = opts;
  const plugins = opts.plugins ?? [];
  const host = new PluginHost(plugins);

  const ctx: RuntimeContext = {
    cwd: cfg.cwd,
    model: cfg.model,
    runId: randomUUID(),
    signal: signal ?? new AbortController().signal,
    logger: logger ?? { warn: () => {} },
    state: new Map(),
  };

  opts.onEvent({ type: "status", phase: "starting" });

  let finalText = "";
  let status: RunStatus = "completed";
  let usage: RunResult["usage"];

  try {
    await host.runPreRun(ctx);
    await host.runSystemPrompt(ctx);
    const prefix = await host.runPromptPrefix(ctx);
    const finalPrompt = prefix.length > 0 ? `${prefix}\n\n${cfg.prompt}` : cfg.prompt;

    const live = await startWithRetry(cfg, finalPrompt, signal, logger);

    try {
      for await (const msg of live.run.stream()) {
        if (signal?.aborted) {
          await live.run.cancel();
          status = "cancelled";
          break;
        }
        const events = normalize(msg, logger);
        for (const e of events) {
          const out = host.intercept(e, ctx);
          for (const e2 of out) {
            if (e2.type === "text") finalText += e2.delta;
            opts.onEvent(e2);
            if (e2.type === "tool_start") {
              const snap: ToolCallSnapshot = {
                callId: e2.callId,
                name: e2.name,
                status: "running",
                ...(e2.args !== undefined ? { args: e2.args } : {}),
              };
              host.fireToolCall(snap, ctx);
            }
            if (e2.type === "tool_end") {
              const snap: ToolCallSnapshot = {
                callId: e2.callId,
                name: e2.name,
                status: e2.ok ? "completed" : "error",
                ...(e2.args !== undefined ? { args: e2.args } : {}),
              };
              host.fireToolCall(snap, ctx);
            }
          }
        }
      }
      if (status !== "cancelled") {
        const wait = await live.run.wait();
        const waitStatus = (wait as { status?: string }).status?.toLowerCase();
        if (waitStatus === "cancelled") status = "cancelled";
        else if (waitStatus && waitStatus !== "completed" && waitStatus !== "finished") {
          status = "failed";
        }
        const u = (wait as { usage?: { inputTokens: number; outputTokens: number } }).usage;
        if (u) usage = u;
      }
    } catch (e) {
      throw mapToHarnessError(e);
    } finally {
      try {
        await live.agent.close();
      } catch {
        /* swallow disposal errors; primary error already in flight if any */
      }
    }

    opts.onEvent({ type: "status", phase: "done" });
    const result: RunResult = { status, finalText };
    if (usage) result.usage = usage;
    return result;
  } finally {
    await host.cleanup(ctx);
  }
}
