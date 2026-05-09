# flow-build — LLM Blocks & Graph Execution Design

**Date:** 2026-05-09
**Status:** Approved (brainstormed)
**Builds on:**
- `docs/superpowers/specs/2026-05-09-flowbuilder-harness-design.md`
- `docs/superpowers/specs/2026-05-09-multi-turn-session-and-electron-integration-design.md`
- `docs/superpowers/specs/2026-05-09-plugin-system-and-rote-integration-design.md`

---

## 1. Goal

Make flowbuilder graphs executable end-to-end. Add a new **LLM block** node
type whose pre-prepared prompt consumes upstream output and emits a new
output. Add an execution engine triggered from MCP (agent-driven) **and**
from a UI Play button. Both triggers funnel through one execution path so
behavior never diverges between agent and user.

Today the graph is purely declarative: the chat agent reasons about it and
edits it via `flowbuilder_get_state` / `flowbuilder_set_state`, but no code
walks the graph or invokes anything. After this spec, the graph runs.

### Non-goals (deferred to follow-up specs)

- Branch / Merge node execution (engine throws "not yet supported"; v1
  validates linear-plus-fan-in graphs only).
- Parallel traversal of independent subgraphs (sequential topological order
  for v1).
- Per-node retry policies.
- LLM block as a multi-turn agent with tool access (single-shot only).
- Pluggable LLM provider abstraction (Cursor SDK only; swap-in for
  `@anthropic-ai/sdk` is anticipated behind the same internal interface).
- Run resume / replay-from-intermediate-node.
- Multi-run concurrency within one session (UI disables Play while
  running).

---

## 2. Success criteria

1. A graph of the form `input("hello") → llm("Translate {{input}} to French") → output`
   runs end-to-end via the UI Play button, with French text streaming live
   into the LLM node and a final envelope visible in the inspector.
2. The same graph runs end-to-end via the MCP tool
   `flowbuilder_execute_flow` invoked by the chat agent. The agent
   receives a `runId` synchronously, then calls
   `flowbuilder_get_run_result({ runId })` to retrieve final status +
   output envelope once the run finishes (polling once at the end is
   sufficient for the conversational case).
3. A graph that includes a `flow` node referencing an installed rote flow
   runs that flow as a real subprocess and threads its stdout into
   downstream blocks.
4. Templated `FlowNode.params` strings (e.g. `{ owner: "{{input.data.owner}}" }`)
   resolve at run time, with the same substitution rules as LLM block
   prompts.
5. A node that errors halts the run; the failing node is marked `error`,
   downstream nodes are marked `skipped`, and `run_end` carries
   `status: "failed"` with the error message.
6. A graph containing a `branch` or `merge` node fails fast with a clear
   typed error before any node executes.
7. Past runs are preserved on disk (`sessions/<sid>/runs/<runId>/`) and
   listed in a sidebar; clicking opens a read-only replay view.
8. The `@flow-build/engine` package builds and tests independently of the
   electron app — pure-ish executor with injected `cursorClient` and
   configurable `roteCmd`.

---

## 3. Architecture

```
flow-build/
├── packages/
│   ├── engine/                              # NEW @flow-build/engine
│   │   ├── package.json                     # deps: @flow-build/flowbuilder, @cursor/sdk, zod
│   │   └── src/
│   │       ├── index.ts                     # public exports
│   │       ├── types.ts                     # Run, RunStatus, RunEvent, Envelope
│   │       ├── engine.ts                    # createRun(): main executor
│   │       ├── runStore.ts                  # per-run dir IO
│   │       ├── topo.ts                      # topo-sort + linear-only validator
│   │       ├── template.ts                  # {{input}} substitution
│   │       ├── cursorSingleShot.ts          # Cursor SDK → completion-text adapter
│   │       └── executors/
│   │           ├── input.ts
│   │           ├── output.ts
│   │           ├── flow.ts                  # spawns `rote flow run ...`
│   │           └── llm.ts                   # calls cursorSingleShot
│   ├── flowbuilder/
│   │   src/schema.ts                        # + LlmNodeSchema, + 'llm' in union
│   │   src/mcp-server.ts                    # + flowbuilder_execute_flow tool
│   └── core/                                # unchanged
├── src/
│   ├── main/
│   │   ├── runRegistry.ts                   # NEW: parallels SessionRegistry
│   │   └── ipc/
│   │       ├── run.ts                       # NEW: run:* handlers
│   │       └── schemas.ts                   # + run:* zod schemas
│   ├── preload/index.ts                     # + window.api.run.*
│   └── renderer/src/
│       ├── components/TopBar.tsx            # + Play button
│       ├── components/FlowCanvas.tsx        # drives existing status badges from real events
│       ├── components/FlowNode.tsx          # + LLM block visual w/ streaming text
│       ├── components/RunSidebar.tsx        # NEW: past-runs list
│       ├── data/typeColors.ts               # + 'llm' color
│       ├── data/icons.tsx                   # + 'llm' icon
│       └── App.tsx                          # rewires handleRun → real engine
```

### 3.1 Triggers funnel into one path

```
[ MCP agent ]                  [ UI Play button ]
      │                                │
      │ flowbuilder_execute_flow       │ window.api.run.execute({ sessionId })
      ▼                                ▼
session.startRun() ────────────► ipcMain.handle("run:execute") → RunRegistry.start()
                                                                       │
                                                                       ▼
                                                createRun(...) from @flow-build/engine
                                                                       │
                                                                       ▼ (events)
                                              ┌─── events.jsonl (disk)
                                              │
                                              └─── webContents.send("run:event", ...) → renderer
```

A `Run` is alive in memory only while executing. Past runs are read from
disk via `run:read`. There is no separate "agent-driven run" vs
"UI-driven run" path.

---

## 4. Schema additions (`packages/flowbuilder/src/schema.ts`)

### 4.1 LlmNode

```ts
const LlmNodeSchema = NodeBase.extend({
  type: z.literal("llm"),
  prompt: z.string().min(1),                       // template; supports {{input}} / {{input.data.X}}
  model: z.string().default("claude-sonnet-4-6"),  // Cursor model id
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  systemPrompt: z.string().optional(),
});
```

Added to the `Node` discriminated union alongside
`input | output | flow | branch | merge | llm`.

### 4.2 FlowNode params — runtime templating

`FlowNode.params: Record<string, unknown>` is unchanged at the schema
level. At run time, **string values** in `params` are passed through the
same template substitution as LLM prompts (`{{input}}`,
`{{input.data.X}}`). Non-string values pass through unchanged.

This is a runtime convention, not a schema change — keeps the schema
backwards-compatible and shifts complexity into the engine where it
belongs.

### 4.3 Edge envelope (runtime only — not in state.json)

```ts
type Envelope = {
  text: string;            // canonical; what LLM block consumes
  data?: unknown;          // optional structured payload
};
```

Envelopes live only in `outputs.json` per run. State.json stays the
declarative graph definition.

### 4.4 Schema version

`schemaVersion` stays `1`. Adding a new variant to a discriminated union
is backwards-compatible. Existing pre-llm `state.json` files continue to
load without migration.

---

## 5. The `@flow-build/engine` package

### 5.1 Public types

```ts
type RunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

type NodeRunStatus = "pending" | "running" | "done" | "error" | "skipped";

type RunEvent =
  | { type: "run_start";   runId: string; sessionId: string; startedAt: string }
  | { type: "node_start";  runId: string; nodeId: string; nodeType: string; at: string }
  | { type: "node_text";   runId: string; nodeId: string; chunk: string }
  | { type: "node_end";    runId: string; nodeId: string; status: NodeRunStatus;
                           output?: Envelope; error?: string; at: string }
  | { type: "run_end";     runId: string; status: RunStatus;
                           finalOutput?: Envelope; error?: string; at: string };

type Run = {
  runId: string;                            // ulid
  sessionId: string;
  status: RunStatus;
  events: AsyncIterable<RunEvent>;          // consumed by the IPC bridge
  cancel(): Promise<void>;
  done: Promise<{ status: RunStatus; finalOutput?: Envelope; error?: string }>;
};
```

### 5.2 Public API

```ts
function createRun(opts: {
  sessionId: string;
  baseDir: string;                          // session base dir
  state: State;                             // graph snapshot at run start
  signal?: AbortSignal;
  cursorClient: CursorClient;               // injected, mockable
  roteCmd?: string;                         // default "rote"
}): Run;
```

The engine is otherwise free of side effects: it does not touch the
session's `state.json`, does not own a network or filesystem identity
beyond its `baseDir`, and accepts `cursorClient` + `roteCmd` injection so
tests stay hermetic.

### 5.3 Execution algorithm — sequential, fail-fast

```
1. validate state via flowbuilder schema
2. topo-sort nodes; reject if any branch/merge present
3. initialize outputs: Map<nodeId, Envelope>
4. write run_start to events.jsonl + emit on the events iterable
5. for each node in topo order:
     a. emit node_start
     b. resolve inputs from incoming edges:
        - 0 inputs → input is { text: "", data: undefined }
        - 1 input  → input = upstream envelope
        - N inputs → fan-in: concat .text in topo order, .data = array of upstream .data
     c. run node-type executor with (node, input, ctx)
     d. on success: store output, emit node_end{status:"done", output}
        on error:   emit node_end{status:"error", error}; mark all remaining
                    topo-later nodes skipped (emit node_end{status:"skipped"} for each); break
        on cancel:  emit node_end{status:"cancelled"} for in-flight; break
6. emit run_end with final status; finalOutput = output node's envelope (if any reached)
7. fsync events.jsonl, write outputs.json + manifest.json
   (outputs.json is written even on failure/cancel — it contains every
   envelope captured before the halt, which is what the inspector shows
   for past runs)
```

### 5.4 Per-node executors

| Node type | Behavior |
|---|---|
| `input` | `output = { text: String(node.value ?? ""), data: node.value }`. Pure passthrough. |
| `output` | `output = input` (no transform). Marks the run's `finalOutput`. |
| `flow` | Build argv: `["flow", "run", node.flow, ...flatten(node.params after template substitution)]`. Spawn via `child_process.spawn(roteCmd, argv)`. Capture stdout → `envelope.text`. Stderr accumulated into error message on non-zero exit. Best-effort `JSON.parse(stdout)` populates `envelope.data` (parse failure ignored). |
| `llm` | Substitute `{{input}}` / `{{input.data.X}}` in `node.prompt`. Call `cursorSingleShot({ prompt, system: node.systemPrompt, model, maxTokens, temperature, signal })`. Stream chunks → emit `node_text` events. Final string → `envelope.text`. Best-effort: if the completion is a fenced JSON block, parse for `envelope.data`. |
| `branch`, `merge` | Throw a typed `EngineError("UNSUPPORTED_NODE_TYPE")` during topo validation, before run starts. |

### 5.5 Cursor SDK single-shot adapter (`cursorSingleShot.ts`)

Cursor SDK is an agent harness, not a completion API. The adapter
constrains it to behave like one:

- `Agent.create()` with no MCP servers, no tools, no plugins.
- One user message (the substituted prompt).
- System prompt either user-provided (`node.systemPrompt`) or empty.
- Stream events; collect only `text` events into the result string;
  ignore tool/thinking/status events (they shouldn't appear, but be
  defensive).
- Return `{ text, usage }` plus an async iterator of text chunks the
  engine forwards as `node_text` events.

If Cursor SDK proves a poor fit (e.g. enforced tool catalog, disallowed
empty system prompt, latency surprise), the fallback is to swap
`cursorSingleShot.ts` for an `@anthropic-ai/sdk` implementation behind
the same interface. **The engine code is unchanged** in either case;
this is the only file that touches the LLM SDK.

### 5.6 Template substitution (`template.ts`)

A tiny mustache-ish evaluator. Regex
`/\{\{\s*(input(?:\.data(?:\.[a-zA-Z_][\w]*)*)?)\s*\}\}/g` over a string,
resolving:

- `{{input}}` → `envelope.text`
- `{{input.data}}` → `JSON.stringify(envelope.data)` (or `""` if undefined)
- `{{input.data.foo.bar}}` → string-coerced value at path; `""` if path missing

No conditionals, loops, or escaping. One implementation, used by both
`executors/llm.ts` and `executors/flow.ts`.

### 5.7 Run store layout (`runStore.ts`)

```
sessions/<sid>/runs/<runId>/
├── manifest.json     # { runId, sessionId, startedAt, endedAt, status, error? }
├── events.jsonl      # line-delimited RunEvent stream (append-only)
├── outputs.json      # { [nodeId]: Envelope } — written at run_end
└── snapshot.json     # the State at run start (graph as it was when run kicked off)
```

`runs/` directories are immutable post-completion. The UI lists past runs
by enumerating `runs/` and reading each `manifest.json`. Clicking a run
replays `events.jsonl` into the same UI shapes used for live runs.

`snapshot.json` is kept (despite the disk cost) to make replay and debug
trivial: a past run's view always reflects the graph as it was, not the
current edited graph.

---

## 6. MCP tools — `flowbuilder_execute_flow` + `flowbuilder_get_run_result`

Two new tools added in `packages/flowbuilder/src/mcp-server.ts`
`buildMcpServer()`, alongside the existing read/write pair.

### 6.1 `flowbuilder_execute_flow` (fire-and-forget)

```ts
mcp.tool(
  "flowbuilder_execute_flow",
  "Execute the current flowbuilder graph. Returns a runId immediately; \
the run executes asynchronously. Call flowbuilder_get_run_result({ runId }) \
to await the final outcome.",
  {},   // no params — runs the saved graph
  async () => {
    // session here is the SessionManager already passed to buildMcpServer.
    // Implementation forwards to RunRegistry.start(session.id) — both the
    // MCP server and the IPC handlers share that singleton (see §7.2).
    const runId = await runRegistry.start(session.id);
    return asTextResult({ runId, sessionId: session.id });
  },
);
```

The tool returns immediately with `{ runId, sessionId }`. The MCP
request is finished before the first node executes; the engine churns
in the background under `RunRegistry`.

**No params.** v1 runs the saved graph as-is. Inputs are encoded in the
`InputNode.value` field — agent or user edits state.json (via existing
`flowbuilder_set_state`) then calls execute.

### 6.2 `flowbuilder_get_run_result`

Closes the loop so the agent can act on results in the same
conversation. Reads from disk (no in-memory state required, so it works
for past runs too).

```ts
mcp.tool(
  "flowbuilder_get_run_result",
  "Fetch the result of a previously started run. If the run is still in \
progress, returns { status: 'running' } — the agent should retry a few \
seconds later. Once finished, returns final status, finalOutput, and \
per-node outputs.",
  {
    runId: z.string(),
    waitMs: z.number().int().min(0).max(60_000).optional(),  // see below
  },
  async ({ runId, waitMs }) => {
    if (waitMs && waitMs > 0) {
      await runRegistry.waitForRunEnd(runId, waitMs);  // resolves on run_end or timeout
    }
    const result = await readRunResult(session.baseDir, session.id, runId);
    // result = { status, finalOutput?, outputs: Record<nodeId, Envelope>, error? }
    return asTextResult(result);
  },
);
```

**`waitMs` is the agent's "block until done (with timeout)" knob.** When
provided, the tool blocks server-side up to `waitMs` waiting for the
run's `run_end` event (via `RunRegistry.waitForRunEnd`). When absent,
it returns immediately with whatever's currently on disk. This keeps
the simple agent flow one tool call (`execute_flow` then
`get_run_result({ runId, waitMs: 30000 })`) without making the engine
itself synchronous, and without adding a polling loop on the agent side.

**Why split into two tools instead of one synchronous `execute_flow`:**
- Long runs that exceed `waitMs` still complete; `get_run_result` can be
  re-called later (or with a longer wait) to fetch the final result.
- UI runs and agent runs share the same async engine — no fork in
  behavior.
- The agent gets to decide its patience budget per call.

**`flowbuilder_execute_flow` rule of thumb for the agent** (documented
in `rules.ts`): after kicking off a run, follow up immediately with
`flowbuilder_get_run_result({ runId, waitMs: 30000 })` unless told
otherwise. Most graphs in v1 finish in seconds.

### 6.3 Tools NOT in v1

`cancel_run`, `list_runs`, and a streaming/event-subscription tool are
explicitly deferred. The UI handles cancellation and listing via direct
IPC (§7); agents rarely need them.

### 6.4 Rules update (`packages/flowbuilder/src/rules.ts`)

The flowbuilder plugin's injected system-prompt rules (which already
document the schema and the existing get/set tools) gain:

- A new section describing the `llm` node: shape, when to use it vs a
  rote `flow` node, the `{{input}}` / `{{input.data.X}}` template syntax,
  default model/temperature, and the single-shot constraint (no tools,
  no multi-turn).
- A new section describing the execution tools and the recommended
  pattern: `flowbuilder_execute_flow()` immediately followed by
  `flowbuilder_get_run_result({ runId, waitMs: 30000 })`.
- A note that template substitution applies to `FlowNode.params`
  string values too, so an agent can wire data from upstream into a
  rote flow's parameters without reading and re-writing state mid-run.

This is the surface the agent reads to "know what it can do" — keeping
it accurate is part of the implementation work, not an afterthought.

---

## 7. Main process — IPC + RunRegistry

### 7.1 IPC handlers (`src/main/ipc/run.ts`, new file)

Mirrors `session.ts` shape. All inputs zod-validated with `.strict()`.

| Channel | Input | Output |
|---|---|---|
| `run:execute` | `{ sessionId }` | `{ ok: true, runId }` \| `{ ok: false, code, error }` |
| `run:cancel` | `{ sessionId, runId }` | `{ ok: true }` \| `{ ok: false, ... }` |
| `run:list` | `{ sessionId }` | `{ ok: true, runs: RunManifest[] }` |
| `run:read` | `{ sessionId, runId }` | `{ ok: true, manifest: RunManifest, events: RunEvent[], outputs: Record<nodeId, Envelope> }` |

`RunManifest = { runId, sessionId, startedAt, endedAt?, status: RunStatus, error? }`.
| `run:watch` | `{ sessionId, runId }` | `{ ok: true, subscriptionId }` |
| `run:unwatch` | `{ subscriptionId }` | `{ ok: true }` |

Zod schemas added to `src/main/ipc/schemas.ts` matching the existing
`session:*` strictness.

### 7.2 RunRegistry (`src/main/runRegistry.ts`)

Parallels `SessionRegistry`:

```ts
class RunRegistry {
  private runs = new Map<string, Run>();             // runId → live Run
  private subs = new Map<string, RunSubscription>(); // subId → { runId, webContents }

  async start(sessionId: string): Promise<string> {
    const session = sessionRegistry.get(sessionId);
    const state = await session.getState();
    const run = createRun({
      sessionId,
      baseDir: session.baseDir,
      state,
      cursorClient,
    });
    this.runs.set(run.runId, run);
    void this.pump(run);
    return run.runId;
  }

  private async pump(run: Run) {
    for await (const ev of run.events) {
      this.fanout(run.runId, ev);
    }
    this.runs.delete(run.runId);
  }

  fanout(runId: string, ev: RunEvent) {
    for (const [, sub] of this.subs) {
      if (sub.runId === runId && !sub.webContents.isDestroyed()) {
        sub.webContents.send("run:event", { runId, event: ev });
      }
    }
  }

  subscribe(runId: string, webContents: WebContents): string { /* ... */ }
  unsubscribe(subId: string): void { /* ... */ }
  cancel(runId: string): Promise<void> {
    return this.runs.get(runId)?.cancel() ?? Promise.resolve();
  }

  /**
   * Resolves when the given run reaches run_end, or when timeoutMs elapses
   * — whichever happens first. Used by flowbuilder_get_run_result's
   * `waitMs` knob (§6.2). If the run is already done (not in `runs`), the
   * promise resolves immediately. Never throws on timeout — caller reads
   * disk to discover whether the run actually finished.
   */
  waitForRunEnd(runId: string, timeoutMs: number): Promise<void> { /* ... */ }
}
```

### 7.3 Preload bridge (`src/preload/index.ts`)

Exposes `window.api.run.{ execute, cancel, list, read, watch, unwatch, onEvent }`.
Pattern matches `window.api.flowbuilder.*` and the upcoming `session.*`
shape.

---

## 8. Renderer changes

### 8.1 Play button

`src/renderer/src/components/TopBar.tsx`, in the `tb-r` div:

```tsx
<button
  className="tb-btn tb-btn-primary"
  onClick={onPlay}
  disabled={running || !canRun}
  title={canRun ? "Execute flow" : "Add an Output node to run"}
>
  {running ? "Running…" : "▶ Play"}
</button>
```

`canRun = state has ≥1 input + ≥1 output and no branch/merge nodes`.
The disabled tooltip explains why. The button is also disabled while a
run is in progress (no concurrent runs in v1).

### 8.2 App.tsx wiring

Replaces the existing simulated `handleRun()`:

```ts
const [activeRunId, setActiveRunId] = useState<string | null>(null);
const [runState, setRunState] = useState<Map<string, NodeRunStatus>>(new Map());
const [nodeStreams, setNodeStreams] = useState<Map<string, string>>(new Map());

async function handlePlay() {
  const r = await window.api.run.execute({ sessionId });
  if (!r.ok) return showError(r.error);
  setActiveRunId(r.runId);
  const sub = await window.api.run.watch({ sessionId, runId: r.runId });
  // window.api.run.onEvent → updates runState + nodeStreams
  // run_end → setActiveRunId(null), refresh node-output panel
}
```

The existing CSS for `running` (pulse) and `done` (checkmark) badges in
`FlowNode.tsx` already covers visual states — no new styling, just drive
the existing classes from real `RunEvent`s instead of the simulated
timer.

### 8.3 Live LLM streaming

When a `node_text` event arrives for an LLM node, append the chunk to
`nodeStreams[nodeId]`. The LLM block visual (using the existing larger
`prompt`-style node) shows the streaming completion in a read-only area
below the prompt template. On `node_end`, the final text persists as the
node's "last output" until the next run.

### 8.4 Per-node output inspection

Click a node when `runState` is non-empty → the side inspector shows the
node's envelope from the active or most-recent run, read from
`runs/<runId>/outputs.json`. The inspector gains an "Output" tab.

### 8.5 Run history sidebar (`RunSidebar.tsx`)

A new collapsed section in the existing left sidebar: "Runs". Lists past
runs for the current session via `window.api.run.list({ sessionId })`.
Each row: `▶ runId · status · startedAt`. Click → opens a read-only run
view (replays events from disk into the same UI).

Out of scope for v1: filtering, deletion, comparison.

### 8.6 Error display

On `run_end{status:"failed"}`, show a toast and an inline red badge on
the failing node. Clicking the badge opens the inspector with the error
message and last-resolved input envelope. `skipped` nodes use the same
gray "pending" look — no new styling.

### 8.7 LLM block authoring UX

Inside the prompt textarea, a small `{{input}}` insert button and a hint
line: `Use {{input}} for upstream text, {{input.data.foo}} for structured fields.`
No autocomplete, no validation — keep authoring lightweight.

---

## 9. Testing

### 9.1 Engine unit tests (vitest)

| Test | Scope |
|---|---|
| `topo.test.ts` | Topo sort correct on linear, fan-in, fan-out. Rejects branch/merge with typed error. Rejects cycles. |
| `template.test.ts` | `{{input}}` / `{{input.data.X}}` substitution. Missing path → `""`. Non-string `data` paths string-coerce. No interpretation of unrelated `{{...}}`. |
| `engine.linear.test.ts` | input → llm → output with mocked `cursorClient`. Asserts events emitted in order, outputs.json contents, finalOutput, run_end status. |
| `engine.flow.test.ts` | input → flow → output with `roteCmd` pointing at a fixture script (echoes JSON). Asserts subprocess argv (params templated), stdout captured, JSON parse populates `data`. |
| `engine.failfast.test.ts` | Middle node throws → node `error`, downstream `skipped`, run_end `failed`. |
| `engine.cancel.test.ts` | AbortSignal mid-run → in-flight node cancelled, downstream skipped, run_end `cancelled`. |
| `engine.fanin.test.ts` | Two upstreams → one consumer. Concat order = topo. |
| `runStore.test.ts` | Round-trip events.jsonl + outputs.json + manifest.json. Snapshot equals start-of-run state. |

### 9.2 Flowbuilder schema tests

- `LlmNodeSchema` accepts valid input, rejects missing `prompt`.
- Backward compat: existing pre-llm `state.json` fixtures still parse.
- Discriminated union round-trips through `JSON.parse(JSON.stringify(...))`.

### 9.3 Flowbuilder MCP tool tests

- `flowbuilder_execute_flow` returns well-formed `{ runId, sessionId }` text result.
- Calling without an active session → typed error.
- `flowbuilder_get_run_result({ runId })` with no `waitMs` returns
  current state from disk (status, partial outputs).
- `flowbuilder_get_run_result({ runId, waitMs })` resolves once
  `RunRegistry.waitForRunEnd` fires; returned status matches `run_end`.
- `flowbuilder_get_run_result({ runId, waitMs })` returns the
  in-progress disk state if `waitMs` elapses before `run_end`.
- Unknown `runId` → typed error.

### 9.4 IPC tests

Under `src/main/ipc/__tests__/`, mirroring the `session.ts` test style:

- `run.execute.test.ts` — happy path returns `{ ok: true, runId }`.
- `run.watch.test.ts` — subscription receives events; unsubscribe stops them.
- Strict zod schema rejection of unknown keys.

### 9.5 Renderer

No automated tests added in v1 (renderer tests are sparse in the repo
today). Manual smoke covers UI.

### 9.6 Manual smoke (added to `docs/smoke.md`)

1. Open app, create new session.
2. Ask agent in chat to build: `input("hello") → llm("Translate {{input}} to French") → output`.
3. Click Play. Watch status badges progress; French text streams into the LLM node.
4. Click LLM node → inspector shows envelope.
5. Repeat with a `flow` node in the middle (requires `rote` on PATH).
6. Inject failure: edit graph to reference a nonexistent rote flow → Play → fail-fast UI verified (red badge on flow node, downstream gray, toast).
7. Open run history sidebar → past runs visible, clickable to re-view.

### 9.7 Out of test scope

- Cursor SDK behavior beyond mocking — assumed to work; failures surface at smoke time.
- Concurrency safety of multiple simultaneous runs in same session — UI prevents it.
- Cross-platform rote subprocess spawning — develop on macOS, sanity-check Linux.

---

## 10. Risks and open questions

- **Cursor SDK single-shot fit.** If Cursor's `Agent.create()` insists on
  some minimum tool catalog or rejects empty system prompts, the
  `cursorSingleShot.ts` adapter will need to negotiate that. Worst case:
  swap to `@anthropic-ai/sdk` — engine code unaffected, only the adapter
  file changes.
- **Rote subprocess JSON output.** Best-effort `JSON.parse(stdout)` can
  silently miss structured data when a flow prints log-style output
  before its JSON. Mitigation: encourage rote flows to emit
  newline-delimited JSON with the final line being the result, or add
  an explicit `--json` convention later. v1 accepts the loose contract.
- **InputNode.value typing.** `value: unknown` means anything goes. The
  engine string-coerces for `text` but stores the raw value as `data`.
  If an InputNode holds a non-serializable object (rare but possible
  via agent edits), `outputs.json` write will throw. v1 lets that
  surface as an error rather than silently dropping data.
- **No params on `flowbuilder_execute_flow`.** If users want to "run with
  this temporary input" without saving to state.json, they can't in v1.
  Acceptable; they edit the input node first. A future tool variant can
  accept `{ inputs: Record<inputNodeId, unknown> }` overrides.
