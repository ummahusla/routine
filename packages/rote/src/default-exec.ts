import { execFile } from "node:child_process";
import type { ExecFn } from "./types.js";

export const defaultExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    let timedOut = false;
    const child = execFile(cmd, args, { timeout: opts.timeoutMs }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ETIMEDOUT") timedOut = true;
      resolve({
        stdout,
        stderr,
        exitCode:
          err && typeof (err as NodeJS.ErrnoException).code === "number"
            ? Number((err as NodeJS.ErrnoException).code)
            : err
              ? 1
              : 0,
        timedOut,
      });
    });
    opts.signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
  });
