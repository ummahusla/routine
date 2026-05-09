# flow-build — Cursor SDK Harness Design

**Date:** 2026-05-09
**Status:** Approved
**Source research:** `cursor-agent-sdk-research.md` (repo root)

---

## 1. Goal

Build a minimal CLI harness that wraps `@cursor/sdk` and exposes a stable
internal API. CLI is step one; the same core API will later power a UI. The
contract between core and presenter (CLI now, UI later) is the durable surface;
the CLI is a thin presenter.

**Non-goals (v1):** multi-turn sessions, agent resume, MCP servers, hooks,
subagents, cloud agents, persistence, telemetry, UI.

---

## 2. Success criteria

`flow-build run "<prompt>"` invoked in a repo:

1. Streams Cursor agent text deltas to stdout as they arrive.
2. Shows tool-call indicators inline: `[tool: shell]`, `[tool: edit ✓]`.
3. Exits 0 on completion, 130 on `SIGINT`, 1–3 on error classes (see §6).
4. Honors `CURSOR_API_KEY` env var; surfaces clear error if missing.
5. `--max-retries N` / `--no-retry` flags wire through to core.

A second consumer (a stub HTTP server in `packages/core` test code) can drive
`runPrompt` with the same options and observe the same event stream — proving
core does not depend on CLI concerns.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│  packages/cli  (bin: flow-build)                │
│   - argv parsing (commander)                    │
│   - renderer (plain-text + tool indicators)     │
│   - exits 0/non-zero on Run result              │
└────────────────┬────────────────────────────────┘
                 │ imports core's public API only
                 ▼
┌─────────────────────────────────────────────────┐
│  packages/core                                  │
│   public:                                       │
│     runPrompt({prompt, cwd, model, signal,     │
│                onEvent, logger, retry})         │
│     HarnessEvent  (narrowed event union)        │
│     RunResult     (status, finalText, usage)    │
│     HarnessError, AuthError, NetworkError,     │
│     ConfigError                                 │
│   internal:                                     │
│     sdkClient (wraps @cursor/sdk Agent)         │
│     normalizer (SDKMessage → HarnessEvent)      │
│     errors (SDK error → HarnessError)           │
│     retry (exponential backoff)                 │
│     config (resolves apiKey, defaults)          │
└────────────────┬────────────────────────────────┘
                 │ depends on
                 ▼
              @cursor/sdk
```

- Monorepo: pnpm workspaces. Two packages: `core`, `cli`.
- `core` is the contract surface. CLI never imports `@cursor/sdk` directly.
- `core` defines its own `HarnessEvent` union — narrower than SDK's
  `SDKMessage` so consumers don't break when SDK schema drifts (research
  §4.8: "Tool call schema is not stable").
- Single async-iterator stream model exposed as a callback (`onEvent`); no
  generator over the package boundary so consumers can pick how they want
  to consume (sync render, queue, fan-out).
- `runPrompt` is one-shot. Multi-turn → future `createSession()`.

---

## 4. Components

### 4.1 `packages/core/src/index.ts` — public surface

```typescript
export { runPrompt } from "./run";
export type {
  HarnessEvent,
  RunOptions,
  RunResult,
  RunStatus,
  Logger,
} from "./types";
export {
  HarnessError,
  AuthError,
  NetworkError,
  ConfigError,
} from "./errors";
```

### 4.2 `packages/core/src/types.ts`

```typescript
export type Logger = {
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  debug?: (msg: string, ctx?: Record<string, unknown>) => void;
};

export type RetryOptions = {
  attempts?: number;       // default 3
  baseDelayMs?: number;    // default 1000
};

export type RunOptions = {
  prompt: string;
  cwd: string;
  model?: string;          // default "composer-2"
  apiKey?: string;         // falls back to CURSOR_API_KEY
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

### 4.3 `packages/core/src/run.ts` — orchestrator

Responsibilities:

1. Resolve config: `apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY`.
   If missing → throw `AuthError` synchronously.
2. Validate `cwd` exists and is a directory → throw `ConfigError` if not.
3. Emit `{type:"status", phase:"starting"}`.
4. Wrap `Agent.create({apiKey, model, local:{cwd}})` + first `agent.send`
   in retry helper (see §4.6). Each retry attempt creates a fresh `Agent`
   and disposes any prior failed instance via `agent.close()` before
   sleeping. The successful `(agent, run)` pair is returned out of the
   retry block and the stream loop runs outside it. `await using agent`
   declared on the returned pair guarantees disposal of the live agent
   regardless of how the stream loop ends.
5. Iterate `run.stream()`:
   - On each tick check `opts.signal?.aborted` → call `run.cancel()`,
     break.
   - Pass each `SDKMessage` through `normalize(msg, logger)` → `HarnessEvent[]`.
   - Forward each event to `opts.onEvent`.
   - Accumulate text deltas into `finalText`.
6. After stream end: `await run.wait()`, capture usage if available.
7. Emit `{type:"status", phase:"done"}`.
8. Return `RunResult`.

Mid-stream errors do NOT retry. Wrap in `mapToHarnessError` and rethrow.

### 4.4 `packages/core/src/normalizer.ts`

Pure function: `normalize(msg: SDKMessage, logger?: Logger) → HarnessEvent[]`.

| SDKMessage `type`            | → HarnessEvent                                       |
|------------------------------|------------------------------------------------------|
| `assistant`                  | per `TextBlock` → `{type:"text", delta:block.text}`  |
| `thinking`                   | `{type:"thinking", delta:msg.text}`                  |
| `tool_call` `status:running` | `{type:"tool_start", name, callId}`                  |
| `tool_call` `status:completed` | `{type:"tool_end", name, callId, ok:true}`         |
| `tool_call` `status:error`   | `{type:"tool_end", name, callId, ok:false}`         |
| `status`                     | `{type:"status", phase: mapPhase(msg.status)}`       |
| `system`, `task`, `request`, unknown | dropped (logged at warn if expected fields absent) |

Defensive parsing rules:
- Missing fields on a known message type → `logger.warn("missing field", {type, field})`,
  emit best-effort event or drop; never throw.
- Unknown `type` → `logger.warn("unknown SDKMessage type", {type})`, drop.
- Schema drift (e.g., `assistant.message.content` not an array, `tool_call`
  missing `name` or `call_id`) → `logger.warn("schema drift", {type, field})`
  and drop the offending message entirely. Do not emit partial/guessed
  events. Continue the stream.

### 4.5 `packages/core/src/errors.ts`

```typescript
export class HarnessError extends Error {
  readonly retryable: boolean;
  readonly cause?: unknown;
  constructor(msg: string, opts: { retryable?: boolean; cause?: unknown });
}
export class AuthError extends HarnessError {}    // retryable: false
export class ConfigError extends HarnessError {}  // retryable: false
export class NetworkError extends HarnessError {} // retryable: true
```

`mapToHarnessError(e: unknown): HarnessError` translation table:

| Cursor SDK class               | → HarnessError class | retryable |
|--------------------------------|----------------------|-----------|
| `AuthenticationError`          | `AuthError`          | false     |
| `ConfigurationError`           | `ConfigError`        | false     |
| `IntegrationNotConnectedError` | `ConfigError`        | false     |
| `RateLimitError`               | `NetworkError`       | true      |
| `NetworkError`                 | `NetworkError`       | `e.isRetryable` (default true) |
| `UnknownAgentError`            | `HarnessError`       | false     |
| `UnsupportedRunOperationError` | `HarnessError`       | false     |
| Anything else                  | `HarnessError`       | false     |

### 4.6 `packages/core/src/retry.ts`

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; baseDelayMs: number; signal?: AbortSignal; logger?: Logger }
): Promise<T>
```

- Exponential backoff: `baseDelayMs * 2^(attempt-1)` (1s, 2s, 4s for default 3 attempts).
- Retries only when caught error is `HarnessError` with `retryable: true`.
- Aborts immediately if `signal.aborted`.
- Logs each retry: `logger?.debug?.("retrying", {attempt, delayMs, cause})`
  (debug is optional on `Logger` — always call via optional chaining).
- Throws the last error after exhaustion.

Used to wrap `Agent.create` and the **initial** `agent.send(prompt)` call. Once
the stream produces its first event, we are past the retry boundary.

### 4.7 `packages/core/src/config.ts`

Single helper `resolveConfig(opts: RunOptions)` returning a fully-resolved
config object. Centralizes default model (`composer-2`), env-var fallbacks,
and the validation throws.

### 4.8 `packages/cli/src/main.ts`

- `commander` argv: `flow-build run <prompt> [--cwd <path>] [--model <id>] [--max-retries N] [--no-retry] [--verbose]`.
- Constructs `AbortController`. `process.on("SIGINT", () => controller.abort())`.
- Logger:
  - `warn` → `process.stderr.write("[warn] " + msg + " " + JSON.stringify(ctx) + "\n")`
  - `debug` → only emitted when `--verbose` set; else no-op
- Calls `runPrompt({...args, onEvent: render, logger, signal})`.
- Maps result/error → exit code (see §6).

### 4.9 `packages/cli/src/render.ts`

- `text` deltas → `process.stdout.write(delta)`.
- `thinking` deltas → `process.stdout.write(dim(delta))`. Disabled when stdout
  is not a TTY (no ANSI escape codes in pipes).
- `tool_start` → `\n[tool: ${name}]\n` (cyan in TTY, plain otherwise).
- `tool_end` → `[tool: ${name} ${ok ? "✓" : "✗"}]\n`.
- `status` → `[${phase}]\n` to stderr.

---

## 5. Data flow

```
user types:  flow-build run "summarize repo"
                │
                ▼
  cli/main.ts
    parses argv, builds RunOptions
    creates AbortController, hooks SIGINT → abort()
                │
                ▼
  core.runPrompt(opts)
    1. resolve apiKey, model, cwd       → ConfigError/AuthError on fail
    2. emit {status: "starting"}
    3. withRetry(() => Agent.create + agent.send)
         on RateLimitError/NetworkError → backoff + retry up to N
    4. await using agent / stream loop
       for await (const msg of run.stream()):
         if signal.aborted → run.cancel(); break
         events = normalize(msg, logger)
         events.forEach(opts.onEvent)
    5. await run.wait() → capture usage
    6. emit {status: "done"}
    7. return RunResult
                │
                │ each onEvent call (sync)
                ▼
  cli/render.ts
    switch event.type:
      text     → stdout.write(delta)
      thinking → stdout.write(dim(delta))
      tool_*   → stdout.write(formatted line)
      status   → stderr.write([phase])
                │
                ▼
  process.exit(<see exit code map>)
```

**Cancel path:** SIGINT → controller.abort() → next stream tick checks signal
→ `run.cancel()` → SDK emits final `status` → loop exits → `wait()` returns
cancelled result → CLI exits 130.

**Disposal:** `await using agent` + try/finally around stream loop ensures
`agent.close()` runs on throw or cancel.

---

## 6. Error handling

| HarnessError class | Sources                                | Retryable | CLI exit |
|--------------------|----------------------------------------|-----------|----------|
| `AuthError`        | missing key, `AuthenticationError`     | no        | 2        |
| `ConfigError`      | bad `cwd`, `ConfigurationError`, `IntegrationNotConnectedError` | no | 2 |
| `NetworkError`     | `NetworkError`, `RateLimitError`       | yes (auto-retry up to N attempts; surfaced only after exhaustion) | 3 |
| `HarnessError`     | catch-all (unmapped SDK errors)        | no        | 1        |
| (no error)         | cancelled by SIGINT                    | n/a       | 130      |
| (no error)         | completed                              | n/a       | 0        |

CLI prints `error.message` to stderr. With `--verbose`, also prints the
`cause` stack.

Mid-stream errors (after first event) bypass retry — partial output already
emitted to consumer; retry would duplicate. Surface as the mapped class.

Defensive parsing in normalizer: never throws on schema drift; always logs
via `logger.warn`.

---

## 7. Testing strategy

### 7.1 Unit — normalizer (`packages/core/src/normalizer.test.ts`)

Pure function, no SDK dependency. Fixture-driven.

Cases:
- Each known `SDKMessage.type` → expected events.
- Missing fields trigger `logger.warn`; mock logger asserts the call.
- Unknown types swallowed silently.
- Schema drift (e.g., `assistant.message.content` not array) → warn + drop.

~20 tests. `vitest`.

### 7.2 Unit — error mapper (`packages/core/src/errors.test.ts`)

Construct each `CursorAgentError` subclass → `mapToHarnessError(e)` → assert
class + `retryable`. Round-trip `cause` reference preserved.

### 7.3 Integration — `runPrompt` with mocked SDK (`packages/core/src/run.test.ts`)

`vi.mock("@cursor/sdk")`: stub `Agent.create` returning fake agent with an
injectable async iterator.

Cases:
- happy: stream emits text + tool events → `RunResult.status === "completed"`,
  `onEvent` called in order, `finalText` matches concatenation.
- retry: first `Agent.create` throws `NetworkError{isRetryable:true}` →
  succeeds 2nd attempt → assert backoff slept (fake timers).
- retry exhausted: 3 fails → `NetworkError` thrown.
- mid-stream error: stream throws after one text event → `NetworkError`
  thrown; assert NO retry attempted (partial output delivered).
- cancellation: signal.abort during stream → `run.cancel()` called; returns
  cancelled.
- auth missing: no apiKey, no env → `AuthError` thrown synchronously, no
  network call.

~10 tests.

### 7.4 CLI smoke (`packages/cli/src/main.test.ts`)

Spawn `node dist/main.js run "test"` with `@cursor/sdk` mocked at the package
level (or with a `FLOW_BUILD_FAKE_SDK=1` env switch wired in test build).

Assert:
- exit code matches expected for each branch (completed / config error /
  cancelled).
- stdout contains concatenated text deltas in order.
- stderr contains `[starting]`, `[done]`, and tool indicators.

2–3 cases. Wiring sanity only.

### 7.5 Out of scope (v1)

Real Cursor API integration tests. Costs tokens, requires key, slow.
Replace with manual smoke checklist at `docs/smoke.md` — three scripts a
human runs on a release branch.

### 7.6 Tooling

- `vitest` — TS native, fast, fake timers built-in.
- `tsx` — run TS directly in dev.
- `tsup` — build `cli` to single CJS bundle for Node ≥20.
- `eslint` + `prettier` — minimal config.
- `pnpm` workspaces; root `pnpm test` runs both packages.

---

## 8. Layout

```
flow-build/
├── package.json                      # workspace root, devDeps only
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── core/
│   │   ├── package.json              # name: @flow-build/core
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts              # public exports
│   │   │   ├── types.ts
│   │   │   ├── run.ts
│   │   │   ├── normalizer.ts
│   │   │   ├── errors.ts
│   │   │   ├── retry.ts
│   │   │   ├── config.ts
│   │   │   ├── normalizer.test.ts
│   │   │   ├── errors.test.ts
│   │   │   └── run.test.ts
│   │   └── vitest.config.ts
│   └── cli/
│       ├── package.json              # name: flow-build, bin: flow-build
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       ├── src/
│       │   ├── main.ts
│       │   ├── render.ts
│       │   └── main.test.ts
│       └── vitest.config.ts
└── docs/
    ├── superpowers/specs/2026-05-09-cursor-sdk-harness-design.md
    └── smoke.md                      # written during implementation
```

---

## 9. Open follow-ups (post-v1)

Not in this spec; called out so they aren't forgotten:

- Multi-turn `createSession()` API + agent ID persistence.
- `Agent.resume()` integration (note: SDK does not persist MCP across resume).
- `.cursor/mcp.json` + `.cursor/hooks.json` loading.
- Cloud agents (`autoCreatePR`, repo clone).
- Telemetry / cost tracking sink.
- UI package (`packages/ui`) consuming same `core`.
- Replacing one-shot `runPrompt` with a `Session` object that exposes a real
  async iterator and a `send(prompt)` method.
