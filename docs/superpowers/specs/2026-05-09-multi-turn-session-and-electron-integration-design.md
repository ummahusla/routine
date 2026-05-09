# flow-build — Multi-Turn Session + Electron Integration Design

**Date:** 2026-05-09
**Status:** Proposed — revised after Codex review
**Source research:**
- `cursor-agent-sdk-research.md` (repo root)
- `docs/superpowers/specs/2026-05-09-agent-loop-support-research.md`
- Upstream `origin/main` Electron integration (collaborator branch, not yet merged locally)

---

## 1. Goal

Replace the prototype's single-message lifecycle with a real multi-turn chat that survives app restart, and wire it cleanly into the Electron app so the renderer renders from disk-backed sessions instead of in-memory React state.

A "session" is a self-contained workspace under app user-data: chat metadata + chat events log, the existing flowbuilder flow-graph state, an agent scratch dir. The app has no concept of "the user's repo" — every session is its own little world.

**Non-goals (this spec):** cloud agents, summarisation / sliding-window for very long sessions (deliberately deferred — see §13), search across sessions, sharing/export, multi-user.

---

## 2. Constraints driving the design

### 2.1 Cursor SDK local-agent context bug — the central constraint

`@cursor/sdk@1.0.12` does not retain conversation context across `agent.send()` calls in **local** mode. Confirmed by Cursor staff on the forum (`deanrie`, listing 1.0.7 / 1.0.11 / 1.0.12 as affected); no fix ETA. Cloud agents are unaffected.

Source: <https://forum.cursor.com/t/sdk-local-agents-do-not-retain-conversation-context-between-agent-send-calls/159440>

Implication: we cannot use `Agent.create` once + `agent.send` repeatedly. We must treat the SDK agent as a **per-turn** primitive and re-feed prior conversation as part of every turn's prompt.

### 2.2 What the SDK does cover

Within a single turn the SDK runs the full inner agent loop server-side: assistant ↔ built-in tools (shell/edit/read/grep/glob/ls/sem_search/write/update_todos/create_plan/task) ↔ MCP tools ↔ subagents ↔ assistant. We just observe `tool_call` messages and stream them through. `Run.wait()` resolves only after the agent stops calling tools and emits final text. So a single `Session.send()` covers an arbitrarily long inner loop including MCP-served flowbuilder tool calls.

### 2.3 Persistence must outlive the agent

Disk is the source of truth. SDK agents are ephemeral (one per turn). Renderer renders from disk. App restart, window reload, multi-window concurrent watch: all read the same files.

### 2.4 Verbatim replay — lossless, no compression

Each new turn's prompt includes the **full verbatim transcript** of all completed prior turns: every user message, every assistant text block, every tool call's full args, every tool result. Token cost grows linearly with session length; that's acceptable for v1. Compression / summarisation / sliding window is deferred (§13) and explicitly out of scope.

---

## 3. Architecture

```
+--------------------------------------------------------------+
|  Electron renderer  (React)                                  |
|   Sidebar + ChatThread + PromptBox + FlowCanvas              |
|   reads via window.api.session.*; live via session:event     |
+--------------+-----------------------------------------------+
               | IPC (zod-validated payloads)
+--------------v-----------------------------------------------+
|  Electron main  (src/main/)                                  |
|   SessionRegistry: Map<sessionId, Session>                   |
|   IPC: session:list/create/open/send/cancel/rename/delete    |
|        session:watch/unwatch                                 |
|   pushes session:event { sessionId, event } to subscribers   |
|   replaces upstream cursor-chat:send entirely                |
|   app.requestSingleInstanceLock() prevents 2 main processes  |
+--------------+-----------------------------------------------+
               | uses
+--------------v-----------------------------------------------+
|  @flow-build/core  (new Session API)                         |
|   createSession / loadSession / listSessions / deleteSession |
|   Session.send(prompt) — multi-turn loop, owns replay        |
|   Per-session lockfile prevents multi-process writers        |
|   runPrompt remains as one-shot convenience for CLI          |
+--------------+-----------------------------------------------+
               |
       +-------+---------------------------+
       v                                   v
   @cursor/sdk                       @flow-build/flowbuilder
   (Agent.create per turn,           (SessionManager — flow graph
    Agent.close per turn)             state.json + manifest.json
                                      under same sessions/<id>/)
```

Package boundaries:
- **core** owns Cursor SDK calls, replay logic, `chat.json` + `events.jsonl` writes, session lockfile
- **flowbuilder** keeps owning its own `manifest.json` (flow project metadata) + `state.json` (flow graph). Files are siblings under the same `sessions/<id>/`. **No file is co-owned.**
- **electron main** owns IPC fan-out + abort signals + per-session registry; never imports `@cursor/sdk` directly (reverses upstream)
- **CLI** keeps using `runPrompt` unchanged

---

## 4. Disk layout

```
<userData>/flow-build/sessions/<sessionId>/
  chat.json         # chat session metadata — owned by core, atomic write
  events.jsonl      # append-only chat event log — canonical, owned by core
  manifest.json     # flowbuilder flow project metadata — owned by flowbuilder
  state.json        # flowbuilder flow graph — owned by flowbuilder
  session.lock      # PID + start-ts; held by the main process that opened the session
  workspace/        # Cursor agent local.cwd — files agent creates live here
    .cursor/rules/  # rote/plugin rules survive turns (workspace persists)
```

`<userData>` resolves to `app.getPath("userData") + "/flow-build"` in Electron, `~/.flow-build/` for CLI default. Both pass through `opts.baseDir`. flowbuilder's existing `SessionManager` already uses `<baseDir>/sessions/<id>/` — same root, same `sessionId`, distinct files.

`sessionId` = ULID (lexicographic-sortable, time-ordered, no extra dep — small inline impl).

### 4.1 `chat.json` (owned by core, atomic write)

```json
{
  "v": 1,
  "sessionId": "01HXYZ...",
  "title": "Refactor auth middleware",
  "createdAt": "2026-05-09T12:00:00Z",
  "updatedAt": "2026-05-09T12:34:56Z",
  "model": "composer-2",
  "turnCount": 4,
  "lastStatus": "completed",
  "totalUsage": { "inputTokens": 12340, "outputTokens": 4567 }
}
```

Title auto-derived from first user message (truncated 60 chars), user-renamable via `session:rename`. Rewritten atomically (`<file>.tmp` → `fsync` → `rename`) at every `turn_end`. `model` is the default for the next turn.

**No co-ownership with flowbuilder.** flowbuilder's `manifest.json` keeps its existing schema and writer (`packages/flowbuilder/src/schema.ts` + `session.ts`). Core never touches it; flowbuilder never touches `chat.json` or `events.jsonl`.

### 4.2 `events.jsonl` — append-only

Common envelope on every line: `v`, `ts` (ISO 8601), `turnId` (ULID, generated when `Session.send()` is called).

| `kind` | Payload | Notes |
|---|---|---|
| `user` | `{ text }` | Written first when `Session.send()` enters |
| `turn_open` | `{ }` | **New.** Written immediately after `user`, before any network work. Marks intent-to-run. |
| `turn_start` | `{ model, runId, agentId }` | Written after `Agent.create + agent.send` resolves |
| `text` | `{ delta }` | Assistant text deltas |
| `thinking` | `{ delta }` | Optional |
| `tool_start` | `{ callId, name, args }` | Full args, no truncation |
| `tool_end` | `{ callId, name, ok, args, result }` | **Full result** — see §5.7 for the required `HarnessEvent` extension |
| `status` | `{ phase }` | `starting` / `running` / `done` |
| `turn_end` | `{ status, usage?, durationMs }` | `completed` / `cancelled` / `failed` / `failed_to_start` |
| `error` | `{ message, code? }` | Mapped from `HarnessError` subclasses |

Append + `fsync` per line. Each line is a complete JSON record so partial writes (process killed mid-line) leave the file readable up to the last newline; reducer skips trailing partial line.

### 4.3 No truncation, no summarisation

Decision: keep it lossless. Sessions can grow large. If a single tool call dumps megabytes, the line is megabytes. Replay re-feeds the whole thing verbatim (§6). Compression / sliding-window is deferred (§13).

---

## 5. Session API (`@flow-build/core`)

### 5.1 Public exports (added to `packages/core/src/index.ts`)

```typescript
export {
  createSession,
  loadSession,
  listSessions,
  deleteSession,
} from "./session/index.js";
export type {
  Session,
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

### 5.2 Types

```typescript
type SessionEvent =
  | HarnessEvent                                                   // existing union — text/thinking/tool_start/tool_end/status (tool_end now carries `result`)
  | { type: "user"; turnId: string; text: string }
  | { type: "turn_open"; turnId: string }
  | { type: "turn_start"; turnId: string; model: string; agentId: string }
  | { type: "turn_end"; turnId: string; status: TurnStatus; usage?: Usage; durationMs: number }
  | { type: "error"; turnId: string; message: string; code?: string };

type TurnStatus = "completed" | "cancelled" | "failed" | "failed_to_start" | "interrupted";

type TurnResult = {
  turnId: string;
  status: TurnStatus;
  finalText: string;
  usage?: { inputTokens: number; outputTokens: number };
};

type SessionMetadata = {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  lastStatus: TurnStatus | "running";
  model: string;
};

type PersistedTurn = {
  turnId: string;
  user: { text: string; ts: string };
  assistant: {
    textBlocks: string[];
    toolCalls: Array<{ callId: string; name: string; args: unknown; ok?: boolean; result?: unknown }>;
    thinking?: string[];
  };
  status: TurnStatus | "running";
  usage?: { inputTokens: number; outputTokens: number };
};

interface Session {
  readonly sessionId: string;
  readonly baseDir: string;
  readonly sessionDir: string;
  readonly workspaceDir: string;
  send(prompt: string, opts?: SendTurnOptions): Promise<TurnResult>;
  cancel(): Promise<void>;
  turns(): Promise<PersistedTurn[]>;
  events(opts?: { fromOffset?: number }): AsyncIterable<SessionEvent>;
  metadata(): Promise<SessionMetadata>;
  rename(title: string): Promise<void>;
  close(): Promise<void>;
}

type SendTurnOptions = {
  signal?: AbortSignal;
  onEvent?: (e: SessionEvent) => void;
};

type CreateSessionOptions = {
  baseDir: string;
  title?: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};

type LoadSessionOptions = {
  baseDir: string;
  sessionId: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};
```

### 5.3 Module layout

```
packages/core/src/session/
  index.ts          # public factory functions
  session.ts        # Session class
  store.ts          # JSONL append/read + chat.json atomic write + sessions list scan
  reducer.ts        # events → PersistedTurn[]
  replay.ts         # PersistedTurn[] → verbatim replay-prefix string
  lockfile.ts       # session.lock acquire/release with PID + stale-pid check
  ulid.ts           # tiny inline ULID generator (no dep)
  types.ts          # the types above
  errors.ts         # SessionBusyError, SessionMissingError, SessionCorruptError, SessionLockedError
```

### 5.4 Lifecycle of `Session.send(prompt)`

1. Reject if `activeTurn` non-null → `SessionBusyError`
2. Generate `turnId`
3. Append `{ kind: "user", turnId, text: prompt }` to `events.jsonl`
4. Append `{ kind: "turn_open", turnId }` — marks intent-to-run before any network work
5. Build replay prefix from prior **completed** turns (those with a matching `turn_end`); the just-written `user` and `turn_open` lines are excluded naturally because they have no `turn_end`. No `slice(0, -1)` games.
6. Run plugin per-turn hooks: `preRun(turnCtx)` → `systemPrompt(turnCtx)` → `promptPrefix(turnCtx)` → `provideMcpServers(turnCtx)`. All four are per-turn (see §5.5).
7. `finalPrompt = [pluginPrefix, replayPrefix, "User: " + prompt].filter(Boolean).join("\n\n")`
8. `withRetry` wraps `Agent.create({ apiKey, model, local: { cwd: workspaceDir, settingSources }, mcpServers }) + agent.send(finalPrompt)`
9. On failure of step 8: append `{ kind: "turn_end", turnId, status: "failed_to_start" }`, append `{ kind: "error" }`, return `TurnResult { status: "failed_to_start" }`
10. Append `turn_start` event with `{ model, runId, agentId }`
11. Stream loop = current `runPrompt` body — `normalize` → plugin `intercept` → write event to jsonl + fire `onEvent` + fire `onToolCall`
12. Cancellation path: `signal.aborted` or `Session.cancel()` → call `run.cancel()` → **continue draining the stream** until terminal — do not break the loop. After loop exits, still `await run.wait()` with a 5s timeout (see §5.6).
13. `run.wait()` resolves → append `turn_end` with actual SDK status + usage → rewrite `chat.json` (turnCount++, updatedAt, lastStatus, totalUsage cumulative)
14. `agent.close()` in `finally`
15. Clear `activeTurn`; return `TurnResult`

Per-turn agent. Disk source of truth. Reuses every existing core primitive (`withRetry`, `normalize`, `mapToHarnessError`, `PluginHost`).

### 5.5 Plugin host adjustments — keep per-turn

After Codex review: do **not** move `preRun` / `systemPrompt` to session-open scope. Doing so would:
- break `flowbuilder.preRun()` which loads state from disk (would go stale across turns) and starts an HTTP MCP server (would leak in registry-memoised sessions)
- couple plugin output into `chat.json`'s on-disk format, hard to evolve

Decision: all existing hooks (`preRun`, `systemPrompt`, `promptPrefix`, `provideMcpServers`, `interceptEvent`, `onToolCall`, `cleanup`) stay **per-turn**, identical to the current `runPrompt` semantics. flowbuilder keeps loading state per turn (always fresh) and starting + closing its MCP server per turn (no leaks).

`runPrompt` becomes a thin wrapper over `Session.send`:

```typescript
export async function runPrompt(opts: RunOptions): Promise<RunResult> {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const session = await createSession({ ...opts, baseDir });
  try {
    const result = await session.send(opts.prompt, {
      ...(opts.signal ? { signal: opts.signal } : {}),
      onEvent: opts.onEvent,
    });
    return {
      status: result.status,
      finalText: result.finalText,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  } finally {
    await session.close();
  }
}
```

`RunOptions` gains an optional `baseDir`; absent, `defaultBaseDir()` returns `os.tmpdir()` for one-shot CLI use. Existing CLI behavior unchanged.

**Future plugin opt-in:** if a future plugin (e.g. rote) genuinely wants session-scoped setup that survives across turns, we add optional `sessionInit(sessionCtx)` and `sessionDispose(sessionCtx)` hooks. Out of scope for v1.

### 5.6 Cancellation — drain to terminal

Today `runPrompt` calls `run.cancel()` and breaks the stream loop without awaiting `run.wait()`. That can mislabel a run that finished microseconds before cancel landed and loses tail tool events / usage. The new `Session.send`:

1. On cancel signal: call `run.cancel()` once
2. **Keep iterating the stream** until the SDK closes it
3. `await run.wait()` wrapped in `Promise.race([wait(), timeout(5_000)])` — if SDK hangs we still finalise
4. Use SDK's actual terminal status (`completed | finished | cancelled | error`) for `turn_end`
5. Persist any tool events that arrive during the drain (their full results land in `events.jsonl`)

### 5.7 `HarnessEvent.tool_end` carries `result` — prerequisite core change

Today `packages/core/src/normalizer.ts:78` drops `msg.result` from `tool_call` events; `HarnessEvent.tool_end` has no `result` field. The spec persists full results.

**Required core change** (must land in the same implementation phase, not later):
- `HarnessEvent.tool_end` extended with `result?: unknown`
- `normalizeToolCall` reads `msg.result` and includes it on the event
- `normalizeToolCall` similarly reads `msg.args` on `tool_start` (it already does)
- `ToolCallSnapshot` similarly extended with `result?: unknown` so plugin `onToolCall` sees it
- Existing tests updated; this is a non-breaking additive change to the `HarnessEvent` union

### 5.8 Crash recovery

On `loadSession`, reducer walks `events.jsonl`:
- `turn_open` without matching `turn_end` at end of jsonl → mark turn `status: "interrupted"`
- `turn_open` followed by `turn_end: failed_to_start` → mark turn `status: "failed_to_start"` (already explicit)
- `chat.json.lastStatus` rewritten to `"interrupted"` if it was `"running"`
- Stale `chat.json.tmp` files cleaned on first metadata write

On any `Session` open: acquire `session.lock` (§7.7). If held by a live PID → `SessionLockedError`. If stale (process gone) → reclaim.

Renderer renders the partial turn read-only and prompts user to start a new turn.

---

## 6. Replay prefix builder (pure, lossless)

`replay(turns: PersistedTurn[]): string`. Input is **completed turns only** — caller does not slice. Reducer naturally excludes the in-flight turn because it has no `turn_end`.

Output (illustrative, real format):

    [Conversation so far — replayed because the local Cursor agent does not
    retain context across send() calls. Verbatim transcript including all
    tool args and results.]

    User: Plan the auth refactor — list files we'll touch.

    Assistant:
    [tool_call: grep
      args: {"pattern":"authMiddleware","path":"src/"}
      result: {"matches":[{"file":"src/server/middleware/auth.ts","line":12,"text":"export function authMiddleware..."}, ...]}
    ]
    [tool_call: read
      args: {"path":"src/server/middleware/auth.ts"}
      result: "<full file contents...>"
    ]
    Files to touch: src/server/middleware/auth.ts, src/server/routes/*.ts.

    User: Now implement the plan and add regression tests.

    Assistant: ...

Rules:
- Each completed `PersistedTurn` becomes a `User: …` block plus an `Assistant:` block.
- Assistant text = `assistant.textBlocks.join("")`.
- Tool calls render fully:
  ```
  [tool_call: <name>
    args: <JSON.stringify(args)>
    result: <JSON.stringify(result)>      # or string verbatim if result is a string
  ]
  ```
  No truncation, no abbreviation. Multi-line strings are inlined as JSON-quoted single lines or fenced blocks; pick the form that round-trips losslessly.
- `thinking` deltas dropped from replay (kept on disk; not part of the SDK input contract).
- Cancelled / failed / interrupted turns: append `[turn ended: <status>]` after the assistant block so the next agent knows the prior turn did not finish.
- Empty if no completed prior turns.

Replay never reads `events.jsonl` directly — always goes through the reducer.

**Cost:** input tokens scale linearly with cumulative session size. Acceptable v1 tradeoff. Compression in §13.

---

## 7. Electron main + IPC

### 7.1 Module layout (upstream `src/main/` rewritten)

```
src/main/
  index.ts            # window + lifecycle + env loading + ripgrep path + single-instance lock
  ipc/
    session.ts        # all session:* IPC handlers
    schemas.ts        # zod schemas for every IPC payload
  registry.ts         # SessionRegistry + per-window event fan-out + subscription ownership
```

`src/main/index.ts` shrinks: keeps `loadLocalEnv`, `configureCursorRipgrepPath`, `BrowserWindow` setup. Drops the `cursor-chat:send` handler entirely. Adds `app.requestSingleInstanceLock()` — second app launch focuses the existing window and exits. `BrowserWindow` flips to `sandbox: true`; preload bridge stays via `contextBridge`.

### 7.2 IPC channels (renderer → main)

Every payload is validated in main with a zod schema before reaching handler logic. Invalid payloads return `{ ok: false, code: "INVALID", error: <details> }` and never touch core.

| Channel | Args | Returns | Notes |
|---|---|---|---|
| `session:list` | `()` | `SessionMetadata[]` | Reads `chat.json` files under `<baseDir>/sessions/*` |
| `session:create` | `{ title?, model? }` | `{ sessionId }` | Generates ULID, mkdir `sessions/<id>/workspace/`, writes initial `chat.json`, **also writes initial `state.json` + `manifest.json` for flowbuilder via flowbuilder's API** |
| `session:open` | `{ sessionId }` | `{ metadata, turns: PersistedTurn[] }` | Acquires lockfile, loads + reduces `events.jsonl` |
| `session:send` | `{ sessionId, prompt }` | `{ ok: true, turnId, status, usage? } \| { ok: false, code, error }` | Promise resolves on `turn_end`. **No `subscriptionId`** — events flow only through the existing `session:watch` subscription. |
| `session:cancel` | `{ sessionId }` | `{ ok: true }` | No-op if no active turn |
| `session:rename` | `{ sessionId, title }` | `{ ok: true }` | |
| `session:delete` | `{ sessionId }` | `{ ok: true }` | Rejects if active turn. Evicts from registry, fans out `session:deleted` to subscribers, releases lockfile, then rm -rf the dir. |
| `session:watch` | `{ sessionId }` | `{ subscriptionId }` | Subscribes the calling `WebContents` to live events |
| `session:unwatch` | `{ subscriptionId }` | `{ ok: true }` | Validates the calling `WebContents` owns this `subscriptionId` |

### 7.3 Main → renderer push channel

`session:event` — payload `{ sessionId, event: SessionEvent }`. Sent only to subscribers of that `sessionId`. Renderer's per-session hook receives them once.

`session:deleted` — payload `{ sessionId }`. Sent to all subscribers of a session being deleted; renderer drops the session from the sidebar.

### 7.4 `registry.ts`

```typescript
class SessionRegistry {
  private sessions = new Map<string, Session>();
  private subs = new Map<string, { sessionId: string; webContents: WebContents }>();

  async open(sessionId: string): Promise<Session>;            // memoised
  fanout(sessionId: string, event: SessionEvent): void;       // sends session:event to all subs for this session
  subscribe(sessionId: string, webContents: WebContents): string; // returns subscriptionId
  unsubscribe(subscriptionId: string, ownerWebContents: WebContents): void; // ownership-checked
  evict(sessionId: string): Promise<void>;                    // close session, drop subs
  async closeAll(): Promise<void>;                             // app quit
}
```

When a `WebContents` is destroyed, every subscription owned by it is removed automatically (listener on `webContents.on("destroyed")`). Sessions stay open in the registry — a turn started by window A keeps writing to disk after A is closed; window B can later `session:watch` and tail.

### 7.5 Send flow — single subscription path

1. Renderer's `useSession(sessionId)` calls `window.api.session.watch(id, onEvent)` once on mount; receives `subscriptionId`; stores unsubscribe fn.
2. User submits a prompt: renderer calls `window.api.session.send(id, prompt)` — **does not subscribe again**.
3. Preload `invoke("session:send", { sessionId, prompt })` → main validates payload → looks up `Session` from registry → awaits `session.send(prompt, { onEvent: (e) => registry.fanout(id, e) })`.
4. Core writes event → `events.jsonl`, fires `onEvent` → registry fans out → existing `useSession` subscription receives it.
5. Promise resolves on `turn_end`; renderer reduces all events and re-renders.
6. Cancellation: renderer calls `window.api.session.cancel(id)` → main calls `session.cancel()` → §5.6 drain → `turn_end (cancelled)` fans out to the same subscription.
7. Window close: subscription auto-cleaned on `webContents` destroy. The send-promise on the renderer side is rejected by the IPC layer; turn keeps running in main and another window can tail it.

### 7.6 Preload (`src/preload/index.ts`)

```typescript
window.api.session = {
  list(): Promise<SessionMetadata[]>;
  create(opts?: { title?: string; model?: string }): Promise<{ sessionId: string }>;
  open(sessionId: string): Promise<{ metadata: SessionMetadata; turns: PersistedTurn[] }>;
  send(sessionId: string, prompt: string): Promise<TurnResult>;          // no onEvent — events flow through watch
  cancel(sessionId: string): Promise<void>;
  rename(sessionId: string, title: string): Promise<void>;
  delete(sessionId: string): Promise<void>;
  watch(sessionId: string, onEvent: (e: SessionEvent) => void): () => void;  // returns unsubscribe
};
```

The upstream `window.api.cursorChat` surface is dropped.

### 7.7 Concurrency + cross-process safety

Single-process correctness:
- Multiple sessions: each its own `Session` in registry, independent in-flight turns
- Single session: second `send` while first running → `SessionBusyError` → renderer maps to disabled prompt + tooltip "session already running"
- App quit: `registry.closeAll()` cancels every in-flight turn (writes `turn_end: cancelled`), runs plugin cleanup, releases lockfiles, closes Cursor agents

Cross-process safety:
- `app.requestSingleInstanceLock()` in `src/main/index.ts` — prevents two app instances. Second launch focuses the existing window and exits.
- Per-session **lockfile** `session.lock` written on `Session` open: `{ pid, startedAt, host }`. Acquire = `O_CREAT|O_EXCL`; collision → check `pid` is alive (`process.kill(pid, 0)`). Stale → reclaim. Live → `SessionLockedError` (renderer maps to "session is open in another process" toast).
- CLI inherits the same lockfile path; running CLI against a session held by Electron returns `SessionLockedError` cleanly.
- This makes "disk is source of truth" honest: only one process at a time mutates a given session's `chat.json` + `events.jsonl`. Other readers (e.g. a script tail-watching the file) are fine; they're read-only.

### 7.8 IPC validation — runtime, not just types

zod schemas live in `src/main/ipc/schemas.ts`. Every handler:
1. Parses the incoming payload against the schema
2. Verifies `event.sender` ownership for any subscription-scoped op (e.g. `unwatch`)
3. Returns `{ ok: false, code: "INVALID", error: zod.format() }` on failure

Schemas cover: `sessionId` (ULID regex), `prompt` (max length sanity), `title` (length), `subscriptionId` (registry-issued string), payload shape. Preload TypeScript types are documentation only — main is the security boundary.

---

## 8. Renderer wiring (`src/renderer/`)

- `App.tsx`: drop the in-memory `useState<ChatMessage[]>` initial seed. On mount: `window.api.session.list()` → sidebar; if none, auto-create one. Active `sessionId` in state.
- New `useSession(sessionId)` hook:
  - on change → `session.open(id)` for `metadata + turns`, sets state
  - calls `session.watch(id, onEvent)` exactly once per session lifetime, stores unsubscribe
  - `onEvent` is the only place new events enter renderer state — applies them to a reducer
  - cleanup on unmount/swap calls unsubscribe
- `ChatThread`: consumes `PersistedTurn[]` directly. Existing `Message` component already uses ReactMarkdown for assistant text — keep. Add `ToolCallChip` per `assistant.toolCalls[i]`, expandable to show full args/result inline.
- `PromptBox` submit: `session.send(activeId, prompt)` — promise resolves on `turn_end`; events arrived via the existing watch subscription. While `lastStatus === "running"` show stop button → `session.cancel(activeId)`.
- Flow canvas: same hook tails the same session's `state.json` via a separate `flowbuilder:state-changed` IPC event. v1 fires on any `tool_end` whose name starts with `flowbuilder_`, then renderer re-fetches `state.json`. (Chokidar watcher in main is a v2 optimisation.)

---

## 9. Migration from upstream `origin/main`

This branch starts from local `main` (c8723cd). When merging upstream changes:
- **Keep** upstream renderer additions (FlowCanvas edge work, ChatThread Markdown, env.d.ts, types.ts) — those don't touch SDK
- **Reject** `src/main/index.ts` `cursor-chat:send` handler — replaced wholesale by §7
- **Reject** `src/preload/index.ts` `cursorChat` surface — replaced wholesale by §7.6
- **Reject** core deletions (`provideMcpServers`, `flowbuilder` package) — local kept these and the design depends on them
- Document in spec: any future renderer chat-related changes upstream go through `window.api.session` adapter

---

## 10. Errors

New session-level errors in `@flow-build/core` (extend existing `HarnessError`):

| Class | When |
|---|---|
| `SessionBusyError` | Concurrent `send()` on same session |
| `SessionMissingError` | `loadSession` for an unknown `sessionId` |
| `SessionCorruptError` | `chat.json` unparseable, schema mismatch, or `events.jsonl` line malformed beyond skip |
| `SessionLockedError` | Lockfile held by a live PID elsewhere |

IPC marshals all errors as `{ ok: false, code, message }`. Renderer maps:
- `BUSY` → disabled prompt + tooltip
- `MISSING` → "session deleted" toast + sidebar refresh
- `CORRUPT` → "could not load session" modal with sessionId for support
- `LOCKED` → "session is open in another process" toast
- `INVALID` → developer error surface (should not happen in production)
- `AUTH` / `NETWORK` / `CONFIG` (existing) → existing error UI

Per-turn `Agent.create + send` errors land in `events.jsonl` as `{ kind: "error", ... }` followed by `{ kind: "turn_end", status: "failed" | "failed_to_start" }`. Renderer renders the failed turn with an inline error block; the session stays usable — next `send` opens a fresh agent.

---

## 11. Cancellation + crash recovery

- App quit: `SessionRegistry.closeAll()` cancels all active turns; each writes `turn_end: cancelled` before exit and releases its lockfile
- Hard crash mid-turn: `events.jsonl` ends with `turn_open` (and possibly `turn_start` + partial events) but no `turn_end`. Reducer marks the turn `status: "interrupted"`. On next session open the metadata's `lastStatus` is rewritten to `"interrupted"`. Lockfile is stale; next opener reclaims it (PID check).
- Window close while turn running: turn keeps running in main process; another window can watch via `session:watch`
- `chat.json.tmp` left over: cleaned on next metadata write
- Drain on cancel: §5.6 — `run.cancel()` issued, stream drained, `run.wait()` awaited with timeout, actual SDK terminal status persisted

---

## 12. Testing

### 12.1 core unit tests (`packages/core/src/session/*.test.ts`)

- `store.test.ts` — append jsonl + atomic chat.json rewrite + reducer round-trips; partial-line tail recovery; `turn_open` without `turn_end` → interrupted
- `replay.test.ts` — verbatim prefix snapshot tests covering: empty history, mix of text + tool calls with full results, cancelled turn marker, completed-only filtering (no slicing)
- `session.test.ts` — full `Session.send` happy path with existing `fakeSdk`; busy-error path; cancel path that races finish (asserts SDK terminal status used, not optimistic `cancelled`); plugin lifecycle (all hooks per-turn including flowbuilder MCP server start/close every turn); `failed_to_start` path when `Agent.create` throws
- `lockfile.test.ts` — acquire / collision (live PID) / stale reclaim / release
- `index.test.ts` — `createSession` / `loadSession` / `listSessions` / `deleteSession` round-trip; ULID ordering; missing-session error; create bootstraps both core files and flowbuilder files

### 12.2 smoke (extends `packages/core/src/smoke.test.ts`)

Two-turn session: assert second turn's `agent.send` argument contains the **verbatim** first turn (full args + full results, no abbreviation); rote plugin's rules-file installed each turn (per-turn lifecycle); flowbuilder MCP server started + closed each turn.

### 12.3 Electron main

vitest integration with mocked `Session` proving:
- IPC zod validation rejects malformed payloads
- IPC round-trips for create/open/send/cancel/delete
- Single watch subscription per window per session — events delivered exactly once
- Subscription cleanup when `WebContents` destroyed
- `unwatch` rejects calls from non-owning `WebContents`
- App-quit path cancels in-flight turns and releases lockfiles
- `session:delete` evicts registry, fans out `session:deleted`, releases lockfile, rm -rf'd

### 12.4 Manual smoke

`docs/smoke.md` updated with multi-turn checklist: create session → send "hello" → send follow-up → quit app → reopen → confirm history rendered → confirm next send replays prior turns verbatim → kill app mid-turn → reopen → confirm interrupted-turn UI.

---

## 13. Open follow-ups (post-v1)

- **Sliding-window summarisation** — compress old turns when `events.jsonl` exceeds a token threshold. Synthetic per-turn summary block emitted after `run.wait()` listing changed files, salient command outputs, unresolved failures; replayed in lieu of raw verbatim transcript. Codex review flagged the verbatim approach can run hot on long coding sessions; deferred deliberately to keep v1 simple.
- Switch to native multi-turn (`Agent.resume` + reuse) once the Cursor SDK local-context bug is fixed; on-disk format unchanged
- Cloud-agent option per session (`local | cloud` mode in `chat.json`)
- Search across sessions (full-text over assistant text + user messages)
- Export / share session as zip
- chokidar-based live `state.json` watcher (replaces tool_end-triggered re-fetch)
- Session pin / archive / colour-tag in sidebar
- `sessionInit` / `sessionDispose` plugin hooks for plugins that want session-scoped setup (rote candidate)
- Multi-user / sync (deliberately out of scope — single-machine app)

---

## 14. File-tree summary

```
packages/core/
  src/
    index.ts                                # exports session API alongside runPrompt
    run.ts                                  # becomes thin wrapper over Session
    types.ts                                # HarnessEvent.tool_end gains optional `result` (§5.7)
    normalizer.ts                           # surfaces msg.result on tool_end
    session/
      index.ts                              # createSession / loadSession / listSessions / deleteSession
      session.ts                            # Session class
      store.ts                              # jsonl + chat.json IO
      reducer.ts
      replay.ts
      lockfile.ts
      ulid.ts
      types.ts
      errors.ts
      *.test.ts
    smoke.test.ts                           # extended with multi-turn case

src/main/
  index.ts                                  # window + env + single-instance lock (cursor-chat:* removed)
  ipc/session.ts                            # session:* handlers
  ipc/schemas.ts                            # zod payload schemas
  registry.ts                               # SessionRegistry

src/preload/
  index.ts                                  # window.api.session.* (cursorChat removed)

src/renderer/
  src/
    App.tsx                                 # drops in-memory chat state, uses useSession
    hooks/useSession.ts                     # one watch per session, reduces events into state
    components/ChatThread.tsx               # consumes PersistedTurn[]
    components/ToolCallChip.tsx             # new — args/result expandable
    components/PromptBox.tsx                # cancel button wiring
    components/Sidebar.tsx                  # session list

docs/superpowers/specs/
  2026-05-09-agent-loop-support-research.md  # research
  2026-05-09-multi-turn-session-and-electron-integration-design.md  # this spec
```

---

## 15. Codex review changelog (this revision)

Findings from the Codex second-opinion review applied:

| # | Finding | Resolution |
|---|---|---|
| 1 | manifest.json ownership conflict with flowbuilder | Renamed chat metadata file to `chat.json`; flowbuilder's `manifest.json` untouched (§4.1) |
| 2 | Plugin lifecycle change broke flowbuilder | Reverted — all hooks stay per-turn; future opt-in `sessionInit` deferred (§5.5) |
| 3 | Turn state machine gap | Added `turn_open` event before any network work (§4.2, §5.4 step 4) |
| 4 | Replay off-by-one | Replay input is completed turns only — no slicing (§5.4 step 5, §6) |
| 5 | Duplicate event delivery | Single watch per session; `send()` does not auto-subscribe (§7.5) |
| 6 | `tool_end.result` not on `HarnessEvent` | Prerequisite core change called out (§5.7) |
| 7 | Cancel path mislabels races | Drain stream + `run.wait()` with timeout; persist actual SDK terminal status (§5.6) |
| 8 | Cross-process concurrency | `app.requestSingleInstanceLock()` + per-session lockfile (§7.7) |
| 9 | IPC validation + sandbox | zod schemas in main, `WebContents` ownership checks, `sandbox: true` (§7.8, §7.1) |
| 10 | Replay too lossy | **Inverted** — replay is now fully verbatim (full args + full results); compression deferred to v2 (§2.4, §6, §13) |
| 11 | Create/delete holes | `session:create` bootstraps both core and flowbuilder files; `session:delete` evicts registry, fans out `session:deleted`, releases lockfile (§7.2) |
