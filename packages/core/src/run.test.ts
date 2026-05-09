import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSdk, makeFakeAgent } from "./test/fakeSdk.js";
import type { HarnessEvent } from "./types.js";

const RUN_PATH = "./run.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flow-build-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  // Disable safe-shell wiring for runPrompt tests — they don't want the
  // harness spinning up real HTTP listeners or writing .cursor/hooks.json
  // into the test cwd. Safe-shell coverage lives in session.test.ts and
  // safe-shell-lifecycle.test.ts.
  process.env.FLOW_BUILD_SAFE_SHELL = "0";
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  delete process.env.FLOW_BUILD_SAFE_SHELL;
  vi.doUnmock("@cursor/sdk");
});

describe("runPrompt happy path", () => {
  it("streams text + tool events and returns completed", async () => {
    const fa = makeFakeAgent({
      streamItems: [
        { type: "status", status: "running" },
        { type: "tool_call", call_id: "1", name: "shell", status: "running" },
        { type: "tool_call", call_id: "1", name: "shell", status: "completed" },
        { type: "assistant", message: { content: [{ type: "text", text: "hello " }] } },
        { type: "assistant", message: { content: [{ type: "text", text: "world" }] } },
      ],
      waitResult: { status: "completed", usage: { inputTokens: 10, outputTokens: 5 } },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { runPrompt } = await import(RUN_PATH);
    const events: HarnessEvent[] = [];
    const result = await runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: (e) => events.push(e),
    });

    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("hello world");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    expect(events[0]).toEqual({ type: "status", phase: "starting" });
    expect(events[events.length - 1]).toEqual({ type: "status", phase: "done" });

    const types = events.map((e) => e.type);
    expect(types).toContain("tool_start");
    expect(types).toContain("tool_end");
    expect(types.filter((t) => t === "text")).toHaveLength(2);
  });

  it("throws AuthError synchronously when no apiKey", async () => {
    delete process.env.CURSOR_API_KEY;
    installFakeSdk({ createBehavior: [] });
    const { runPrompt } = await import(RUN_PATH);
    const { AuthError } = await import("./errors.js");
    await expect(
      runPrompt({ prompt: "hi", cwd: dir, onEvent: () => {} }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ConfigError when cwd missing", async () => {
    installFakeSdk({ createBehavior: [] });
    const { runPrompt } = await import(RUN_PATH);
    const { ConfigError } = await import("./errors.js");
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: join(dir, "nope"),
        onEvent: () => {},
      }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});

describe("runPrompt retry behavior", () => {
  it("retries Agent.create when first attempt throws retryable", async () => {
    vi.useFakeTimers();
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
    });
    const fail = Object.assign(new Error("flap"), { name: "NetworkError", isRetryable: true });
    const fake = installFakeSdk({
      createBehavior: [{ throws: fail }, { agent: fa }],
    });

    const { runPrompt } = await import(RUN_PATH);
    const events: HarnessEvent[] = [];
    const promise = runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: (e) => events.push(e),
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    vi.useRealTimers();

    expect(fake.create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("ok");
  });

  it("throws NetworkError after retry exhaustion", async () => {
    vi.useFakeTimers();
    const fail = Object.assign(new Error("flap"), { name: "NetworkError", isRetryable: true });
    installFakeSdk({
      createBehavior: [{ throws: fail }, { throws: fail }, { throws: fail }],
    });

    const { runPrompt } = await import(RUN_PATH);
    const { NetworkError } = await import("./errors.js");
    const promise = runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: () => {},
    });
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).rejects.toBeInstanceOf(NetworkError);
    vi.useRealTimers();
  });

  it("does NOT retry on mid-stream error (after first event)", async () => {
    const fail = Object.assign(new Error("net flap"), { name: "NetworkError", isRetryable: true });
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "partial" }] } },
      ],
      streamThrows: { afterIndex: 1, error: fail },
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { runPrompt } = await import(RUN_PATH);
    const { NetworkError } = await import("./errors.js");
    const events: HarnessEvent[] = [];
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: dir,
        onEvent: (e) => events.push(e),
      }),
    ).rejects.toBeInstanceOf(NetworkError);

    expect(fake.create).toHaveBeenCalledTimes(1);
    const partial = events.find((e) => e.type === "text");
    expect(partial).toBeDefined();
  });

  it("does not retry non-retryable Agent.create error", async () => {
    const fail = Object.assign(new Error("bad key"), { name: "AuthenticationError" });
    const fake = installFakeSdk({ createBehavior: [{ throws: fail }] });

    const { runPrompt } = await import(RUN_PATH);
    const { AuthError } = await import("./errors.js");
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: dir,
        onEvent: () => {},
      }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(fake.create).toHaveBeenCalledTimes(1);
  });
});

describe("runPrompt cancellation", () => {
  it("aborts the stream and returns cancelled status", async () => {
    let resolveStreamGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveStreamGate = r;
    });

    const ctl = new AbortController();
    const cancel = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const wait = vi.fn(async () => ({ status: "cancelled" }));

    async function* stream() {
      yield { type: "assistant", message: { content: [{ type: "text", text: "first" }] } };
      await gate;
      yield { type: "assistant", message: { content: [{ type: "text", text: "should-not-emit" }] } };
    }

    vi.doMock("@cursor/sdk", () => ({
      Agent: {
        create: vi.fn(async () => ({
          agentId: "a",
          close,
          [Symbol.asyncDispose]: close,
          send: vi.fn(async () => ({ cancel, wait, stream })),
        })),
      },
    }));

    const { runPrompt } = await import(RUN_PATH);
    const events: HarnessEvent[] = [];
    const promise = runPrompt({
      prompt: "hi",
      cwd: dir,
      signal: ctl.signal,
      onEvent: (e) => events.push(e),
    });

    await new Promise((r) => setImmediate(r));
    ctl.abort();
    resolveStreamGate();
    const result = await promise;

    expect(result.status).toBe("cancelled");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "text" && e.delta === "first")).toBe(true);
    expect(events.some((e) => e.type === "text" && e.delta === "should-not-emit")).toBe(false);
    expect(close).toHaveBeenCalled();
  });
});

describe("runPrompt wait() terminal status mapping", () => {
  it("wait status 'finished' → completed (real SDK contract)", async () => {
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
      waitResult: { status: "finished" },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { runPrompt } = await import(RUN_PATH);
    const result = await runPrompt({ prompt: "hi", cwd: dir, onEvent: () => {} });
    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("ok");
  });

  it("wait status 'error' → failed", async () => {
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "x" }] } }],
      waitResult: { status: "error" },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { runPrompt } = await import(RUN_PATH);
    const result = await runPrompt({ prompt: "hi", cwd: dir, onEvent: () => {} });
    expect(result.status).toBe("failed");
  });

  it("wait status 'CANCELLED' (uppercase) → cancelled", async () => {
    const fa = makeFakeAgent({
      streamItems: [],
      waitResult: { status: "CANCELLED" },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { runPrompt } = await import(RUN_PATH);
    const result = await runPrompt({ prompt: "hi", cwd: dir, onEvent: () => {} });
    expect(result.status).toBe("cancelled");
  });
});
