import { HarnessError } from "./errors.js";
import type { Logger } from "./types.js";

export type WithRetryOpts = {
  attempts: number;
  baseDelayMs: number;
  signal?: AbortSignal;
  logger?: Logger;
};

class AbortedError extends HarnessError {
  constructor() {
    super("aborted", { retryable: false });
    this.name = "AbortedError";
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new AbortedError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOpts,
): Promise<T> {
  const { attempts, baseDelayMs, signal, logger } = opts;
  if (signal?.aborted) throw new AbortedError();

  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof HarnessError && e.retryable;
      const hasMore = attempt < attempts - 1;
      if (!retryable || !hasMore) throw e;
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      logger?.debug?.("retrying", { attempt: attempt + 1, delayMs, cause: e });
      await sleep(delayMs, signal);
    }
  }
  throw lastErr;
}
