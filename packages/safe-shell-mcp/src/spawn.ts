import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export type ExecResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  truncated: { stdout: boolean; stderr: boolean };
};

export type RunShellOptions = {
  command: string;
  cwd: string;
  timeoutMs: number;
  maxBytes: number;
  env?: Record<string, string>;
};

const SIGKILL_GRACE_MS = 2_000;

function buildEnv(extra: Record<string, string> | undefined): NodeJS.ProcessEnv {
  // Drop any caller-supplied or ambient CURSOR_* keys. SDK rule: cloud envVars
  // cannot start with CURSOR_; we apply the same policy here for symmetry.
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("CURSOR_")) continue;
    if (v !== undefined) out[k] = v;
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (k.startsWith("CURSOR_")) continue;
      out[k] = v;
    }
  }
  return out;
}

export async function runShell(opts: RunShellOptions): Promise<ExecResult> {
  // Validate cwd up front so the agent gets a proper MCP error rather than
  // a silent spawn failure.
  try {
    const s = await stat(opts.cwd);
    if (!s.isDirectory()) throw new Error(`cwd is not a directory: ${opts.cwd}`);
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new Error(`cwd is not usable: ${opts.cwd}: ${cause}`, { cause: e });
  }

  const started = Date.now();
  return new Promise<ExecResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(opts.command, {
        cwd: opts.cwd,
        env: buildEnv(opts.env),
        shell: true, // /bin/sh -c on POSIX, cmd.exe /c on win32
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      reject(e);
      return;
    }

    let stdout = "";
    let stderr = "";
    let stdoutTrunc = false;
    let stderrTrunc = false;
    let timedOut = false;
    let closed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!closed) child.kill("SIGKILL");
      }, SIGKILL_GRACE_MS).unref();
    }, opts.timeoutMs);
    timer.unref();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const remaining = opts.maxBytes - stdout.length;
      if (remaining <= 0) {
        stdoutTrunc = true;
        return;
      }
      if (chunk.length > remaining) {
        stdout += chunk.slice(0, remaining);
        stdoutTrunc = true;
      } else {
        stdout += chunk;
      }
    });
    child.stderr.on("data", (chunk: string) => {
      const remaining = opts.maxBytes - stderr.length;
      if (remaining <= 0) {
        stderrTrunc = true;
        return;
      }
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTrunc = true;
      } else {
        stderr += chunk;
      }
    });

    child.on("error", (err) => {
      closed = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr: stderr + (stderr ? "\n" : "") + `spawn error: ${err.message}`,
        exitCode: null,
        signal: null,
        durationMs: Date.now() - started,
        timedOut,
        truncated: { stdout: stdoutTrunc, stderr: stderrTrunc },
      });
    });

    child.on("close", (code, signal) => {
      closed = true;
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        stdout,
        stderr,
        exitCode: code,
        signal,
        durationMs: Date.now() - started,
        timedOut,
        truncated: { stdout: stdoutTrunc, stderr: stderrTrunc },
      });
    });
  });
}
