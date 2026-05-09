import { writeFileSync, readFileSync, existsSync, unlinkSync, openSync, closeSync } from "node:fs";
import { hostname } from "node:os";
import { SessionLockedError } from "./errors.js";

export type LockData = {
  pid: number;
  sessionId: string;
  startedAt: string;
  host: string;
};

export function readLock(path: string): LockData | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LockData;
  } catch {
    return undefined;
  }
}

function isAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "EPERM"; // exists but we can't signal it
  }
}

export function acquireLock(path: string, sessionId: string): void {
  const existing = readLock(path);
  if (existing && isAlive(existing.pid) && existing.pid !== process.pid) {
    throw new SessionLockedError(sessionId, existing.pid);
  }
  // Stale or absent — atomically replace.
  const data: LockData = {
    pid: process.pid,
    sessionId,
    startedAt: new Date().toISOString(),
    host: hostname(),
  };
  // Use O_CREAT|O_TRUNC|O_WRONLY via writeFileSync; race with another process is
  // narrow because we filter by single-instance lock at the app level.
  writeFileSync(path, JSON.stringify(data, null, 2), { flag: "w" });
  // Best-effort fsync via open+close on the file's directory is omitted;
  // crash recovery treats stale locks as reclaimable.
  void openSync;
  void closeSync;
}

export function releaseLock(path: string): void {
  if (!existsSync(path)) return;
  try {
    const data = readLock(path);
    if (data && data.pid !== process.pid) return; // do not delete another holder's lock
    unlinkSync(path);
  } catch {
    /* swallow — best-effort cleanup */
  }
}
