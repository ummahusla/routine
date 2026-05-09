import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SessionCorruptError, SessionMissingError } from "./errors.js";
import type { LineEnvelope, SessionMetadata } from "./types.js";

export function sessionDir(baseDir: string, sessionId: string): string {
  return join(baseDir, "sessions", sessionId);
}

export function workspaceDir(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "workspace");
}

export function chatPath(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "chat.json");
}

export function eventsPath(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "events.jsonl");
}

export function lockPath(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "session.lock");
}

export type InitArgs = {
  baseDir: string;
  sessionId: string;
  title: string;
  model: string;
  now?: Date;
};

export function initSession(args: InitArgs): SessionMetadata {
  const dir = sessionDir(args.baseDir, args.sessionId);
  mkdirSync(workspaceDir(args.baseDir, args.sessionId), { recursive: true });
  const ts = (args.now ?? new Date()).toISOString();
  const meta: SessionMetadata = {
    v: 1,
    sessionId: args.sessionId,
    title: args.title,
    createdAt: ts,
    updatedAt: ts,
    model: args.model,
    turnCount: 0,
    lastStatus: "completed",
    totalUsage: { inputTokens: 0, outputTokens: 0 },
  };
  writeChatMetaAt(join(dir, "chat.json"), meta);
  // touch events.jsonl
  writeFileSync(eventsPath(args.baseDir, args.sessionId), "");
  return meta;
}

export type AppendArgs = {
  baseDir: string;
  sessionId: string;
  event: LineEnvelope;
};

export function appendEvent(args: AppendArgs): void {
  const path = eventsPath(args.baseDir, args.sessionId);
  if (!existsSync(path)) throw new SessionMissingError(args.sessionId);
  appendFileSync(path, JSON.stringify(args.event) + "\n");
}

export function clearEvents(args: { baseDir: string; sessionId: string }): void {
  const path = eventsPath(args.baseDir, args.sessionId);
  if (!existsSync(path)) throw new SessionMissingError(args.sessionId);
  writeFileSync(path, "");
}

export function readEvents(args: { baseDir: string; sessionId: string }): LineEnvelope[] {
  const path = eventsPath(args.baseDir, args.sessionId);
  if (!existsSync(path)) throw new SessionMissingError(args.sessionId);
  const raw = readFileSync(path, "utf8");
  if (raw.length === 0) return [];
  const lines = raw.split("\n");
  // Always drop the final element of split("\n"): if file ends with "\n" it is
  // the empty string after the trailing newline; if it does not, it is a
  // partial trailing line that has not been fully written yet. Either way we
  // skip it so callers only see complete events.
  const completed = lines.slice(0, lines.length - 1);
  const out: LineEnvelope[] = [];
  for (const line of completed) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as LineEnvelope);
    } catch (cause) {
      throw new SessionCorruptError(args.sessionId, `malformed jsonl line: ${(cause as Error).message}`);
    }
  }
  return out;
}

export function writeChatMeta(args: {
  baseDir: string;
  sessionId: string;
  meta: SessionMetadata;
}): void {
  const path = chatPath(args.baseDir, args.sessionId);
  if (!existsSync(sessionDir(args.baseDir, args.sessionId))) {
    throw new SessionMissingError(args.sessionId);
  }
  writeChatMetaAt(path, args.meta);
}

function writeChatMetaAt(path: string, meta: SessionMetadata): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2) + "\n");
  renameSync(tmp, path);
}

export function readChatMeta(path: string): SessionMetadata {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as SessionMetadata;
  } catch (cause) {
    throw new SessionCorruptError(path, `malformed chat.json: ${(cause as Error).message}`);
  }
}

export function listSessionMeta(baseDir: string): SessionMetadata[] {
  const root = join(baseDir, "sessions");
  if (!existsSync(root)) return [];
  const entries = readdirSync(root);
  const out: SessionMetadata[] = [];
  for (const id of entries) {
    const cp = chatPath(baseDir, id);
    if (!existsSync(cp)) continue;
    if (!statSync(join(root, id)).isDirectory()) continue;
    try {
      out.push(readChatMeta(cp));
    } catch {
      // skip corrupt sessions in listings; load() will report them explicitly
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}
