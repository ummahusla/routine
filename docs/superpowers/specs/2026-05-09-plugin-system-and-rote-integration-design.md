# flow-build — Plugin System & Rote Integration Design

**Date:** 2026-05-09
**Status:** Approved (brainstormed)
**Builds on:** `docs/superpowers/specs/2026-05-09-cursor-sdk-harness-design.md`
**Related research:** `docs/rote-research/`, `cursor-agent-sdk-research.md`

---

## 1. Goal

Add a plugin extension layer to `@flow-build/core` and ship a first-party
`@flow-build/rote` plugin so every flow-build run is aware of the rote
workflow engine: its installed version, available adapters, pending flow
stubs, the active workspace, the lifecycle (search → execute → crystallize
→ reuse), and bypass-suggestion hints when the agent calls direct service
CLIs.

The rote plugin is **always on** in the CLI. Future packages (telemetry,
subagent definitions, organization-specific guidance) will plug into the
same interface.

**Non-goals (this spec):**
- Multi-turn `Session` API. Plugin lifecycle is scoped to one `runPrompt`.
- `.cursor/hooks.json` materialization. Plugin only writes
  `.cursor/rules/*.mdc` files.
- Running rote as an MCP server.
- Disk-based plugin discovery (e.g. `.flow-build/plugins.json`).

---

## 2. Success criteria

1. `flow-build run "<prompt>"` invoked anywhere — every run prepends a rote
   facts block to the user prompt and materializes a rules file under
   `<cwd>/.cursor/rules/.flow-build-rote.mdc` with `alwaysApply: true`.
2. The rules file is removed at run end (success, failure, SIGINT). A
   pre-existing file at the same path is backed up and restored.
3. The Cursor agent receives the rules file in context (verified via
   `settingSources` including `"project"`).
4. When the agent runs `gh issue list` (or any classified bypass), a
   synthetic text event surfaces inline with a `[rote hint] try: rote …`
   suggestion. Local dev commands (`git`, `npm`, `cargo`, …) never trigger
   hints.
5. If `rote` is not on `PATH`, the run still completes; the rules file
   tells the agent rote is unavailable and how to install.
6. A second consumer can register its own `Plugin` and observe the same
   ordering and isolation guarantees as the rote plugin — proving the API
   is general.

---

## 3. Architecture

```
flow-build/
├── packages/
│   ├── core/                 # @flow-build/core
│   │   adds: Plugin, RuntimeContext, PluginHostError
│   │   adds: RunOptions.plugins?: Plugin[]
│   │   stays rote-agnostic; never imports @flow-build/rote
│   │
│   ├── cli/                  # flow-build
│   │   imports @flow-build/rote unconditionally
│   │   wires: plugins = [createRotePlugin({...})]
│   │
│   └── rote/                 # @flow-build/rote   (NEW)
│       only place that knows about: rote CLI binary,
│       .cursor/rules layout, prompt assembly, bypass patterns
```

- Core defines the contract.
- CLI is the only place that wires the rote plugin in.
- Future plugins (telemetry, custom org guidance) sit beside `rote/` in the
  same monorepo or in external packages — they only depend on the public
  types from `@flow-build/core`.

---

## 4. Plugin interface (core)

### 4.1 New types

```ts
// packages/core/src/types.ts (additions)

export type Plugin = {
  name: string;                         // unique per run; logs and state key
  preRun?:        (ctx: RuntimeContext) => Promise<PreRunOutput | void>;
  systemPrompt?:  (ctx: RuntimeContext) => Promise<SystemPromptContribution | void>;
  promptPrefix?:  (ctx: RuntimeContext) => Promise<string | void>;
  interceptEvent?: (e: HarnessEvent, ctx: RuntimeContext) => HarnessEvent[] | void;
  onToolCall?:    (call: ToolCallSnapshot, ctx: RuntimeContext) => Promise<void>;
  cleanup?:       (ctx: RuntimeContext) => Promise<void>;
};

export type RuntimeContext = {
  cwd: string;
  model: string;
  runId: string;                        // ulid; survives the run
  signal: AbortSignal;
  logger: Logger;
  state: Map<string, unknown>;          // plugin-private scratch (key by plugin.name)
};

export type PreRunOutput = {
  facts?: Record<string, unknown>;      // merged into ctx.state[plugin.name].facts
};

export type SystemPromptContribution = {
  rulesFile: {
    relativePath: string;               // must resolve under <cwd>/.cursor/rules/
    contents: string;                   // full file body, frontmatter included
  };
};

export type ToolCallSnapshot = {
  callId: string;
  name: string;
  status: "running" | "completed" | "error";
  args?: unknown;
  result?: unknown;
};
```

### 4.2 Errors

```ts
export class PluginHostError extends HarnessError {} // retryable: false
```

Maps to CLI exit code 1.

### 4.3 RunOptions extension

```ts
export type RunOptions = {
  // ... existing fields ...
  plugins?: Plugin[];   // default: []
};
```

### 4.4 Hook execution order (per run)

```
1.  validate plugin names unique                   → PluginHostError if not
2.  emit {status:"starting"}
3.  preRun                  (parallel, awaited)    facts → ctx.state[name].facts
4.  systemPrompt            (parallel, awaited)    rules files written by host
5.  promptPrefix            (parallel, awaited)    contributions concatenated
6.  Agent.create + agent.send(prefixedPrompt)      withRetry
7.  stream loop:
      each event → interceptEvent (sequential, plugin order) → onEvent
      tool_start/tool_end → onToolCall (parallel, fire-and-forget)
8.  emit {status:"done"}
9.  cleanup                 (always, sequential, reverse order, throws swallowed)
10. return RunResult
```

### 4.5 Guarantees

- A plugin sees only its own `ctx.state[plugin.name]` slot. Cross-plugin
  reads are opt-in and explicit.
- `interceptEvent` returning `void` = pass through; returning `[]` = drop;
  returning multiple events = fan out.
- `onToolCall` is for side effects only. To surface a hint to the user, the
  plugin emits a synthetic `text` event from `interceptEvent` on the next
  tick. No new event types are added to the harness.
- `cleanup` runs in `try/finally`. Always invoked, including on SIGINT and
  errors during the stream loop.

### 4.6 Failure model

| Source | Class | Retryable | Behavior |
|---|---|---|---|
| Plugin name collision | `PluginHostError` | no | reject before any hook fires |
| Throw in `preRun` | `PluginHostError(cause)` | no | abort run, no rules written yet |
| Throw in `systemPrompt` | `PluginHostError(cause)` | no | abort, cleanup written-so-far |
| File write fails | `PluginHostError(cause)` | no | abort, cleanup |
| Throw in `promptPrefix` | `PluginHostError(cause)` | no | abort, cleanup |
| Throw in `interceptEvent` | swallowed | n/a | `logger.warn`; pass original through |
| Throw in `onToolCall` | swallowed | n/a | `logger.warn` |
| Throw in `cleanup` | swallowed | n/a | `logger.warn`; continue cleaning the rest |

### 4.7 Rules-file write protocol (host-side)

1. Resolve `relativePath` against `cwd`. Reject any path that escapes
   `cwd` or is not under `.cursor/rules/` (host throws `PluginHostError`).
2. If the target exists with byte-identical content → no-op (do not
   register a cleanup, the file was already there).
3. If the target exists with different content → rename to
   `<path>.flow-build-bak.<runId>` before writing.
4. Write atomically: write to `<path>.tmp.<runId>`, then `rename`.
5. Track all written paths and any created backups in a run-scoped
   registry.
6. On `cleanup`: delete the file we wrote; restore the backup if any.
   Never touch a file we did not create.
7. Empty parent dirs created during the run (`.cursor/rules`, `.cursor`)
   are removed. Pre-existing dirs are left alone.

### 4.8 Cursor SDK wiring

`Agent.create(...)` is called with `local.settingSources` that includes
`"project"` so the harness loads the materialized
`.cursor/rules/.flow-build-rote.mdc`. If a future plugin requires
additional setting sources, it declares them in
`SystemPromptContribution.requiredSettingSources` (post-v1; not in this
spec).

---

## 5. `@flow-build/rote` package

### 5.1 Layout

```
packages/rote/
├── package.json                    # name: @flow-build/rote
├── src/
│   ├── index.ts                    # exports createRotePlugin
│   ├── plugin.ts                   # the Plugin object factory
│   ├── probe.ts                    # rote CLI probing
│   ├── facts.ts                    # Facts type + assembly
│   ├── render/
│   │   ├── rules.ts                # static rules-file body template
│   │   └── prefix.ts               # dynamic per-run prefix template
│   ├── intercept/
│   │   ├── bypass-patterns.ts      # pattern table
│   │   └── hint.ts                 # synthetic text-event builder
│   └── workspace.ts                # cwd → active workspace inference
└── tests/                          # vitest, all rote shells mocked
```

### 5.2 Public surface

```ts
// packages/rote/src/index.ts
export { createRotePlugin } from "./plugin.js";
export type { RotePluginOptions, RoteFacts } from "./types.js";

export type RotePluginOptions = {
  bin?: string;                     // default "rote"
  probeTimeoutMs?: number;          // default 1500
  hintBypassPatterns?: BypassPatternSet;
  rulesFilePath?: string;           // default ".cursor/rules/.flow-build-rote.mdc"
  enableHints?: boolean;            // default true
  enableProbe?: boolean;            // default true
  exec?: ExecFn;                    // dependency-injection seam for tests
};

export type RoteFacts = {
  version: string | null;
  adapters: Array<{ id: string; fingerprint: string; toolsetCount: number }> | null;
  pendingStubs: Array<{ workspace: string; name: string; adapter: string }> | null;
  flowCount: number | null;
  activeWorkspace: { name: string; path: string } | null;
};
```

### 5.3 `probe.ts`

`preRun` runs these in parallel, each with a hard timeout
(`probeTimeoutMs`), all best-effort. The plugin's `preRun` catches every
probe failure internally and records the corresponding fact as `null`; it
never throws upward (so it never trips the §4.6 abort path). On total
failure (binary missing) the plugin emits one consolidated warn rather
than one per command.

| Command | Captured fact |
|---|---|
| `rote --version` | `version: string` |
| `rote machine inventory --json` | `adapters[]` |
| `rote flow pending list --json` | `pendingStubs[]` |
| `rote flow list --json` | `flowCount: number` |
| (cwd inspection, no shell) | `activeWorkspace` |

If `rote` is not on `PATH`, every shell-derived fact is `null` and one
warn fires: `"rote binary not found"`.

### 5.4 `render/rules.ts` — static body

Sections, in order:

1. Frontmatter — `alwaysApply: true`, `description: "rote workflow guidance"`,
   `globs: "**/*"`.
2. Identity & lifecycle — rote is the engine; lifecycle is search → execute
   → crystallize → reuse; always run `rote flow search "<intent>"` first.
3. Primitives — adapters, workspaces, response cells (`@N`), variables,
   sessions, flows, pending stubs (one line each).
4. Command crib sheet — most-common workflow (~15 lines), grouped by verb.
5. Bypass policy — when you would call `gh`, `curl`, `stripe`, `linear`,
   `supabase`, prefer `rote …`.
6. Pointer block — `rote how`, `rote guidance agent`, `rote man <topic>`.

The template is a TS string. Slots (`${}`) are limited to facts that are
stable across runs (e.g. major-version banner). Per-run dynamic facts go
through the prefix instead so the rules file content is identical across
most runs and the harness's context cache stays warm.

### 5.5 `render/prefix.ts` — dynamic per-run prefix

```
[rote runtime — flow-build]
version: 0.11.4
adapters: 7 (github-api, stripe, linear, …)
flows: 23 indexed; 2 pending stubs in workspaces: github-issues, gmail-recents
active workspace: github-issues  (cwd matches ~/.rote/workspaces/github-issues)
remember: rote flow search "<intent>" before building anything new.
```

- Empty fields are dropped.
- If every fact is `null`, the prefix collapses to a single line:
  `rote unavailable; install with: curl -fsSL https://…/install.sh | bash`.

### 5.6 `intercept/bypass-patterns.ts`

Pure function `classify(toolName, args) → BypassMatch | null`:

| Match | Suggested `rote …` |
|---|---|
| `gh issue \| gh pr \| gh repo …` | `rote flow search "<intent>"` then `rote explore` |
| `curl … github.com` | same |
| `stripe …` | `rote stripe_probe "<intent>"` |
| `linear …` | `rote linear_probe "<intent>"` |
| `supabase …` | `rote adapter catalog search "supabase"` |

Patterns are data, not code; consumers can extend them via
`RotePluginOptions.hintBypassPatterns`.

### 5.7 `intercept/hint.ts`

Builds a synthetic `text` event:

```
\n[rote hint] <one-line> — try: <suggested commands joined with " ; ">\n
```

Surfaced as a normal text delta so it appears inline next to the bash call
that triggered it. No new event type added to core.

### 5.8 `workspace.ts`

Walks `cwd` upward looking for either:
- a path component matching `~/.rote/workspaces/<name>` or
  `$ROTE_HOME/workspaces/<name>`, or
- a `.rote/state.json` marker file.

Returns `{ name, path }` or `null`. Does not parse `state.json`.

### 5.9 Crash recovery

If the process dies between the rules-file write and cleanup, the next
run's `preRun` performs a one-shot scan: any
`<rulesFilePath>.flow-build-bak.*` older than 1 hour gets restored or
deleted. Any orphan `<rulesFilePath>` we own (matched by content header
sentinel) is deleted.

---

## 6. CLI changes

```
packages/cli/src/main.ts
  + import { createRotePlugin } from "@flow-build/rote";
  …
  const plugins = [createRotePlugin({})];
  await runPrompt({ ..., plugins, onEvent: render, logger, signal });
```

- `@flow-build/rote` is a hard dependency of `packages/cli`.
- Test-only env `FLOW_BUILD_DISABLE_PLUGINS=1` short-circuits the array to
  empty for CLI smoke tests. Core never reads this env.

---

## 7. Data flow

```
user types: flow-build run "summarize repo"
    │
    ▼
cli/main.ts
   plugins = [createRotePlugin({})]
   runPrompt({ ..., plugins, onEvent, logger, signal })
    │
    ▼
core.runPrompt(opts)
  validate plugin names unique
  emit {status:"starting"}
  PluginHost.preRun()                   # rote probes in parallel
  PluginHost.systemPrompt()             # rote returns rules content
     host writes <cwd>/.cursor/rules/.flow-build-rote.mdc atomically
     host backs up any pre-existing file at that path
  PluginHost.promptPrefix()             # rote returns dynamic facts block
  prefixed = prefix + "\n\n" + opts.prompt
  withRetry( Agent.create({ local:{cwd, settingSources:["project", ...]} })
             + agent.send(prefixed) )
  for await msg of run.stream():
     events = normalize(msg)
     for each e:
        e' = pluginHost.interceptEvent(e)        # rote may fan out hints
        each e' → opts.onEvent
     if e is tool_*: pluginHost.onToolCall(snap) # rote classifies bypasses
  await run.wait() → usage
  emit {status:"done"}
  PluginHost.cleanup()                  # rote removes its rules file,
                                        #   restores any backup
  return RunResult
```

---

## 8. Testing

### 8.1 `@flow-build/core`

`pluginHost.test.ts` — host orchestration with three fake plugins:

- hook ordering: preRun → systemPrompt → promptPrefix → events → cleanup
- parallel preRun, sequential cleanup in reverse order
- throw in `interceptEvent` is swallowed; original event still emits
- throw in `preRun` aborts; cleanup of already-written rules invoked
- cleanup runs on SIGINT, on stream throw, on completion
- rules-file write protocol — backup, restore, atomic rename, escape-cwd
  rejection — covered in a tmp dir
- plugin name collision rejected before any hook fires

~12 tests.

### 8.2 `@flow-build/rote`

- `probe.test.ts` — fake `exec` returns canned stdout / errors / timeouts;
  facts shape; no probe failure ever throws.
- `render/rules.test.ts` — golden snapshot for fixed facts.
- `render/prefix.test.ts` — table-driven facts → expected prefix string,
  including empty-facts collapse.
- `intercept/bypass-patterns.test.ts` — table-driven matches and negative
  cases (`git`, `npm`, `cargo` never match).
- `plugin.test.ts` — end-to-end with the real host, fake `exec`, fake
  `Agent`: rules file present during run, gone after; hint event fans out
  on a `gh issue list` shell tool result.

~20 tests.

### 8.3 CLI smoke

One added case: rote plugin enabled, fake `exec` returns "rote not
installed", run completes, stderr contains the install hint.

### 8.4 Out of scope

Real `rote` shells out from CI. The probe layer is dependency-injected
exactly so tests can avoid it.

---

## 9. v1 scope

**In:**

- `Plugin`, `RuntimeContext`, `PluginHostError` on core.
- `RunOptions.plugins?: Plugin[]`.
- All hooks: `preRun`, `systemPrompt`, `promptPrefix`, `interceptEvent`,
  `onToolCall`, `cleanup`.
- `@flow-build/rote` with all features in §5.
- CLI always loads the rote plugin.
- `settingSources` includes `"project"`.

**Deferred (post-v1):**

- Multi-turn `Session` API. Plugin lifecycle currently scoped to one
  `runPrompt`. A future `Session` will gate `preRun`/`cleanup` to session
  boundaries and re-fire `promptPrefix` per send.
- Subagents — plugin can render `agents/*.md` definitions when there is a
  matching API.
- MCP — running rote as an MCP server is its own design.
- Disk-based plugin discovery (e.g. `.flow-build/plugins.json`).
- Telemetry / cost-tracking plugin — second consumer of the same API,
  validates the contract is general.
- `SystemPromptContribution.requiredSettingSources` for plugins that need
  more than `"project"`.

---

## 10. Layout impact

```
packages/
├── core/
│   └── src/
│       ├── plugin/                  # NEW
│       │   ├── host.ts              # PluginHost: orchestrates hooks, owns registry
│       │   ├── rules-writer.ts      # atomic write + backup/restore
│       │   ├── types.ts             # Plugin, RuntimeContext, PreRunOutput, …
│       │   └── errors.ts            # PluginHostError
│       ├── types.ts                 # extended: RunOptions.plugins
│       └── run.ts                   # invokes PluginHost at the points in §4.4
└── rote/                            # NEW package per §5
```

No changes to `cli/render.ts`. CLI imports and registers the plugin only
in `main.ts`.

---

## 11. Open follow-ups (post-v1)

- `Plugin.beforeAgentSend(prompt)` mutator — for plugins that want to
  rewrite the user prompt rather than only prefix it.
- Plugin context budgeting — surface a token estimate for the rules file
  and prefix back to plugins so they can self-trim when context is tight.
- Per-plugin enable/disable from disk config.
- `PluginEvent` log channel — structured, on top of `Logger`, for telemetry
  consumers.
- Plugin signing / attestation for distributed plugins.
