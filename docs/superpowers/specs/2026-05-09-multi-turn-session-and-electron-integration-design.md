# flow-build — Multi-Turn Session + Electron Integration Design

**Date:** 2026-05-09
**Status:** Proposed
**Source research:**
- `cursor-agent-sdk-research.md` (repo root)
- `docs/superpowers/specs/2026-05-09-agent-loop-support-research.md`
- Upstream `origin/main` Electron integration (collaborator branch, not yet merged locally)

---

## 1. Goal

Replace the prototype's single-message lifecycle with a real multi-turn chat that survives app restart, and wire it cleanly into the Electron app so the renderer renders from disk-backed sessions instead of in-memory React state.

A "session" is a self-contained workspace under app user-data: chat history (`events.jsonl`), flow graph (`state.json`), agent scratch dir (`workspace/`), and metadata (`manifest.json`). The app has no concept of "the user's repo" — every session is its own little world.

**Non-goals (this spec):** cloud agents, summarisation / sliding-window for very long sessions, search across sessions, sharing/export, multi-user. All listed in §13.

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

---

## 3. Architecture

```
+--------------------------------------------------------------+
|  Electron renderer  (React)                                  |
|   Sidebar + ChatThread + PromptBox + FlowCanvas              |
|   reads via window.api.session.*; live via session:event     |
+--------------+-----------------------------------------------+
               | IPC
+--------------v-----------------------------------------------+
|  Electron main  (src/main/)                                  |
|   SessionRegistry: Map<sessionId, Session>                   |
|   IPC: session:list/create/open/send/cancel/rename/delete    |
|   pushes session:event { subscriptionId, sessionId, event }  |
|   replaces upstream cursor-chat:send entirely                |
+--------------+-----------------------------------------------+
               | uses
+--------------v-----------------------------------------------+
|  @flow-build/core  (new Session API)                         |
|   createSession / loadSession / listSessions / deleteSession |
|   Session.send(prompt) — multi-turn loop, owns replay        |
|   runPrompt remains as one-shot convenience for CLI          |
+--------------+-----------------------------------------------+
               |
       +-------+---------------------------+
       v                                   v
   @cursor/sdk                       @flow-build/flowbuilder
   (Agent.create per turn,           (SessionManager — flow graph
    Agent.close per turn)             state.json sibling under
                                      same sessions/<id>/)
```

Package boundaries:
- **core** owns Cursor SDK calls, replay logic, JSONL events, manifest writes for chat
- **flowbuilder** keeps owning the flow-graph `state.json` under same `sessions/<id>/`
- **electron main** owns IPC fan-out + abort signals + per-session registry; never touches `@cursor/sdk` directly (reverses upstream)
- **CLI** keeps using `runPrompt` unchanged

---

## 4. Disk layout

```
<userData>/flow-build/sessions/<sessionId>/
  manifest.json     # session metadata (atomic write)
  events.jsonl      # append-only chat event log — canonical
  state.json        # flowbuilder flow graph (existing schema, atomic write)
  workspace/        # Cursor agent local.cwd — files agent creates live here
    .cursor/rules/  # rote/plugin rules survive turns (workspace persists)
```

`<userData>` resolves to `app.getPath("userData") + "/flow-build"` in Electron, `~/.flow-build/` for CLI default. Both pass through `opts.baseDir`. flowbuilder `SessionManager` already uses `<baseDir>/sessions/<id>/` — same root, same `sessionId`.

`sessionId` = ULID (lexicographic-sortable, time-ordered, no extra dep — small inline impl).

### 4.1 `manifest.json`

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

Title auto-derived from first user message (truncated 60 chars), user-renamable via `session:rename`. Rewritten atomically (`<file>.tmp` → `fsync` → `rename`) at every `turn_end`. `model` is the default for the next turn — callers may override per `Session.send` later (not in v1; v1 takes the manifest default).

### 4.2 `events.jsonl` — append-only

Common envelope on every line: `v`, `ts` (ISO 8601), `turnId` (ULID, generated when `Session.send()` is called).

| `kind` | Payload | Notes |
|---|---|---|
| `user` | `{ text }` | Written first when `Session.send()` enters |
| `turn_start` | `{ model, runId, agentId }` | After `Agent.create + agent.send` resolves |
| `text` | `{ delta }` | Assistant text deltas (concatenate to render) |
| `thinking` | `{ delta }` | Optional — UI may hide |
| `tool_start` | `{ callId, name, args? }` | Full args, no truncation |
| `tool_end` | `{ callId, name, ok, args?, result? }` | Full result, no truncation |
| `status` | `{ phase }` | `starting` / `running` / `done` |
| `turn_end` | `{ status, usage?, durationMs }` | `completed` / `cancelled` / `failed` |
| `error` | `{ message, code? }` | Mapped from `HarnessError` subclasses |

Append + `fsync` per line. Each line is a complete JSON record so partial writes (process killed mid-line) leave the file readable up to the last newline; reducer skips trailing partial line.

### 4.3 No truncation

Decision: keep it simple. Sessions can grow large. If a single tool call dumps megabytes, the line is megabytes. Sliding-window summarisation is a v2 concern; until then, replay-prefix summarisation (§6) keeps token cost bounded for the SDK call even when the on-disk file is big.

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
} from "./session/errors.js";
```

### 5.2 Types

```typescript
type SessionEvent =
  | HarnessEvent                                                   // existing union — text/thinking/tool_start/tool_end/status
  | { type: "user"; turnId: string; text: string }
  | { type: "turn_start"; turnId: string; model: string; agentId: string }
  | { type: "turn_end"; turnId: string; status: TurnStatus; usage?: Usage; durationMs: number }
  | { type: "error"; turnId: string; message: string; code?: string };

type TurnStatus = "completed" | "cancelled" | "failed";

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
  lastStatus: TurnStatus | "running" | "interrupted";
  model: string;
};

type PersistedTurn = {
  turnId: string;
  user: { text: string; ts: string };
  assistant: {
    textBlocks: string[];
    toolCalls: Array<{ callId: string; name: string; args?: unknown; ok?: boolean; result?: unknown }>;
    thinking?: string[];
  };
  status: TurnStatus | "running" | "interrupted";
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
  manifest(): Promise<SessionMetadata>;
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
  session.ts        # Session class — owns plugin host, jsonl writer, in-memory active turn
  store.ts          # JSONL append/read + manifest atomic write + sessions list scan
  reducer.ts        # events → PersistedTurn[]
  replay.ts         # PersistedTurn[] → replay-prefix string
  ulid.ts           # tiny inline ULID generator (no dep)
  types.ts          # the types above
  errors.ts         # SessionBusyError, SessionMissingError, SessionCorruptError
```

### 5.4 Lifecycle of `Session.send(prompt)`

1. Reject if `activeTurn` non-null → `SessionBusyError`
2. Generate `turnId`; append `{ kind: "user", turnId, text: prompt }` to `events.jsonl`
3. Build replay prefix from prior `PersistedTurn[]` (excludes the just-written user line)
4. Run plugin `promptPrefix(turnCtx)` + `provideMcpServers(turnCtx)` (per-turn hooks)
5. `finalPrompt = [pluginPrefix, replayPrefix, "User: " + prompt].filter(Boolean).join("\n\n")`
6. `withRetry` wraps `Agent.create({ apiKey, model, local: { cwd: workspaceDir, settingSources }, mcpServers }) + agent.send(finalPrompt)` (existing helper, unchanged)
7. Append `turn_start` event
8. Stream loop = current `runPrompt` body — `normalize` → plugin `intercept` → write event to jsonl + fire `onEvent` + fire `onToolCall`
9. Cancellation path: `signal.aborted` or `Session.cancel()` → `run.cancel()` → break → status `cancelled`
10. `run.wait()` resolves → append `turn_end` → rewrite `manifest.json` (turnCount++, updatedAt, lastStatus, totalUsage cumulative)
11. `agent.close()` in `finally`
12. Clear `activeTurn`; return `TurnResult`

Per-turn agent. Disk source of truth. Reuses every existing core primitive (`withRetry`, `normalize`, `mapToHarnessError`, `PluginHost`).

### 5.5 Plugin host adjustments

`PluginHost.runPreRun` + `runSystemPrompt` move from per-`runPrompt` to per-`createSession` / `loadSession`. `runPromptPrefix` + `runProvideMcpServers` + `intercept` + `fireToolCall` stay per-turn. `cleanup` runs once on `Session.close()`.

`RuntimeContext` exists at session scope (cwd, model, sessionId, signal, logger, state). New `TurnContext` extends it with `turnId` and per-turn `signal` (composed from session signal + send-time signal); passed only to per-turn hooks.

`runPrompt` becomes a thin wrapper:

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

CLI keeps working unchanged. The CLI's per-invocation session is created in a tmpdir (or `~/.flow-build/sessions/<runId>/`) — auto-deleted on close unless `--keep-session` flag added later.

`RunOptions` gains an optional `baseDir`; absent, `defaultBaseDir()` returns `os.tmpdir()` for one-shot CLI use. Existing `runPrompt` callers and tests are unaffected.

### 5.6 Crash recovery

On `loadSession`, reducer detects `turn_start` without matching `turn_end` at end of jsonl → marks that turn `status: "interrupted"`. `manifest.lastStatus` rewritten to `"interrupted"` if it was `"running"`. UI renders the partial turn read-only and prompts user to start a new turn.

Stale `manifest.json.tmp` files cleaned on first manifest write of next session open.

---

## 6. Replay prefix builder (pure)

`replay(turns: PersistedTurn[]): string`. Caller passes `turns.slice(0, -1)` so the trailing turn (whose user message is the new prompt) is excluded.

Output (illustrative):

    [Conversation so far — replayed because the local Cursor agent does not
    retain context across send() calls. Tool calls are summarised; full args
    and results live in this session's events.jsonl.]

    User: Plan the auth refactor — list files we'll touch.

    Assistant: I'll grep for auth middleware usages and list candidates.
      [tool: grep "authMiddleware" → ok]
      [tool: read "src/server/middleware/auth.ts" → ok]
    Files to touch: src/server/middleware/auth.ts, src/server/routes/*.ts.

    User: Now implement the plan and add regression tests.

    Assistant: ...

Rules:
- Each `PersistedTurn` becomes a `User: …` block plus `Assistant: …` block.
- Assistant text = `assistant.textBlocks.join("")`.
- Tool calls become single lines `[tool: <name> "<args summary>" → <ok|error>]` indented 2 spaces. Args summary = first 80 chars of `JSON.stringify(args)` with newlines collapsed; never includes full result.
- `thinking` is dropped from replay (kept on disk for UI).
- Cancelled / failed / interrupted turns: append a `[turn ended: <status>]` marker so the agent knows the prior turn did not finish.
- Empty if no prior turns.

Replay never reads `events.jsonl` directly — always goes through the reducer so the prefix shape stays decoupled from on-disk format changes.

---

## 7. Electron main + IPC

### 7.1 Module layout (upstream `src/main/` rewritten)

```
src/main/
  index.ts            # window + lifecycle + env loading + ripgrep path
  ipc/
    session.ts        # all session:* IPC handlers
  registry.ts         # SessionRegistry + per-window event fan-out
```

`src/main/index.ts` shrinks: keeps `loadLocalEnv`, `configureCursorRipgrepPath`, `BrowserWindow` setup. Drops the `cursor-chat:send` handler entirely. Imports `registerSessionIpc` from `./ipc/session.ts`.

### 7.2 IPC channels (renderer → main)

| Channel | Args | Returns | Notes |
|---|---|---|---|
| `session:list` | `()` | `SessionMetadata[]` | Reads manifests under `<baseDir>/sessions/*` |
| `session:create` | `{ title?, model? }` | `{ sessionId }` | Generates ULID, mkdir, writes initial manifest |
| `session:open` | `{ sessionId }` | `{ manifest, turns: PersistedTurn[] }` | Loads + reduces `events.jsonl` |
| `session:send` | `{ sessionId, prompt, subscriptionId }` | `{ ok: true, turnId } \| { ok: false, code, error }` | Promise resolves on `turn_end`; deltas via `session:event` |
| `session:cancel` | `{ sessionId }` | `{ ok: true }` | No-op if no active turn |
| `session:rename` | `{ sessionId, title }` | `{ ok: true }` | |
| `session:delete` | `{ sessionId }` | `{ ok: true }` | rm -rf the session dir; rejects if active turn |
| `session:watch` | `{ sessionId }` | `{ subscriptionId }` | Subscribes the calling window to live events |
| `session:unwatch` | `{ subscriptionId }` | `{ ok: true }` | |

### 7.3 Main → renderer push channel

`session:event` — payload `{ subscriptionId, sessionId, event: SessionEvent }`. One channel for all sessions; renderer filters by `sessionId` (and ignores other `subscriptionId`s). Carrying `subscriptionId` lets a window cancel cleanly without affecting other windows watching the same session.

### 7.4 `registry.ts`

```typescript
class SessionRegistry {
  private sessions = new Map<string, Session>();
  private subs = new Map<string, { sessionId: string; webContents: WebContents }>();

  async open(sessionId: string): Promise<Session>;            // memoised
  fanout(sessionId: string, event: SessionEvent): void;       // sends session:event to all subs for this session
  subscribe(sessionId: string, webContents: WebContents): string; // returns subscriptionId
  unsubscribe(subscriptionId: string): void;
  async closeAll(): Promise<void>;                             // app quit — cancel turns, close sessions
}
```

When a `WebContents` is destroyed, every subscription owned by it is removed. Sessions stay open in the registry so a turn started by window A keeps writing to disk after A is closed; window B can later `session:watch` and tail.

### 7.5 Send flow (renderer → main → core → SDK)

1. Renderer calls `window.api.session.send(id, prompt, onEvent)` (preload bridge)
2. Preload generates a per-call `subscriptionId`, registers `ipcRenderer.on("session:event", filterById)`
3. Preload `invoke("session:watch", { sessionId })` → main subscribes the renderer's `webContents`; preload swaps in main's returned `subscriptionId`
4. Main `session:send` handler: looks up `Session` from registry, awaits `session.send(prompt, { signal, onEvent: (e) => registry.fanout(id, e) })`
5. Core writes event → `events.jsonl`, fires `onEvent` → registry fans out to all subscribed windows
6. Promise resolves on `turn_end`; preload removes its listener and `unwatch`es
7. Cancellation: renderer aborts → preload sends `session:cancel` → main calls `session.cancel()` → core triggers `run.cancel()` → stream loop exits → `turn_end` (cancelled) flows back

### 7.6 Preload (`src/preload/index.ts`)

```typescript
window.api.session = {
  list(): Promise<SessionMetadata[]>;
  create(opts?: { title?: string; model?: string }): Promise<{ sessionId: string }>;
  open(sessionId: string): Promise<{ manifest: SessionMetadata; turns: PersistedTurn[] }>;
  send(sessionId: string, prompt: string, onEvent: (e: SessionEvent) => void): Promise<TurnResult>;
  cancel(sessionId: string): Promise<void>;
  rename(sessionId: string, title: string): Promise<void>;
  delete(sessionId: string): Promise<void>;
  watch(sessionId: string, onEvent: (e: SessionEvent) => void): () => void;  // returns unsubscribe
};
```

The upstream `window.api.cursorChat` surface is dropped.

### 7.7 Concurrency rules

- Multiple sessions: each its own `Session` in registry, independent in-flight turns
- Single session: second `send` while first running → `SessionBusyError` propagated to renderer as `{ ok: false, code: "BUSY", error: "session already running" }`
- App quit: `registry.closeAll()` cancels every in-flight turn (writes `turn_end: cancelled`), runs plugin cleanup, closes Cursor agents

---

## 8. Renderer wiring (`src/renderer/`)

- `App.tsx`: drop the in-memory `useState<ChatMessage[]>` initial seed. On mount: `window.api.session.list()` → sidebar; if none, auto-create one. Active `sessionId` in state.
- New `useSession(sessionId)` hook: on change → `session.open(id)` for `manifest + turns`, sets state, calls `session.watch(id, onEvent)` to tail live events; cleanup on unmount/swap.
- `ChatThread`: consumes `PersistedTurn[]` directly. Existing `Message` component already uses ReactMarkdown for assistant text — keep it. Add tool-call rendering: collapsed `[tool: <name>]` chip per `assistant.toolCalls[i]`, expandable to show args/result from event log.
- `PromptBox` submit: `session.send(activeId, prompt, onEvent)`. While `lastStatus === "running"` show a stop button → `session.cancel(activeId)`.
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
| `SessionCorruptError` | `manifest.json` unparseable, schema mismatch, or `events.jsonl` line malformed beyond skip |

IPC marshals all errors as `{ ok: false, code, message }`. Renderer maps:
- `BUSY` → disabled prompt + tooltip "session already running"
- `MISSING` → "session deleted" toast + sidebar refresh
- `CORRUPT` → "could not load session" modal with sessionId for support
- `AUTH` / `NETWORK` / `CONFIG` (existing) → existing error UI

Per-turn `Agent.create + send` errors land in `events.jsonl` as `{ kind: "error", ... }` followed by `{ kind: "turn_end", status: "failed" }`. Renderer renders the failed turn with an inline error block; the session stays usable — next `send` opens a fresh agent.

---

## 11. Cancellation + crash recovery

- App quit: `SessionRegistry.closeAll()` cancels all active turns; each writes `turn_end: cancelled` before exit
- Hard crash mid-turn: `events.jsonl` ends with `turn_start` but no `turn_end`. Reducer marks that turn `status: "interrupted"`. On next session open the manifest's `lastStatus` is rewritten to `"interrupted"`. Renderer renders the partial turn read-only and prompts user: "previous turn interrupted — start new turn"
- `manifest.json.tmp` left over: cleaned on next manifest write
- Window close while turn running: turn keeps running in main process; another window can watch via `session:watch`

---

## 12. Testing

### 12.1 core unit tests (`packages/core/src/session/*.test.ts`)

- `store.test.ts` — append jsonl + atomic manifest rewrite + reducer round-trips; partial-line tail recovery
- `replay.test.ts` — prefix builder snapshot tests covering: empty history, mix of text + tool calls, cancelled turn marker, `args`-summary truncation
- `session.test.ts` — full `Session.send` happy path with existing `fakeSdk`; busy-error path; cancel path; plugin lifecycle (`preRun` once, `promptPrefix` per turn); turn_end manifest update; crash recovery (load with no trailing turn_end → status interrupted)
- `index.test.ts` — `createSession` / `loadSession` / `listSessions` / `deleteSession` round-trip; ULID ordering; missing-session error

### 12.2 smoke (extends `packages/core/src/smoke.test.ts`)

Two-turn session: assert second turn's `agent.send` argument contains the replayed first turn (text + summarised tool line); rote plugin's rules-file installed once; flowbuilder MCP contributed both turns.

### 12.3 Electron main

vitest integration with mocked `Session` proving:
- IPC round-trips for create/open/send/cancel/delete
- Per-window subscription fan-out (two mock `WebContents` both receive events)
- Subscription cleanup when `WebContents` destroyed
- App-quit path cancels in-flight turns

### 12.4 Manual smoke

`docs/smoke.md` updated with multi-turn checklist: create session → send "hello" → send follow-up → quit app → reopen → confirm history rendered → confirm next send replays prior turns.

---

## 13. Open follow-ups (post-v1)

- Sliding-window summarisation: compress old turns into a single context block when `events.jsonl` exceeds N tokens
- Switch to native multi-turn (`Agent.resume` + reuse) once the Cursor SDK local-context bug is fixed; on-disk format unchanged
- Cloud-agent option per session (`local | cloud` mode in manifest)
- Search across sessions (full-text over assistant text + user messages)
- Export / share session as zip
- chokidar-based live `state.json` watcher (replaces tool_end-triggered re-fetch)
- Session pin / archive / colour-tag in sidebar
- Multi-user / sync (deliberately out of scope — single-machine app)

---

## 14. File-tree summary

```
packages/core/
  src/
    index.ts                                # exports session API alongside runPrompt
    run.ts                                  # becomes thin wrapper over Session
    session/
      index.ts                              # createSession / loadSession / listSessions / deleteSession
      session.ts                            # Session class
      store.ts                              # jsonl + manifest IO
      reducer.ts
      replay.ts
      ulid.ts
      types.ts
      errors.ts
      *.test.ts
    smoke.test.ts                           # extended with multi-turn case

src/main/
  index.ts                                  # window + env (cursor-chat:* removed)
  ipc/session.ts                            # session:* handlers
  registry.ts                               # SessionRegistry

src/preload/
  index.ts                                  # window.api.session.* (cursorChat removed)

src/renderer/
  src/
    App.tsx                                 # drops in-memory chat state, uses useSession
    hooks/useSession.ts                     # new
    components/ChatThread.tsx               # consumes PersistedTurn[]
    components/ToolCallChip.tsx             # new
    components/PromptBox.tsx                # cancel button wiring
    components/Sidebar.tsx                  # session list

docs/superpowers/specs/
  2026-05-09-agent-loop-support-research.md  # research
  2026-05-09-multi-turn-session-and-electron-integration-design.md  # this spec
```
