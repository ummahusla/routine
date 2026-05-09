import { describe, it, expect } from "vitest";
import {
  HarnessError,
  AuthError,
  ConfigError,
  NetworkError,
  mapToHarnessError,
} from "./errors.js";

describe("HarnessError hierarchy", () => {
  it("HarnessError carries retryable + cause", () => {
    const cause = new Error("orig");
    const e = new HarnessError("boom", { retryable: true, cause });
    expect(e.message).toBe("boom");
    expect(e.retryable).toBe(true);
    expect(e.cause).toBe(cause);
    expect(e).toBeInstanceOf(Error);
  });

  it("AuthError is not retryable by default", () => {
    const e = new AuthError("no key");
    expect(e.retryable).toBe(false);
    expect(e).toBeInstanceOf(HarnessError);
  });

  it("NetworkError is retryable by default", () => {
    const e = new NetworkError("flap");
    expect(e.retryable).toBe(true);
  });

  it("ConfigError is not retryable", () => {
    expect(new ConfigError("bad cwd").retryable).toBe(false);
  });
});

describe("mapToHarnessError", () => {
  class FakeSdkError extends Error {
    constructor(public name: string, public isRetryable: boolean = false) {
      super(name);
    }
  }

  it("maps AuthenticationError → AuthError", () => {
    const m = mapToHarnessError(new FakeSdkError("AuthenticationError"));
    expect(m).toBeInstanceOf(AuthError);
    expect(m.retryable).toBe(false);
  });

  it("maps RateLimitError → NetworkError (retryable)", () => {
    const m = mapToHarnessError(new FakeSdkError("RateLimitError", true));
    expect(m).toBeInstanceOf(NetworkError);
    expect(m.retryable).toBe(true);
  });

  it("maps NetworkError respecting isRetryable", () => {
    const m = mapToHarnessError(new FakeSdkError("NetworkError", false));
    expect(m).toBeInstanceOf(NetworkError);
    expect(m.retryable).toBe(false);
  });

  it("maps ConfigurationError → ConfigError", () => {
    const m = mapToHarnessError(new FakeSdkError("ConfigurationError"));
    expect(m).toBeInstanceOf(ConfigError);
  });

  it("maps IntegrationNotConnectedError → ConfigError", () => {
    const m = mapToHarnessError(new FakeSdkError("IntegrationNotConnectedError"));
    expect(m).toBeInstanceOf(ConfigError);
  });

  it("falls back to HarnessError for unknown", () => {
    const m = mapToHarnessError(new Error("weird"));
    expect(m).toBeInstanceOf(HarnessError);
    expect(m.retryable).toBe(false);
  });

  it("preserves cause reference", () => {
    const orig = new FakeSdkError("AuthenticationError");
    const m = mapToHarnessError(orig);
    expect(m.cause).toBe(orig);
  });

  it("returns HarnessError unchanged if already mapped", () => {
    const orig = new AuthError("already mapped");
    const m = mapToHarnessError(orig);
    expect(m).toBe(orig);
  });
});
