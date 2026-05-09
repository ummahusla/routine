import { describe, it, expect } from "vitest";
import { reduce } from "./reducer.js";
import type { LineEnvelope } from "./types.js";

const env = (e: Omit<LineEnvelope, "v" | "ts">): LineEnvelope =>
  ({ v: 1, ts: "2026-05-09T10:00:00Z", ...e }) as LineEnvelope;

describe("reduce", () => {
  it("returns [] for empty events", () => {
    expect(reduce([])).toEqual([]);
  });

  it("groups text deltas + tool calls under a single turn", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "hi" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "turn_start", turnId: "T1", model: "m", runId: "r1", agentId: "a1" }),
      env({ kind: "text", turnId: "T1", delta: "hello " }),
      env({ kind: "tool_start", turnId: "T1", callId: "c1", name: "shell", args: { cmd: "ls" } }),
      env({ kind: "tool_end", turnId: "T1", callId: "c1", name: "shell", ok: true, args: { cmd: "ls" }, result: "a\nb" }),
      env({ kind: "text", turnId: "T1", delta: "world" }),
      env({ kind: "turn_end", turnId: "T1", status: "completed", durationMs: 1000 }),
    ];
    const out = reduce(events);
    expect(out).toHaveLength(1);
    expect(out[0]!.user.text).toBe("hi");
    expect(out[0]!.assistant.textBlocks).toEqual(["hello ", "world"]);
    expect(out[0]!.assistant.toolCalls).toEqual([
      { callId: "c1", name: "shell", args: { cmd: "ls" }, ok: true, result: "a\nb" },
    ]);
    expect(out[0]!.status).toBe("completed");
  });

  it("marks turn_open without turn_end as interrupted", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "hi" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "turn_start", turnId: "T1", model: "m", runId: "r1", agentId: "a1" }),
      env({ kind: "text", turnId: "T1", delta: "partial" }),
    ];
    const out = reduce(events);
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe("interrupted");
  });

  it("marks user-only (no turn_open) as interrupted too", () => {
    const events: LineEnvelope[] = [env({ kind: "user", turnId: "T1", text: "hi" })];
    const out = reduce(events);
    expect(out[0]!.status).toBe("interrupted");
  });

  it("preserves multiple turns in order", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "first" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "turn_start", turnId: "T1", model: "m", runId: "r1", agentId: "a1" }),
      env({ kind: "text", turnId: "T1", delta: "ok1" }),
      env({ kind: "turn_end", turnId: "T1", status: "completed", durationMs: 1 }),
      env({ kind: "user", turnId: "T2", text: "second" }),
      env({ kind: "turn_open", turnId: "T2" }),
      env({ kind: "turn_start", turnId: "T2", model: "m", runId: "r2", agentId: "a2" }),
      env({ kind: "text", turnId: "T2", delta: "ok2" }),
      env({ kind: "turn_end", turnId: "T2", status: "completed", durationMs: 2 }),
    ];
    const out = reduce(events);
    expect(out.map((t) => t.turnId)).toEqual(["T1", "T2"]);
  });

  it("propagates failed_to_start status", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "hi" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "error", turnId: "T1", message: "AuthError", code: "AUTH" }),
      env({ kind: "turn_end", turnId: "T1", status: "failed_to_start", durationMs: 5 }),
    ];
    const out = reduce(events);
    expect(out[0]!.status).toBe("failed_to_start");
  });
});
