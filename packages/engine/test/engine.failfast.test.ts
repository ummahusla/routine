import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient } from "../src/types.js";

const throwingClient: CursorClient = {
  singleShot() {
    return {
      chunks: (async function* () { /* never yields */ })(),
      done: Promise.reject(new Error("boom")),
    };
  },
};

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-failfast-")); });

describe("createRun fail-fast", () => {
  it("middle node errors → downstream skipped, run failed", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: throwingClient,
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
    const events = [];
    for await (const ev of run.events) events.push(ev);
    const ends = events.filter((e: any) => e.type === "node_end") as any[];
    expect(ends.find((e) => e.nodeId === "l")?.status).toBe("error");
    expect(ends.find((e) => e.nodeId === "o")?.status).toBe("skipped");
    const result = await run.done;
    expect(result.status).toBe("failed");
    expect(result.error).toContain("boom");
  });
});
