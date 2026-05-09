import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "./config.js";
import { createSession } from "./session/index.js";
import type { RunOptions, RunResult } from "./types.js";

/**
 * Thin wrapper around a single-shot {@link createSession}+{@link Session.send}.
 *
 * Preserves the legacy {@link runPrompt} contract that callers (and tests)
 * still depend on:
 *
 * - Synthesizes `{type:"status", phase:"starting"}` BEFORE invoking the agent
 *   and `{type:"status", phase:"done"}` AFTER the run completes. Session does
 *   not emit these on its own.
 * - Drops the multi-turn `user`/`turn_open`/`turn_start`/`turn_end`/`error`
 *   events Session.send produces — the legacy `onEvent` only ever saw
 *   `HarnessEvent`s.
 * - Honors the caller-supplied `cwd` as the per-turn working directory
 *   (via Session's `cwd` override), instead of an isolated session
 *   workspace under `baseDir/sessions/<id>/workspace`.
 * - Re-throws on `failed_to_start` so callers still get `AuthError` /
 *   `NetworkError` / etc. as rejected promises (Session.send catches these
 *   internally and returns a result; runPrompt's contract is to throw).
 *   Mid-stream `HarnessError`s already throw out of `session.send`.
 */
export async function runPrompt(opts: RunOptions): Promise<RunResult> {
  const cfg = resolveConfig(opts);
  const baseDir = cfg.baseDir ?? mkdtempSync(join(tmpdir(), "flow-build-cli-"));

  // Preserve legacy contract: synthesize status:starting before agent run.
  opts.onEvent({ type: "status", phase: "starting" });

  const session = await createSession({
    baseDir,
    title: cfg.prompt.slice(0, 60),
    cwd: cfg.cwd,
    model: cfg.model,
    apiKey: cfg.apiKey,
    ...(opts.logger ? { logger: opts.logger } : {}),
    ...(cfg.retry ? { retry: cfg.retry } : {}),
    ...(opts.plugins ? { plugins: opts.plugins } : {}),
  });
  try {
    const result = await session.send(opts.prompt, {
      ...(opts.signal ? { signal: opts.signal } : {}),
      onEvent: (e) => {
        // Pass through the HarnessEvent subset; non-Harness events
        // (`user`, `turn_*`, `error`) are dropped — the legacy onEvent
        // never saw them.
        if (
          e.type === "text" ||
          e.type === "thinking" ||
          e.type === "tool_start" ||
          e.type === "tool_end" ||
          e.type === "status"
        ) {
          opts.onEvent(e);
        }
      },
    });

    if (result.status === "failed_to_start") {
      // Legacy runPrompt let AuthError/NetworkError/etc. propagate; Session
      // surfaces the original HarnessError on `result.error` so we can
      // rethrow it with the right class.
      throw result.error ?? new Error("agent failed to start");
    }

    // Preserve legacy contract: synthesize status:done after run.
    opts.onEvent({ type: "status", phase: "done" });

    const status: RunResult["status"] =
      result.status === "completed"
        ? "completed"
        : result.status === "cancelled"
          ? "cancelled"
          : "failed";
    return {
      status,
      finalText: result.finalText,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  } finally {
    await session.close();
  }
}
