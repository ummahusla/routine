# Cursor SDK Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal CLI (`flow-build run "<prompt>"`) that wraps `@cursor/sdk` and exposes a stable internal `core` API designed to also serve a future UI.

**Architecture:** pnpm monorepo with two packages — `@flow-build/core` (SDK wrapper + narrowed event types + retry/error mapping) and `flow-build` CLI (commander + plain-text renderer). CLI imports only the public surface of core. SDK access is centralized in `core/run.ts`.

**Tech stack:** TypeScript, Node ≥20, pnpm workspaces, `@cursor/sdk`, `commander`, `vitest`, `tsx`, `tsup`, `eslint`, `prettier`.

**Spec:** `docs/superpowers/specs/2026-05-09-cursor-sdk-harness-design.md`

---

## Notes for the implementer

- **TDD discipline:** every behavior task writes the failing test first, runs it to confirm failure, writes the minimal impl, runs again to confirm pass. Do not skip the failing-run step.
- **Commits:** every task ends with one commit. Never include `Co-Authored-By` lines. Conventional Commits (`feat:`, `chore:`, `test:`, `docs:`).
- **No real network calls in tests.** All `@cursor/sdk` calls are mocked via `vi.mock("@cursor/sdk")`. Real-API smoke is done manually per `docs/smoke.md` (Task 16).
- **`@cursor/sdk` version:** the spec references the SDK as published. At install time, run `npm view @cursor/sdk version` and pin to the latest 1.x caret range. If installation fails because the package shape differs from what this plan assumes, stop and surface the diff before continuing.
- **Node 20+ required** for `await using` (Disposable) and stable test runner timers.

---

## Task 1: Initialize pnpm monorepo skeleton

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `.prettierrc`
- Create: `.eslintrc.cjs`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "flow-build-monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.10.0" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "eslint packages",
    "format": "prettier --write \"packages/**/*.ts\"",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.5",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
.env
.env.local
```

- [ ] **Step 5: Create `.npmrc`**

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 6: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 7: Create `.eslintrc.cjs`**

```javascript
/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist", "node_modules", "*.cjs"],
};
```

- [ ] **Step 8: Install root deps**

Run: `pnpm install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 9: Verify pnpm picks up the (currently empty) workspace**

Run: `pnpm -r exec node -e "console.log('ok')"`
Expected: prints nothing (no packages yet) and exits 0.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .npmrc .prettierrc .eslintrc.cjs pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo"
```

---

## Task 2: Scaffold `packages/core` with types

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@flow-build/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@cursor/sdk": "^1.0.0"
  }
}
```

(If `@cursor/sdk@1.x` is not yet published per `npm view @cursor/sdk version`, pin to whatever is current; surface the change in the commit message.)

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/test/**"]
}
```

- [ ] **Step 3: Create `packages/core/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create `packages/core/src/types.ts`**

```typescript
export type Logger = {
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  debug?: (msg: string, ctx?: Record<string, unknown>) => void;
};

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
};

export type RunOptions = {
  prompt: string;
  cwd: string;
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
  onEvent: (e: HarnessEvent) => void;
  logger?: Logger;
  retry?: RetryOptions;
};

export type HarnessEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; name: string; callId: string }
  | { type: "tool_end"; name: string; callId: string; ok: boolean }
  | { type: "status"; phase: "starting" | "running" | "done"; message?: string };

export type RunStatus = "completed" | "cancelled" | "failed";

export type RunResult = {
  status: RunStatus;
  finalText: string;
  usage?: { inputTokens: number; outputTokens: number };
};
```

- [ ] **Step 5: Create stub `packages/core/src/index.ts`**

```typescript
export type {
  Logger,
  RetryOptions,
  RunOptions,
  HarnessEvent,
  RunStatus,
  RunResult,
} from "./types.js";
```

- [ ] **Step 6: Install package deps**

Run: `pnpm install`
Expected: `@cursor/sdk` installed under `packages/core/node_modules/.pnpm/...`. No errors.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @flow-build/core typecheck`
Expected: exits 0 with no output.

- [ ] **Step 8: Commit**

```bash
git add packages/core package.json pnpm-lock.yaml
git commit -m "feat(core): scaffold core package with public types"
```

---

## Task 3: Errors module — classes + SDK mapper (TDD)

**Files:**
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/errors.test.ts`

- [ ] **Step 1: Write failing test for `HarnessError` subclasses**

`packages/core/src/errors.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @flow-build/core test`
Expected: FAIL with "Cannot find module './errors.js'" or similar.

- [ ] **Step 3: Implement `errors.ts`**

`packages/core/src/errors.ts`:

```typescript
type ErrorOpts = { retryable?: boolean; cause?: unknown };

export class HarnessError extends Error {
  readonly retryable: boolean;
  override readonly cause?: unknown;
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message);
    this.name = "HarnessError";
    this.retryable = opts.retryable ?? false;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export class AuthError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: false, ...opts });
    this.name = "AuthError";
  }
}

export class ConfigError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: false, ...opts });
    this.name = "ConfigError";
  }
}

export class NetworkError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: true, ...opts });
    this.name = "NetworkError";
  }
}

export function mapToHarnessError(e: unknown): HarnessError {
  if (e instanceof HarnessError) return e;
  const name = (e as { name?: string } | null | undefined)?.name ?? "";
  const message = (e as { message?: string } | null | undefined)?.message ?? String(e);
  const isRetryable = (e as { isRetryable?: boolean } | null | undefined)?.isRetryable;

  switch (name) {
    case "AuthenticationError":
      return new AuthError(message, { cause: e });
    case "ConfigurationError":
    case "IntegrationNotConnectedError":
      return new ConfigError(message, { cause: e });
    case "RateLimitError":
      return new NetworkError(message, { retryable: true, cause: e });
    case "NetworkError":
      return new NetworkError(message, { retryable: isRetryable ?? true, cause: e });
    case "UnknownAgentError":
    case "UnsupportedRunOperationError":
      return new HarnessError(message, { retryable: false, cause: e });
    default:
      return new HarnessError(message, { retryable: false, cause: e });
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS, all errors-test cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/errors.ts packages/core/src/errors.test.ts
git commit -m "feat(core): add HarnessError hierarchy and SDK error mapper"
```

---

## Task 4: Normalizer for known message types (TDD)

**Files:**
- Create: `packages/core/src/normalizer.ts`
- Create: `packages/core/src/normalizer.test.ts`

- [ ] **Step 1: Write failing test for known message types**

`packages/core/src/normalizer.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { normalize } from "./normalizer.js";
import type { Logger } from "./types.js";

const mkLogger = (): Logger & { warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> } => ({
  warn: vi.fn(),
  debug: vi.fn(),
});

describe("normalize known SDKMessage types", () => {
  it("assistant message with text blocks → text events", () => {
    const log = mkLogger();
    const events = normalize(
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "hello " },
            { type: "text", text: "world" },
          ],
        },
      },
      log,
    );
    expect(events).toEqual([
      { type: "text", delta: "hello " },
      { type: "text", delta: "world" },
    ]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("assistant non-text blocks are skipped (no warn)", () => {
    const log = mkLogger();
    const events = normalize(
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "x", name: "shell", input: {} },
            { type: "text", text: "hi" },
          ],
        },
      },
      log,
    );
    expect(events).toEqual([{ type: "text", delta: "hi" }]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("thinking message → thinking event", () => {
    const events = normalize({ type: "thinking", text: "pondering..." }, mkLogger());
    expect(events).toEqual([{ type: "thinking", delta: "pondering..." }]);
  });

  it("tool_call running → tool_start", () => {
    const events = normalize(
      { type: "tool_call", call_id: "abc", name: "shell", status: "running" },
      mkLogger(),
    );
    expect(events).toEqual([{ type: "tool_start", name: "shell", callId: "abc" }]);
  });

  it("tool_call completed → tool_end ok=true", () => {
    const events = normalize(
      { type: "tool_call", call_id: "abc", name: "shell", status: "completed" },
      mkLogger(),
    );
    expect(events).toEqual([
      { type: "tool_end", name: "shell", callId: "abc", ok: true },
    ]);
  });

  it("tool_call error → tool_end ok=false", () => {
    const events = normalize(
      { type: "tool_call", call_id: "abc", name: "edit", status: "error" },
      mkLogger(),
    );
    expect(events).toEqual([
      { type: "tool_end", name: "edit", callId: "abc", ok: false },
    ]);
  });

  it("status running → status event running", () => {
    const events = normalize({ type: "status", status: "running" }, mkLogger());
    expect(events).toEqual([{ type: "status", phase: "running" }]);
  });

  it("status completed → status event done", () => {
    const events = normalize({ type: "status", status: "completed" }, mkLogger());
    expect(events).toEqual([{ type: "status", phase: "done" }]);
  });

  it("system message dropped silently", () => {
    const log = mkLogger();
    const events = normalize({ type: "system", model: "composer-2", tools: [] }, log);
    expect(events).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("task message dropped silently", () => {
    const events = normalize({ type: "task", status: "ok", text: "x" }, mkLogger());
    expect(events).toEqual([]);
  });

  it("request message dropped silently", () => {
    const events = normalize({ type: "request", request_id: "r1" }, mkLogger());
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @flow-build/core test`
Expected: FAIL with "Cannot find module './normalizer.js'".

- [ ] **Step 3: Implement `normalizer.ts`**

`packages/core/src/normalizer.ts`:

```typescript
import type { HarnessEvent, Logger } from "./types.js";

type Unknown = Record<string, unknown>;

function get<T = unknown>(obj: unknown, key: string): T | undefined {
  if (obj && typeof obj === "object") return (obj as Unknown)[key] as T | undefined;
  return undefined;
}

function mapPhase(status: unknown): HarnessEvent & { type: "status" } {
  switch (status) {
    case "starting":
    case "queued":
      return { type: "status", phase: "starting" };
    case "completed":
    case "succeeded":
    case "done":
      return { type: "status", phase: "done" };
    default:
      return { type: "status", phase: "running" };
  }
}

export function normalize(msg: unknown, logger?: Logger): HarnessEvent[] {
  const type = get<string>(msg, "type");
  switch (type) {
    case "assistant":
      return normalizeAssistant(msg, logger);
    case "thinking":
      return normalizeThinking(msg, logger);
    case "tool_call":
      return normalizeToolCall(msg, logger);
    case "status":
      return [mapPhase(get(msg, "status"))];
    case "system":
    case "task":
    case "request":
    case "user":
      return [];
    default:
      logger?.warn("unknown SDKMessage type", { type });
      return [];
  }
}

function normalizeAssistant(msg: unknown, logger?: Logger): HarnessEvent[] {
  const content = get<unknown[]>(get(msg, "message"), "content");
  if (!Array.isArray(content)) {
    logger?.warn("schema drift", { type: "assistant", field: "message.content" });
    return [];
  }
  const out: HarnessEvent[] = [];
  for (const block of content) {
    if (get<string>(block, "type") === "text") {
      const text = get<string>(block, "text");
      if (typeof text === "string") out.push({ type: "text", delta: text });
      else logger?.warn("schema drift", { type: "assistant", field: "block.text" });
    }
    // non-text blocks (tool_use, etc.) are silently skipped — surfaced via tool_call events instead.
  }
  return out;
}

function normalizeThinking(msg: unknown, logger?: Logger): HarnessEvent[] {
  const text = get<string>(msg, "text");
  if (typeof text !== "string") {
    logger?.warn("schema drift", { type: "thinking", field: "text" });
    return [];
  }
  return [{ type: "thinking", delta: text }];
}

function normalizeToolCall(msg: unknown, logger?: Logger): HarnessEvent[] {
  const name = get<string>(msg, "name");
  const callId = get<string>(msg, "call_id");
  const status = get<string>(msg, "status");
  if (typeof name !== "string" || typeof callId !== "string") {
    logger?.warn("schema drift", { type: "tool_call", field: "name|call_id" });
    return [];
  }
  if (status === "running") return [{ type: "tool_start", name, callId }];
  if (status === "completed") return [{ type: "tool_end", name, callId, ok: true }];
  if (status === "error") return [{ type: "tool_end", name, callId, ok: false }];
  logger?.warn("unknown tool_call status", { status });
  return [];
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS, normalizer known-types cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/normalizer.ts packages/core/src/normalizer.test.ts
git commit -m "feat(core): normalize known SDKMessage types to HarnessEvent"
```

---

## Task 5: Normalizer schema drift + unknown-type handling (TDD)

**Files:**
- Modify: `packages/core/src/normalizer.test.ts`

(`normalizer.ts` already handles drift; this task locks in coverage and confirms warn semantics.)

- [ ] **Step 1: Append schema-drift tests**

Append to `packages/core/src/normalizer.test.ts`:

```typescript
describe("normalize defensive parsing", () => {
  it("unknown type → warn + drop", () => {
    const log = mkLogger();
    const events = normalize({ type: "wat", x: 1 }, log);
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("unknown SDKMessage type", { type: "wat" });
  });

  it("assistant with non-array content → warn + drop entire message", () => {
    const log = mkLogger();
    const events = normalize({ type: "assistant", message: { content: "string" } }, log);
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "assistant",
      field: "message.content",
    });
  });

  it("assistant text block missing text → warn + skip block", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "assistant", message: { content: [{ type: "text" }] } },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "assistant",
      field: "block.text",
    });
  });

  it("thinking missing text → warn + drop", () => {
    const log = mkLogger();
    const events = normalize({ type: "thinking" }, log);
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", { type: "thinking", field: "text" });
  });

  it("tool_call missing name → warn + drop", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "tool_call", call_id: "x", status: "running" },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "tool_call",
      field: "name|call_id",
    });
  });

  it("tool_call missing call_id → warn + drop", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "tool_call", name: "shell", status: "running" },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("schema drift", {
      type: "tool_call",
      field: "name|call_id",
    });
  });

  it("tool_call unknown status → warn + drop", () => {
    const log = mkLogger();
    const events = normalize(
      { type: "tool_call", name: "shell", call_id: "x", status: "weird" },
      log,
    );
    expect(events).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith("unknown tool_call status", { status: "weird" });
  });

  it("works without a logger argument", () => {
    expect(() => normalize({ type: "wat" })).not.toThrow();
    expect(normalize({ type: "wat" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect pass (impl already supports it)**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS, all new defensive cases green.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/normalizer.test.ts
git commit -m "test(core): cover normalizer schema drift and unknown-type warns"
```

---

## Task 6: Retry helper with exponential backoff (TDD)

**Files:**
- Create: `packages/core/src/retry.ts`
- Create: `packages/core/src/retry.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/core/src/retry.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @flow-build/core test`
Expected: FAIL with "Cannot find module './retry.js'".

- [ ] **Step 3: Implement `retry.ts`**

`packages/core/src/retry.ts`:

```typescript
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new AbortedError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS, all retry cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/retry.ts packages/core/src/retry.test.ts
git commit -m "feat(core): add withRetry helper with exponential backoff"
```

---

## Task 7: Config resolver (TDD)

**Files:**
- Create: `packages/core/src/config.ts`
- Create: `packages/core/src/config.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/core/src/config.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @flow-build/core test`
Expected: FAIL with "Cannot find module './config.js'".

- [ ] **Step 3: Implement `config.ts`**

`packages/core/src/config.ts`:

```typescript
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
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config.ts packages/core/src/config.test.ts
git commit -m "feat(core): add resolveConfig with apiKey/cwd/prompt validation"
```

---

## Task 8: `runPrompt` happy path with mocked SDK (TDD)

**Files:**
- Create: `packages/core/src/run.ts`
- Create: `packages/core/src/run.test.ts`
- Create: `packages/core/src/test/fakeSdk.ts`

- [ ] **Step 1: Create the fake SDK helper**

`packages/core/src/test/fakeSdk.ts`:

```typescript
import { vi } from "vitest";

export type FakeStreamItem = unknown;

export type FakeAgentSpec = {
  streamItems?: FakeStreamItem[];
  streamThrows?: { afterIndex: number; error: unknown };
  waitResult?: {
    status?: string;
    usage?: { inputTokens: number; outputTokens: number };
  };
};

export type FakeAgent = {
  agent: {
    agentId: string;
    close: ReturnType<typeof vi.fn>;
    [Symbol.asyncDispose]: () => Promise<void>;
  };
  run: {
    cancel: ReturnType<typeof vi.fn>;
    wait: ReturnType<typeof vi.fn>;
    stream: () => AsyncGenerator<FakeStreamItem>;
  };
};

export function makeFakeAgent(spec: FakeAgentSpec = {}): FakeAgent {
  const close = vi.fn(async () => {});
  const cancel = vi.fn(async () => {});
  const wait = vi.fn(async () => ({
    status: spec.waitResult?.status ?? "completed",
    result: "",
    usage: spec.waitResult?.usage,
  }));

  async function* stream(): AsyncGenerator<FakeStreamItem> {
    const items = spec.streamItems ?? [];
    for (let i = 0; i < items.length; i++) {
      if (spec.streamThrows && i === spec.streamThrows.afterIndex) {
        throw spec.streamThrows.error;
      }
      yield items[i];
    }
    if (spec.streamThrows && spec.streamThrows.afterIndex >= items.length) {
      throw spec.streamThrows.error;
    }
  }

  const agent = {
    agentId: "agent-1",
    close,
    [Symbol.asyncDispose]: async () => {
      await close();
    },
  };

  return { agent, run: { cancel, wait, stream } };
}

export type FakeSdkConfig = {
  createBehavior: Array<{ throws?: unknown; agent?: FakeAgent }>;
  sendBehavior?: { throws?: unknown };
};

export function installFakeSdk(cfg: FakeSdkConfig) {
  let createCallIdx = 0;
  const create = vi.fn(async () => {
    const next = cfg.createBehavior[createCallIdx++];
    if (!next) throw new Error("fake SDK ran out of createBehavior entries");
    if (next.throws) throw next.throws;
    if (!next.agent) throw new Error("fake SDK behavior missing agent");
    const fa = next.agent;
    const send = vi.fn(async () => {
      if (cfg.sendBehavior?.throws) throw cfg.sendBehavior.throws;
      return fa.run;
    });
    return { ...fa.agent, send };
  });
  vi.doMock("@cursor/sdk", () => ({
    Agent: { create },
  }));
  return { create };
}
```

- [ ] **Step 2: Write failing happy-path test**

`packages/core/src/run.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSdk, makeFakeAgent } from "./test/fakeSdk.js";
import type { HarnessEvent } from "./types.js";

const RUN_PATH = "./run.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flow-build-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@cursor/sdk");
});

describe("runPrompt happy path", () => {
  it("streams text + tool events and returns completed", async () => {
    const fa = makeFakeAgent({
      streamItems: [
        { type: "status", status: "running" },
        { type: "tool_call", call_id: "1", name: "shell", status: "running" },
        { type: "tool_call", call_id: "1", name: "shell", status: "completed" },
        { type: "assistant", message: { content: [{ type: "text", text: "hello " }] } },
        { type: "assistant", message: { content: [{ type: "text", text: "world" }] } },
      ],
      waitResult: { status: "completed", usage: { inputTokens: 10, outputTokens: 5 } },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { runPrompt } = await import(RUN_PATH);
    const events: HarnessEvent[] = [];
    const result = await runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: (e) => events.push(e),
    });

    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("hello world");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    expect(events[0]).toEqual({ type: "status", phase: "starting" });
    expect(events[events.length - 1]).toEqual({ type: "status", phase: "done" });

    const types = events.map((e) => e.type);
    expect(types).toContain("tool_start");
    expect(types).toContain("tool_end");
    expect(types.filter((t) => t === "text")).toHaveLength(2);
  });

  it("throws AuthError synchronously when no apiKey", async () => {
    delete process.env.CURSOR_API_KEY;
    installFakeSdk({ createBehavior: [] });
    const { runPrompt } = await import(RUN_PATH);
    const { AuthError } = await import("./errors.js");
    await expect(
      runPrompt({ prompt: "hi", cwd: dir, onEvent: () => {} }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ConfigError when cwd missing", async () => {
    installFakeSdk({ createBehavior: [] });
    const { runPrompt } = await import(RUN_PATH);
    const { ConfigError } = await import("./errors.js");
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: join(dir, "nope"),
        onEvent: () => {},
      }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
```

- [ ] **Step 3: Run test, expect failure**

Run: `pnpm --filter @flow-build/core test`
Expected: FAIL with "Cannot find module './run.js'".

- [ ] **Step 4: Implement `run.ts`**

`packages/core/src/run.ts`:

```typescript
import { Agent } from "@cursor/sdk";
import { resolveConfig } from "./config.js";
import { mapToHarnessError } from "./errors.js";
import { normalize } from "./normalizer.js";
import { withRetry } from "./retry.js";
import type { HarnessEvent, Logger, RunOptions, RunResult, RunStatus } from "./types.js";

type LiveRun = {
  agent: Awaited<ReturnType<typeof Agent.create>>;
  run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>;
};

async function startWithRetry(
  cfg: ReturnType<typeof resolveConfig>,
  signal: AbortSignal | undefined,
  logger: Logger | undefined,
): Promise<LiveRun> {
  return withRetry<LiveRun>(
    async () => {
      let agent;
      try {
        agent = await Agent.create({
          apiKey: cfg.apiKey,
          model: { id: cfg.model },
          local: { cwd: cfg.cwd },
        });
      } catch (e) {
        throw mapToHarnessError(e);
      }
      try {
        const run = await agent.send(cfg.prompt);
        return { agent, run };
      } catch (e) {
        try {
          await agent.close();
        } catch {
          /* ignore disposal failure during retry path */
        }
        throw mapToHarnessError(e);
      }
    },
    { attempts: cfg.retry.attempts, baseDelayMs: cfg.retry.baseDelayMs, signal, logger },
  );
}

export async function runPrompt(opts: RunOptions): Promise<RunResult> {
  const cfg = resolveConfig(opts);
  const { signal, logger } = opts;

  opts.onEvent({ type: "status", phase: "starting" });

  const live = await startWithRetry(cfg, signal, logger);
  let finalText = "";
  let status: RunStatus = "completed";
  let usage: RunResult["usage"];

  try {
    for await (const msg of live.run.stream()) {
      if (signal?.aborted) {
        await live.run.cancel();
        status = "cancelled";
        break;
      }
      const events = normalize(msg, logger);
      for (const e of events) {
        if (e.type === "text") finalText += e.delta;
        opts.onEvent(e);
      }
    }
    if (status !== "cancelled") {
      const wait = await live.run.wait();
      const waitStatus = (wait as { status?: string }).status;
      if (waitStatus === "cancelled") status = "cancelled";
      else if (waitStatus && waitStatus !== "completed") status = "failed";
      const u = (wait as { usage?: { inputTokens: number; outputTokens: number } }).usage;
      if (u) usage = u;
    }
  } catch (e) {
    throw mapToHarnessError(e);
  } finally {
    try {
      await live.agent.close();
    } catch {
      /* swallow disposal errors; primary error already in flight if any */
    }
  }

  opts.onEvent({ type: "status", phase: "done" });
  const result: RunResult = { status, finalText };
  if (usage) result.usage = usage;
  return result;
}
```

- [ ] **Step 5: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS, all run-happy-path cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/run.ts packages/core/src/run.test.ts packages/core/src/test
git commit -m "feat(core): implement runPrompt happy path with mocked SDK harness"
```

---

## Task 9: `runPrompt` retry + mid-stream behavior (TDD)

**Files:**
- Modify: `packages/core/src/run.test.ts`

- [ ] **Step 1: Append retry tests**

Append to `packages/core/src/run.test.ts`:

```typescript
import { NetworkError } from "./errors.js";

describe("runPrompt retry behavior", () => {
  it("retries Agent.create when first attempt throws retryable", async () => {
    vi.useFakeTimers();
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
    });
    const fail = Object.assign(new Error("flap"), { name: "NetworkError", isRetryable: true });
    const fake = installFakeSdk({
      createBehavior: [{ throws: fail }, { agent: fa }],
    });

    const { runPrompt } = await import(RUN_PATH);
    const events: HarnessEvent[] = [];
    const promise = runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: (e) => events.push(e),
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    vi.useRealTimers();

    expect(fake.create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("ok");
  });

  it("throws NetworkError after retry exhaustion", async () => {
    vi.useFakeTimers();
    const fail = Object.assign(new Error("flap"), { name: "NetworkError", isRetryable: true });
    installFakeSdk({
      createBehavior: [{ throws: fail }, { throws: fail }, { throws: fail }],
    });

    const { runPrompt } = await import(RUN_PATH);
    const promise = runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: () => {},
    });
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).rejects.toBeInstanceOf(NetworkError);
    vi.useRealTimers();
  });

  it("does NOT retry on mid-stream error (after first event)", async () => {
    const fail = Object.assign(new Error("net flap"), { name: "NetworkError", isRetryable: true });
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "partial" }] } },
      ],
      streamThrows: { afterIndex: 1, error: fail },
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { runPrompt } = await import(RUN_PATH);
    const events: HarnessEvent[] = [];
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: dir,
        onEvent: (e) => events.push(e),
      }),
    ).rejects.toBeInstanceOf(NetworkError);

    expect(fake.create).toHaveBeenCalledTimes(1);
    const partial = events.find((e) => e.type === "text");
    expect(partial).toBeDefined();
  });

  it("does not retry non-retryable Agent.create error", async () => {
    const fail = Object.assign(new Error("bad key"), { name: "AuthenticationError" });
    const fake = installFakeSdk({ createBehavior: [{ throws: fail }] });

    const { runPrompt } = await import(RUN_PATH);
    const { AuthError } = await import("./errors.js");
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: dir,
        onEvent: () => {},
      }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(fake.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS, all retry cases green.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/run.test.ts
git commit -m "test(core): cover runPrompt retry, exhaustion, and mid-stream error"
```

---

## Task 10: `runPrompt` cancellation (TDD)

**Files:**
- Modify: `packages/core/src/run.test.ts`

- [ ] **Step 1: Append cancellation tests**

Append to `packages/core/src/run.test.ts`:

```typescript
describe("runPrompt cancellation", () => {
  it("aborts the stream and returns cancelled status", async () => {
    let resolveStreamGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveStreamGate = r;
    });

    const ctl = new AbortController();
    const cancel = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const wait = vi.fn(async () => ({ status: "cancelled" }));

    async function* stream() {
      yield { type: "assistant", message: { content: [{ type: "text", text: "first" }] } };
      await gate;
      yield { type: "assistant", message: { content: [{ type: "text", text: "should-not-emit" }] } };
    }

    vi.doMock("@cursor/sdk", () => ({
      Agent: {
        create: vi.fn(async () => ({
          agentId: "a",
          close,
          [Symbol.asyncDispose]: close,
          send: vi.fn(async () => ({ cancel, wait, stream })),
        })),
      },
    }));

    const { runPrompt } = await import(RUN_PATH);
    const events: HarnessEvent[] = [];
    const promise = runPrompt({
      prompt: "hi",
      cwd: dir,
      signal: ctl.signal,
      onEvent: (e) => events.push(e),
    });

    await new Promise((r) => setImmediate(r));
    ctl.abort();
    resolveStreamGate();
    const result = await promise;

    expect(result.status).toBe("cancelled");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "text" && e.delta === "first")).toBe(true);
    expect(events.some((e) => e.type === "text" && e.delta === "should-not-emit")).toBe(false);
    expect(close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/run.test.ts
git commit -m "test(core): cover runPrompt cancellation via AbortSignal"
```

---

## Task 11: Wire core public API + index smoke

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/index.test.ts`

- [ ] **Step 1: Write failing public-surface test**

`packages/core/src/index.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import * as core from "./index.js";

describe("core public surface", () => {
  it("exports runPrompt", () => {
    expect(typeof core.runPrompt).toBe("function");
  });

  it("exports error classes", () => {
    expect(typeof core.HarnessError).toBe("function");
    expect(typeof core.AuthError).toBe("function");
    expect(typeof core.ConfigError).toBe("function");
    expect(typeof core.NetworkError).toBe("function");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter @flow-build/core test`
Expected: FAIL with "core.runPrompt is not a function".

- [ ] **Step 3: Update `packages/core/src/index.ts`**

Replace contents:

```typescript
export { runPrompt } from "./run.js";
export type {
  Logger,
  RetryOptions,
  RunOptions,
  HarnessEvent,
  RunStatus,
  RunResult,
} from "./types.js";
export {
  HarnessError,
  AuthError,
  ConfigError,
  NetworkError,
} from "./errors.js";
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter @flow-build/core test && pnpm --filter @flow-build/core typecheck`
Expected: both PASS.

- [ ] **Step 5: Build core**

Run: `pnpm --filter @flow-build/core build`
Expected: `packages/core/dist/index.js` and `index.d.ts` produced.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "feat(core): wire public API exports for runPrompt and errors"
```

---

## Task 12: Scaffold `packages/cli`

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/main.ts`

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "flow-build",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "flow-build": "./dist/main.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/main.ts"
  },
  "dependencies": {
    "@flow-build/core": "workspace:*",
    "commander": "^12.0.0",
    "picocolors": "^1.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/cli/tsup.config.ts`**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  splitting: false,
  sourcemap: true,
  dts: false,
});
```

- [ ] **Step 4: Create `packages/cli/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Create stub `packages/cli/src/main.ts`**

```typescript
export {};
```

- [ ] **Step 6: Install deps**

Run: `pnpm install`
Expected: `commander`, `picocolors`, `tsup` resolve. Workspace link to `@flow-build/core` set up.

- [ ] **Step 7: Typecheck both packages**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "chore(cli): scaffold cli package"
```

---

## Task 13: Renderer (TDD)

**Files:**
- Create: `packages/cli/src/render.ts`
- Create: `packages/cli/src/render.test.ts`

- [ ] **Step 1: Write failing render tests**

`packages/cli/src/render.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { makeRenderer } from "./render.js";
import type { HarnessEvent } from "@flow-build/core";

function captureWrites() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: { write: (s: string) => stdout.push(s) },
    stderr: { write: (s: string) => stderr.push(s) },
    capturedStdout: () => stdout.join(""),
    capturedStderr: () => stderr.join(""),
  };
}

describe("renderer", () => {
  it("text deltas go to stdout in order", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    const events: HarnessEvent[] = [
      { type: "text", delta: "hello " },
      { type: "text", delta: "world" },
    ];
    events.forEach(render);
    expect(cap.capturedStdout()).toBe("hello world");
  });

  it("status events go to stderr", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "status", phase: "starting" });
    render({ type: "status", phase: "done" });
    expect(cap.capturedStderr()).toContain("[starting]");
    expect(cap.capturedStderr()).toContain("[done]");
    expect(cap.capturedStdout()).toBe("");
  });

  it("tool_start prints labelled line", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "tool_start", name: "shell", callId: "1" });
    expect(cap.capturedStdout()).toContain("[tool: shell]");
  });

  it("tool_end ok=true prints check, ok=false prints x", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "tool_end", name: "shell", callId: "1", ok: true });
    render({ type: "tool_end", name: "edit", callId: "2", ok: false });
    const out = cap.capturedStdout();
    expect(out).toContain("[tool: shell ✓]");
    expect(out).toContain("[tool: edit ✗]");
  });

  it("thinking events go to stdout", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "thinking", delta: "considering..." });
    expect(cap.capturedStdout()).toContain("considering...");
  });

  it("does not emit ANSI escapes when color is false", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: false });
    render({ type: "tool_start", name: "shell", callId: "1" });
    render({ type: "thinking", delta: "x" });
    expect(cap.capturedStdout()).not.toMatch(/\[/);
  });

  it("emits ANSI escapes when color is true", () => {
    const cap = captureWrites();
    const render = makeRenderer({ stdout: cap.stdout, stderr: cap.stderr, color: true });
    render({ type: "tool_start", name: "shell", callId: "1" });
    expect(cap.capturedStdout()).toMatch(/\[/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter flow-build test`
Expected: FAIL with "Cannot find module './render.js'".

- [ ] **Step 3: Implement `render.ts`**

`packages/cli/src/render.ts`:

```typescript
import type { HarnessEvent } from "@flow-build/core";
import pc from "picocolors";

type WriteStream = { write: (s: string) => unknown };

export type RenderOpts = {
  stdout: WriteStream;
  stderr: WriteStream;
  color: boolean;
};

export function makeRenderer(opts: RenderOpts): (e: HarnessEvent) => void {
  const colorize = opts.color ? pc : ({
    cyan: (s: string) => s,
    dim: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
  } as Pick<typeof pc, "cyan" | "dim" | "green" | "red">);

  return function render(e: HarnessEvent): void {
    switch (e.type) {
      case "text":
        opts.stdout.write(e.delta);
        return;
      case "thinking":
        opts.stdout.write(colorize.dim(e.delta));
        return;
      case "tool_start":
        opts.stdout.write("\n" + colorize.cyan(`[tool: ${e.name}]`) + "\n");
        return;
      case "tool_end": {
        const mark = e.ok ? colorize.green("✓") : colorize.red("✗");
        opts.stdout.write(colorize.cyan(`[tool: ${e.name} ${mark}]`) + "\n");
        return;
      }
      case "status":
        opts.stderr.write(`[${e.phase}]\n`);
        return;
    }
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm --filter flow-build test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/render.ts packages/cli/src/render.test.ts
git commit -m "feat(cli): add renderer for HarnessEvent stream"
```

---

## Task 14: CLI entry (`main.ts`) with commander wiring

**Files:**
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: Implement `main.ts`**

Replace `packages/cli/src/main.ts`:

```typescript
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  runPrompt,
  AuthError,
  ConfigError,
  NetworkError,
  HarnessError,
} from "@flow-build/core";
import type { Logger } from "@flow-build/core";
import { makeRenderer } from "./render.js";

type CliDeps = {
  argv: string[];
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  isTTY: boolean;
  signal: AbortSignal;
  exit: (code: number) => never;
};

export async function runCli(deps: CliDeps): Promise<void> {
  const program = new Command();
  program
    .name("flow-build")
    .description("Cursor SDK harness — CLI")
    .exitOverride();

  program
    .command("run")
    .argument("<prompt>", "prompt to send to the agent")
    .option("--cwd <path>", "working directory", process.cwd())
    .option("--model <id>", "model id", "composer-2")
    .option("--max-retries <n>", "max retry attempts", (v) => parseInt(v, 10), 3)
    .option("--no-retry", "disable retries (sets attempts=1)")
    .option("--verbose", "enable debug logs", false)
    .action(async (prompt: string, opts: RunCmdOpts) => {
      await executeRun(prompt, opts, deps);
    });

  try {
    await program.parseAsync(deps.argv);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") return;
    deps.stderr.write(`error: ${err.message ?? String(e)}\n`);
    deps.exit(1);
  }
}

type RunCmdOpts = {
  cwd: string;
  model: string;
  maxRetries: number;
  retry: boolean;
  verbose: boolean;
};

async function executeRun(
  prompt: string,
  opts: RunCmdOpts,
  deps: CliDeps,
): Promise<void> {
  const render = makeRenderer({
    stdout: deps.stdout,
    stderr: deps.stderr,
    color: deps.isTTY,
  });

  const logger: Logger = {
    warn: (msg, ctx) => {
      deps.stderr.write(`[warn] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}\n`);
    },
    debug: opts.verbose
      ? (msg, ctx) => {
          deps.stderr.write(`[debug] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}\n`);
        }
      : undefined,
  };

  const attempts = opts.retry ? opts.maxRetries : 1;

  try {
    const result = await runPrompt({
      prompt,
      cwd: opts.cwd,
      model: opts.model,
      signal: deps.signal,
      onEvent: render,
      logger,
      retry: { attempts },
    });

    if (result.status === "completed") deps.exit(0);
    if (result.status === "cancelled") deps.exit(130);
    deps.exit(1);
  } catch (e) {
    deps.stderr.write(`\nerror: ${(e as Error).message}\n`);
    if (opts.verbose && (e as { cause?: unknown }).cause) {
      deps.stderr.write(`cause: ${String((e as { cause?: unknown }).cause)}\n`);
    }
    if (e instanceof AuthError) deps.exit(2);
    if (e instanceof ConfigError) deps.exit(2);
    if (e instanceof NetworkError) deps.exit(3);
    if (e instanceof HarnessError) deps.exit(1);
    deps.exit(1);
  }
}

const isMainModule =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());
  runCli({
    argv: process.argv,
    stdout: process.stdout,
    stderr: process.stderr,
    isTTY: process.stdout.isTTY ?? false,
    signal: controller.signal,
    exit: process.exit,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter flow-build typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/main.ts
git commit -m "feat(cli): wire commander entry point with run command"
```

---

## Task 15: CLI smoke tests (TDD)

**Files:**
- Create: `packages/cli/src/main.test.ts`

- [ ] **Step 1: Write CLI smoke tests**

`packages/cli/src/main.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flow-build-cli-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@flow-build/core");
});

function fakeStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: { write: (s: string) => (stdout.push(s), true) } as unknown as NodeJS.WritableStream,
    stderr: { write: (s: string) => (stderr.push(s), true) } as unknown as NodeJS.WritableStream,
    out: () => stdout.join(""),
    err: () => stderr.join(""),
  };
}

function exitFake(): { exit: (code: number) => never; codes: number[] } {
  const codes: number[] = [];
  const exit = (code: number) => {
    codes.push(code);
    throw new Error(`__exit:${code}`);
  };
  return { exit: exit as (code: number) => never, codes };
}

async function loadCli(coreImpl: object) {
  vi.doMock("@flow-build/core", () => coreImpl);
  return await import("./main.js");
}

describe("CLI smoke", () => {
  it("happy path → exit 0, text on stdout, status on stderr", async () => {
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async (opts: { onEvent: (e: unknown) => void }) => {
        opts.onEvent({ type: "status", phase: "starting" });
        opts.onEvent({ type: "text", delta: "hi " });
        opts.onEvent({ type: "text", delta: "there" });
        opts.onEvent({ type: "status", phase: "done" });
        return { status: "completed", finalText: "hi there" };
      }),
      AuthError: class AuthError extends Error {},
      ConfigError: class ConfigError extends Error {},
      NetworkError: class NetworkError extends Error {},
      HarnessError: class HarnessError extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();

    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:0");
    expect(ex.codes).toEqual([0]);
    expect(streams.out()).toContain("hi there");
    expect(streams.err()).toContain("[starting]");
    expect(streams.err()).toContain("[done]");
  });

  it("AuthError → exit 2", async () => {
    class AuthError extends Error {}
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async () => {
        throw new AuthError("missing key");
      }),
      AuthError,
      ConfigError: class extends Error {},
      NetworkError: class extends Error {},
      HarnessError: class extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();

    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:2");
    expect(ex.codes).toEqual([2]);
    expect(streams.err()).toContain("missing key");
  });

  it("NetworkError → exit 3", async () => {
    class NetworkError extends Error {}
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async () => {
        throw new NetworkError("no net");
      }),
      AuthError: class extends Error {},
      ConfigError: class extends Error {},
      NetworkError,
      HarnessError: class extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:3");
    expect(ex.codes).toEqual([3]);
  });

  it("cancelled status → exit 130", async () => {
    const { runCli } = await loadCli({
      runPrompt: vi.fn(async () => ({ status: "cancelled", finalText: "" })),
      AuthError: class extends Error {},
      ConfigError: class extends Error {},
      NetworkError: class extends Error {},
      HarnessError: class extends Error {},
    });
    const streams = fakeStreams();
    const ex = exitFake();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: ["node", "flow-build", "run", "hello", "--cwd", dir],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: ex.exit,
      }),
    ).rejects.toThrow("__exit:130");
    expect(ex.codes).toEqual([130]);
  });
});
```

- [ ] **Step 2: Run test, expect pass**

Run: `pnpm --filter flow-build test`
Expected: PASS, all CLI smoke cases green.

- [ ] **Step 3: Build CLI bundle**

Run: `pnpm --filter flow-build build`
Expected: `packages/cli/dist/main.js` produced; first line `#!/usr/bin/env node`.

- [ ] **Step 4: Make bundle executable + manual sanity (no API key needed for help)**

Run: `chmod +x packages/cli/dist/main.js && node packages/cli/dist/main.js --help`
Expected: prints commander help text including `run <prompt>`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/main.test.ts
git commit -m "test(cli): cover exit codes for happy/auth/network/cancelled paths"
```

---

## Task 16: Smoke checklist + final wire-up

**Files:**
- Create: `docs/smoke.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/smoke.md`**

```markdown
# Manual Smoke Checklist

Run before tagging a release. Requires a valid `CURSOR_API_KEY` and a small repo
checked out at `$REPO`.

## 1. Help

    node packages/cli/dist/main.js --help

Expect: usage text mentioning `run <prompt>`. Exit 0.

## 2. Missing key

    unset CURSOR_API_KEY
    node packages/cli/dist/main.js run "hi" --cwd "$REPO"

Expect: stderr contains "Missing Cursor API key". Exit 2.

## 3. Happy path

    export CURSOR_API_KEY="crsr_..."
    node packages/cli/dist/main.js run "Summarize this repo in 2 sentences" --cwd "$REPO"

Expect: streamed text on stdout. `[starting]` and `[done]` markers on stderr.
Possible `[tool: ...]` lines while the agent reads the repo. Exit 0.

## 4. Cancellation

Start (3) again, hit Ctrl-C mid-stream.

Expect: stops promptly. Exit 130.

## 5. Verbose

    node packages/cli/dist/main.js run "hi" --cwd "$REPO" --verbose

Expect: `[debug] retrying ...` lines if any retry path triggers.
```

- [ ] **Step 2: Replace `README.md`**

```markdown
# flow-build

Minimal CLI wrapper around the [Cursor SDK](https://cursor.com/docs/sdk/typescript)
that streams agent output with tool-call indicators. Designed as the foundation
for a future UI: a stable `@flow-build/core` API powers both the CLI and any
later presenter.

## Status

Pre-alpha. Spec: `docs/superpowers/specs/2026-05-09-cursor-sdk-harness-design.md`.
Plan: `docs/superpowers/plans/2026-05-09-cursor-sdk-harness.md`.

## Quick start

    pnpm install
    pnpm -r build
    export CURSOR_API_KEY="crsr_..."
    node packages/cli/dist/main.js run "summarize this repo" --cwd .

## Layout

- `packages/core` — `runPrompt`, narrowed `HarnessEvent` union, error mapping, retry
- `packages/cli` — `flow-build` binary; renderer; commander wiring
- `docs/smoke.md` — manual release checks
```

- [ ] **Step 3: Run full test + typecheck + build sweep**

Run: `pnpm test && pnpm typecheck && pnpm -r build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add docs/smoke.md README.md
git commit -m "docs: add smoke checklist and update README for v1"
```

---

## Done criteria

After all 16 tasks:

- `pnpm test` passes (~40 tests across core + cli).
- `pnpm typecheck` clean.
- `pnpm -r build` produces `packages/core/dist` and `packages/cli/dist/main.js`.
- `node packages/cli/dist/main.js --help` shows usage.
- `docs/smoke.md` exists; manual smoke #1, #2 pass without an API key.
- Spec sections 2–7 each have at least one passing test.
- No `Co-Authored-By` lines in any commit on the branch.

Real-API smoke (#3, #4, #5 in `docs/smoke.md`) is operator-driven and not part
of automated done criteria.
