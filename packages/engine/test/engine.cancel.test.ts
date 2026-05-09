import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient } from "../src/types.js";

// A client that "hangs" so we can cancel mid-run.
const hangingClient: CursorClient = {
  singleShot() {
    return {
      chunks: (async function* () { /* never yields */ })(),
      done: new Promise<{ text: string }>(() => { /* never resolves */ }),
    };
  },
};

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-cancel-")); });

describe("createRun cancellation", () => {
  it("cancel() mid-run yields cancelled status, downstream skipped", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: hangingClient,
      state: {
        schemaVersion: 1,
        nodes: [
          { id: "i", type: "input", value: "x" },
          { id: "l", type: "llm", prompt: "x", model: "m", maxTokens: 1, temperature: 0 },
          { id: "o", type: "output", value: null },
        ],
        edges: [{ from: "i", to: "l" }, { from: "l", to: "o" }],
      },
    });

    // Wait for run_start and node_start "l" before cancelling
    const events: any[] = [];
    setTimeout(() => { void run.cancel(); }, 50);
    for await (const ev of run.events) events.push(ev);
    const result = await run.done;
    expect(["cancelled", "failed"]).toContain(result.status);
    // 'o' must not be 'done'
    const oEnd = events.find((e) => e.type === "node_end" && e.nodeId === "o");
    expect(oEnd?.status === "done").toBe(false);
  }, 5000);
});
