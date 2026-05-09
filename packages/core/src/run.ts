import { Agent } from "@cursor/sdk";
import { resolveConfig } from "./config.js";
import { mapToHarnessError } from "./errors.js";
import { normalize } from "./normalizer.js";
import { withRetry } from "./retry.js";
import type { HarnessEvent, Logger, RunOptions, RunResult, RunStatus } from "./types.js";

type LiveRun = {
  agent: Awaited<ReturnType<typeof Agent.create>>;
  run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>;
};

async function startWithRetry(
  cfg: ReturnType<typeof resolveConfig>,
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
          local: { cwd: cfg.cwd },
        });
      } catch (e) {
        throw mapToHarnessError(e);
      }
      try {
        const run = await agent.send(cfg.prompt);
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

  opts.onEvent({ type: "status", phase: "starting" });

  const live = await startWithRetry(cfg, signal, logger);
  let finalText = "";
  let status: RunStatus = "completed";
  let usage: RunResult["usage"];

  try {
    for await (const msg of live.run.stream()) {
      if (signal?.aborted) {
        await live.run.cancel();
        status = "cancelled";
        break;
      }
      const events = normalize(msg, logger);
      for (const e of events) {
        if (e.type === "text") finalText += e.delta;
        opts.onEvent(e);
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
}
