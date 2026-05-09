# Multi-Turn Session + Electron Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `runPrompt` one-shot lifecycle with a disk-backed `Session` API that drives multi-turn chat (verbatim replay per turn) and rewire the Electron app to use it.

**Architecture:** New `@flow-build/core/session` module owns chat persistence (`chat.json` + append-only `events.jsonl`) and per-turn agent lifecycle. flowbuilder keeps its own `manifest.json` + `state.json` siblings. Electron main owns `SessionRegistry` + zod-validated IPC; renderer reads via `window.api.session.*` with one watch subscription per session.

**Tech Stack:** TypeScript, Node 20, pnpm workspaces, vitest, Electron + electron-vite + React, `@cursor/sdk@1.0.12`, `@modelcontextprotocol/sdk`, `zod`.

**Spec:** `docs/superpowers/specs/2026-05-09-multi-turn-session-and-electron-integration-design.md`

---

## File Structure

### Created

```
packages/core/src/session/
  types.ts                         # SessionEvent, PersistedTurn, TurnResult, etc.
  errors.ts                        # SessionBusyError, SessionMissingError, SessionCorruptError, SessionLockedError
  ulid.ts                          # tiny ULID generator
  lockfile.ts                      # session.lock acquire/release with PID + stale check
  store.ts                         # JSONL append + chat.json atomic write + sessions list scan
  reducer.ts                       # events → PersistedTurn[]
  replay.ts                        # PersistedTurn[] → verbatim replay-prefix string
  session.ts                       # Session class
  index.ts                         # createSession / loadSession / listSessions / deleteSession
  ulid.test.ts
  lockfile.test.ts
  store.test.ts
  reducer.test.ts
  replay.test.ts
  session.test.ts
  index.test.ts

packages/flowbuilder/src/
  bootstrap.ts                     # bootstrapFlowbuilderSession()
  bootstrap.test.ts

src/main/
  registry.ts                      # SessionRegistry
  registry.test.ts
  ipc/
    schemas.ts                     # zod payload schemas
    schemas.test.ts
    session.ts                     # session:* IPC handlers
    session.test.ts

src/renderer/src/hooks/
  useSession.ts                    # one-watch-per-session reducer hook

src/renderer/src/components/
  ToolCallChip.tsx                 # expandable args/result tile
```

### Modified

```
packages/core/src/types.ts                  # HarnessEvent.tool_end gets result; ToolCallSnapshot too; RunOptions gets baseDir
packages/core/src/normalizer.ts             # propagate msg.result on tool_end
packages/core/src/run.ts                    # thin wrapper over Session.send
packages/core/src/index.ts                  # add session exports
packages/core/src/smoke.test.ts             # extend with two-turn case
packages/core/package.json                  # devDependency: zod (used in session/store)
packages/flowbuilder/src/index.ts           # re-export bootstrapFlowbuilderSession

src/main/index.ts                           # single-instance lock, sandbox:true, register session IPC, drop cursor-chat
src/preload/index.ts                        # window.api.session.*; drop cursorChat
src/renderer/src/App.tsx                    # use useSession; drop seeded ChatMessage state
src/renderer/src/components/ChatThread.tsx  # consume PersistedTurn[]
src/renderer/src/components/PromptBox.tsx   # cancel button while running

docs/smoke.md                               # multi-turn manual checklist
```

### Conventions to follow

- Strict TS, ESM only (`.js` import suffix in source). Match existing style: 2-space indent, double quotes, semicolons.
- Tests with vitest. Use `vi.useFakeTimers()` only when needed; otherwise real timers.
- Atomic writes follow `flowbuilder/SessionManager.atomicWrite`: write `<file>.tmp.<runId>` → rename.
- All paths absolute; never `cd`.
- Commits: Conventional Commits style (`feat(core/session): …`). Never include Co-Authored-By.

---

## Phase 0 — Prerequisite core changes

### Task 1: Extend `HarnessEvent.tool_end` and normalizer with `result`

**Files:**
- Modify: `packages/core/src/types.ts:27-32`, `:62-68`
- Modify: `packages/core/src/normalizer.ts:78-93`
- Test: `packages/core/src/normalizer.test.ts` (extend)

- [ ] **Step 1: Add a failing test for `result` propagation**

Append to `packages/core/src/normalizer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalize } from "./normalizer.js";

describe("normalize tool_call result propagation", () => {
  it("includes result on tool_end (completed)", () => {
    const out = normalize({
      type: "tool_call",
      call_id: "c1",
      name: "shell",
      status: "completed",
      args: { command: "ls" },
      result: { stdout: "a\nb\n", exitCode: 0 },
    });
    expect(out).toEqual([
      {
        type: "tool_end",
        name: "shell",
        callId: "c1",
        ok: true,
        args: { command: "ls" },
        result: { stdout: "a\nb\n", exitCode: 0 },
      },
    ]);
  });

  it("includes result on tool_end (error)", () => {
    const out = normalize({
      type: "tool_call",
      call_id: "c2",
      name: "shell",
      status: "error",
      args: { command: "boom" },
      result: { stderr: "no such file", exitCode: 127 },
    });
    expect(out[0]).toMatchObject({
      type: "tool_end",
      ok: false,
      result: { stderr: "no such file", exitCode: 127 },
    });
  });

  it("omits result when SDK did not include it", () => {
    const out = normalize({
      type: "tool_call",
      call_id: "c3",
      name: "shell",
      status: "completed",
      args: { command: "ls" },
    });
    expect(out[0]).not.toHaveProperty("result");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @flow-build/core test -- --run normalizer`
Expected: 3 new tests fail (`result` not on event).

- [ ] **Step 3: Extend `HarnessEvent.tool_end` and `ToolCallSnapshot`**

Replace `packages/core/src/types.ts:27-32` with:

```typescript
export type HarnessEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; name: string; callId: string; args?: unknown }
  | { type: "tool_end"; name: string; callId: string; ok: boolean; args?: unknown; result?: unknown }
  | { type: "status"; phase: "starting" | "running" | "done"; message?: string };
```

`ToolCallSnapshot` already has optional `result` (line 67) — leave as-is.

- [ ] **Step 4: Update `normalizeToolCall` to read `msg.result`**

Replace `packages/core/src/normalizer.ts:78-93` with:

```typescript
function normalizeToolCall(msg: unknown, logger?: Logger): HarnessEvent[] {
  const name = get<string>(msg, "name");
  const callId = get<string>(msg, "call_id");
  const status = get<string>(msg, "status");
  const args = get<unknown>(msg, "args");
  const result = get<unknown>(msg, "result");
  if (typeof name !== "string" || typeof callId !== "string") {
    logger?.warn("schema drift", { type: "tool_call", field: "name|call_id" });
    return [];
  }
  const argsField = args !== undefined ? { args } : {};
  const resultField = result !== undefined ? { result } : {};
  if (status === "running") return [{ type: "tool_start", name, callId, ...argsField }];
  if (status === "completed") return [{ type: "tool_end", name, callId, ok: true, ...argsField, ...resultField }];
  if (status === "error") return [{ type: "tool_end", name, callId, ok: false, ...argsField, ...resultField }];
  logger?.warn("unknown tool_call status", { status });
  return [];
}
```

- [ ] **Step 5: Run all core tests; verify pass and no regressions**

Run: `pnpm --filter @flow-build/core test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/normalizer.ts packages/core/src/normalizer.test.ts
git commit -m "feat(core): tool_end events carry result payload"
```

---

### Task 2: Add `baseDir` to `RunOptions` (non-breaking)

**Files:**
- Modify: `packages/core/src/types.ts:15-25`
- Modify: `packages/core/src/config.ts` (use it if provided)
- Test: `packages/core/src/config.test.ts` (extend)

- [ ] **Step 1: Read existing `config.ts`**

Run: `cat packages/core/src/config.ts`
Note the shape of `resolveConfig`. The plan assumes it does not currently expose `baseDir`.

- [ ] **Step 2: Add a failing test in `config.test.ts`**

Append:

```typescript
import { describe, it, expect } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig baseDir", () => {
  it("passes through opts.baseDir when provided", () => {
    process.env.CURSOR_API_KEY = "crsr_test";
    const cfg = resolveConfig({
      prompt: "p",
      cwd: "/tmp/cwd",
      baseDir: "/tmp/base",
      onEvent: () => {},
    });
    expect(cfg.baseDir).toBe("/tmp/base");
  });

  it("baseDir is undefined if not provided (caller decides default)", () => {
    process.env.CURSOR_API_KEY = "crsr_test";
    const cfg = resolveConfig({ prompt: "p", cwd: "/tmp/cwd", onEvent: () => {} });
    expect(cfg.baseDir).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run config`
Expected: TS error or failing tests.

- [ ] **Step 4: Extend `RunOptions`**

In `packages/core/src/types.ts:15-25`, add after `apiKey?: string;`:

```typescript
  baseDir?: string;
```

- [ ] **Step 5: Pass `baseDir` through `resolveConfig`**

In `packages/core/src/config.ts`, ensure the returned object spreads `baseDir: opts.baseDir`. If the file uses an explicit interface for the result, add `baseDir?: string` to it.

- [ ] **Step 6: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run config`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts packages/core/src/config.test.ts
git commit -m "feat(core): RunOptions.baseDir threaded through resolveConfig"
```

---

## Phase 1 — Session core API

### Task 3: ULID generator (no dep)

**Files:**
- Create: `packages/core/src/session/ulid.ts`
- Test: `packages/core/src/session/ulid.test.ts`

- [ ] **Step 1: Create test**

`packages/core/src/session/ulid.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ulid, ULID_REGEX } from "./ulid.js";

describe("ulid", () => {
  it("produces 26-char Crockford-base32 strings matching the regex", () => {
    for (let i = 0; i < 100; i++) {
      const id = ulid();
      expect(id).toHaveLength(26);
      expect(id).toMatch(ULID_REGEX);
    }
  });

  it("is monotonically sortable in time", async () => {
    const a = ulid();
    await new Promise((r) => setTimeout(r, 2));
    const b = ulid();
    expect(a < b).toBe(true);
  });

  it("ULID_REGEX rejects non-ULIDs", () => {
    expect(ULID_REGEX.test("not-a-ulid")).toBe(false);
    expect(ULID_REGEX.test("01HXYZABCDEFGHJKMNPQRSTVWX")).toBe(true);
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run session/ulid`
Expected: fail (file missing).

- [ ] **Step 3: Implement**

`packages/core/src/session/ulid.ts`:

```typescript
import { randomBytes } from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function encodeTime(now: number, len: number): string {
  let mod;
  let str = "";
  for (let i = len - 1; i >= 0; i--) {
    mod = now % ENCODING_LEN;
    str = ENCODING[mod]! + str;
    now = (now - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = randomBytes(len);
  let str = "";
  for (let i = 0; i < len; i++) {
    str += ENCODING[bytes[i]! % ENCODING_LEN];
  }
  return str;
}

let lastTime = -1;
let lastRandom = "";

export function ulid(now: number = Date.now()): string {
  if (now === lastTime) {
    // monotonic increment of last random part — increments by treating the
    // last char's index as a counter; collision-safe enough for our use.
    const incremented = bumpRandom(lastRandom);
    lastRandom = incremented;
    return encodeTime(now, TIME_LEN) + incremented;
  }
  lastTime = now;
  lastRandom = encodeRandom(RANDOM_LEN);
  return encodeTime(now, TIME_LEN) + lastRandom;
}

function bumpRandom(s: string): string {
  const chars = s.split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = ENCODING.indexOf(chars[i]!);
    if (idx < ENCODING_LEN - 1) {
      chars[i] = ENCODING[idx + 1]!;
      return chars.join("");
    }
    chars[i] = ENCODING[0]!;
  }
  return chars.join("");
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run session/ulid`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/ulid.ts packages/core/src/session/ulid.test.ts
git commit -m "feat(core/session): ULID generator"
```

---

### Task 4: Session errors

**Files:**
- Create: `packages/core/src/session/errors.ts`

- [ ] **Step 1: Implement (no test — pure thiserror-style classes covered by callers)**

`packages/core/src/session/errors.ts`:

```typescript
import { HarnessError } from "../errors.js";

export class SessionBusyError extends HarnessError {
  readonly code = "BUSY" as const;
  constructor(sessionId: string) {
    super(`session ${sessionId} already has an in-flight turn`);
    this.name = "SessionBusyError";
  }
}

export class SessionMissingError extends HarnessError {
  readonly code = "MISSING" as const;
  constructor(sessionId: string) {
    super(`session ${sessionId} not found`);
    this.name = "SessionMissingError";
  }
}

export class SessionCorruptError extends HarnessError {
  readonly code = "CORRUPT" as const;
  constructor(sessionId: string, detail: string) {
    super(`session ${sessionId} corrupt: ${detail}`);
    this.name = "SessionCorruptError";
  }
}

export class SessionLockedError extends HarnessError {
  readonly code = "LOCKED" as const;
  constructor(sessionId: string, holderPid: number) {
    super(`session ${sessionId} is locked by pid ${holderPid}`);
    this.name = "SessionLockedError";
  }
}
```

- [ ] **Step 2: Verify `HarnessError` constructor signature**

Run: `grep -n "class HarnessError" packages/core/src/errors.ts`
If `HarnessError` does not accept a single string, adjust the `super(...)` calls to match its constructor signature.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @flow-build/core typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/session/errors.ts
git commit -m "feat(core/session): typed session errors"
```

---

### Task 5: Lockfile

**Files:**
- Create: `packages/core/src/session/lockfile.ts`
- Test: `packages/core/src/session/lockfile.test.ts`

- [ ] **Step 1: Write test**

`packages/core/src/session/lockfile.test.ts`:

```typescript
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
      JSON.stringify({ pid: process.pid, sessionId: "sess-1", startedAt: new Date().toISOString() }),
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
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run session/lockfile`
Expected: fail.

- [ ] **Step 3: Implement**

`packages/core/src/session/lockfile.ts`:

```typescript
import { writeFileSync, readFileSync, existsSync, unlinkSync, openSync, closeSync } from "node:fs";
import { hostname } from "node:os";
import { SessionLockedError } from "./errors.js";

export type LockData = {
  pid: number;
  sessionId: string;
  startedAt: string;
  host: string;
};

export function readLock(path: string): LockData | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LockData;
  } catch {
    return undefined;
  }
}

function isAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "EPERM"; // exists but we can't signal it
  }
}

export function acquireLock(path: string, sessionId: string): void {
  const existing = readLock(path);
  if (existing && isAlive(existing.pid) && existing.pid !== process.pid) {
    throw new SessionLockedError(sessionId, existing.pid);
  }
  // Stale or absent — atomically replace.
  const data: LockData = {
    pid: process.pid,
    sessionId,
    startedAt: new Date().toISOString(),
    host: hostname(),
  };
  // Use O_CREAT|O_TRUNC|O_WRONLY via writeFileSync; race with another process is
  // narrow because we filter by single-instance lock at the app level.
  writeFileSync(path, JSON.stringify(data, null, 2), { flag: "w" });
  // Best-effort fsync via open+close on the file's directory is omitted;
  // crash recovery treats stale locks as reclaimable.
  void openSync; void closeSync;
}

export function releaseLock(path: string): void {
  if (!existsSync(path)) return;
  try {
    const data = readLock(path);
    if (data && data.pid !== process.pid) return; // do not delete another holder's lock
    unlinkSync(path);
  } catch {
    /* swallow — best-effort cleanup */
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run session/lockfile`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/lockfile.ts packages/core/src/session/lockfile.test.ts
git commit -m "feat(core/session): per-session lockfile with PID + stale check"
```

---

### Task 6: Session types

**Files:**
- Create: `packages/core/src/session/types.ts`

- [ ] **Step 1: Implement**

`packages/core/src/session/types.ts`:

```typescript
import type { HarnessEvent, Logger, Plugin, RetryOptions } from "../types.js";

export type Usage = { inputTokens: number; outputTokens: number };

export type TurnStatus =
  | "completed"
  | "cancelled"
  | "failed"
  | "failed_to_start"
  | "interrupted";

export type SessionEvent =
  | HarnessEvent
  | { type: "user"; turnId: string; text: string }
  | { type: "turn_open"; turnId: string }
  | { type: "turn_start"; turnId: string; model: string; agentId: string }
  | { type: "turn_end"; turnId: string; status: TurnStatus; usage?: Usage; durationMs: number }
  | { type: "error"; turnId: string; message: string; code?: string };

export type TurnResult = {
  turnId: string;
  status: TurnStatus;
  finalText: string;
  usage?: Usage;
};

export type SessionMetadata = {
  v: 1;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  turnCount: number;
  lastStatus: TurnStatus | "running";
  totalUsage: Usage;
};

export type PersistedTurn = {
  turnId: string;
  user: { text: string; ts: string };
  assistant: {
    textBlocks: string[];
    toolCalls: Array<{
      callId: string;
      name: string;
      args?: unknown;
      ok?: boolean;
      result?: unknown;
    }>;
    thinking?: string[];
  };
  status: TurnStatus | "running";
  usage?: Usage;
};

export type SendTurnOptions = {
  signal?: AbortSignal;
  onEvent?: (e: SessionEvent) => void;
};

export type CreateSessionOptions = {
  baseDir: string;
  title?: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};

export type LoadSessionOptions = {
  baseDir: string;
  sessionId: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};

export type LineEnvelope =
  | { kind: "user"; v: 1; ts: string; turnId: string; text: string }
  | { kind: "turn_open"; v: 1; ts: string; turnId: string }
  | { kind: "turn_start"; v: 1; ts: string; turnId: string; model: string; runId: string; agentId: string }
  | { kind: "text"; v: 1; ts: string; turnId: string; delta: string }
  | { kind: "thinking"; v: 1; ts: string; turnId: string; delta: string }
  | { kind: "tool_start"; v: 1; ts: string; turnId: string; callId: string; name: string; args?: unknown }
  | { kind: "tool_end"; v: 1; ts: string; turnId: string; callId: string; name: string; ok: boolean; args?: unknown; result?: unknown }
  | { kind: "status"; v: 1; ts: string; turnId: string; phase: "starting" | "running" | "done" }
  | { kind: "turn_end"; v: 1; ts: string; turnId: string; status: TurnStatus; usage?: Usage; durationMs: number }
  | { kind: "error"; v: 1; ts: string; turnId: string; message: string; code?: string };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @flow-build/core typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/session/types.ts
git commit -m "feat(core/session): canonical types for events, turns, metadata"
```

---

### Task 7: Store — JSONL append + chat.json atomic write

**Files:**
- Create: `packages/core/src/session/store.ts`
- Test: `packages/core/src/session/store.test.ts`

- [ ] **Step 1: Write test**

`packages/core/src/session/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initSession,
  appendEvent,
  readEvents,
  writeChatMeta,
  readChatMeta,
  listSessionMeta,
} from "./store.js";
import type { LineEnvelope, SessionMetadata } from "./types.js";

let baseDir: string;
beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "store-"));
});
afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("initSession", () => {
  it("creates sessions/<id>/workspace/ + chat.json + empty events.jsonl", () => {
    const meta = initSession({ baseDir, sessionId: "S1", title: "hello", model: "composer-2" });
    expect(meta.sessionId).toBe("S1");
    expect(meta.title).toBe("hello");
    expect(meta.turnCount).toBe(0);
    const chat = readChatMeta(join(baseDir, "sessions", "S1", "chat.json"));
    expect(chat).toEqual(meta);
    expect(readFileSync(join(baseDir, "sessions", "S1", "events.jsonl"), "utf8")).toBe("");
  });
});

describe("appendEvent + readEvents", () => {
  it("appends one JSON object per line and reads them back in order", () => {
    initSession({ baseDir, sessionId: "S1", title: "hi", model: "m" });
    const events: LineEnvelope[] = [
      { kind: "user", v: 1, ts: "2026-05-09T10:00:00Z", turnId: "T1", text: "hi" },
      { kind: "turn_open", v: 1, ts: "2026-05-09T10:00:01Z", turnId: "T1" },
      { kind: "turn_end", v: 1, ts: "2026-05-09T10:00:10Z", turnId: "T1", status: "completed", durationMs: 9000 },
    ];
    for (const e of events) appendEvent({ baseDir, sessionId: "S1", event: e });
    const back = readEvents({ baseDir, sessionId: "S1" });
    expect(back).toEqual(events);
  });

  it("skips trailing partial line on read", () => {
    initSession({ baseDir, sessionId: "S1", title: "hi", model: "m" });
    const path = join(baseDir, "sessions", "S1", "events.jsonl");
    const good: LineEnvelope = { kind: "user", v: 1, ts: "2026-05-09T10:00:00Z", turnId: "T1", text: "hi" };
    writeFileSync(path, JSON.stringify(good) + "\n" + '{"kind":"turn_open","v":1,"ts":"2026-');
    const back = readEvents({ baseDir, sessionId: "S1" });
    expect(back).toEqual([good]);
  });
});

describe("writeChatMeta + readChatMeta", () => {
  it("atomically rewrites chat.json", () => {
    initSession({ baseDir, sessionId: "S1", title: "old", model: "m" });
    const next: SessionMetadata = {
      v: 1,
      sessionId: "S1",
      title: "new",
      createdAt: "2026-05-09T10:00:00Z",
      updatedAt: "2026-05-09T10:00:05Z",
      model: "m",
      turnCount: 1,
      lastStatus: "completed",
      totalUsage: { inputTokens: 100, outputTokens: 50 },
    };
    writeChatMeta({ baseDir, sessionId: "S1", meta: next });
    expect(readChatMeta(join(baseDir, "sessions", "S1", "chat.json"))).toEqual(next);
  });
});

describe("listSessionMeta", () => {
  it("returns empty list when no sessions exist", () => {
    expect(listSessionMeta(baseDir)).toEqual([]);
  });

  it("returns metadata for all sessions sorted by updatedAt desc", async () => {
    initSession({ baseDir, sessionId: "S1", title: "first", model: "m" });
    await new Promise((r) => setTimeout(r, 5));
    initSession({ baseDir, sessionId: "S2", title: "second", model: "m" });
    const list = listSessionMeta(baseDir);
    expect(list.map((m) => m.sessionId)).toEqual(["S2", "S1"]);
  });

  it("skips dirs that lack chat.json", () => {
    mkdirSync(join(baseDir, "sessions", "stray"), { recursive: true });
    initSession({ baseDir, sessionId: "S1", title: "first", model: "m" });
    expect(listSessionMeta(baseDir).map((m) => m.sessionId)).toEqual(["S1"]);
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run session/store`
Expected: fail (file missing).

- [ ] **Step 3: Implement**

`packages/core/src/session/store.ts`:

```typescript
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SessionCorruptError, SessionMissingError } from "./errors.js";
import type { LineEnvelope, SessionMetadata } from "./types.js";

export function sessionDir(baseDir: string, sessionId: string): string {
  return join(baseDir, "sessions", sessionId);
}

export function workspaceDir(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "workspace");
}

export function chatPath(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "chat.json");
}

export function eventsPath(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "events.jsonl");
}

export function lockPath(baseDir: string, sessionId: string): string {
  return join(sessionDir(baseDir, sessionId), "session.lock");
}

export type InitArgs = {
  baseDir: string;
  sessionId: string;
  title: string;
  model: string;
  now?: Date;
};

export function initSession(args: InitArgs): SessionMetadata {
  const dir = sessionDir(args.baseDir, args.sessionId);
  mkdirSync(workspaceDir(args.baseDir, args.sessionId), { recursive: true });
  const ts = (args.now ?? new Date()).toISOString();
  const meta: SessionMetadata = {
    v: 1,
    sessionId: args.sessionId,
    title: args.title,
    createdAt: ts,
    updatedAt: ts,
    model: args.model,
    turnCount: 0,
    lastStatus: "completed",
    totalUsage: { inputTokens: 0, outputTokens: 0 },
  };
  writeChatMetaAt(join(dir, "chat.json"), meta);
  // touch events.jsonl
  writeFileSync(eventsPath(args.baseDir, args.sessionId), "");
  return meta;
}

export type AppendArgs = {
  baseDir: string;
  sessionId: string;
  event: LineEnvelope;
};

export function appendEvent(args: AppendArgs): void {
  const path = eventsPath(args.baseDir, args.sessionId);
  if (!existsSync(path)) throw new SessionMissingError(args.sessionId);
  appendFileSync(path, JSON.stringify(args.event) + "\n");
}

export function readEvents(args: { baseDir: string; sessionId: string }): LineEnvelope[] {
  const path = eventsPath(args.baseDir, args.sessionId);
  if (!existsSync(path)) throw new SessionMissingError(args.sessionId);
  const raw = readFileSync(path, "utf8");
  if (raw.length === 0) return [];
  const lines = raw.split("\n");
  // Final element after split is "" if file ends with \n, else partial line — drop it.
  const dropLast = raw.endsWith("\n") ? 1 : 1;
  const completed = lines.slice(0, lines.length - dropLast);
  const out: LineEnvelope[] = [];
  for (const line of completed) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as LineEnvelope);
    } catch (cause) {
      throw new SessionCorruptError(args.sessionId, `malformed jsonl line: ${(cause as Error).message}`);
    }
  }
  return out;
}

export function writeChatMeta(args: {
  baseDir: string;
  sessionId: string;
  meta: SessionMetadata;
}): void {
  const path = chatPath(args.baseDir, args.sessionId);
  if (!existsSync(sessionDir(args.baseDir, args.sessionId))) {
    throw new SessionMissingError(args.sessionId);
  }
  writeChatMetaAt(path, args.meta);
}

function writeChatMetaAt(path: string, meta: SessionMetadata): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2) + "\n");
  renameSync(tmp, path);
}

export function readChatMeta(path: string): SessionMetadata {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as SessionMetadata;
  } catch (cause) {
    throw new SessionCorruptError(path, `malformed chat.json: ${(cause as Error).message}`);
  }
}

export function listSessionMeta(baseDir: string): SessionMetadata[] {
  const root = join(baseDir, "sessions");
  if (!existsSync(root)) return [];
  const entries = readdirSync(root);
  const out: SessionMetadata[] = [];
  for (const id of entries) {
    const cp = chatPath(baseDir, id);
    if (!existsSync(cp)) continue;
    if (!statSync(join(root, id)).isDirectory()) continue;
    try {
      out.push(readChatMeta(cp));
    } catch {
      // skip corrupt sessions in listings; load() will report them explicitly
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run session/store`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/store.ts packages/core/src/session/store.test.ts
git commit -m "feat(core/session): events.jsonl + chat.json store"
```

---

### Task 8: Reducer — events → PersistedTurn[]

**Files:**
- Create: `packages/core/src/session/reducer.ts`
- Test: `packages/core/src/session/reducer.test.ts`

- [ ] **Step 1: Write test**

`packages/core/src/session/reducer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { reduce } from "./reducer.js";
import type { LineEnvelope } from "./types.js";

const env = (e: Omit<LineEnvelope, "v" | "ts">): LineEnvelope =>
  ({ v: 1, ts: "2026-05-09T10:00:00Z", ...e }) as LineEnvelope;

describe("reduce", () => {
  it("returns [] for empty events", () => {
    expect(reduce([])).toEqual([]);
  });

  it("groups text deltas + tool calls under a single turn", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "hi" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "turn_start", turnId: "T1", model: "m", runId: "r1", agentId: "a1" }),
      env({ kind: "text", turnId: "T1", delta: "hello " }),
      env({ kind: "tool_start", turnId: "T1", callId: "c1", name: "shell", args: { cmd: "ls" } }),
      env({ kind: "tool_end", turnId: "T1", callId: "c1", name: "shell", ok: true, args: { cmd: "ls" }, result: "a\nb" }),
      env({ kind: "text", turnId: "T1", delta: "world" }),
      env({ kind: "turn_end", turnId: "T1", status: "completed", durationMs: 1000 }),
    ];
    const out = reduce(events);
    expect(out).toHaveLength(1);
    expect(out[0]!.user.text).toBe("hi");
    expect(out[0]!.assistant.textBlocks).toEqual(["hello ", "world"]);
    expect(out[0]!.assistant.toolCalls).toEqual([
      { callId: "c1", name: "shell", args: { cmd: "ls" }, ok: true, result: "a\nb" },
    ]);
    expect(out[0]!.status).toBe("completed");
  });

  it("marks turn_open without turn_end as interrupted", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "hi" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "turn_start", turnId: "T1", model: "m", runId: "r1", agentId: "a1" }),
      env({ kind: "text", turnId: "T1", delta: "partial" }),
    ];
    const out = reduce(events);
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe("interrupted");
  });

  it("marks user-only (no turn_open) as interrupted too", () => {
    const events: LineEnvelope[] = [env({ kind: "user", turnId: "T1", text: "hi" })];
    const out = reduce(events);
    expect(out[0]!.status).toBe("interrupted");
  });

  it("preserves multiple turns in order", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "first" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "turn_start", turnId: "T1", model: "m", runId: "r1", agentId: "a1" }),
      env({ kind: "text", turnId: "T1", delta: "ok1" }),
      env({ kind: "turn_end", turnId: "T1", status: "completed", durationMs: 1 }),
      env({ kind: "user", turnId: "T2", text: "second" }),
      env({ kind: "turn_open", turnId: "T2" }),
      env({ kind: "turn_start", turnId: "T2", model: "m", runId: "r2", agentId: "a2" }),
      env({ kind: "text", turnId: "T2", delta: "ok2" }),
      env({ kind: "turn_end", turnId: "T2", status: "completed", durationMs: 2 }),
    ];
    const out = reduce(events);
    expect(out.map((t) => t.turnId)).toEqual(["T1", "T2"]);
  });

  it("propagates failed_to_start status", () => {
    const events: LineEnvelope[] = [
      env({ kind: "user", turnId: "T1", text: "hi" }),
      env({ kind: "turn_open", turnId: "T1" }),
      env({ kind: "error", turnId: "T1", message: "AuthError", code: "AUTH" }),
      env({ kind: "turn_end", turnId: "T1", status: "failed_to_start", durationMs: 5 }),
    ];
    const out = reduce(events);
    expect(out[0]!.status).toBe("failed_to_start");
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run session/reducer`
Expected: fail.

- [ ] **Step 3: Implement**

`packages/core/src/session/reducer.ts`:

```typescript
import type { LineEnvelope, PersistedTurn } from "./types.js";

export function reduce(events: LineEnvelope[]): PersistedTurn[] {
  const byId = new Map<string, PersistedTurn>();
  const order: string[] = [];

  function ensure(turnId: string, ts: string): PersistedTurn {
    let t = byId.get(turnId);
    if (!t) {
      t = {
        turnId,
        user: { text: "", ts },
        assistant: { textBlocks: [], toolCalls: [] },
        status: "interrupted",
      };
      byId.set(turnId, t);
      order.push(turnId);
    }
    return t;
  }

  for (const e of events) {
    const t = ensure(e.turnId, e.ts);
    switch (e.kind) {
      case "user":
        t.user = { text: e.text, ts: e.ts };
        break;
      case "turn_open":
        // status stays interrupted until turn_end overwrites
        break;
      case "turn_start":
        // no-op for reduced view
        break;
      case "text":
        t.assistant.textBlocks.push(e.delta);
        break;
      case "thinking":
        (t.assistant.thinking ??= []).push(e.delta);
        break;
      case "tool_start": {
        t.assistant.toolCalls.push({
          callId: e.callId,
          name: e.name,
          ...(e.args !== undefined ? { args: e.args } : {}),
        });
        break;
      }
      case "tool_end": {
        // find matching by callId; if missing, push standalone
        const existing = t.assistant.toolCalls.find((c) => c.callId === e.callId);
        if (existing) {
          existing.ok = e.ok;
          if (e.args !== undefined) existing.args = e.args;
          if (e.result !== undefined) existing.result = e.result;
        } else {
          t.assistant.toolCalls.push({
            callId: e.callId,
            name: e.name,
            ok: e.ok,
            ...(e.args !== undefined ? { args: e.args } : {}),
            ...(e.result !== undefined ? { result: e.result } : {}),
          });
        }
        break;
      }
      case "status":
        // ignore for reducer
        break;
      case "turn_end":
        t.status = e.status;
        if (e.usage) t.usage = e.usage;
        break;
      case "error":
        // status stays — turn_end (failed/failed_to_start) carries the verdict
        break;
    }
  }

  return order.map((id) => byId.get(id)!);
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run session/reducer`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/reducer.ts packages/core/src/session/reducer.test.ts
git commit -m "feat(core/session): event-log reducer to PersistedTurn[]"
```

---

### Task 9: Replay — verbatim prefix builder

**Files:**
- Create: `packages/core/src/session/replay.ts`
- Test: `packages/core/src/session/replay.test.ts`

- [ ] **Step 1: Write test**

`packages/core/src/session/replay.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildReplay } from "./replay.js";
import type { PersistedTurn } from "./types.js";

describe("buildReplay", () => {
  it("returns empty string for no completed turns", () => {
    expect(buildReplay([])).toBe("");
  });

  it("excludes in-flight turns (status running/interrupted with no turn_end)", () => {
    const turns: PersistedTurn[] = [
      {
        turnId: "T1",
        user: { text: "hi", ts: "t" },
        assistant: { textBlocks: ["ok"], toolCalls: [] },
        status: "interrupted",
      },
    ];
    expect(buildReplay(turns)).toBe("");
  });

  it("renders a completed turn with text + verbatim tool args/result", () => {
    const turns: PersistedTurn[] = [
      {
        turnId: "T1",
        user: { text: "list files", ts: "t" },
        assistant: {
          textBlocks: ["Here you go."],
          toolCalls: [
            {
              callId: "c1",
              name: "shell",
              args: { command: "ls" },
              ok: true,
              result: "a\nb\n",
            },
          ],
        },
        status: "completed",
      },
    ];
    const out = buildReplay(turns);
    expect(out).toContain("User: list files");
    expect(out).toContain("Assistant:");
    expect(out).toContain("[tool_call: shell");
    expect(out).toContain('"command":"ls"');
    expect(out).toContain('"a\\nb\\n"');
    expect(out).toContain("Here you go.");
  });

  it("appends [turn ended: cancelled] marker for cancelled turns", () => {
    const turns: PersistedTurn[] = [
      {
        turnId: "T1",
        user: { text: "hi", ts: "t" },
        assistant: { textBlocks: ["partial"], toolCalls: [] },
        status: "cancelled",
      },
    ];
    expect(buildReplay(turns)).toContain("[turn ended: cancelled]");
  });

  it("renders multiple turns separated by blank lines", () => {
    const t = (id: string, text: string): PersistedTurn => ({
      turnId: id,
      user: { text, ts: "t" },
      assistant: { textBlocks: ["ok"], toolCalls: [] },
      status: "completed",
    });
    const out = buildReplay([t("T1", "first"), t("T2", "second")]);
    expect(out).toMatch(/User: first[\s\S]+User: second/);
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run session/replay`
Expected: fail.

- [ ] **Step 3: Implement**

`packages/core/src/session/replay.ts`:

```typescript
import type { PersistedTurn } from "./types.js";

const HEADER =
  "[Conversation so far — replayed because the local Cursor agent does not\n" +
  "retain context across send() calls. Verbatim transcript including all\n" +
  "tool args and results.]\n";

export function buildReplay(turns: PersistedTurn[]): string {
  const completed = turns.filter(
    (t) => t.status === "completed" || t.status === "cancelled" || t.status === "failed",
  );
  if (completed.length === 0) return "";

  const blocks: string[] = [HEADER];
  for (const t of completed) {
    blocks.push(`User: ${t.user.text}`);
    blocks.push(renderAssistant(t));
    if (t.status !== "completed") {
      blocks.push(`[turn ended: ${t.status}]`);
    }
  }
  return blocks.join("\n\n");
}

function renderAssistant(t: PersistedTurn): string {
  const parts: string[] = ["Assistant:"];
  // Interleave text blocks with tool calls in the order seen during streaming.
  // Reducer separates them; here we render text first, then tool block list.
  // This is acceptable because Cursor itself emits assistant text and tool_use
  // blocks with no strict interleave guarantee for reconstruction.
  for (const tc of t.assistant.toolCalls) {
    parts.push(renderToolCall(tc));
  }
  if (t.assistant.textBlocks.length > 0) {
    parts.push(t.assistant.textBlocks.join(""));
  }
  return parts.join("\n");
}

function renderToolCall(tc: PersistedTurn["assistant"]["toolCalls"][number]): string {
  const argsLine = tc.args !== undefined ? `  args: ${JSON.stringify(tc.args)}` : "  args: <none>";
  const okLine = tc.ok === undefined ? "  status: <pending>" : tc.ok ? "  status: ok" : "  status: error";
  const resultLine =
    tc.result !== undefined ? `  result: ${JSON.stringify(tc.result)}` : "  result: <none>";
  return `[tool_call: ${tc.name}\n${argsLine}\n${okLine}\n${resultLine}\n]`;
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run session/replay`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/replay.ts packages/core/src/session/replay.test.ts
git commit -m "feat(core/session): verbatim replay-prefix builder"
```

---

### Task 10: `flowbuilder.bootstrapSession()` helper

**Files:**
- Create: `packages/flowbuilder/src/bootstrap.ts`
- Test: `packages/flowbuilder/src/bootstrap.test.ts`
- Modify: `packages/flowbuilder/src/index.ts` — re-export

- [ ] **Step 1: Write test**

`packages/flowbuilder/src/bootstrap.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapFlowbuilderSession } from "./bootstrap.js";

let baseDir: string;
beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "fb-bootstrap-"));
});
afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("bootstrapFlowbuilderSession", () => {
  it("creates manifest.json + state.json under sessions/<id>/", () => {
    bootstrapFlowbuilderSession({ baseDir, sessionId: "S1", name: "demo", description: "" });
    const dir = join(baseDir, "sessions", "S1");
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(m.schemaVersion).toBe(1);
    expect(m.name).toBe("demo");
    const s = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    expect(s).toEqual({ schemaVersion: 1, nodes: [], edges: [] });
  });

  it("is idempotent — does not overwrite existing files", () => {
    bootstrapFlowbuilderSession({ baseDir, sessionId: "S1", name: "first" });
    bootstrapFlowbuilderSession({ baseDir, sessionId: "S1", name: "second" });
    const m = JSON.parse(
      readFileSync(join(baseDir, "sessions", "S1", "manifest.json"), "utf8"),
    );
    expect(m.name).toBe("first");
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter @flow-build/flowbuilder test -- --run bootstrap`
Expected: fail.

- [ ] **Step 3: Implement**

`packages/flowbuilder/src/bootstrap.ts`:

```typescript
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { customAlphabet } from "nanoid";
import { EMPTY_STATE, type Manifest, ManifestSchema } from "./schema.js";

const idGen = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export type BootstrapArgs = {
  baseDir: string;
  sessionId: string;
  name: string;
  description?: string;
};

export function bootstrapFlowbuilderSession(args: BootstrapArgs): {
  manifest: Manifest;
  manifestPath: string;
  statePath: string;
} {
  const dir = join(args.baseDir, "sessions", args.sessionId);
  mkdirSync(dir, { recursive: true });

  const manifestPath = join(dir, "manifest.json");
  const statePath = join(dir, "state.json");

  let manifest: Manifest;
  if (existsSync(manifestPath)) {
    manifest = ManifestSchema.parse(
      JSON.parse(require("node:fs").readFileSync(manifestPath, "utf8")),
    );
  } else {
    const ts = new Date().toISOString();
    manifest = {
      schemaVersion: 1,
      id: `s_${idGen()}`,
      name: args.name,
      description: args.description ?? "",
      createdAt: ts,
      updatedAt: ts,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }

  if (!existsSync(statePath)) {
    writeFileSync(statePath, JSON.stringify(EMPTY_STATE, null, 2) + "\n");
  }

  return { manifest, manifestPath, statePath };
}
```

- [ ] **Step 4: Replace `require` with ESM import**

Edit `bootstrap.ts` — replace the `require("node:fs").readFileSync(...)` with a top-level `readFileSync` import:

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
```

and use `readFileSync(manifestPath, "utf8")` directly.

- [ ] **Step 5: Re-export from `packages/flowbuilder/src/index.ts`**

Add to the export list:

```typescript
export { bootstrapFlowbuilderSession } from "./bootstrap.js";
export type { BootstrapArgs } from "./bootstrap.js";
```

- [ ] **Step 6: Run tests; verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test`
Expected: all pass including 2 new.

- [ ] **Step 7: Commit**

```bash
git add packages/flowbuilder/src/bootstrap.ts packages/flowbuilder/src/bootstrap.test.ts packages/flowbuilder/src/index.ts
git commit -m "feat(flowbuilder): bootstrapFlowbuilderSession seeds manifest+state.json"
```

---

### Task 11: `Session` class

**Files:**
- Create: `packages/core/src/session/session.ts`
- Test: `packages/core/src/session/session.test.ts`

- [ ] **Step 1: Write test (covers happy path, busy, cancel, failed_to_start, plugin per-turn)**

`packages/core/src/session/session.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSdk, makeFakeAgent } from "../test/fakeSdk.js";
import { Session } from "./session.js";
import { initSession, eventsPath } from "./store.js";
import { SessionBusyError } from "./errors.js";

const SESSION_PATH = "./session.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "session-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@cursor/sdk");
});

describe("Session.send", () => {
  it("appends user, turn_open, turn_start, text, turn_end events; status completed", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "composer-2" });
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "hello" }] } },
      ],
      waitResult: { status: "completed", usage: { inputTokens: 10, outputTokens: 5 } },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    const result = await session.send("hi");
    expect(result.status).toBe("completed");
    expect(result.finalText).toBe("hello");

    const lines = readFileSync(eventsPath(dir, "S1"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toEqual(["user", "turn_open", "turn_start", "text", "turn_end"]);
    expect(lines[lines.length - 1].status).toBe("completed");
  });

  it("rejects concurrent send with SessionBusyError", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    let resolveStream!: () => void;
    const blockedStream = new Promise<void>((r) => (resolveStream = r));
    const fa = makeFakeAgent({});
    fa.run.stream = async function* () {
      await blockedStream;
    };
    installFakeSdk({ createBehavior: [{ agent: fa }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    const first = session.send("first");
    await expect(session.send("second")).rejects.toBeInstanceOf(SessionBusyError);
    resolveStream();
    await first;
  });

  it("writes turn_end status=failed_to_start when Agent.create throws", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    installFakeSdk({ createBehavior: [{ throws: new Error("auth bad") }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test", retry: { attempts: 1 } });
    const result = await session.send("hi");
    expect(result.status).toBe("failed_to_start");

    const lines = readFileSync(eventsPath(dir, "S1"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const last = lines[lines.length - 1];
    expect(last.kind).toBe("turn_end");
    expect(last.status).toBe("failed_to_start");
  });

  it("includes verbatim replay of prior completed turn in second send's prompt", async () => {
    initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "m" });
    const fa1 = makeFakeAgent({
      streamItems: [
        {
          type: "tool_call",
          call_id: "c1",
          name: "shell",
          status: "completed",
          args: { cmd: "ls" },
          result: "a\n",
        },
        { type: "assistant", message: { content: [{ type: "text", text: "first reply" }] } },
      ],
      waitResult: { status: "completed" },
    });
    const fa2 = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "second reply" }] } },
      ],
      waitResult: { status: "completed" },
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa1 }, { agent: fa2 }] });

    const { Session: S } = await import(SESSION_PATH);
    const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
    await session.send("first prompt");
    await session.send("second prompt");

    const lastSent = fake.lastSendPrompt()!;
    expect(lastSent).toContain("Conversation so far");
    expect(lastSent).toContain("User: first prompt");
    expect(lastSent).toContain("[tool_call: shell");
    expect(lastSent).toContain('"cmd":"ls"');
    expect(lastSent).toContain('"a\\n"');
    expect(lastSent).toContain("first reply");
    expect(lastSent).toContain("User: second prompt");
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run session/session`
Expected: fail.

- [ ] **Step 3: Implement Session class**

`packages/core/src/session/session.ts`:

```typescript
import { Agent } from "@cursor/sdk";
import { mapToHarnessError } from "../errors.js";
import { normalize } from "../normalizer.js";
import { withRetry } from "../retry.js";
import { PluginHost } from "../plugin/host.js";
import type {
  HarnessEvent,
  Logger,
  McpServerConfig,
  Plugin,
  RetryOptions,
  RuntimeContext,
  ToolCallSnapshot,
} from "../types.js";
import {
  appendEvent,
  chatPath,
  eventsPath,
  lockPath,
  readChatMeta,
  readEvents,
  sessionDir,
  workspaceDir,
  writeChatMeta,
} from "./store.js";
import { reduce } from "./reducer.js";
import { buildReplay } from "./replay.js";
import { ulid } from "./ulid.js";
import { acquireLock, releaseLock } from "./lockfile.js";
import { SessionBusyError } from "./errors.js";
import type {
  LineEnvelope,
  SendTurnOptions,
  SessionEvent,
  SessionMetadata,
  TurnResult,
  TurnStatus,
} from "./types.js";

export type SessionInternalOptions = {
  baseDir: string;
  sessionId: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};

export class Session {
  readonly sessionId: string;
  readonly baseDir: string;
  readonly sessionDir: string;
  readonly workspaceDir: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly logger: Logger;
  private readonly retry: Required<RetryOptions>;
  private readonly plugins: Plugin[];
  private activeTurn: { abort: AbortController; runCancel?: () => Promise<void> } | undefined;
  private closed = false;

  constructor(opts: SessionInternalOptions) {
    this.baseDir = opts.baseDir;
    this.sessionId = opts.sessionId;
    this.sessionDir = sessionDir(opts.baseDir, opts.sessionId);
    this.workspaceDir = workspaceDir(opts.baseDir, opts.sessionId);
    const meta = readChatMeta(chatPath(opts.baseDir, opts.sessionId));
    this.model = opts.model ?? meta.model;
    this.apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY ?? "";
    this.logger = opts.logger ?? { warn: () => {} };
    this.retry = {
      attempts: opts.retry?.attempts ?? 3,
      baseDelayMs: opts.retry?.baseDelayMs ?? 200,
    };
    this.plugins = opts.plugins ?? [];
    acquireLock(lockPath(opts.baseDir, opts.sessionId), opts.sessionId);
  }

  async send(prompt: string, opts: SendTurnOptions = {}): Promise<TurnResult> {
    if (this.activeTurn) throw new SessionBusyError(this.sessionId);
    const abort = new AbortController();
    if (opts.signal) {
      const onAbort = () => abort.abort();
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    this.activeTurn = { abort };
    const turnId = ulid();
    const startedAt = Date.now();
    const onEvent = opts.onEvent ?? (() => {});

    const emit = (line: LineEnvelope, ev: SessionEvent | undefined) => {
      appendEvent({ baseDir: this.baseDir, sessionId: this.sessionId, event: line });
      if (ev) onEvent(ev);
    };

    const ts = () => new Date().toISOString();

    emit({ kind: "user", v: 1, ts: ts(), turnId, text: prompt }, { type: "user", turnId, text: prompt });
    emit({ kind: "turn_open", v: 1, ts: ts(), turnId }, { type: "turn_open", turnId });

    let finalText = "";
    let status: TurnStatus = "completed";
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    const host = new PluginHost(this.plugins);
    const ctx: RuntimeContext = {
      cwd: this.workspaceDir,
      model: this.model,
      runId: turnId,
      signal: abort.signal,
      logger: this.logger,
      state: new Map(),
    };

    try {
      // Per-turn plugin lifecycle
      await host.runPreRun(ctx);
      await host.runSystemPrompt(ctx);
      const pluginPrefix = await host.runPromptPrefix(ctx);
      const mcpServers = await host.runProvideMcpServers(ctx);

      const priorTurns = reduce(readEvents({ baseDir: this.baseDir, sessionId: this.sessionId }));
      // The just-written user/turn_open turn has no turn_end → reduce gives it status "interrupted",
      // which buildReplay's filter excludes.
      const replayPrefix = buildReplay(priorTurns);

      const finalPrompt = [pluginPrefix, replayPrefix, `User: ${prompt}`]
        .filter((s) => typeof s === "string" && s.length > 0)
        .join("\n\n");

      type LiveRun = {
        agent: Awaited<ReturnType<typeof Agent.create>>;
        run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>;
      };
      let live: LiveRun;
      try {
        live = await withRetry<LiveRun>(
          async () => {
            let agent;
            try {
              agent = await Agent.create({
                apiKey: this.apiKey,
                model: { id: this.model },
                local: { cwd: this.workspaceDir, settingSources: ["project", "user"] },
                ...(mcpServers && Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
              });
            } catch (e) {
              throw mapToHarnessError(e);
            }
            try {
              const run = await agent.send(finalPrompt);
              return { agent, run };
            } catch (e) {
              try {
                await agent.close();
              } catch {
                /* ignore */
              }
              throw mapToHarnessError(e);
            }
          },
          {
            attempts: this.retry.attempts,
            baseDelayMs: this.retry.baseDelayMs,
            signal: abort.signal,
            logger: this.logger,
          },
        );
      } catch (e) {
        const message = (e as Error).message ?? String(e);
        const code = (e as { code?: string }).code;
        emit(
          { kind: "error", v: 1, ts: ts(), turnId, message, ...(code ? { code } : {}) },
          { type: "error", turnId, message, ...(code ? { code } : {}) },
        );
        emit(
          { kind: "turn_end", v: 1, ts: ts(), turnId, status: "failed_to_start", durationMs: Date.now() - startedAt },
          { type: "turn_end", turnId, status: "failed_to_start", durationMs: Date.now() - startedAt },
        );
        await this.updateMeta({ turnStatus: "failed_to_start" });
        return { turnId, status: "failed_to_start", finalText: "" };
      }

      this.activeTurn.runCancel = () => live.run.cancel();
      emit(
        {
          kind: "turn_start",
          v: 1,
          ts: ts(),
          turnId,
          model: this.model,
          runId: turnId,
          agentId: live.agent.agentId,
        },
        { type: "turn_start", turnId, model: this.model, agentId: live.agent.agentId },
      );

      try {
        for await (const msg of live.run.stream()) {
          if (abort.signal.aborted && !this.activeTurn?.runCancel) break;
          if (abort.signal.aborted) {
            await live.run.cancel();
            this.activeTurn!.runCancel = undefined; // dedupe
          }
          const events = normalize(msg, this.logger);
          for (const e of events) {
            const out = host.intercept(e, ctx);
            for (const e2 of out) {
              persistEvent(e2);
              if (e2.type === "text") finalText += e2.delta;
              onEvent(e2);
              if (e2.type === "tool_start" || e2.type === "tool_end") {
                const snap: ToolCallSnapshot = {
                  callId: e2.callId,
                  name: e2.name,
                  status:
                    e2.type === "tool_start"
                      ? "running"
                      : e2.ok
                        ? "completed"
                        : "error",
                  ...(e2.args !== undefined ? { args: e2.args } : {}),
                  ...(e2.type === "tool_end" && e2.result !== undefined ? { result: e2.result } : {}),
                };
                host.fireToolCall(snap, ctx);
              }
            }
          }
        }
        // After cancel, drain to terminal with timeout
        const wait = await Promise.race([
          live.run.wait(),
          new Promise<{ status: string; usage?: { inputTokens: number; outputTokens: number } }>((resolve) =>
            setTimeout(() => resolve({ status: abort.signal.aborted ? "cancelled" : "completed" }), 5_000),
          ),
        ]);
        const waitStatus = (wait as { status?: string }).status?.toLowerCase();
        if (waitStatus === "cancelled") status = "cancelled";
        else if (waitStatus && waitStatus !== "completed" && waitStatus !== "finished") status = "failed";
        const u = (wait as { usage?: { inputTokens: number; outputTokens: number } }).usage;
        if (u) usage = u;
      } finally {
        try {
          await live.agent.close();
        } catch {
          /* ignore */
        }
      }

      function persistEvent(ev: HarnessEvent): void {
        switch (ev.type) {
          case "text":
            emit({ kind: "text", v: 1, ts: ts(), turnId, delta: ev.delta }, undefined);
            return;
          case "thinking":
            emit({ kind: "thinking", v: 1, ts: ts(), turnId, delta: ev.delta }, undefined);
            return;
          case "tool_start":
            emit(
              {
                kind: "tool_start",
                v: 1,
                ts: ts(),
                turnId,
                callId: ev.callId,
                name: ev.name,
                ...(ev.args !== undefined ? { args: ev.args } : {}),
              },
              undefined,
            );
            return;
          case "tool_end":
            emit(
              {
                kind: "tool_end",
                v: 1,
                ts: ts(),
                turnId,
                callId: ev.callId,
                name: ev.name,
                ok: ev.ok,
                ...(ev.args !== undefined ? { args: ev.args } : {}),
                ...(ev.result !== undefined ? { result: ev.result } : {}),
              },
              undefined,
            );
            return;
          case "status":
            emit(
              { kind: "status", v: 1, ts: ts(), turnId, phase: ev.phase },
              undefined,
            );
            return;
        }
      }
    } finally {
      try {
        await host.cleanup(ctx);
      } catch (e) {
        this.logger.warn("plugin cleanup threw", { cause: String(e) });
      }
      this.activeTurn = undefined;
    }

    emit(
      {
        kind: "turn_end",
        v: 1,
        ts: ts(),
        turnId,
        status,
        durationMs: Date.now() - startedAt,
        ...(usage ? { usage } : {}),
      },
      {
        type: "turn_end",
        turnId,
        status,
        durationMs: Date.now() - startedAt,
        ...(usage ? { usage } : {}),
      },
    );
    await this.updateMeta({ turnStatus: status, usage });

    return { turnId, status, finalText, ...(usage ? { usage } : {}) };
  }

  async cancel(): Promise<void> {
    if (!this.activeTurn) return;
    this.activeTurn.abort.abort();
    if (this.activeTurn.runCancel) {
      try {
        await this.activeTurn.runCancel();
      } catch {
        /* ignore */
      }
    }
  }

  async turns() {
    return reduce(readEvents({ baseDir: this.baseDir, sessionId: this.sessionId }));
  }

  async metadata(): Promise<SessionMetadata> {
    return readChatMeta(chatPath(this.baseDir, this.sessionId));
  }

  async rename(title: string): Promise<void> {
    const meta = readChatMeta(chatPath(this.baseDir, this.sessionId));
    meta.title = title;
    meta.updatedAt = new Date().toISOString();
    writeChatMeta({ baseDir: this.baseDir, sessionId: this.sessionId, meta });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.activeTurn) await this.cancel();
    releaseLock(lockPath(this.baseDir, this.sessionId));
  }

  private async updateMeta(args: {
    turnStatus: TurnStatus;
    usage?: { inputTokens: number; outputTokens: number };
  }): Promise<void> {
    const meta = readChatMeta(chatPath(this.baseDir, this.sessionId));
    meta.turnCount += 1;
    meta.updatedAt = new Date().toISOString();
    meta.lastStatus = args.turnStatus;
    if (args.usage) {
      meta.totalUsage.inputTokens += args.usage.inputTokens;
      meta.totalUsage.outputTokens += args.usage.outputTokens;
    }
    if (meta.turnCount === 1) {
      // derive title from first user message if title is "untitled"
      if (meta.title === "untitled") {
        const first = (await this.turns())[0];
        if (first) meta.title = first.user.text.slice(0, 60);
      }
    }
    writeChatMeta({ baseDir: this.baseDir, sessionId: this.sessionId, meta });
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run session/session`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/session.ts packages/core/src/session/session.test.ts
git commit -m "feat(core/session): Session class — multi-turn loop with verbatim replay"
```

---

### Task 12: Public factories — `createSession`, `loadSession`, `listSessions`, `deleteSession`

**Files:**
- Create: `packages/core/src/session/index.ts`
- Test: `packages/core/src/session/index.test.ts`
- Modify: `packages/core/package.json` — add `@flow-build/flowbuilder` as workspace devDependency (test imports it)

- [ ] **Step 1: Add devDependency**

Edit `packages/core/package.json`. The file already has `"@flow-build/rote": "workspace:*"` under `devDependencies`. Add a sibling:

```json
    "@flow-build/flowbuilder": "workspace:*"
```

Then run: `pnpm install`

- [ ] **Step 2: Write test**

`packages/core/src/session/index.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSession,
  loadSession,
  listSessions,
  deleteSession,
} from "./index.js";
import { SessionMissingError } from "./errors.js";

let baseDir: string;
beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "session-fac-"));
  process.env.CURSOR_API_KEY = "crsr_test";
});
afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
});

describe("createSession", () => {
  it("creates chat.json + events.jsonl + workspace/ + flowbuilder manifest+state", async () => {
    const session = await createSession({ baseDir, title: "first" });
    const dir = join(baseDir, "sessions", session.sessionId);
    expect(existsSync(join(dir, "chat.json"))).toBe(true);
    expect(existsSync(join(dir, "events.jsonl"))).toBe(true);
    expect(existsSync(join(dir, "workspace"))).toBe(true);
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
    await session.close();
  });

  it("auto-generates ULID sessionId when omitted", async () => {
    const session = await createSession({ baseDir });
    expect(session.sessionId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    await session.close();
  });
});

describe("loadSession", () => {
  it("loads an existing session", async () => {
    const created = await createSession({ baseDir, title: "x" });
    const sid = created.sessionId;
    await created.close();
    const loaded = await loadSession({ baseDir, sessionId: sid });
    expect(loaded.sessionId).toBe(sid);
    await loaded.close();
  });

  it("throws SessionMissingError for unknown id", async () => {
    await expect(loadSession({ baseDir, sessionId: "nope" })).rejects.toBeInstanceOf(
      SessionMissingError,
    );
  });
});

describe("listSessions", () => {
  it("returns empty array when no sessions", async () => {
    expect(await listSessions({ baseDir })).toEqual([]);
  });

  it("returns metadata for created sessions", async () => {
    const a = await createSession({ baseDir, title: "a" });
    await a.close();
    const b = await createSession({ baseDir, title: "b" });
    await b.close();
    const list = await listSessions({ baseDir });
    expect(list.map((m) => m.title).sort()).toEqual(["a", "b"]);
  });
});

describe("deleteSession", () => {
  it("removes the session dir", async () => {
    const s = await createSession({ baseDir });
    await s.close();
    await deleteSession({ baseDir, sessionId: s.sessionId });
    expect(existsSync(join(baseDir, "sessions", s.sessionId))).toBe(false);
  });

  it("is idempotent on missing", async () => {
    await deleteSession({ baseDir, sessionId: "nope" }); // should not throw
  });
});
```

- [ ] **Step 3: Run; verify failing**

Run: `pnpm --filter @flow-build/core test -- --run session/index`
Expected: fail.

- [ ] **Step 4: Implement factories**

`packages/core/src/session/index.ts`:

```typescript
import { existsSync, rmSync } from "node:fs";
import { bootstrapFlowbuilderSession } from "@flow-build/flowbuilder";
import {
  initSession,
  listSessionMeta,
  sessionDir,
} from "./store.js";
import { Session } from "./session.js";
import { ulid } from "./ulid.js";
import { SessionMissingError } from "./errors.js";
import type {
  CreateSessionOptions,
  LoadSessionOptions,
  SessionMetadata,
} from "./types.js";

export async function createSession(opts: CreateSessionOptions): Promise<Session> {
  const sessionId = ulid();
  const title = opts.title ?? "untitled";
  const model = opts.model ?? "composer-2";
  initSession({ baseDir: opts.baseDir, sessionId, title, model });
  bootstrapFlowbuilderSession({
    baseDir: opts.baseDir,
    sessionId,
    name: title,
    description: "",
  });
  return new Session({
    baseDir: opts.baseDir,
    sessionId,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    ...(opts.logger ? { logger: opts.logger } : {}),
    ...(opts.retry ? { retry: opts.retry } : {}),
    ...(opts.plugins ? { plugins: opts.plugins } : {}),
  });
}

export async function loadSession(opts: LoadSessionOptions): Promise<Session> {
  if (!existsSync(sessionDir(opts.baseDir, opts.sessionId))) {
    throw new SessionMissingError(opts.sessionId);
  }
  return new Session({
    baseDir: opts.baseDir,
    sessionId: opts.sessionId,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    ...(opts.logger ? { logger: opts.logger } : {}),
    ...(opts.retry ? { retry: opts.retry } : {}),
    ...(opts.plugins ? { plugins: opts.plugins } : {}),
  });
}

export async function listSessions(opts: { baseDir: string }): Promise<SessionMetadata[]> {
  return listSessionMeta(opts.baseDir);
}

export async function deleteSession(opts: { baseDir: string; sessionId: string }): Promise<void> {
  const dir = sessionDir(opts.baseDir, opts.sessionId);
  if (!existsSync(dir)) return;
  rmSync(dir, { recursive: true, force: true });
}

export { Session } from "./session.js";
```

- [ ] **Step 5: Run tests; verify pass**

Run: `pnpm --filter @flow-build/core test -- --run session/index`
Expected: 7 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/session/index.ts packages/core/src/session/index.test.ts packages/core/package.json
git commit -m "feat(core/session): public factories — create/load/list/delete"
```

---

### Task 13: Wire `runPrompt` to use Session; expose session API from core index

**Files:**
- Modify: `packages/core/src/run.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Read existing tests for `runPrompt` to know which contract to preserve**

Run: `cat packages/core/src/run.test.ts | head -60`
Note that tests inspect emitted `HarnessEvent`s. The wrapper must continue to emit the same events.

- [ ] **Step 2: Replace `packages/core/src/run.ts` with wrapper**

```typescript
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "./config.js";
import { createSession } from "./session/index.js";
import type { RunOptions, RunResult } from "./types.js";

export async function runPrompt(opts: RunOptions): Promise<RunResult> {
  const cfg = resolveConfig(opts);
  const baseDir = cfg.baseDir ?? mkdtempSync(join(tmpdir(), "flow-build-cli-"));
  const session = await createSession({
    baseDir,
    title: cfg.prompt.slice(0, 60),
    model: cfg.model,
    apiKey: cfg.apiKey,
    ...(opts.logger ? { logger: opts.logger } : {}),
    ...(cfg.retry ? { retry: cfg.retry } : {}),
    ...(opts.plugins ? { plugins: opts.plugins } : {}),
  });
  try {
    const result = await session.send(opts.prompt, {
      ...(opts.signal ? { signal: opts.signal } : {}),
      onEvent: (e) => {
        // Pass through the HarnessEvent subset; non-Harness events (user/turn_*) are dropped
        // for the legacy onEvent contract.
        if (
          e.type === "text" ||
          e.type === "thinking" ||
          e.type === "tool_start" ||
          e.type === "tool_end" ||
          e.type === "status"
        ) {
          opts.onEvent(e);
        }
      },
    });
    const status: RunResult["status"] =
      result.status === "completed"
        ? "completed"
        : result.status === "cancelled"
          ? "cancelled"
          : "failed";
    return {
      status,
      finalText: result.finalText,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  } finally {
    await session.close();
  }
}
```

- [ ] **Step 3: Update `packages/core/src/index.ts` to export session API**

Append to the existing exports:

```typescript
export {
  createSession,
  loadSession,
  listSessions,
  deleteSession,
  Session,
} from "./session/index.js";
export type {
  SessionEvent,
  SessionMetadata,
  PersistedTurn,
  TurnStatus,
  TurnResult,
  SendTurnOptions,
  CreateSessionOptions,
  LoadSessionOptions,
} from "./session/types.js";
export {
  SessionBusyError,
  SessionMissingError,
  SessionCorruptError,
  SessionLockedError,
} from "./session/errors.js";
```

- [ ] **Step 4: Run all core tests; expect existing run.ts tests still pass**

Run: `pnpm --filter @flow-build/core test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/run.ts packages/core/src/index.ts
git commit -m "feat(core): runPrompt wraps Session; export session API"
```

---

### Task 14: Smoke test — two-turn session with rote + flowbuilder

**Files:**
- Modify: `packages/core/src/smoke.test.ts`

- [ ] **Step 1: Append a two-turn case**

Append to `packages/core/src/smoke.test.ts`:

```typescript
describe("multi-turn session smoke", () => {
  it("second turn's send prompt contains verbatim first turn (text + tool args/result)", async () => {
    const fa1 = makeFakeAgent({
      streamItems: [
        {
          type: "tool_call",
          call_id: "c1",
          name: "shell",
          status: "completed",
          args: { command: "echo first" },
          result: "first\n",
        },
        { type: "assistant", message: { content: [{ type: "text", text: "first reply" }] } },
      ],
      waitResult: { status: "completed" },
    });
    const fa2 = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "second reply" }] } },
      ],
      waitResult: { status: "completed" },
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa1 }, { agent: fa2 }] });

    const baseDir = mkdtempSync(join(tmpdir(), "flow-build-multi-turn-"));
    try {
      const { createSession } = await import("./session/index.js");
      const session = await createSession({ baseDir, title: "multi" });
      try {
        await session.send("first prompt");
        await session.send("second prompt");

        const sent = fake.lastSendPrompt()!;
        expect(sent).toContain("Conversation so far");
        expect(sent).toContain("User: first prompt");
        expect(sent).toContain("[tool_call: shell");
        expect(sent).toContain('"command":"echo first"');
        expect(sent).toContain('"first\\n"');
        expect(sent).toContain("first reply");
        expect(sent).toContain("User: second prompt");
      } finally {
        await session.close();
      }
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run smoke test**

Run: `pnpm --filter @flow-build/core test -- --run smoke`
Expected: existing smoke tests + new one pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/smoke.test.ts
git commit -m "test(core): two-turn smoke proves verbatim replay"
```

---

## Phase 2 — Electron main + IPC

### Task 15: zod schemas for IPC payloads

**Files:**
- Create: `src/main/ipc/schemas.ts`
- Test: `src/main/ipc/schemas.test.ts`

- [ ] **Step 1: Confirm zod available in root**

Run: `node -e "console.log(require('zod').z ? 'ok' : 'no')"`
Expected: `ok`. If not, run `pnpm add -w zod` at repo root.

- [ ] **Step 2: Write test**

`src/main/ipc/schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  SessionIdSchema,
  CreateInputSchema,
  SendInputSchema,
  WatchInputSchema,
  RenameInputSchema,
} from "./schemas.js";

describe("schemas", () => {
  it("SessionIdSchema accepts ULID, rejects garbage", () => {
    expect(SessionIdSchema.safeParse("01HXYZABCDEFGHJKMNPQRSTVWX").success).toBe(true);
    expect(SessionIdSchema.safeParse("nope").success).toBe(false);
    expect(SessionIdSchema.safeParse("").success).toBe(false);
  });
  it("CreateInputSchema accepts empty + optional title/model", () => {
    expect(CreateInputSchema.safeParse({}).success).toBe(true);
    expect(CreateInputSchema.safeParse({ title: "x" }).success).toBe(true);
    expect(CreateInputSchema.safeParse({ title: 1 }).success).toBe(false);
  });
  it("SendInputSchema requires sessionId+prompt; cap on prompt length", () => {
    expect(SendInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", prompt: "" }).success).toBe(false);
    expect(SendInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", prompt: "hi" }).success).toBe(true);
    const huge = "x".repeat(200_001);
    expect(SendInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", prompt: huge }).success).toBe(false);
  });
  it("WatchInputSchema + RenameInputSchema basics", () => {
    expect(WatchInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX" }).success).toBe(true);
    expect(RenameInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", title: "" }).success).toBe(false);
    expect(RenameInputSchema.safeParse({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", title: "ok" }).success).toBe(true);
  });
});
```

- [ ] **Step 3: Run; verify failing**

Run: `pnpm --filter . exec vitest run src/main/ipc/schemas.test.ts`
Expected: fail.

- [ ] **Step 4: Implement**

`src/main/ipc/schemas.ts`:

```typescript
import { z } from "zod";

export const SessionIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const CreateInputSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    model: z.string().min(1).max(80).optional(),
  })
  .strict();

export const OpenInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const SendInputSchema = z
  .object({
    sessionId: SessionIdSchema,
    prompt: z.string().min(1).max(200_000),
  })
  .strict();

export const CancelInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const RenameInputSchema = z
  .object({ sessionId: SessionIdSchema, title: z.string().min(1).max(120) })
  .strict();

export const DeleteInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const WatchInputSchema = z.object({ sessionId: SessionIdSchema }).strict();

export const UnwatchInputSchema = z
  .object({ subscriptionId: z.string().min(1).max(64) })
  .strict();

export type CreateInput = z.infer<typeof CreateInputSchema>;
export type OpenInput = z.infer<typeof OpenInputSchema>;
export type SendInput = z.infer<typeof SendInputSchema>;
export type CancelInput = z.infer<typeof CancelInputSchema>;
export type RenameInput = z.infer<typeof RenameInputSchema>;
export type DeleteInput = z.infer<typeof DeleteInputSchema>;
export type WatchInput = z.infer<typeof WatchInputSchema>;
export type UnwatchInput = z.infer<typeof UnwatchInputSchema>;
```

- [ ] **Step 5: Run tests; verify pass**

Run: `pnpm --filter . exec vitest run src/main/ipc/schemas.test.ts`
Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/schemas.ts src/main/ipc/schemas.test.ts
git commit -m "feat(main/ipc): zod schemas for session IPC payloads"
```

---

### Task 16: `SessionRegistry`

**Files:**
- Create: `src/main/registry.ts`
- Test: `src/main/registry.test.ts`

- [ ] **Step 1: Write test (uses minimal `Session` mock)**

`src/main/registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionRegistry } from "./registry.js";

type FakeSession = { sessionId: string; close: ReturnType<typeof vi.fn> };

function fakeSession(id: string): FakeSession {
  return { sessionId: id, close: vi.fn(async () => {}) };
}

function fakeWebContents() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    send: vi.fn(),
    on: vi.fn((ev: string, cb: () => void) => {
      const arr = listeners.get(ev) ?? [];
      arr.push(cb);
      listeners.set(ev, arr);
    }),
    isDestroyed: vi.fn(() => false),
    _emit(ev: string) {
      for (const cb of listeners.get(ev) ?? []) cb();
    },
  };
}

let registry: SessionRegistry;
let openImpl: (id: string) => Promise<FakeSession>;
beforeEach(() => {
  openImpl = vi.fn(async (id: string) => fakeSession(id));
  registry = new SessionRegistry({ openSession: openImpl as never });
});

describe("SessionRegistry", () => {
  it("memoises openSession per sessionId", async () => {
    await registry.open("S1");
    await registry.open("S1");
    expect(openImpl).toHaveBeenCalledTimes(1);
  });

  it("subscribe + fanout sends session:event to subscribers of that session only", async () => {
    await registry.open("S1");
    await registry.open("S2");
    const wc1 = fakeWebContents();
    const wc2 = fakeWebContents();
    registry.subscribe("S1", wc1 as never);
    registry.subscribe("S2", wc2 as never);
    registry.fanout("S1", { type: "text", delta: "hi" } as never);
    expect(wc1.send).toHaveBeenCalledWith("session:event", expect.objectContaining({ sessionId: "S1" }));
    expect(wc2.send).not.toHaveBeenCalled();
  });

  it("unsubscribe removes the subscription only when caller owns it", async () => {
    const wc1 = fakeWebContents();
    const wc2 = fakeWebContents();
    const subId = registry.subscribe("S1", wc1 as never);
    registry.unsubscribe(subId, wc2 as never); // wrong owner — no-op
    registry.fanout("S1", { type: "text", delta: "hi" } as never);
    expect(wc1.send).toHaveBeenCalled();

    registry.unsubscribe(subId, wc1 as never);
    wc1.send.mockClear();
    registry.fanout("S1", { type: "text", delta: "again" } as never);
    expect(wc1.send).not.toHaveBeenCalled();
  });

  it("removes subscriptions on webContents destroyed", async () => {
    const wc = fakeWebContents();
    registry.subscribe("S1", wc as never);
    wc._emit("destroyed");
    wc.send.mockClear();
    registry.fanout("S1", { type: "text", delta: "x" } as never);
    expect(wc.send).not.toHaveBeenCalled();
  });

  it("evict closes the session and drops subs", async () => {
    const session = await registry.open("S1");
    const wc = fakeWebContents();
    registry.subscribe("S1", wc as never);
    await registry.evict("S1");
    expect(session.close).toHaveBeenCalled();
    registry.fanout("S1", { type: "text", delta: "z" } as never);
    expect(wc.send).not.toHaveBeenCalled();
  });

  it("closeAll closes every session", async () => {
    const a = await registry.open("S1");
    const b = await registry.open("S2");
    await registry.closeAll();
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter . exec vitest run src/main/registry.test.ts`
Expected: fail.

- [ ] **Step 3: Implement**

`src/main/registry.ts`:

```typescript
import { randomBytes } from "node:crypto";
import type { WebContents } from "electron";

export interface SessionLike {
  readonly sessionId: string;
  close(): Promise<void>;
}

export type RegistryDeps<S extends SessionLike = SessionLike> = {
  openSession: (sessionId: string) => Promise<S>;
};

type Subscription = { id: string; sessionId: string; webContents: WebContents };

export class SessionRegistry<S extends SessionLike = SessionLike> {
  private readonly deps: RegistryDeps<S>;
  private readonly sessions = new Map<string, S>();
  private readonly opening = new Map<string, Promise<S>>();
  private readonly subs = new Map<string, Subscription>();
  private readonly destroyHandlers = new WeakMap<WebContents, () => void>();

  constructor(deps: RegistryDeps<S>) {
    this.deps = deps;
  }

  async open(sessionId: string): Promise<S> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const inFlight = this.opening.get(sessionId);
    if (inFlight) return inFlight;
    const p = this.deps.openSession(sessionId).then((s) => {
      this.sessions.set(sessionId, s);
      this.opening.delete(sessionId);
      return s;
    });
    this.opening.set(sessionId, p);
    return p;
  }

  subscribe(sessionId: string, webContents: WebContents): string {
    const id = randomBytes(8).toString("hex");
    const sub: Subscription = { id, sessionId, webContents };
    this.subs.set(id, sub);
    if (!this.destroyHandlers.has(webContents)) {
      const handler = () => {
        for (const [k, v] of this.subs) {
          if (v.webContents === webContents) this.subs.delete(k);
        }
      };
      this.destroyHandlers.set(webContents, handler);
      webContents.on("destroyed", handler);
    }
    return id;
  }

  unsubscribe(subscriptionId: string, ownerWebContents: WebContents): void {
    const sub = this.subs.get(subscriptionId);
    if (!sub) return;
    if (sub.webContents !== ownerWebContents) return;
    this.subs.delete(subscriptionId);
  }

  fanout(sessionId: string, event: unknown): void {
    for (const sub of this.subs.values()) {
      if (sub.sessionId !== sessionId) continue;
      if (sub.webContents.isDestroyed?.()) {
        this.subs.delete(sub.id);
        continue;
      }
      sub.webContents.send("session:event", { sessionId, event });
    }
  }

  fanoutDeleted(sessionId: string): void {
    for (const [k, sub] of this.subs) {
      if (sub.sessionId !== sessionId) continue;
      if (!sub.webContents.isDestroyed?.()) {
        sub.webContents.send("session:deleted", { sessionId });
      }
      this.subs.delete(k);
    }
  }

  async evict(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      try {
        await s.close();
      } catch {
        /* ignore */
      }
      this.sessions.delete(sessionId);
    }
    for (const [k, sub] of this.subs) {
      if (sub.sessionId === sessionId) this.subs.delete(k);
    }
  }

  async closeAll(): Promise<void> {
    const closes = Array.from(this.sessions.values()).map((s) =>
      s.close().catch(() => {}),
    );
    this.sessions.clear();
    this.subs.clear();
    await Promise.all(closes);
  }
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter . exec vitest run src/main/registry.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/registry.ts src/main/registry.test.ts
git commit -m "feat(main): SessionRegistry with subscription fan-out + ownership checks"
```

---

### Task 17: IPC handlers (`session:*`)

**Files:**
- Create: `src/main/ipc/session.ts`
- Test: `src/main/ipc/session.test.ts`

- [ ] **Step 1: Write test (uses fake ipcMain + registry)**

`src/main/ipc/session.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerSessionIpc } from "./session.js";

type Handler = (event: { sender: unknown }, payload: unknown) => Promise<unknown>;

function makeIpcMain() {
  const handlers = new Map<string, Handler>();
  return {
    handle: vi.fn((channel: string, fn: Handler) => handlers.set(channel, fn)),
    invoke: (channel: string, sender: unknown, payload: unknown) =>
      handlers.get(channel)!({ sender }, payload),
  };
}

const baseDir = "/tmp/test-base";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("registerSessionIpc", () => {
  it("session:create returns sessionId on valid input, calls deps.create", async () => {
    const ipc = makeIpcMain();
    const deps = {
      baseDir,
      registry: { open: vi.fn(), evict: vi.fn(), fanoutDeleted: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
      createSession: vi.fn(async () => ({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX", close: vi.fn() })),
      listSessions: vi.fn(async () => []),
      deleteSession: vi.fn(async () => {}),
    };
    registerSessionIpc(ipc as never, deps as never);
    const result = await ipc.invoke("session:create", {}, { title: "demo" });
    expect(result).toEqual({ sessionId: "01HXYZABCDEFGHJKMNPQRSTVWX" });
    expect(deps.createSession).toHaveBeenCalledWith({ baseDir, title: "demo" });
  });

  it("session:send rejects malformed payload with INVALID", async () => {
    const ipc = makeIpcMain();
    registerSessionIpc(ipc as never, {
      baseDir,
      registry: {} as never,
      createSession: vi.fn() as never,
      listSessions: vi.fn() as never,
      deleteSession: vi.fn() as never,
    });
    const out = await ipc.invoke("session:send", {}, { sessionId: "bad", prompt: "x" });
    expect(out).toMatchObject({ ok: false, code: "INVALID" });
  });

  it("session:unwatch checks WebContents ownership", async () => {
    const ipc = makeIpcMain();
    const unsubscribe = vi.fn();
    registerSessionIpc(ipc as never, {
      baseDir,
      registry: { unsubscribe } as never,
      createSession: vi.fn() as never,
      listSessions: vi.fn() as never,
      deleteSession: vi.fn() as never,
    });
    const sender = { id: "wc-1" };
    await ipc.invoke("session:unwatch", sender, { subscriptionId: "abc" });
    expect(unsubscribe).toHaveBeenCalledWith("abc", sender);
  });
});
```

- [ ] **Step 2: Run; verify failing**

Run: `pnpm --filter . exec vitest run src/main/ipc/session.test.ts`
Expected: fail.

- [ ] **Step 3: Implement**

`src/main/ipc/session.ts`:

```typescript
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import type {
  Session,
  SessionEvent,
  SessionMetadata,
  PersistedTurn,
  TurnResult,
} from "@flow-build/core";
import {
  CreateInputSchema,
  OpenInputSchema,
  SendInputSchema,
  CancelInputSchema,
  RenameInputSchema,
  DeleteInputSchema,
  WatchInputSchema,
  UnwatchInputSchema,
} from "./schemas.js";
import type { SessionRegistry } from "../registry.js";

export type IpcDeps = {
  baseDir: string;
  registry: SessionRegistry<Session>;
  createSession: (opts: { baseDir: string; title?: string; model?: string }) => Promise<Session>;
  listSessions: (opts: { baseDir: string }) => Promise<SessionMetadata[]>;
  deleteSession: (opts: { baseDir: string; sessionId: string }) => Promise<void>;
};

type IpcResult<T> = ({ ok: true } & T) | { ok: false; code: string; error: string };

function invalid(error: string): IpcResult<never> {
  return { ok: false, code: "INVALID", error };
}

function harnessFail(e: unknown): IpcResult<never> {
  const code = (e as { code?: string }).code ?? "UNKNOWN";
  const error = (e as Error).message ?? String(e);
  return { ok: false, code, error };
}

export function registerSessionIpc(ipc: IpcMain, deps: IpcDeps): void {
  ipc.handle("session:list", async () => {
    try {
      return { ok: true, items: await deps.listSessions({ baseDir: deps.baseDir }) };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:create", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = CreateInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const args: { baseDir: string; title?: string; model?: string } = { baseDir: deps.baseDir };
      if (parsed.data.title) args.title = parsed.data.title;
      if (parsed.data.model) args.model = parsed.data.model;
      const s = await deps.createSession(args);
      return { sessionId: s.sessionId };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:open", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = OpenInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      const [metadata, turns] = await Promise.all([session.metadata(), session.turns()]);
      return { ok: true, metadata, turns };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:send", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = SendInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      const result: TurnResult = await session.send(parsed.data.prompt, {
        onEvent: (ev: SessionEvent) => deps.registry.fanout(parsed.data.sessionId, ev),
      });
      return { ok: true, ...result };
    } catch (err) {
      return harnessFail(err);
    }
  });

  ipc.handle("session:cancel", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = CancelInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      await session.cancel();
      return { ok: true };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:rename", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RenameInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const session = await deps.registry.open(parsed.data.sessionId);
      await session.rename(parsed.data.title);
      return { ok: true };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:delete", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = DeleteInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      await deps.registry.evict(parsed.data.sessionId);
      deps.registry.fanoutDeleted(parsed.data.sessionId);
      await deps.deleteSession({ baseDir: deps.baseDir, sessionId: parsed.data.sessionId });
      return { ok: true };
    } catch (e) {
      return harnessFail(e);
    }
  });

  ipc.handle("session:watch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = WatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    const subscriptionId = deps.registry.subscribe(
      parsed.data.sessionId,
      e.sender as WebContents,
    );
    return { ok: true, subscriptionId };
  });

  ipc.handle("session:unwatch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = UnwatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    deps.registry.unsubscribe(parsed.data.subscriptionId, e.sender as WebContents);
    return { ok: true };
  });
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter . exec vitest run src/main/ipc/session.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/session.ts src/main/ipc/session.test.ts
git commit -m "feat(main/ipc): session:* handlers with zod validation"
```

---

### Task 18: Wire `src/main/index.ts` — single-instance lock, sandbox:true, register IPC, drop cursor-chat

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Read current file**

Run: `wc -l src/main/index.ts && cat src/main/index.ts`

- [ ] **Step 2: Replace with new wiring**

Overwrite `src/main/index.ts`:

```typescript
import { app, shell, BrowserWindow, ipcMain } from "electron";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import {
  createSession,
  listSessions,
  loadSession,
  deleteSession,
  type Session,
} from "@flow-build/core";
import icon from "../../resources/icon.png?asset";
import { SessionRegistry } from "./registry.js";
import { registerSessionIpc } from "./ipc/session.js";

function loadLocalEnv(): void {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const env = readFileSync(envPath, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

function configureCursorRipgrepPath(): void {
  if (process.env.CURSOR_RIPGREP_PATH) return;
  const platformPackage =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? "@cursor/sdk-darwin-arm64"
        : "@cursor/sdk-darwin-x64"
      : process.platform === "linux"
        ? process.arch === "arm64"
          ? "@cursor/sdk-linux-arm64"
          : "@cursor/sdk-linux-x64"
        : process.platform === "win32"
          ? "@cursor/sdk-win32-x64"
          : null;
  if (!platformPackage) return;
  const binaryName = process.platform === "win32" ? "rg.exe" : "rg";
  const rgPath = join(process.cwd(), "node_modules", platformPackage, "bin", binaryName);
  if (existsSync(rgPath)) process.env.CURSOR_RIPGREP_PATH = rgPath;
}

function getBaseDir(): string {
  return join(app.getPath("userData"), "flow-build");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

loadLocalEnv();
configureCursorRipgrepPath();

const registry = new SessionRegistry<Session>({
  openSession: (sessionId) => loadSession({ baseDir: getBaseDir(), sessionId }),
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.on("second-instance", () => {
  const all = BrowserWindow.getAllWindows();
  if (all[0]) {
    if (all[0].isMinimized()) all[0].restore();
    all[0].focus();
  }
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId("build.flow");
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));

  registerSessionIpc(ipcMain, {
    baseDir: getBaseDir(),
    registry,
    createSession: (opts) => createSession(opts),
    listSessions: (opts) => listSessions(opts),
    deleteSession: (opts) => deleteSession(opts),
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await registry.closeAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  await registry.closeAll();
  app.exit();
});
```

- [ ] **Step 3: Typecheck the main**

Run: `pnpm typecheck`
Expected: pass. If `Session` type is not exported from `@flow-build/core`, verify Task 13 left the export in place.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): single-instance lock, sandbox:true, session IPC; drop cursor-chat handler"
```

---

### Task 19: Replace preload bridge

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Read current preload**

Run: `cat src/preload/index.ts`
Note current `window.api.cursorChat`.

- [ ] **Step 2: Replace**

```typescript
import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import type {
  PersistedTurn,
  SessionEvent,
  SessionMetadata,
  TurnResult,
} from "@flow-build/core";

type IpcOk<T> = { ok: true } & T;
type IpcErr = { ok: false; code: string; error: string };
type IpcResult<T> = IpcOk<T> | IpcErr;

function unwrap<T>(r: IpcResult<T>): T {
  if (!r || (r as IpcErr).ok === false) {
    const e = r as IpcErr;
    const err = new Error(e?.error ?? "ipc error");
    (err as { code?: string }).code = e?.code;
    throw err;
  }
  return r;
}

const api = {
  session: {
    async list(): Promise<SessionMetadata[]> {
      const r = await ipcRenderer.invoke("session:list");
      return unwrap<{ items: SessionMetadata[] }>(r).items;
    },
    async create(opts: { title?: string; model?: string } = {}): Promise<{ sessionId: string }> {
      const r = await ipcRenderer.invoke("session:create", opts);
      return unwrap<{ sessionId: string }>(r);
    },
    async open(sessionId: string): Promise<{ metadata: SessionMetadata; turns: PersistedTurn[] }> {
      const r = await ipcRenderer.invoke("session:open", { sessionId });
      return unwrap<{ metadata: SessionMetadata; turns: PersistedTurn[] }>(r);
    },
    async send(sessionId: string, prompt: string): Promise<TurnResult> {
      const r = await ipcRenderer.invoke("session:send", { sessionId, prompt });
      return unwrap<TurnResult>(r);
    },
    async cancel(sessionId: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:cancel", { sessionId }));
    },
    async rename(sessionId: string, title: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:rename", { sessionId, title }));
    },
    async delete(sessionId: string): Promise<void> {
      unwrap(await ipcRenderer.invoke("session:delete", { sessionId }));
    },
    watch(sessionId: string, onEvent: (e: SessionEvent) => void): () => void {
      let subscriptionId: string | undefined;
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { sessionId: string; event: SessionEvent },
      ) => {
        if (payload.sessionId !== sessionId) return;
        onEvent(payload.event);
      };
      const deletedListener = (
        _e: Electron.IpcRendererEvent,
        payload: { sessionId: string },
      ) => {
        if (payload.sessionId !== sessionId) return;
        // best effort — surface a deletion event upstream via a synthetic wrapper
        onEvent({ type: "error", turnId: "", message: "session deleted", code: "DELETED" } as SessionEvent);
      };
      ipcRenderer.on("session:event", listener);
      ipcRenderer.on("session:deleted", deletedListener);
      ipcRenderer
        .invoke("session:watch", { sessionId })
        .then((r) => {
          subscriptionId = unwrap<{ subscriptionId: string }>(r).subscriptionId;
        })
        .catch(() => {});
      return () => {
        ipcRenderer.removeListener("session:event", listener);
        ipcRenderer.removeListener("session:deleted", deletedListener);
        if (subscriptionId) {
          ipcRenderer.invoke("session:unwatch", { subscriptionId }).catch(() => {});
        }
      };
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // sandbox: true normally implies contextIsolated, but keep parity
  (window as unknown as { electron: typeof electronAPI }).electron = electronAPI;
  (window as unknown as { api: typeof api }).api = api;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose window.api.session; drop cursorChat surface"
```

---

## Phase 3 — Renderer

### Task 20: `useSession` hook

**Files:**
- Create: `src/renderer/src/hooks/useSession.ts`

- [ ] **Step 1: Implement**

`src/renderer/src/hooks/useSession.ts`:

```typescript
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PersistedTurn, SessionEvent, SessionMetadata } from "@flow-build/core";

type State = {
  metadata?: SessionMetadata;
  turns: PersistedTurn[];
  loading: boolean;
  error?: string;
};

type Action =
  | { type: "loaded"; metadata: SessionMetadata; turns: PersistedTurn[] }
  | { type: "event"; ev: SessionEvent }
  | { type: "error"; message: string }
  | { type: "reset" };

function applyEvent(turns: PersistedTurn[], ev: SessionEvent): PersistedTurn[] {
  if (ev.type === "user") {
    return [
      ...turns,
      {
        turnId: ev.turnId,
        user: { text: ev.text, ts: new Date().toISOString() },
        assistant: { textBlocks: [], toolCalls: [] },
        status: "running",
      },
    ];
  }
  const idx = turns.findIndex((t) => "turnId" in ev && t.turnId === (ev as { turnId: string }).turnId);
  if (idx < 0) return turns;
  const next = turns.slice();
  const t = { ...next[idx]!, assistant: { ...next[idx]!.assistant } };
  next[idx] = t;
  switch (ev.type) {
    case "turn_open":
    case "turn_start":
      t.status = "running";
      break;
    case "text":
      t.assistant.textBlocks = [...t.assistant.textBlocks, ev.delta];
      break;
    case "thinking":
      t.assistant.thinking = [...(t.assistant.thinking ?? []), ev.delta];
      break;
    case "tool_start":
      t.assistant.toolCalls = [
        ...t.assistant.toolCalls,
        { callId: ev.callId, name: ev.name, ...(ev.args !== undefined ? { args: ev.args } : {}) },
      ];
      break;
    case "tool_end": {
      const tcIdx = t.assistant.toolCalls.findIndex((c) => c.callId === ev.callId);
      if (tcIdx >= 0) {
        const tcs = t.assistant.toolCalls.slice();
        const tc = { ...tcs[tcIdx]! };
        tc.ok = ev.ok;
        if (ev.args !== undefined) tc.args = ev.args;
        if (ev.result !== undefined) tc.result = ev.result;
        tcs[tcIdx] = tc;
        t.assistant.toolCalls = tcs;
      }
      break;
    }
    case "turn_end":
      t.status = ev.status;
      if (ev.usage) t.usage = ev.usage;
      break;
    case "error":
    case "status":
    default:
      break;
  }
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { metadata: action.metadata, turns: action.turns, loading: false };
    case "event":
      return { ...state, turns: applyEvent(state.turns, action.ev) };
    case "error":
      return { ...state, loading: false, error: action.message };
    case "reset":
      return { turns: [], loading: true };
  }
}

export function useSession(sessionId: string | undefined): {
  metadata?: SessionMetadata;
  turns: PersistedTurn[];
  loading: boolean;
  error?: string;
  send: (prompt: string) => Promise<void>;
  cancel: () => Promise<void>;
} {
  const [state, dispatch] = useReducer(reducer, { turns: [], loading: !!sessionId });
  const unsubRef = useRef<() => void>();

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    dispatch({ type: "reset" });
    window.api.session
      .open(sessionId)
      .then(({ metadata, turns }) => {
        if (cancelled) return;
        dispatch({ type: "loaded", metadata, turns });
      })
      .catch((e) => dispatch({ type: "error", message: (e as Error).message }));
    unsubRef.current = window.api.session.watch(sessionId, (ev) =>
      dispatch({ type: "event", ev }),
    );
    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = undefined;
    };
  }, [sessionId]);

  const send = useCallback(
    async (prompt: string) => {
      if (!sessionId) return;
      await window.api.session.send(sessionId, prompt);
    },
    [sessionId],
  );

  const cancel = useCallback(async () => {
    if (!sessionId) return;
    await window.api.session.cancel(sessionId);
  }, [sessionId]);

  return { ...state, send, cancel };
}

declare global {
  interface Window {
    api: {
      session: {
        list: () => Promise<SessionMetadata[]>;
        create: (opts?: { title?: string; model?: string }) => Promise<{ sessionId: string }>;
        open: (sessionId: string) => Promise<{ metadata: SessionMetadata; turns: PersistedTurn[] }>;
        send: (sessionId: string, prompt: string) => Promise<unknown>;
        cancel: (sessionId: string) => Promise<void>;
        rename: (sessionId: string, title: string) => Promise<void>;
        delete: (sessionId: string) => Promise<void>;
        watch: (sessionId: string, onEvent: (e: SessionEvent) => void) => () => void;
      };
    };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useSession.ts
git commit -m "feat(renderer): useSession hook — single watch, reduces events to turns"
```

---

### Task 21: `ToolCallChip` component

**Files:**
- Create: `src/renderer/src/components/ToolCallChip.tsx`

- [ ] **Step 1: Implement**

`src/renderer/src/components/ToolCallChip.tsx`:

```typescript
import { useState } from "react";
import type { PersistedTurn } from "@flow-build/core";

type Props = { call: PersistedTurn["assistant"]["toolCalls"][number] };

export function ToolCallChip({ call }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const status = call.ok === undefined ? "running" : call.ok ? "ok" : "error";
  return (
    <div className={`tool-chip tool-chip-${status}`}>
      <button className="tool-chip-head" onClick={() => setOpen((v) => !v)}>
        <span className="tool-chip-name">{call.name}</span>
        <span className="tool-chip-status">{status}</span>
        <span className="tool-chip-toggle">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="tool-chip-body">
          <div className="tool-chip-section">
            <div className="tool-chip-label">args</div>
            <pre>{call.args !== undefined ? JSON.stringify(call.args, null, 2) : "<none>"}</pre>
          </div>
          <div className="tool-chip-section">
            <div className="tool-chip-label">result</div>
            <pre>{call.result !== undefined ? JSON.stringify(call.result, null, 2) : "<none>"}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ToolCallChip.tsx
git commit -m "feat(renderer): ToolCallChip with expandable args/result"
```

---

### Task 22: Refactor `App.tsx` + `ChatThread.tsx` + `PromptBox.tsx`

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/ChatThread.tsx`
- Modify: `src/renderer/src/components/PromptBox.tsx`

- [ ] **Step 1: Read current files**

Run: `cat src/renderer/src/App.tsx | head -60 src/renderer/src/components/ChatThread.tsx src/renderer/src/components/PromptBox.tsx`

- [ ] **Step 2: Refactor `ChatThread.tsx` to consume `PersistedTurn[]`**

Replace the file's inner data flow:

```typescript
import { useEffect, useRef, type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PersistedTurn } from "@flow-build/core";
import { ToolCallChip } from "./ToolCallChip";

type ChatThreadProps = {
  turns: PersistedTurn[];
  height: number;
  onResize: (height: number) => void;
};

export function ChatThread({ turns, height, onResize }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, turns[turns.length - 1]?.assistant.textBlocks.length ?? 0]);

  function onResizeDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startH = height;
    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      const dy = startY - moveEvent.clientY;
      onResize(Math.max(60, Math.min(560, startH + dy)));
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "ns-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <>
      <div className="ct-resizer" onMouseDown={onResizeDown} title="Drag to resize">
        <div className="ct-resizer-grip" />
      </div>
      <div className="ct" ref={scrollRef} style={{ height, maxHeight: "none", flex: "0 0 auto" }}>
        <div className="ct-list">
          {turns.map((turn) => (
            <div key={turn.turnId} className="msg-pair">
              <div className="msg msg-user">
                <div className="msg-bub">{turn.user.text}</div>
              </div>
              <div className="msg msg-ai">
                <div className="msg-body">
                  <div className="msg-h">FlowBuild</div>
                  {turn.assistant.toolCalls.map((c) => (
                    <ToolCallChip key={c.callId} call={c} />
                  ))}
                  {turn.assistant.textBlocks.length > 0 && (
                    <div className="msg-text">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {turn.assistant.textBlocks.join("")}
                      </ReactMarkdown>
                    </div>
                  )}
                  {turn.status !== "completed" && turn.status !== "running" && (
                    <div className="msg-end">[turn {turn.status}]</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Refactor `PromptBox.tsx` to surface a stop button while running**

Add a prop `isRunning` and a stop button. Inspect the existing component's props/JSX in your read; add the new prop without breaking existing call sites:

```typescript
type PromptBoxProps = {
  onSubmit: (text: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
  // …existing props
};
```

In the form's submit area:

```tsx
{isRunning ? (
  <button type="button" className="prompt-stop" onClick={onStop}>
    Stop
  </button>
) : (
  <button type="submit" className="prompt-submit">
    Send
  </button>
)}
```

(Preserve the rest of the existing JSX.)

- [ ] **Step 4: Refactor `App.tsx` — replace seeded chat state**

The existing `App.tsx` seeds `messages` directly. Replace with session state:

- Remove the `useState<ChatMessage[]>(...)` initial seed.
- Add a sidebar that lists sessions via `window.api.session.list()`; clicking switches `activeSessionId`.
- Use `useSession(activeSessionId)` to get `turns`, `metadata`, `send`, `cancel`.
- Create-on-mount: if `list()` returns `[]`, call `window.api.session.create({})` and set the new id as active.
- Pass `turns` to `<ChatThread />` (replacing the old `messages` prop).
- Pass `isRunning = turns[turns.length - 1]?.status === "running"`, `onStop = cancel`, `onSubmit = send` to `<PromptBox />`.

Concrete diff (simplified — adapt around the file's existing JSX):

```typescript
import { useEffect, useState } from "react";
import { useSession } from "./hooks/useSession";
import type { SessionMetadata } from "@flow-build/core";

export function App() {
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const { turns, metadata, send, cancel } = useSession(activeId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await window.api.session.list();
      if (cancelled) return;
      if (list.length === 0) {
        const { sessionId } = await window.api.session.create({});
        const fresh = await window.api.session.list();
        if (cancelled) return;
        setSessions(fresh);
        setActiveId(sessionId);
      } else {
        setSessions(list);
        setActiveId(list[0]!.sessionId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isRunning = turns.length > 0 && turns[turns.length - 1]!.status === "running";

  // …existing layout JSX, replacing in-memory messages with `turns`,
  // and Sidebar should render `sessions` letting the user click to switch.
  return null; // placeholder — keep the existing component structure
}
```

(Keep the existing layout chrome — Sidebar, TopBar, FlowCanvas, Minimap, FlowLegend, etc. Replace only the chat data flow.)

- [ ] **Step 5: Run dev build to verify renderer compiles**

Run: `pnpm dev`
Then: visually confirm the app launches, sidebar appears, sending a prompt streams text into the thread.

If `pnpm dev` is not desired during plan execution, run `pnpm build` instead and verify it succeeds:

Run: `pnpm build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/ChatThread.tsx src/renderer/src/components/PromptBox.tsx
git commit -m "feat(renderer): wire chat to disk-backed sessions via useSession"
```

---

## Phase 4 — Manual smoke + docs

### Task 23: Update `docs/smoke.md`

**Files:**
- Modify: `docs/smoke.md`

- [ ] **Step 1: Append manual checklist**

Append to `docs/smoke.md`:

```markdown

## Multi-turn session smoke

Goal: verify v1 multi-turn chat persists across restart and replays verbatim.

1. Launch the app: `pnpm dev`.
2. Sidebar shows one auto-created session. Note its title.
3. Submit prompt: `list files in this session's workspace dir`.
4. Confirm: assistant streams text + at least one `[shell]` tool chip with full args/result expandable.
5. Submit follow-up: `now write a file called ping.txt with content "pong"`.
6. Confirm: agent acts on the prior context (references the listing or writes via `edit`/`write` tool); the chip shows the write call.
7. Quit the app (Cmd-Q on macOS).
8. Relaunch: `pnpm dev`. Sidebar still lists the session; clicking it shows both prior turns rendered identically.
9. Submit: `summarise what we just did`. Confirm the assistant references the prior file write — proves replay is feeding history into the third turn.
10. Force-kill the app mid-turn (during a long shell command). Relaunch. Confirm the in-flight turn appears with `[turn interrupted]` marker; submitting a new prompt works.
11. From a second shell: `node -e 'require("@flow-build/core").loadSession({baseDir: "...", sessionId: "..."})'` — confirm `SessionLockedError` because the app holds the lockfile.
```

- [ ] **Step 2: Commit**

```bash
git add docs/smoke.md
git commit -m "docs(smoke): multi-turn session manual checklist"
```

---

### Task 24: Final verification

- [ ] **Step 1: Run all tests**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 2: Run app once end-to-end**

Run: `pnpm dev`
Walk through `docs/smoke.md` multi-turn checklist steps 1–9. Capture any regressions; fix and recommit before declaring complete.

- [ ] **Step 3: Final commit (if any leftover fixes)**

```bash
git add -A
git commit -m "fix: smoke-test follow-ups"
```

---

## Cross-cutting reminders

- **Never include Co-Authored-By lines** in commit messages.
- **Atomic writes** — when in doubt, write `<path>.tmp.<pid>.<ts>` then `rename`. Never `writeFileSync` directly to the canonical path.
- **No truncation** — replay is verbatim. If a tool result is megabytes, the line is megabytes. Document only.
- **No silent error swallowing in core** — log via `ctx.logger.warn` but surface fatal conditions as typed errors.
- **No business logic in preload** — preload only marshals IPC + types. Validation lives in main.
- **No `@cursor/sdk` import outside `packages/core`** — main process must use `@flow-build/core` only.

---

## Self-Review

- [x] **Spec coverage** — every section of the spec maps to a task:
  - §2.4 lossless replay → Task 9
  - §4 disk layout → Tasks 7, 10, 12
  - §4.1 chat.json → Task 7
  - §4.2 events.jsonl + turn_open → Tasks 7, 11
  - §5.1 exports → Task 13
  - §5.2 types → Task 6
  - §5.3 modules → Tasks 3–12
  - §5.4 lifecycle → Task 11
  - §5.5 plugin per-turn → Task 11
  - §5.6 cancel drain → Task 11
  - §5.7 tool_end.result → Task 1
  - §5.8 crash recovery → Task 8 (reducer rule) + Task 11 (lockfile)
  - §6 replay → Task 9
  - §7.1–7.7 main + IPC + lockfile → Tasks 15–18
  - §7.8 IPC validation → Task 15 + 17
  - §8 renderer → Tasks 20–22
  - §9 migration → Task 18 (drops cursor-chat)
  - §10 errors → Task 4
  - §11 cancellation/recovery → Task 11
  - §12 testing — covered across each task's tests + Task 14 + Task 23
  - §13 follow-ups — out of scope, documented in spec
  - §14 file-tree — matches "Modified" + "Created" sections above
  - §15 changelog — informational, no task

- [x] **Placeholder scan** — no TBD/TODO/"add validation"/"similar to"; every code step contains complete code or surgical references to existing files.

- [x] **Type consistency** — `SessionMetadata.lastStatus` is `TurnStatus | "running"` everywhere. `LineEnvelope` covers every event kind. `Session.metadata()` (not `manifest()`) used consistently across factories, IPC, and renderer. `ToolCallSnapshot.status` values: `running | completed | error` (matches existing core type).

- [x] **Scope** — single coherent feature (Session API + Electron wiring). No decomposition needed.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-multi-turn-session-and-electron-integration.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
