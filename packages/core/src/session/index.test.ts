import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSession,
  loadSession,
  listSessions,
  deleteSession,
} from "./index.js";
import { SessionMissingError } from "./errors.js";

let baseDir: string;
beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "session-fac-"));
  process.env.CURSOR_API_KEY = "crsr_test";
});
afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
});

describe("createSession", () => {
  it("creates chat.json + events.jsonl + workspace/ + flowbuilder manifest+state", async () => {
    const session = await createSession({ baseDir, title: "first" });
    const dir = join(baseDir, "sessions", session.sessionId);
    expect(existsSync(join(dir, "chat.json"))).toBe(true);
    expect(existsSync(join(dir, "events.jsonl"))).toBe(true);
    expect(existsSync(join(dir, "workspace"))).toBe(true);
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
    await session.close();
  });

  it("auto-generates ULID sessionId when omitted", async () => {
    const session = await createSession({ baseDir });
    expect(session.sessionId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    await session.close();
  });
});

describe("loadSession", () => {
  it("loads an existing session", async () => {
    const created = await createSession({ baseDir, title: "x" });
    const sid = created.sessionId;
    await created.close();
    const loaded = await loadSession({ baseDir, sessionId: sid });
    expect(loaded.sessionId).toBe(sid);
    await loaded.close();
  });

  it("throws SessionMissingError for unknown id", async () => {
    await expect(loadSession({ baseDir, sessionId: "nope" })).rejects.toBeInstanceOf(
      SessionMissingError,
    );
  });
});

describe("listSessions", () => {
  it("returns empty array when no sessions", async () => {
    expect(await listSessions({ baseDir })).toEqual([]);
  });

  it("returns metadata for created sessions", async () => {
    const a = await createSession({ baseDir, title: "a" });
    await a.close();
    const b = await createSession({ baseDir, title: "b" });
    await b.close();
    const list = await listSessions({ baseDir });
    expect(list.map((m) => m.title).sort()).toEqual(["a", "b"]);
  });
});

describe("deleteSession", () => {
  it("removes the session dir", async () => {
    const s = await createSession({ baseDir });
    await s.close();
    await deleteSession({ baseDir, sessionId: s.sessionId });
    expect(existsSync(join(baseDir, "sessions", s.sessionId))).toBe(false);
  });

  it("is idempotent on missing", async () => {
    await deleteSession({ baseDir, sessionId: "nope" }); // should not throw
  });
});
