import { existsSync, rmSync } from "node:fs";
import { bootstrapFlowbuilderSession } from "@flow-build/flowbuilder";
import {
  initSession,
  listSessionMeta,
  sessionDir,
} from "./store.js";
import { Session } from "./session.js";
import { ulid } from "./ulid.js";
import { SessionMissingError } from "./errors.js";
import type {
  CreateSessionOptions,
  LoadSessionOptions,
  SessionMetadata,
} from "./types.js";

export async function createSession(opts: CreateSessionOptions): Promise<Session> {
  const sessionId = ulid();
  const title = opts.title ?? "untitled";
  const model = opts.model ?? "composer-2";
  initSession({ baseDir: opts.baseDir, sessionId, title, model });
  bootstrapFlowbuilderSession({
    baseDir: opts.baseDir,
    sessionId,
    name: title,
    description: "",
  });
  return new Session({
    baseDir: opts.baseDir,
    sessionId,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    ...(opts.logger ? { logger: opts.logger } : {}),
    ...(opts.retry ? { retry: opts.retry } : {}),
    ...(opts.plugins ? { plugins: opts.plugins } : {}),
  });
}

export async function loadSession(opts: LoadSessionOptions): Promise<Session> {
  if (!existsSync(sessionDir(opts.baseDir, opts.sessionId))) {
    throw new SessionMissingError(opts.sessionId);
  }
  return new Session({
    baseDir: opts.baseDir,
    sessionId: opts.sessionId,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    ...(opts.logger ? { logger: opts.logger } : {}),
    ...(opts.retry ? { retry: opts.retry } : {}),
    ...(opts.plugins ? { plugins: opts.plugins } : {}),
  });
}

export async function listSessions(opts: { baseDir: string }): Promise<SessionMetadata[]> {
  return listSessionMeta(opts.baseDir);
}

export async function deleteSession(opts: { baseDir: string; sessionId: string }): Promise<void> {
  const dir = sessionDir(opts.baseDir, opts.sessionId);
  if (!existsSync(dir)) return;
  rmSync(dir, { recursive: true, force: true });
}

export { Session } from "./session.js";
