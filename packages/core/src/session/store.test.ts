import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initSession,
  appendEvent,
  readEvents,
  writeChatMeta,
  readChatMeta,
  listSessionMeta,
} from "./store.js";
import type { LineEnvelope, SessionMetadata } from "./types.js";

let baseDir: string;
beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "store-"));
});
afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("initSession", () => {
  it("creates sessions/<id>/workspace/ + chat.json + empty events.jsonl", () => {
    const meta = initSession({ baseDir, sessionId: "S1", title: "hello", model: "composer-2" });
    expect(meta.sessionId).toBe("S1");
    expect(meta.title).toBe("hello");
    expect(meta.turnCount).toBe(0);
    const chat = readChatMeta(join(baseDir, "sessions", "S1", "chat.json"));
    expect(chat).toEqual(meta);
    expect(readFileSync(join(baseDir, "sessions", "S1", "events.jsonl"), "utf8")).toBe("");
  });
});

describe("appendEvent + readEvents", () => {
  it("appends one JSON object per line and reads them back in order", () => {
    initSession({ baseDir, sessionId: "S1", title: "hi", model: "m" });
    const events: LineEnvelope[] = [
      { kind: "user", v: 1, ts: "2026-05-09T10:00:00Z", turnId: "T1", text: "hi" },
      { kind: "turn_open", v: 1, ts: "2026-05-09T10:00:01Z", turnId: "T1" },
      { kind: "turn_end", v: 1, ts: "2026-05-09T10:00:10Z", turnId: "T1", status: "completed", durationMs: 9000 },
    ];
    for (const e of events) appendEvent({ baseDir, sessionId: "S1", event: e });
    const back = readEvents({ baseDir, sessionId: "S1" });
    expect(back).toEqual(events);
  });

  it("skips trailing partial line on read", () => {
    initSession({ baseDir, sessionId: "S1", title: "hi", model: "m" });
    const path = join(baseDir, "sessions", "S1", "events.jsonl");
    const good: LineEnvelope = { kind: "user", v: 1, ts: "2026-05-09T10:00:00Z", turnId: "T1", text: "hi" };
    writeFileSync(path, JSON.stringify(good) + "\n" + '{"kind":"turn_open","v":1,"ts":"2026-');
    const back = readEvents({ baseDir, sessionId: "S1" });
    expect(back).toEqual([good]);
  });
});

describe("writeChatMeta + readChatMeta", () => {
  it("atomically rewrites chat.json", () => {
    initSession({ baseDir, sessionId: "S1", title: "old", model: "m" });
    const next: SessionMetadata = {
      v: 1,
      sessionId: "S1",
      title: "new",
      createdAt: "2026-05-09T10:00:00Z",
      updatedAt: "2026-05-09T10:00:05Z",
      model: "m",
      turnCount: 1,
      lastStatus: "completed",
      totalUsage: { inputTokens: 100, outputTokens: 50 },
    };
    writeChatMeta({ baseDir, sessionId: "S1", meta: next });
    expect(readChatMeta(join(baseDir, "sessions", "S1", "chat.json"))).toEqual(next);
  });
});

describe("listSessionMeta", () => {
  it("returns empty list when no sessions exist", () => {
    expect(listSessionMeta(baseDir)).toEqual([]);
  });

  it("returns metadata for all sessions sorted by updatedAt desc", async () => {
    initSession({ baseDir, sessionId: "S1", title: "first", model: "m" });
    await new Promise((r) => setTimeout(r, 5));
    initSession({ baseDir, sessionId: "S2", title: "second", model: "m" });
    const list = listSessionMeta(baseDir);
    expect(list.map((m) => m.sessionId)).toEqual(["S2", "S1"]);
  });

  it("skips dirs that lack chat.json", () => {
    mkdirSync(join(baseDir, "sessions", "stray"), { recursive: true });
    initSession({ baseDir, sessionId: "S1", title: "first", model: "m" });
    expect(listSessionMeta(baseDir).map((m) => m.sessionId)).toEqual(["S1"]);
  });
});
