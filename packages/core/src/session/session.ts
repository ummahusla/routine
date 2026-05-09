import { Agent } from "@cursor/sdk";
import { type HarnessError, mapToHarnessError } from "../errors.js";
import { normalize } from "../normalizer.js";
import { withRetry } from "../retry.js";
import { PluginHost } from "../plugin/host.js";
import type {
  HarnessEvent,
  Logger,
  Plugin,
  RetryOptions,
  RuntimeContext,
  ToolCallSnapshot,
} from "../types.js";
import {
  appendEvent,
  chatPath,
  readChatMeta,
  readEvents,
  sessionDir,
  workspaceDir,
  writeChatMeta,
  lockPath,
} from "./store.js";
import { reduce } from "./reducer.js";
import { buildReplay } from "./replay.js";
import { ulid } from "./ulid.js";
import { acquireLock, releaseLock } from "./lockfile.js";
import { SessionBusyError } from "./errors.js";
import type {
  LineEnvelope,
  SendTurnOptions,
  SessionEvent,
  SessionMetadata,
  TurnResult,
  TurnStatus,
  Usage,
} from "./types.js";

export type SessionInternalOptions = {
  baseDir: string;
  sessionId: string;
  /**
   * Optional override for the per-turn working directory.
   *
   * When unset, the workspace lives at `baseDir/sessions/<id>/workspace`
   * (the default for a multi-turn Session). When set, that directory is
   * used as both `RuntimeContext.cwd` for plugins and the Cursor SDK's
   * `local.cwd`. The legacy `runPrompt` wrapper uses this to honor the
   * caller-supplied `cwd` instead of an isolated session workspace.
   */
  cwd?: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};

type LiveRun = {
  agent: Awaited<ReturnType<typeof Agent.create>>;
  run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>;
};

export class Session {
  readonly sessionId: string;
  readonly baseDir: string;
  readonly sessionDir: string;
  readonly workspaceDir: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly logger: Logger;
  private readonly retry: Required<RetryOptions>;
  private readonly plugins: Plugin[];
  private activeTurn:
    | { abort: AbortController; runCancel?: () => Promise<void> }
    | undefined;
  private closed = false;
  /**
   * Last `HarnessError` produced by a `failed_to_start` turn. The legacy
   * `runPrompt` wrapper reads this to re-throw the original error class
   * (Session.send catches and returns a result instead of throwing).
   */
  lastError: HarnessError | undefined;

  constructor(opts: SessionInternalOptions) {
    this.baseDir = opts.baseDir;
    this.sessionId = opts.sessionId;
    this.sessionDir = sessionDir(opts.baseDir, opts.sessionId);
    this.workspaceDir = opts.cwd ?? workspaceDir(opts.baseDir, opts.sessionId);
    const meta = readChatMeta(chatPath(opts.baseDir, opts.sessionId));
    this.model = opts.model ?? meta.model;
    this.apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY ?? "";
    this.logger = opts.logger ?? { warn: () => {} };
    this.retry = {
      attempts: opts.retry?.attempts ?? 3,
      baseDelayMs: opts.retry?.baseDelayMs ?? 200,
    };
    this.plugins = opts.plugins ?? [];
    acquireLock(lockPath(opts.baseDir, opts.sessionId), opts.sessionId);
  }

  async send(prompt: string, opts: SendTurnOptions = {}): Promise<TurnResult> {
    if (this.activeTurn) throw new SessionBusyError(this.sessionId);
    // Clear any error captured by a prior turn so callers can read
    // `lastError` after this send to detect *this* turn's outcome.
    this.lastError = undefined;
    const abort = new AbortController();
    if (opts.signal) {
      const onAbort = (): void => abort.abort();
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    this.activeTurn = { abort };
    const turnId = ulid();
    const startedAt = Date.now();
    const onEvent = opts.onEvent ?? ((): void => {});

    const ts = (): string => new Date().toISOString();

    const emit = (line: LineEnvelope, ev: SessionEvent | undefined): void => {
      appendEvent({ baseDir: this.baseDir, sessionId: this.sessionId, event: line });
      if (ev) onEvent(ev);
    };

    emit(
      { kind: "user", v: 1, ts: ts(), turnId, text: prompt },
      { type: "user", turnId, text: prompt },
    );
    emit(
      { kind: "turn_open", v: 1, ts: ts(), turnId },
      { type: "turn_open", turnId },
    );

    let finalText = "";
    let status: TurnStatus = "completed";
    let usage: Usage | undefined;

    const host = new PluginHost(this.plugins);
    const ctx: RuntimeContext = {
      cwd: this.workspaceDir,
      model: this.model,
      runId: turnId,
      signal: abort.signal,
      logger: this.logger,
      state: new Map(),
    };

    const persistEvent = (ev: HarnessEvent): void => {
      switch (ev.type) {
        case "text":
          emit({ kind: "text", v: 1, ts: ts(), turnId, delta: ev.delta }, undefined);
          return;
        case "thinking":
          emit({ kind: "thinking", v: 1, ts: ts(), turnId, delta: ev.delta }, undefined);
          return;
        case "tool_start":
          emit(
            {
              kind: "tool_start",
              v: 1,
              ts: ts(),
              turnId,
              callId: ev.callId,
              name: ev.name,
              ...(ev.args !== undefined ? { args: ev.args } : {}),
            },
            undefined,
          );
          return;
        case "tool_end":
          emit(
            {
              kind: "tool_end",
              v: 1,
              ts: ts(),
              turnId,
              callId: ev.callId,
              name: ev.name,
              ok: ev.ok,
              ...(ev.args !== undefined ? { args: ev.args } : {}),
              ...(ev.result !== undefined ? { result: ev.result } : {}),
            },
            undefined,
          );
          return;
        case "status":
          emit(
            { kind: "status", v: 1, ts: ts(), turnId, phase: ev.phase },
            undefined,
          );
          return;
      }
    };

    try {
      // Per-turn plugin lifecycle.
      await host.runPreRun(ctx);
      await host.runSystemPrompt(ctx);
      const pluginPrefix = await host.runPromptPrefix(ctx);
      const mcpServers = await host.runProvideMcpServers(ctx);

      const priorTurns = reduce(
        readEvents({ baseDir: this.baseDir, sessionId: this.sessionId }),
      );
      // The just-written user/turn_open turn has no turn_end → reduce gives it
      // status "interrupted", which buildReplay's filter excludes.
      const replayPrefix = buildReplay(priorTurns);

      const finalPrompt = [pluginPrefix, replayPrefix, `User: ${prompt}`]
        .filter((s) => typeof s === "string" && s.length > 0)
        .join("\n\n");

      let live: LiveRun;
      try {
        live = await withRetry<LiveRun>(
          async () => {
            let agent;
            try {
              agent = await Agent.create({
                apiKey: this.apiKey,
                model: { id: this.model },
                local: { cwd: this.workspaceDir, settingSources: ["project", "user"] },
                ...(mcpServers && Object.keys(mcpServers).length > 0
                  ? { mcpServers }
                  : {}),
              });
            } catch (e) {
              throw mapToHarnessError(e);
            }
            try {
              const run = await agent.send(finalPrompt);
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
            attempts: this.retry.attempts,
            baseDelayMs: this.retry.baseDelayMs,
            signal: abort.signal,
            logger: this.logger,
          },
        );
      } catch (e) {
        // mapToHarnessError has already run inside withRetry's body; e is a
        // HarnessError. Stash it so callers like runPrompt can re-throw
        // the original error class instead of just the persisted message.
        this.lastError = mapToHarnessError(e);
        const message = (e as Error).message ?? String(e);
        const code = (e as { code?: string }).code;
        emit(
          { kind: "error", v: 1, ts: ts(), turnId, message, ...(code ? { code } : {}) },
          { type: "error", turnId, message, ...(code ? { code } : {}) },
        );
        emit(
          {
            kind: "turn_end",
            v: 1,
            ts: ts(),
            turnId,
            status: "failed_to_start",
            durationMs: Date.now() - startedAt,
          },
          {
            type: "turn_end",
            turnId,
            status: "failed_to_start",
            durationMs: Date.now() - startedAt,
          },
        );
        await this.updateMeta({ turnStatus: "failed_to_start" });
        return { turnId, status: "failed_to_start", finalText: "" };
      }

      this.activeTurn.runCancel = (): Promise<void> =>
        Promise.resolve(live.run.cancel()).then(() => undefined);
      emit(
        {
          kind: "turn_start",
          v: 1,
          ts: ts(),
          turnId,
          model: this.model,
          runId: turnId,
          agentId: live.agent.agentId,
        },
        {
          type: "turn_start",
          turnId,
          model: this.model,
          agentId: live.agent.agentId,
        },
      );

      let midStreamError: HarnessError | undefined;
      try {
        try {
          for await (const msg of live.run.stream()) {
            if (abort.signal.aborted) {
              // Cancel the live run, then break immediately. Legacy
              // runPrompt did the same — no further events are emitted
              // after the caller has aborted.
              if (this.activeTurn?.runCancel) {
                await live.run.cancel();
                delete this.activeTurn.runCancel;
              }
              status = "cancelled";
              break;
            }
            const events = normalize(msg, this.logger);
            for (const e of events) {
              const out = host.intercept(e, ctx);
              for (const e2 of out) {
                persistEvent(e2);
                if (e2.type === "text") finalText += e2.delta;
                onEvent(e2);
                if (e2.type === "tool_start" || e2.type === "tool_end") {
                  const snap: ToolCallSnapshot = {
                    callId: e2.callId,
                    name: e2.name,
                    status:
                      e2.type === "tool_start"
                        ? "running"
                        : e2.ok
                          ? "completed"
                          : "error",
                    ...(e2.args !== undefined ? { args: e2.args } : {}),
                    ...(e2.type === "tool_end" && e2.result !== undefined
                      ? { result: e2.result }
                      : {}),
                  };
                  host.fireToolCall(snap, ctx);
                }
              }
            }
          }
        } catch (e) {
          // Mid-stream errors must surface as HarnessError instances so
          // callers (and runPrompt's tests) can `instanceof NetworkError`
          // them. Normalize here, defer the throw until after agent.close()
          // and the persisted turn_end emit.
          midStreamError = mapToHarnessError(e);
          status = "failed";
        }
        if (!midStreamError) {
          // Drain to terminal with timeout. For cancelled runs we still
          // race wait() to harvest a usage value if the SDK provides one.
          const wait = await Promise.race([
            live.run.wait(),
            new Promise<{ status?: string; usage?: Usage }>((resolve) =>
              setTimeout(
                () => resolve({ status: abort.signal.aborted ? "cancelled" : "completed" }),
                5_000,
              ),
            ),
          ]);
          const waitStatus = (wait as { status?: string }).status?.toLowerCase();
          if (status !== "cancelled") {
            if (waitStatus === "cancelled") status = "cancelled";
            else if (waitStatus && waitStatus !== "completed" && waitStatus !== "finished") {
              status = "failed";
            }
          }
          const u = (wait as { usage?: Usage }).usage;
          if (u) usage = u;
        }
      } finally {
        try {
          await live.agent.close();
        } catch {
          /* ignore disposal errors */
        }
      }
      if (midStreamError) {
        this.lastError = midStreamError;
        // Persist an error event so the JSONL log captures the failure,
        // matching the failed_to_start path. The outer finally will still
        // emit turn_end below before the rethrow propagates.
        const message = midStreamError.message;
        emit(
          { kind: "error", v: 1, ts: ts(), turnId, message },
          { type: "error", turnId, message },
        );
      }
    } finally {
      try {
        await host.cleanup(ctx);
      } catch (e) {
        this.logger.warn("plugin cleanup threw", { cause: String(e) });
      }
      this.activeTurn = undefined;
    }

    emit(
      {
        kind: "turn_end",
        v: 1,
        ts: ts(),
        turnId,
        status,
        durationMs: Date.now() - startedAt,
        ...(usage ? { usage } : {}),
      },
      {
        type: "turn_end",
        turnId,
        status,
        durationMs: Date.now() - startedAt,
        ...(usage ? { usage } : {}),
      },
    );
    await this.updateMeta({ turnStatus: status, ...(usage ? { usage } : {}) });

    if (this.lastError && status === "failed") {
      // Mid-stream HarnessError captured above. Persist + emit are done;
      // surface the original error class to the caller so they can
      // `instanceof` it (legacy runPrompt contract).
      throw this.lastError;
    }

    return { turnId, status, finalText, ...(usage ? { usage } : {}) };
  }

  async cancel(): Promise<void> {
    if (!this.activeTurn) return;
    this.activeTurn.abort.abort();
    if (this.activeTurn.runCancel) {
      try {
        await this.activeTurn.runCancel();
      } catch {
        /* ignore */
      }
    }
  }

  async turns(): Promise<ReturnType<typeof reduce>> {
    return reduce(readEvents({ baseDir: this.baseDir, sessionId: this.sessionId }));
  }

  async metadata(): Promise<SessionMetadata> {
    return readChatMeta(chatPath(this.baseDir, this.sessionId));
  }

  async rename(title: string): Promise<void> {
    const meta = readChatMeta(chatPath(this.baseDir, this.sessionId));
    meta.title = title;
    meta.updatedAt = new Date().toISOString();
    writeChatMeta({ baseDir: this.baseDir, sessionId: this.sessionId, meta });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.activeTurn) await this.cancel();
    } finally {
      releaseLock(lockPath(this.baseDir, this.sessionId));
    }
  }

  private async updateMeta(args: {
    turnStatus: TurnStatus;
    usage?: Usage;
  }): Promise<void> {
    const meta = readChatMeta(chatPath(this.baseDir, this.sessionId));
    meta.turnCount += 1;
    meta.updatedAt = new Date().toISOString();
    meta.lastStatus = args.turnStatus;
    if (args.usage) {
      meta.totalUsage.inputTokens += args.usage.inputTokens;
      meta.totalUsage.outputTokens += args.usage.outputTokens;
    }
    if (meta.turnCount === 1) {
      // derive title from first user message if title is "untitled"
      if (meta.title === "untitled") {
        const first = (await this.turns())[0];
        if (first) meta.title = first.user.text.slice(0, 60);
      }
    }
    writeChatMeta({ baseDir: this.baseDir, sessionId: this.sessionId, meta });
  }
}
