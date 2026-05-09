import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "./retry.js";
import { NetworkError, AuthError, HarnessError } from "./errors.js";

describe("withRetry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const p = withRetry(fn, { attempts: 3, baseDelayMs: 1000 });
    await expect(p).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new NetworkError("flap"))
      .mockResolvedValue("ok");
    const logger = { warn: vi.fn(), debug: vi.fn() };
    const p = withRetry(fn, { attempts: 3, baseDelayMs: 1000, logger });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      "retrying",
      expect.objectContaining({ attempt: 1, delayMs: 1000 }),
    );
  });

  it("uses exponential backoff (1000, 2000)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new NetworkError("a"))
      .mockRejectedValueOnce(new NetworkError("b"))
      .mockResolvedValue("ok");
    const p = withRetry(fn, { attempts: 3, baseDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws last error after exhaustion", async () => {
    const errs = [
      new NetworkError("1"),
      new NetworkError("2"),
      new NetworkError("3"),
    ];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(errs[0])
      .mockRejectedValueOnce(errs[1])
      .mockRejectedValueOnce(errs[2]);
    const p = withRetry(fn, { attempts: 3, baseDelayMs: 100 });
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).rejects.toBe(errs[2]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-retryable HarnessError", async () => {
    const err = new AuthError("nope");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 100 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on non-HarnessError throw", async () => {
    const err = new Error("plain");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 100 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("aborts immediately when signal is already aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 100, signal: ctl.signal }),
    ).rejects.toThrow(/aborted/i);
    expect(fn).not.toHaveBeenCalled();
  });

  it("aborts during backoff window", async () => {
    const ctl = new AbortController();
    const fn = vi.fn().mockRejectedValue(new NetworkError("flap"));
    const p = withRetry(fn, {
      attempts: 5,
      baseDelayMs: 1000,
      signal: ctl.signal,
    });
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(500);
    ctl.abort();
    await vi.advanceTimersByTimeAsync(600);
    await expect(p).rejects.toThrow(/aborted/i);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("works when logger.debug is missing", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new NetworkError("flap"))
      .mockResolvedValue("ok");
    const logger = { warn: vi.fn() };
    const p = withRetry(fn, { attempts: 3, baseDelayMs: 100, logger });
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe("ok");
  });
});
