import { describe, it, expect, vi } from "vitest";
import { executeLlm } from "../src/executors/llm.js";
import type { CursorClient } from "../src/types.js";

function mockClient(chunks: string[]): { client: CursorClient; calls: any[] } {
  const calls: any[] = [];
  const client: CursorClient = {
    singleShot(opts) {
      calls.push(opts);
      return {
        chunks: (async function* () { for (const c of chunks) yield c; })(),
        done: Promise.resolve({ text: chunks.join("") }),
      };
    },
  };
  return { client, calls };
}

describe("executeLlm", () => {
  it("substitutes {{input}} into prompt and calls client with model/temperature/maxTokens", async () => {
    const { client, calls } = mockClient(["hello"]);
    const onChunk = vi.fn();
    const env = await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "Say hi to {{input}}",
        model: "claude-sonnet-4-6",
        maxTokens: 100,
        temperature: 0.5,
      },
      input: { text: "world" },
      cursorClient: client,
      onChunk,
    });
    expect(env.text).toBe("hello");
    expect(calls[0].prompt).toBe("Say hi to world");
    expect(calls[0].model).toBe("claude-sonnet-4-6");
    expect(calls[0].maxTokens).toBe(100);
    expect(calls[0].temperature).toBe(0.5);
  });

  it("forwards system prompt when set", async () => {
    const { client, calls } = mockClient([""]);
    await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "x", model: "m", maxTokens: 1, temperature: 0,
        systemPrompt: "be terse",
      },
      input: { text: "" },
      cursorClient: client,
      onChunk: () => {},
    });
    expect(calls[0].system).toBe("be terse");
  });

  it("emits each chunk via onChunk", async () => {
    const { client } = mockClient(["a", "b", "c"]);
    const seen: string[] = [];
    await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "x", model: "m", maxTokens: 1, temperature: 0,
      },
      input: { text: "" },
      cursorClient: client,
      onChunk: (c) => seen.push(c),
    });
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("populates envelope.data when completion is fenced JSON", async () => {
    const { client } = mockClient(["```json\n", '{"k":1}', "\n```"]);
    const env = await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "x", model: "m", maxTokens: 1, temperature: 0,
      },
      input: { text: "" },
      cursorClient: client,
      onChunk: () => {},
    });
    expect(env.data).toEqual({ k: 1 });
  });
});
