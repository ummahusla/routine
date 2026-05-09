import { describe, it, expect } from "vitest";
import { summarizeNodes } from "../src/runSummary.js";
import type { RunEvent } from "../src/types.js";

describe("summarizeNodes", () => {
  it("returns [] for empty events", () => {
    expect(summarizeNodes([])).toEqual([]);
  });

  it("marks node running on node_start, done on node_end", () => {
    const events: RunEvent[] = [
      { type: "run_start", runId: "r", sessionId: "s", startedAt: "t0" },
      { type: "node_start", runId: "r", nodeId: "n1", nodeType: "merge", at: "t1" },
      { type: "node_end", runId: "r", nodeId: "n1", status: "done", at: "t2" },
    ];
    const out = summarizeNodes(events);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      nodeId: "n1",
      nodeType: "merge",
      status: "done",
      startedAt: "t1",
      endedAt: "t2",
    });
  });

  it("preserves order of first appearance", () => {
    const events: RunEvent[] = [
      { type: "node_start", runId: "r", nodeId: "n1", nodeType: "input", at: "t1" },
      { type: "node_start", runId: "r", nodeId: "n2", nodeType: "llm", at: "t2" },
      { type: "node_end", runId: "r", nodeId: "n1", status: "done", at: "t3" },
    ];
    expect(summarizeNodes(events).map((n) => n.nodeId)).toEqual(["n1", "n2"]);
  });

  it("counts node_text chunks", () => {
    const events: RunEvent[] = [
      { type: "node_start", runId: "r", nodeId: "n1", nodeType: "llm", at: "t1" },
      { type: "node_text", runId: "r", nodeId: "n1", chunk: "a" },
      { type: "node_text", runId: "r", nodeId: "n1", chunk: "b" },
    ];
    expect(summarizeNodes(events)[0]?.textChunks).toBe(2);
  });

  it("propagates error on node_end status=error", () => {
    const events: RunEvent[] = [
      { type: "node_start", runId: "r", nodeId: "n1", nodeType: "llm", at: "t1" },
      { type: "node_end", runId: "r", nodeId: "n1", status: "error", error: "boom", at: "t2" },
    ];
    const out = summarizeNodes(events);
    expect(out[0]?.status).toBe("error");
    expect(out[0]?.error).toBe("boom");
  });

  it("shows in-flight node as running with no endedAt", () => {
    const events: RunEvent[] = [
      { type: "node_start", runId: "r", nodeId: "n1", nodeType: "llm", at: "t1" },
    ];
    const out = summarizeNodes(events);
    expect(out[0]?.status).toBe("running");
    expect(out[0]?.endedAt).toBeUndefined();
  });
});
