import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient } from "../src/types.js";

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-fanin-")); });

const passthroughClient: CursorClient = {
  singleShot({ prompt }) {
    return {
      chunks: (async function* () { yield prompt; })(),
      done: Promise.resolve({ text: prompt }),
    };
  },
};

describe("createRun fan-in", () => {
  it("two upstreams concat .text in topo order before downstream runs", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: passthroughClient,
      state: {
        schemaVersion: 1,
        nodes: [
          { id: "a", type: "input", value: "ALPHA" },
          { id: "b", type: "input", value: "BETA" },
          { id: "l", type: "llm", prompt: "{{input}}", model: "m", maxTokens: 1, temperature: 0 },
          { id: "o", type: "output", value: null },
        ],
        edges: [
          { from: "a", to: "l" },
          { from: "b", to: "l" },
          { from: "l", to: "o" },
        ],
      },
    });
    for await (const _ of run.events) { /* drain */ }
    const result = await run.done;
    expect(result.status).toBe("succeeded");
    // The LLM saw concat of upstream text in topo order ("ALPHA" then "BETA")
    expect(result.finalOutput?.text).toBe("ALPHABETA");
  });
});
