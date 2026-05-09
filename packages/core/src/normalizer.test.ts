import { describe, it, expect, vi } from "vitest";
import { normalize } from "./normalizer.js";
import type { Logger } from "./types.js";

const mkLogger = (): Logger & { warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> } => ({
  warn: vi.fn(),
  debug: vi.fn(),
});

describe("normalize known SDKMessage types", () => {
  it("assistant message with text blocks → text events", () => {
    const log = mkLogger();
    const events = normalize(
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "hello " },
            { type: "text", text: "world" },
          ],
        },
      },
      log,
    );
    expect(events).toEqual([
      { type: "text", delta: "hello " },
      { type: "text", delta: "world" },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("assistant non-text blocks are skipped (no warn)", () => {
    const log = mkLogger();
    const events = normalize(
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "x", name: "shell", input: {} },
            { type: "text", text: "hi" },
          ],
        },
      },
      log,
    );
    expect(events).toEqual([{ type: "text", delta: "hi" }]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("thinking message → thinking event", () => {
    const events = normalize({ type: "thinking", text: "pondering..." }, mkLogger());
    expect(events).toEqual([{ type: "thinking", delta: "pondering..." }]);
  });

  it("tool_call running → tool_start", () => {
    const events = normalize(
      { type: "tool_call", call_id: "abc", name: "shell", status: "running" },
      mkLogger(),
    );
    expect(events).toEqual([{ type: "tool_start", name: "shell", callId: "abc" }]);
  });

  it("tool_call completed → tool_end ok=true", () => {
    const events = normalize(
      { type: "tool_call", call_id: "abc", name: "shell", status: "completed" },
      mkLogger(),
    );
    expect(events).toEqual([
      { type: "tool_end", name: "shell", callId: "abc", ok: true },
    ]);
  });

  it("tool_call error → tool_end ok=false", () => {
    const events = normalize(
      { type: "tool_call", call_id: "abc", name: "edit", status: "error" },
      mkLogger(),
    );
    expect(events).toEqual([
      { type: "tool_end", name: "edit", callId: "abc", ok: false },
    ]);
  });

  it("status running → status event running", () => {
    const events = normalize({ type: "status", status: "running" }, mkLogger());
    expect(events).toEqual([{ type: "status", phase: "running" }]);
  });

  it("status completed → status event done", () => {
    const events = normalize({ type: "status", status: "completed" }, mkLogger());
    expect(events).toEqual([{ type: "status", phase: "done" }]);
  });

  it("system message dropped silently", () => {
    const log = mkLogger();
    const events = normalize({ type: "system", model: "composer-2", tools: [] }, log);
    expect(events).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("task message dropped silently", () => {
    const events = normalize({ type: "task", status: "ok", text: "x" }, mkLogger());
    expect(events).toEqual([]);
  });

  it("request message dropped silently", () => {
    const events = normalize({ type: "request", request_id: "r1" }, mkLogger());
    expect(events).toEqual([]);
  });
});

describe("normalize defensive parsing", () => {
  it("unknown type → warn + drop", () => {
    const log = mkLogger();
    const events = normalize({ type: "wat", x: 1 }, log);
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("unknown SDKMessage type", { type: "wat" });
  });

  it("assistant with non-array content → warn + drop entire message", () => {
    const log = mkLogger();
    const events = normalize({ type: "assistant", message: { content: "string" } }, log);
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "assistant",
      field: "message.content",
    });
  });

  it("assistant text block missing text → warn + skip block", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "assistant", message: { content: [{ type: "text" }] } },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "assistant",
      field: "block.text",
    });
  });

  it("thinking missing text → warn + drop", () => {
    const log = mkLogger();
    const events = normalize({ type: "thinking" }, log);
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", { type: "thinking", field: "text" });
  });

  it("tool_call missing name → warn + drop", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "tool_call", call_id: "x", status: "running" },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "tool_call",
      field: "name|call_id",
    });
  });

  it("tool_call missing call_id → warn + drop", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "tool_call", name: "shell", status: "running" },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "tool_call",
      field: "name|call_id",
    });
  });

  it("tool_call unknown status → warn + drop", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "tool_call", name: "shell", call_id: "x", status: "weird" },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("unknown tool_call status", { status: "weird" });
  });

  it("works without a logger argument", () => {
    expect(() => normalize({ type: "wat" })).not.toThrow();
    expect(normalize({ type: "wat" })).toEqual([]);
  });
});

describe("normalize SDK uppercase status values", () => {
  it("status CREATING → starting", () => {
    expect(normalize({ type: "status", status: "CREATING" }, mkLogger())).toEqual([
      { type: "status", phase: "starting" },
    ]);
  });

  it("status RUNNING → running", () => {
    expect(normalize({ type: "status", status: "RUNNING" }, mkLogger())).toEqual([
      { type: "status", phase: "running" },
    ]);
  });

  it("status FINISHED → done", () => {
    expect(normalize({ type: "status", status: "FINISHED" }, mkLogger())).toEqual([
      { type: "status", phase: "done" },
    ]);
  });

  it("status ERROR → done", () => {
    expect(normalize({ type: "status", status: "ERROR" }, mkLogger())).toEqual([
      { type: "status", phase: "done" },
    ]);
  });

  it("status CANCELLED falls through to running (not a known terminal phase)", () => {
    expect(normalize({ type: "status", status: "CANCELLED" }, mkLogger())).toEqual([
      { type: "status", phase: "running" },
    ]);
  });

  it("status EXPIRED → done", () => {
    expect(normalize({ type: "status", status: "EXPIRED" }, mkLogger())).toEqual([
      { type: "status", phase: "done" },
    ]);
  });
});
