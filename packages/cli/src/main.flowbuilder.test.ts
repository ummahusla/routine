import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let baseDir: string;
let cwd: string;
const sessionId = "s_abc123def456";

const manifest = {
  schemaVersion: 1,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};
const state = { schemaVersion: 1, nodes: [], edges: [] };

vi.mock("@flow-build/core", async () => {
  const actual = await vi.importActual<typeof import("@flow-build/core")>("@flow-build/core");
  return {
    ...actual,
    runPrompt: vi.fn(async (opts: { plugins?: { name: string }[] }) => {
      capturedPluginNames = (opts.plugins ?? []).map((p) => p.name);
      return { status: "completed" as const, finalText: "" };
    }),
  };
});

let capturedPluginNames: string[] = [];

function fakeStreams() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: { write: (s: string) => (out.push(s), true) } as unknown as NodeJS.WritableStream,
    stderr: { write: (s: string) => (err.push(s), true) } as unknown as NodeJS.WritableStream,
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

beforeEach(() => {
  capturedPluginNames = [];
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-cli-base-"));
  cwd = mkdtempSync(join(tmpdir(), "flowbuilder-cli-cwd-"));
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(state));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@flow-build/core");
});

describe("CLI flowbuilder integration", () => {
  it("registers flowbuilder plugin when --session and --flowbuilder-base provided", async () => {
    const { runCli } = await import("./main.js");
    const streams = fakeStreams();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: [
          "node",
          "flow-build",
          "run",
          "hello",
          "--cwd",
          cwd,
          "--session",
          sessionId,
          "--flowbuilder-base",
          baseDir,
        ],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: (code: number) => {
          throw new Error(`__exit:${code}`);
        },
      }),
    ).rejects.toThrow("__exit:0");
    expect(capturedPluginNames).toContain("flowbuilder");
    expect(capturedPluginNames).toContain("rote");
  });

  it("exits 1 with a usage message when --session is missing", async () => {
    const { runCli } = await import("./main.js");
    const streams = fakeStreams();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: [
          "node",
          "flow-build",
          "run",
          "hello",
          "--cwd",
          cwd,
          "--flowbuilder-base",
          baseDir,
        ],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: (code: number) => {
          throw new Error(`__exit:${code}`);
        },
      }),
    ).rejects.toThrow("__exit:1");
    expect(streams.err()).toMatch(/--session/);
  });

  it("exits 1 with a usage message when --flowbuilder-base is missing", async () => {
    const { runCli } = await import("./main.js");
    const streams = fakeStreams();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: [
          "node",
          "flow-build",
          "run",
          "hello",
          "--cwd",
          cwd,
          "--session",
          sessionId,
        ],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: (code: number) => {
          throw new Error(`__exit:${code}`);
        },
      }),
    ).rejects.toThrow("__exit:1");
    expect(streams.err()).toMatch(/--flowbuilder-base/);
  });
});
