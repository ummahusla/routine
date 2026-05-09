import { describe, it, expect } from "vitest";
import { makeRenderer } from "./render.js";
import type { HarnessEvent } from "@flow-build/core";

function captureWrites() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: { write: (s: string) => stdout.push(s) },
    stderr: { write: (s: string) => stderr.push(s) },
    capturedStdout: () => stdout.join(""),
    capturedStderr: () => stderr.join(""),
  };
}

describe("renderer", () => {
  it("text deltas go to stdout in order", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    const events: HarnessEvent[] = [
      { type: "text", delta: "hello " },
      { type: "text", delta: "world" },
    ];
    events.forEach(render);
    expect(cap.capturedStdout()).toBe("hello world");
  });

  it("status events go to stderr", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "status", phase: "starting" });
    render({ type: "status", phase: "done" });
    expect(cap.capturedStderr()).toContain("[starting]");
    expect(cap.capturedStderr()).toContain("[done]");
    expect(cap.capturedStdout()).toBe("");
  });

  it("tool_start prints labelled line", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "tool_start", name: "shell", callId: "1" });
    expect(cap.capturedStdout()).toContain("[tool: shell]");
  });

  it("tool_end ok=true prints check, ok=false prints x", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "tool_end", name: "shell", callId: "1", ok: true });
    render({ type: "tool_end", name: "edit", callId: "2", ok: false });
    const out = cap.capturedStdout();
    expect(out).toContain("[tool: shell ✓]");
    expect(out).toContain("[tool: edit ✗]");
  });

  it("thinking events go to stdout", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "thinking", delta: "considering..." });
    expect(cap.capturedStdout()).toContain("considering...");
  });

  it("does not emit ANSI escapes when color is false", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "tool_start", name: "shell", callId: "1" });
    render({ type: "thinking", delta: "x" });
    render({ type: "tool_end", name: "shell", callId: "1", ok: true });
    expect(cap.capturedStdout()).not.toMatch(/\x1b\[/);
  });

  it("emits ANSI escapes when color is true", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: true });
    render({ type: "tool_start", name: "shell", callId: "1" });
    expect(cap.capturedStdout()).toMatch(/\x1b\[/);
  });
});
