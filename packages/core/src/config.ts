import { statSync } from "node:fs";
import { AuthError, ConfigError } from "./errors.js";
import type { RunOptions } from "./types.js";

export type ResolvedConfig = {
  apiKey: string;
  model: string;
  cwd: string;
  prompt: string;
  retry: { attempts: number; baseDelayMs: number };
};

const DEFAULTS = {
  model: "composer-2",
  retry: { attempts: 3, baseDelayMs: 1000 },
};

export function resolveConfig(opts: RunOptions): ResolvedConfig {
  const apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new AuthError(
      "Missing Cursor API key. Pass apiKey or set CURSOR_API_KEY env var.",
    );
  }
  if (!opts.cwd) throw new ConfigError("cwd is required");
  let stat;
  try {
    stat = statSync(opts.cwd);
  } catch (cause) {
    throw new ConfigError(`cwd does not exist: ${opts.cwd}`, { cause });
  }
  if (!stat.isDirectory()) throw new ConfigError(`cwd is not a directory: ${opts.cwd}`);
  if (!opts.prompt || opts.prompt.trim() === "") {
    throw new ConfigError("prompt is required and must be non-empty");
  }
  return {
    apiKey,
    model: opts.model ?? DEFAULTS.model,
    cwd: opts.cwd,
    prompt: opts.prompt,
    retry: {
      attempts: opts.retry?.attempts ?? DEFAULTS.retry.attempts,
      baseDelayMs: opts.retry?.baseDelayMs ?? DEFAULTS.retry.baseDelayMs,
    },
  };
}
