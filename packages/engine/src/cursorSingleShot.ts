import { Agent } from "@cursor/sdk";
import type { CursorClient } from "./types.js";

export type MakeCursorClientOptions = {
  /**
   * Cursor API key. Falls back to process.env.CURSOR_API_KEY at call time
   * if omitted. Required by the SDK to route to cloud agents — without it
   * the SDK falls back to local mode and silently rejects with status=ERROR.
   */
  apiKey?: string;
};

export function makeCursorClient(clientOpts: MakeCursorClientOptions = {}): CursorClient {
  return {
    singleShot({ prompt, system, model, maxTokens: _maxTokens, temperature: _temperature, signal, cwd }) {
      const apiKey = clientOpts.apiKey ?? process.env.CURSOR_API_KEY ?? "";
      const queue: string[] = [];
      let resolveDone!: (v: { text: string }) => void;
      let rejectDone!: (e: unknown) => void;
      const done = new Promise<{ text: string }>((res, rej) => {
        resolveDone = res;
        rejectDone = rej;
      });
      // Wrapped in an object to prevent TypeScript control-flow narrowing to
      // `never` when the callback assignment is not visible at the call site.
      const state = {
        textNotifier: null as (() => void) | null,
        finished: false,
      };
      const fullText: string[] = [];

      const chunks: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          while (true) {
            while (queue.length) yield queue.shift()!;
            if (state.finished) return;
            await new Promise<void>((r) => (state.textNotifier = r));
            state.textNotifier = null;
          }
        },
      };

      (async () => {
        try {
          // Mirror the main session's Agent.create call (see
          // packages/core/src/session/session.ts): the SDK requires apiKey
          // for cloud routing and a workspace cwd to initialize. Calling
          // create with only `model` lands in a degenerate state where the
          // run dies with status=ERROR + no message in ~400ms.
          if (!apiKey) {
            throw new Error(
              "CURSOR_API_KEY is not set. Add it to .env / .env.local and restart the app — the Cursor SDK cannot route LLM nodes without it.",
            );
          }
          const agent = await Agent.create({
            apiKey,
            model: { id: model },
            ...(cwd
              ? {
                  local: {
                    cwd,
                    settingSources: ["project", "user"] as Array<"project" | "user">,
                  },
                }
              : {}),
          });
          // Build the full prompt, prepending the system prompt if provided.
          // The Cursor SDK send() takes a plain string; system context is
          // injected inline because SendOptions has no systemPrompt field.
          const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
          // maxTokens, temperature, and signal are not supported by SendOptions;
          // they are accepted in the public CursorClient interface for
          // future adapters or SDK updates but are intentionally unused here.
          const run = await agent.send(fullPrompt);
          if (signal?.aborted) {
            await run.cancel().catch(() => {});
            agent.close();
            state.finished = true;
            state.textNotifier?.();
            resolveDone({ text: fullText.join("") });
            return;
          }
          let sawErrorStatus = false;
          let lastStatusMessage: string | undefined;
          let lastStatus: string | undefined;
          for await (const ev of run.stream()) {
            if (signal?.aborted) {
              await run.cancel().catch(() => {});
              break;
            }
            const evType = (ev as { type?: string }).type;
            // Cursor SDK emits SDKMessage events. SDKAssistantMessage has
            // type "assistant" with message.content[] of TextBlock | ToolUseBlock.
            if (evType === "assistant") {
              const content = (
                ev as {
                  message?: { content?: Array<{ type?: string; text?: string }> };
                }
              ).message?.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (
                    block.type === "text" &&
                    typeof block.text === "string" &&
                    block.text.length > 0
                  ) {
                    queue.push(block.text);
                    fullText.push(block.text);
                    state.textNotifier?.();
                  }
                }
              }
            } else if (evType === "status") {
              const s = ev as { status?: string; message?: string };
              if (typeof s.status === "string") lastStatus = s.status;
              if (typeof s.message === "string" && s.message.length > 0) {
                lastStatusMessage = s.message;
              }
              if (s.status === "ERROR") sawErrorStatus = true;
            }
          }

          // Drain richer error info before closing the agent. SDKStatusMessage
          // only carries `status` + optional `message`; the actual error reason
          // (e.g. auth, model gating, content policy) lives on the Run/RunResult
          // surfaced by `run.wait()` / `run.result`. Failures here must not
          // mask the original status=ERROR — we just enrich the message.
          let runResultText: string | undefined;
          let runResultStatus: string | undefined;
          if (sawErrorStatus || fullText.length === 0) {
            try {
              const r = await run.wait();
              runResultStatus = r.status;
              if (typeof r.result === "string" && r.result.length > 0) {
                runResultText = r.result;
              }
            } catch (waitErr) {
              const m = waitErr instanceof Error ? waitErr.message : String(waitErr);
              runResultText = `run.wait() threw: ${m}`;
            }
            if (!runResultText && typeof run.result === "string" && run.result.length > 0) {
              runResultText = run.result;
            }
          }

          agent.close();
          state.finished = true;
          state.textNotifier?.();
          if (sawErrorStatus) {
            const parts = [
              "Cursor SDK reported status=ERROR",
              `model=${JSON.stringify(model)}`,
              lastStatus ? `lastStatus=${lastStatus}` : undefined,
              lastStatusMessage ? `statusMessage=${lastStatusMessage}` : undefined,
              runResultStatus ? `runResultStatus=${runResultStatus}` : undefined,
              runResultText ? `runResult=${runResultText.slice(0, 500)}` : undefined,
            ].filter(Boolean);
            rejectDone(new Error(`cursor stream error: ${parts.join(" | ")}`));
            return;
          }
          resolveDone({ text: fullText.join("") });
        } catch (e) {
          state.finished = true;
          state.textNotifier?.();
          rejectDone(e);
        }
      })();

      return { chunks, done };
    },
  };
}
