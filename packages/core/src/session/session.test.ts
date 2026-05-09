import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSdk, makeFakeAgent } from "../test/fakeSdk.js";
import { Session } from "./session.js";
import { initSession, eventsPath } from "./store.js";
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
