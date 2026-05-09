import { Agent } from "@cursor/sdk";
import type { CursorClient } from "./types.js";

export function makeCursorClient(): CursorClient {
  return {
    singleShot({ prompt, system, model, maxTokens: _maxTokens, temperature: _temperature, signal }) {
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
          const agent = await Agent.create({
            model: { id: model },
            // single-shot: no plugins, no extra tools
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
          for await (const ev of run.stream()) {
            if (signal?.aborted) {
              await run.cancel().catch(() => {});
              break;
            }
            // Cursor SDK emits SDKMessage events. SDKAssistantMessage has
            // type "assistant" with message.content[] of TextBlock | ToolUseBlock.
            // Other event types (tool_call, thinking, status, system, user, task)
            // are skipped — single-shot mode shouldn't produce meaningful ones.
            if ((ev as { type?: string }).type === "assistant") {
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
            }
          }
          agent.close();
          state.finished = true;
          state.textNotifier?.();
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
