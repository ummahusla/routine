import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunRegistry } from "./runRegistry.js";
import type { Run, RunEvent, CursorClient } from "@flow-build/engine";

function fakeRun(runId: string, events: RunEvent[]): Run {
  let i = 0;
  const iter: AsyncIterable<RunEvent> = {
    async *[Symbol.asyncIterator]() {
      while (i < events.length) yield events[i++];
    },
  };
  return {
    runId,
    sessionId: "s1",
    status: "running",
    events: iter,
    cancel: async () => {},
    done: Promise.resolve({ status: "succeeded" }),
  };
}

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "registry-")); });

describe("RunRegistry", () => {
  it("start returns a runId, removes run from map after run_end", async () => {
    const reg = new RunRegistry({
      baseDir,
      cursorClient: {} as CursorClient,
      loadState: async () => ({ schemaVersion: 1, nodes: [], edges: [] }),
      makeRun: () => fakeRun("R1", [
        { type: "run_start", runId: "R1", sessionId: "s1", startedAt: "t" },
        { type: "run_end", runId: "R1", status: "succeeded", at: "t2" },
      ]),
    });
    const runId = await reg.start("s1");
    expect(runId).toBe("R1");
    // give the pump a tick to drain
    await new Promise((r) => setTimeout(r, 20));
    expect(reg.has("R1")).toBe(false);
  });

  it("waitForRunEnd resolves on run_end", async () => {
    const reg = new RunRegistry({
      baseDir,
      cursorClient: {} as CursorClient,
      loadState: async () => ({ schemaVersion: 1, nodes: [], edges: [] }),
      makeRun: () => fakeRun("R2", [
        { type: "run_start", runId: "R2", sessionId: "s1", startedAt: "t" },
        { type: "run_end", runId: "R2", status: "succeeded", at: "t2" },
      ]),
    });
    const runId = await reg.start("s1");
    await reg.waitForRunEnd(runId, 1000);
    expect(reg.has(runId)).toBe(false);
  });

  it("waitForRunEnd resolves on timeout when run never ends", async () => {
    const reg = new RunRegistry({
      baseDir,
      cursorClient: {} as CursorClient,
      loadState: async () => ({ schemaVersion: 1, nodes: [], edges: [] }),
      makeRun: () => {
        const events: AsyncIterable<RunEvent> = {
          async *[Symbol.asyncIterator]() {
            // hang
            await new Promise(() => {});
          },
        };
        return {
          runId: "R3",
          sessionId: "s1",
          status: "running",
          events,
          cancel: async () => {},
          done: new Promise(() => {}),
        };
      },
    });
    const runId = await reg.start("s1");
    const before = Date.now();
    await reg.waitForRunEnd(runId, 100);
    const elapsed = Date.now() - before;
    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(elapsed).toBeLessThan(500);
  });
});
