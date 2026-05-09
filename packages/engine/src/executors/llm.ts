import type { Node } from "@flow-build/flowbuilder";
import type { CursorClient, Envelope } from "../types.js";
import { substitute } from "../template.js";
import { EngineError } from "../errors.js";

export type ExecuteLlmOpts = {
  node: Extract<Node, { type: "llm" }>;
  input: Envelope;
  cursorClient: CursorClient;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
};

const FENCED_JSON = /```json\s*\n([\s\S]*?)\n```/;

export async function executeLlm(opts: ExecuteLlmOpts): Promise<Envelope> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = opts.node as any;
  const prompt = substitute(node.prompt, opts.input);
  const call = opts.cursorClient.singleShot({
    prompt,
    ...(node.systemPrompt ? { system: node.systemPrompt } : {}),
    model: node.model,
    maxTokens: node.maxTokens,
    temperature: node.temperature,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  let collected = "";
  for await (const chunk of call.chunks) {
    collected += chunk;
    opts.onChunk(chunk);
  }
  let final: { text: string };
  if (opts.signal) {
    const signal = opts.signal;
    const abortPromise = new Promise<never>((_, rej) => {
      const onAbort = () => rej(new Error("cancelled"));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    final = await Promise.race([call.done, abortPromise]);
  } else {
    final = await call.done;
  }
  const text = final.text !== "" ? final.text : collected;

  if (text === "") {
    throw new EngineError(
      "LLM_EMPTY_OUTPUT",
      `LLM node "${node.id}" produced no text. Check model id "${node.model}" is valid (e.g. claude-4.6-sonnet, claude-4.7-opus, composer-2) and that CURSOR_API_KEY is set.`,
    );
  }

  const env: Envelope = { text };
  const m = text.match(FENCED_JSON);
  if (m) {
    try {
      env.data = JSON.parse(m[1]!);
    } catch {
      // best-effort
    }
  }
  return env;
}
