import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient, RunEvent } from "../src/types.js";
import { readRunResult } from "../src/runStore.js";

function mockClient(text: string): CursorClient {
  return {
    singleShot() {
      return {
        chunks: (async function* () { yield text; })(),
        done: Promise.resolve({ text }),
      };
    },
  };
}

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-linear-")); });

describe("createRun (linear input → llm → output)", () => {
  it("runs to completion with succeeded status and final envelope", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: mockClient("BONJOUR"),
      state: {
        schemaVersion: 1,
        nodes: [
          { id: "i", type: "input", value: "hello" },
          { id: "l", type: "llm", prompt: "Translate {{input}}", model: "m", maxTokens: 1, temperature: 0 },
          { id: "o", type: "output", value: null },
        ],
        edges: [
          { from: "i", to: "l" },
          { from: "l", to: "o" },
        ],
      },
    });

    const events: RunEvent[] = [];
    for await (const ev of run.events) events.push(ev);
    const result = await run.done;
    expect(result.status).toBe("succeeded");
    expect(result.finalOutput?.text).toBe("BONJOUR");

    expect(events[0].type).toBe("run_start");
    expect(events.at(-1)?.type).toBe("run_end");
    const order = events.filter((e) => e.type === "node_start").map((e: any) => e.nodeId);
    expect(order).toEqual(["i", "l", "o"]);

    // Persisted to disk
    const persisted = await readRunResult(baseDir, "s1", run.runId);
    expect(persisted.manifest.status).toBe("succeeded");
    expect(persisted.outputs.l.text).toBe("BONJOUR");
  });
});
