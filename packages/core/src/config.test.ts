import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "./config.js";
import { AuthError, ConfigError } from "./errors.js";

describe("resolveConfig", () => {
  let dir: string;
  let prevKey: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flow-build-"));
    prevKey = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevKey !== undefined) process.env.CURSOR_API_KEY = prevKey;
    else delete process.env.CURSOR_API_KEY;
  });

  it("uses opts.apiKey when provided", () => {
    const cfg = resolveConfig({
      prompt: "x",
      cwd: dir,
      apiKey: "crsr_explicit",
      onEvent: () => {},
    });
    expect(cfg.apiKey).toBe("crsr_explicit");
  });

  it("falls back to CURSOR_API_KEY env", () => {
    process.env.CURSOR_API_KEY = "crsr_from_env";
    const cfg = resolveConfig({ prompt: "x", cwd: dir, onEvent: () => {} });
    expect(cfg.apiKey).toBe("crsr_from_env");
  });

  it("throws AuthError when no key anywhere", () => {
    expect(() =>
      resolveConfig({ prompt: "x", cwd: dir, onEvent: () => {} }),
    ).toThrow(AuthError);
  });

  it("defaults model to composer-2", () => {
    process.env.CURSOR_API_KEY = "k";
    const cfg = resolveConfig({ prompt: "x", cwd: dir, onEvent: () => {} });
    expect(cfg.model).toBe("composer-2");
  });

  it("respects opts.model", () => {
    process.env.CURSOR_API_KEY = "k";
    const cfg = resolveConfig({
      prompt: "x",
      cwd: dir,
      model: "claude-4-7-opus",
      onEvent: () => {},
    });
    expect(cfg.model).toBe("claude-4-7-opus");
  });

  it("throws ConfigError when cwd missing", () => {
    process.env.CURSOR_API_KEY = "k";
    expect(() =>
      resolveConfig({
        prompt: "x",
        cwd: join(dir, "does-not-exist"),
        onEvent: () => {},
      }),
    ).toThrow(ConfigError);
  });

  it("throws ConfigError when cwd is a file", () => {
    process.env.CURSOR_API_KEY = "k";
    const f = join(dir, "file.txt");
    writeFileSync(f, "x");
    expect(() =>
      resolveConfig({ prompt: "x", cwd: f, onEvent: () => {} }),
    ).toThrow(ConfigError);
  });

  it("throws ConfigError when prompt is empty/whitespace", () => {
    process.env.CURSOR_API_KEY = "k";
    expect(() =>
      resolveConfig({ prompt: "   ", cwd: dir, onEvent: () => {} }),
    ).toThrow(ConfigError);
  });

  it("returns default retry options", () => {
    process.env.CURSOR_API_KEY = "k";
    const cfg = resolveConfig({ prompt: "x", cwd: dir, onEvent: () => {} });
    expect(cfg.retry).toEqual({ attempts: 3, baseDelayMs: 1000 });
  });

  it("merges retry overrides", () => {
    process.env.CURSOR_API_KEY = "k";
    const cfg = resolveConfig({
      prompt: "x",
      cwd: dir,
      onEvent: () => {},
      retry: { attempts: 5 },
    });
    expect(cfg.retry).toEqual({ attempts: 5, baseDelayMs: 1000 });
  });
});

describe("resolveConfig baseDir", () => {
  let dir: string;
  let prevKey: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flow-build-"));
    prevKey = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (prevKey !== undefined) process.env.CURSOR_API_KEY = prevKey;
    else delete process.env.CURSOR_API_KEY;
  });

  it("passes through opts.baseDir when provided", () => {
    process.env.CURSOR_API_KEY = "crsr_test";
    const cfg = resolveConfig({
      prompt: "p",
      cwd: dir,
      baseDir: "/tmp/base",
      onEvent: () => {},
    });
    expect(cfg.baseDir).toBe("/tmp/base");
  });

  it("baseDir is undefined if not provided (caller decides default)", () => {
    process.env.CURSOR_API_KEY = "crsr_test";
    const cfg = resolveConfig({ prompt: "p", cwd: dir, onEvent: () => {} });
    expect(cfg.baseDir).toBeUndefined();
  });
});
