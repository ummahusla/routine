import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupFlowbuilderFixture, type FlowbuilderFixture } from "./test-helpers/flowbuilder-fixture.js";

let dir: string;
let fb: FlowbuilderFixture;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flow-build-cli-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
  fb = setupFlowbuilderFixture();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(fb.baseDir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@flow-build/core");
});

function fakeStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: { write: (s: string) => (stdout.push(s), true) } as unknown as NodeJS.WritableStream,
    stderr: { write: (s: string) => (stderr.push(s), true) } as unknown as NodeJS.WritableStream,
    out: () => stdout.join(""),
    err: () => stderr.join(""),
  };
}

function exitFake(): { exit: (code: number) => never; codes: number[] } {
  const codes: number[] = [];
  const exit = (code: number) => {
    codes.push(code);
    throw new Error(`__exit:${code}`);
  };
  return { exit: exit as (code: number) => never, codes };
}

async function loadCli(coreImpl: object) {
  vi.doMock("@flow-build/core", () => coreImpl);
  return await import("./main.js");
}

describe("CLI smoke", () => {
  it("happy path → exit 0, text on stdout, status on stderr", async () => {
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async (opts: { onEvent: (e: unknown) => void }) => {
        opts.onEvent({ type: "status", phase: "starting" });
        opts.onEvent({ type: "text", delta: "hi " });
        opts.onEvent({ type: "text", delta: "there" });
        opts.onEvent({ type: "status", phase: "done" });
        return { status: "completed", finalText: "hi there" };
      }),
      AuthError: class AuthError extends Error {},
      ConfigError: class ConfigError extends Error {},
      NetworkError: class NetworkError extends Error {},
      HarnessError: class HarnessError extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();

    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir, "--session", fb.sessionId, "--flowbuilder-base", fb.baseDir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:0");
    expect(ex.codes).toEqual([0]);
    expect(streams.out()).toContain("hi there");
    expect(streams.err()).toContain("[starting]");
    expect(streams.err()).toContain("[done]");
  });

  it("AuthError → exit 2", async () => {
    class AuthError extends Error {}
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async () => {
        throw new AuthError("missing key");
      }),
      AuthError,
      ConfigError: class extends Error {},
      NetworkError: class extends Error {},
      HarnessError: class extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();

    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir, "--session", fb.sessionId, "--flowbuilder-base", fb.baseDir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:2");
    expect(ex.codes).toEqual([2]);
    expect(streams.err()).toContain("missing key");
  });

  it("NetworkError → exit 3", async () => {
    class NetworkError extends Error {}
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async () => {
        throw new NetworkError("no net");
      }),
      AuthError: class extends Error {},
      ConfigError: class extends Error {},
      NetworkError,
      HarnessError: class extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir, "--session", fb.sessionId, "--flowbuilder-base", fb.baseDir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:3");
    expect(ex.codes).toEqual([3]);
  });

  it("cancelled status → exit 130", async () => {
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async () => ({ status: "cancelled", finalText: "" })),
      AuthError: class extends Error {},
      ConfigError: class extends Error {},
      NetworkError: class extends Error {},
      HarnessError: class extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir, "--session", fb.sessionId, "--flowbuilder-base", fb.baseDir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:130");
    expect(ex.codes).toEqual([130]);
  });
});
