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
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
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
