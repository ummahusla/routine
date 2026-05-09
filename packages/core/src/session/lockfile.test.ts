import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock, readLock } from "./lockfile.js";
import { SessionLockedError } from "./errors.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lockfile-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("acquireLock", () => {
  it("creates a lockfile with current pid", () => {
    const lockPath = join(dir, "session.lock");
    acquireLock(lockPath, "sess-1");
    expect(existsSync(lockPath)).toBe(true);
    const data = readLock(lockPath)!;
    expect(data.pid).toBe(process.pid);
    expect(data.sessionId).toBe("sess-1");
  });

  it("throws SessionLockedError when held by a live PID", () => {
    const lockPath = join(dir, "session.lock");
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.ppid, sessionId: "sess-1", startedAt: new Date().toISOString() }),
    );
    expect(() => acquireLock(lockPath, "sess-1")).toThrow(SessionLockedError);
  });

  it("reclaims a stale lock (pid not alive)", () => {
    const lockPath = join(dir, "session.lock");
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999_999_999, sessionId: "sess-1", startedAt: new Date().toISOString() }),
    );
    acquireLock(lockPath, "sess-1");
    expect(readLock(lockPath)!.pid).toBe(process.pid);
  });

  it("releaseLock removes the file", () => {
    const lockPath = join(dir, "session.lock");
    acquireLock(lockPath, "sess-1");
    releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
  });
});

// Reference unused import to keep plan-faithful while satisfying TS noUnusedLocals if enabled.
void readFileSync;
