import { describe, it, expect } from "vitest";
import { runShell } from "./spawn.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("runShell", () => {
  it("captures stdout from echo", async () => {
    const r = await runShell({ command: "echo hi", cwd: process.cwd(), timeoutMs: 5_000, maxBytes: 1_000 });
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe("hi\n");
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
    expect(r.timedOut).toBe(false);
    expect(r.truncated).toEqual({ stdout: false, stderr: false });
    expect(r.durationMs).toBeLessThan(2_000);
  });

  it("reports non-zero exit", async () => {
    const r = await runShell({ command: "false", cwd: process.cwd(), timeoutMs: 5_000, maxBytes: 1_000 });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.timedOut).toBe(false);
  });

  it("kills on timeout (SIGTERM then SIGKILL)", async () => {
    const start = Date.now();
    const r = await runShell({
      command: "sleep 10",
      cwd: process.cwd(),
      timeoutMs: 200,
      maxBytes: 1_000,
    });
    const elapsed = Date.now() - start;
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(2_500); // 200ms timeout + 2s SIGKILL grace, plus slack
  });

  it("truncates stdout at maxBytes", async () => {
    const r = await runShell({
      command: "yes | head -c 5000",
      cwd: process.cwd(),
      timeoutMs: 5_000,
      maxBytes: 100,
    });
    expect(r.truncated.stdout).toBe(true);
    expect(r.stdout.length).toBe(100);
  });

  it("rejects nonexistent cwd", async () => {
    await expect(
      runShell({ command: "echo hi", cwd: "/no/such/path/exists", timeoutMs: 5_000, maxBytes: 100 }),
    ).rejects.toThrow(/cwd/i);
  });

  it("drops env keys matching ^CURSOR_", async () => {
    const r = await runShell({
      command: "echo CURSOR=$CURSOR_API_KEY OTHER=$FOO",
      cwd: process.cwd(),
      timeoutMs: 5_000,
      maxBytes: 1_000,
      env: { CURSOR_API_KEY: "secret", FOO: "bar" },
    });
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe("CURSOR= OTHER=bar\n");
  });

  it("works in a temp cwd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "safe-shell-"));
    try {
      const r = await runShell({ command: "pwd", cwd: dir, timeoutMs: 5_000, maxBytes: 1_000 });
      expect(r.ok).toBe(true);
      // macOS resolves /tmp via /private/tmp; just check the suffix.
      expect(r.stdout.trim().endsWith(dir.replace(/^\/tmp/, ""))).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
