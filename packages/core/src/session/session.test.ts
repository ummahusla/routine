import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSdk, makeFakeAgent } from "../test/fakeSdk.js";
import { Session } from "./session.js";
import { chatPath, initSession, eventsPath, readChatMeta } from "./store.js";
import { SessionBusyError } from "./errors.js";

const SESSION_PATH = "./session.js";

// The static value imports of `Session` and `SessionBusyError` above are
// kept so this file matches the plan's import block. Tests dynamically
// re-import them through the freshly-reset module graph; the static refs
// are touched here so TS's noUnusedLocals doesn't trip.
void Session;
void SessionBusyError;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "session-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@cursor/sdk");
});

describe("Session.send", () => {
  it("appends user, turn_open, turn_start, text, turn_end events; status completed", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "composer-2" });
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } },
      ],
      waitResult: { status: "completed", usage: { inputTokens: 10, outputTokens: 5 } },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    const result = await session.send("hi");
    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("hello");

    const lines = readFileSync(eventsPath(dir, "S1"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toEqual(["user", "turn_open", "turn_start", "text", "turn_end"]);
    expect(lines[lines.length - 1].status).toBe("completed");
  });

  it("rejects concurrent send with SessionBusyError", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    let resolveStream!: () => void;
    const blockedStream = new Promise<void>((r) => (resolveStream = r));
    const fa = makeFakeAgent({});
    fa.run.stream = async function* () {
      await blockedStream;
      // unreachable; satisfies require-yield while keeping the stream blocked
      yield undefined as never;
    };
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    // Import the error class through the same fresh module graph the
    // dynamically-imported Session uses; the static `SessionBusyError` import
    // at the top of this file is from a stale graph after vi.resetModules().
    const { SessionBusyError: BusyErr } = await import("./errors.js");
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    const first = session.send("first");
    await expect(session.send("second")).rejects.toBeInstanceOf(BusyErr);
    resolveStream();
    await first;
  });

  it("reports the active persisted turn as running while send is in flight", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    let resolveStream!: () => void;
    const blockedStream = new Promise<void>((r) => (resolveStream = r));
    const fa = makeFakeAgent({});
    fa.run.stream = async function* () {
      await blockedStream;
      yield undefined as never;
    };
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    const sendPromise = session.send("hi");
    await new Promise((r) => setTimeout(r, 10));

    const turns = await session.turns();
    expect(turns).toHaveLength(1);
    expect(turns[0]!.status).toBe("running");

    resolveStream();
    await sendPromise;
  });

  it("writes turn_end status=failed_to_start when Agent.create throws", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    installFakeSdk({ createBehavior: [{ throws: new Error("auth bad") }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test", retry: { attempts: 1 } });
    const result = await session.send("hi");
    expect(result.status).toBe("failed_to_start");

    const lines = readFileSync(eventsPath(dir, "S1"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const last = lines[lines.length - 1];
    expect(last.kind).toBe("turn_end");
    expect(last.status).toBe("failed_to_start");
  });

  it("clearChat removes chat events and usage without touching flowbuilder state", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    const statePath = join(dir, "sessions", "S1", "state.json");
    const stateJson = '{ "nodes": ["keep-me"], "edges": [] }\n';
    writeFileSync(statePath, stateJson);
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } },
      ],
      waitResult: { status: "completed", usage: { inputTokens: 7, outputTokens: 3 } },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    await session.send("hi");

    expect(readFileSync(eventsPath(dir, "S1"), "utf8")).not.toBe("");
    await session.clearChat();

    expect(await session.turns()).toEqual([]);
    expect(readFileSync(eventsPath(dir, "S1"), "utf8")).toBe("");
    expect(readFileSync(statePath, "utf8")).toBe(stateJson);
    expect(readChatMeta(chatPath(dir, "S1"))).toMatchObject({
      turnCount: 0,
      lastStatus: "completed",
      totalUsage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("includes verbatim replay of prior completed turn in second send's prompt", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    const fa1 = makeFakeAgent({
      streamItems: [
        {
          type: "tool_call",
          call_id: "c1",
          name: "shell",
          status: "completed",
          args: { cmd: "ls" },
          result: "a\n",
        },
        { type: "assistant", message: { content: [{ type: "text", text: "first reply" }] } },
      ],
      waitResult: { status: "completed" },
    });
    const fa2 = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "second reply" }] } },
      ],
      waitResult: { status: "completed" },
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa1 }, { agent: fa2 }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    await session.send("first prompt");
    await session.send("second prompt");

    const lastSent = fake.lastSendPrompt()!;
    expect(lastSent).toContain("Conversation so far");
    expect(lastSent).toContain("User: first prompt");
    expect(lastSent).toContain("[tool_call: shell");
    expect(lastSent).toContain('"cmd":"ls"');
    expect(lastSent).toContain('"a\\n"');
    expect(lastSent).toContain("first reply");
    expect(lastSent).toContain("User: second prompt");
  });

  it("plugin systemPrompt fires once per session; preRun + promptPrefix fire per turn; rules file persists between turns and is restored on close", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    const fa1 = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "ok1" }] } },
      ],
      waitResult: { status: "completed" },
    });
    const fa2 = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "ok2" }] } },
      ],
      waitResult: { status: "completed" },
    });
    installFakeSdk({ createBehavior: [{ agent: fa1 }, { agent: fa2 }] });

    const { existsSync, readFileSync: rfs } = await import("node:fs");
    const { join: pj } = await import("node:path");

    const calls = { preRun: 0, systemPrompt: 0, promptPrefix: 0 };
    const plugin = {
      name: "test-plugin",
      async preRun() {
        calls.preRun += 1;
      },
      async systemPrompt() {
        calls.systemPrompt += 1;
        return {
          rulesFile: {
            relativePath: ".cursor/rules/.flow-build-test.mdc",
            contents: "rules-body",
          },
        };
      },
      async promptPrefix() {
        calls.promptPrefix += 1;
        return "prefix";
      },
    };

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({
      baseDir: dir,
      sessionId: "S1",
      apiKey: "crsr_test",
      plugins: [plugin],
    });
    const rulesPath = pj(session.workspaceDir, ".cursor/rules/.flow-build-test.mdc");

    await session.send("first");
    expect(calls.preRun).toBe(1);
    expect(calls.systemPrompt).toBe(1);
    expect(calls.promptPrefix).toBe(1);
    expect(existsSync(rulesPath)).toBe(true);
    expect(rfs(rulesPath, "utf8")).toBe("rules-body");

    await session.send("second");
    expect(calls.preRun).toBe(2);
    expect(calls.systemPrompt).toBe(1); // still 1 — once per session
    expect(calls.promptPrefix).toBe(2);
    expect(existsSync(rulesPath)).toBe(true); // persists across turns

    await session.close();
    expect(existsSync(rulesPath)).toBe(false); // restored on close
  });

  it("tool watchdog fires when tool_start has no matching tool_end within args.timeout + slack", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    // The fake's stream parks until cancel() resolves it. The watchdog
    // calls live.run.cancel() when the deadline expires — that cancel
    // resolves the park and lets the for-await loop see abort.signal.
    let releaseStream!: () => void;
    const streamPark = new Promise<void>((r) => (releaseStream = r));
    const fa = makeFakeAgent({ waitResult: { status: "completed" } });
    fa.run.cancel = vi.fn(async () => {
      releaseStream();
    });
    fa.run.stream = async function* () {
      yield {
        type: "tool_call",
        call_id: "c1",
        name: "shell",
        status: "running",
        args: { command: 'rote flow search "x"', timeout: 100 },
      };
      await streamPark;
    };
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({
      baseDir: dir,
      sessionId: "S1",
      apiKey: "crsr_test",
      retry: { attempts: 1 },
    });
    await expect(session.send("hi")).rejects.toThrow(/tool "shell" produced no result/);
    expect(fa.run.cancel).toHaveBeenCalled();

    const lines = readFileSync(eventsPath(dir, "S1"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const errLine = lines.find((l) => l.kind === "error");
    expect(errLine?.message).toMatch(/tool "shell" produced no result/);
    const lastLine = lines[lines.length - 1];
    expect(lastLine.kind).toBe("turn_end");
    expect(lastLine.status).toBe("failed");
  }, 10_000);

  it("uses opts.model for Agent.create + turn_start, persists meta.model", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "composer-2" });
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
      ],
      waitResult: { status: "completed", usage: { inputTokens: 1, outputTokens: 1 } },
    });
    const installed = installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    await session.send("hi", { model: "claude-4.7-opus" });

    const cfg = installed.lastCreateConfig() as { model: { id: string } };
    expect(cfg.model.id).toBe("claude-4.7-opus");

    const lines = readFileSync(eventsPath(dir, "S1"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const turnStart = lines.find((l: { kind: string }) => l.kind === "turn_start");
    expect(turnStart.model).toBe("claude-4.7-opus");

    const meta = JSON.parse(readFileSync(join(dir, "sessions", "S1", "chat.json"), "utf8"));
    expect(meta.model).toBe("claude-4.7-opus");
  });

  it("persists opts.model to meta even when Agent.create fails", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "composer-2" });
    installFakeSdk({ createBehavior: [{ throws: new Error("auth bad") }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({
      baseDir: dir,
      sessionId: "S1",
      apiKey: "crsr_test",
      retry: { attempts: 1 },
    });
    const result = await session.send("hi", { model: "claude-4.7-opus" });
    expect(result.status).toBe("failed_to_start");

    const meta = JSON.parse(readFileSync(join(dir, "sessions", "S1", "chat.json"), "utf8"));
    expect(meta.model).toBe("claude-4.7-opus");
  });

  it("cancel mid-turn produces status=cancelled", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    let resolveStream!: () => void;
    const blockedStream = new Promise<void>((r) => (resolveStream = r));
    const fa = makeFakeAgent({ waitResult: { status: "cancelled" } });
    fa.run.stream = async function* () {
      await blockedStream;
      // unreachable; satisfies require-yield while keeping the stream blocked
      yield undefined as never;
    };
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    const sendPromise = session.send("hi");
    // Give the send() call time to enter the stream loop
    await new Promise((r) => setTimeout(r, 10));
    await session.cancel();
    resolveStream();
    const result = await sendPromise;
    expect(result.status).toBe("cancelled");

    const lines = readFileSync(eventsPath(dir, "S1"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const last = lines[lines.length - 1];
    expect(last.kind).toBe("turn_end");
    expect(last.status).toBe("cancelled");
  });
});
