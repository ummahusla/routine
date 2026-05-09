# rote + pi-rote Research

Comprehensive reference for the **rote** CLI and the **pi-rote** Claude Code plugin.
Scope: CLI surface, user-facing primitives, integration model. No source-level internals.

## What this is

Two sibling projects:

- **rote** — a stateless CLI that wraps APIs and MCP servers as searchable adapters,
  caches every response in numbered cells, and compiles successful exploration traces
  into reusable parameterized flows.
- **pi-rote** — a thin pi (Claude Code) plugin that injects rote-first guidance into
  the agent prompt, bundles the canonical `rote` and `rote-adapter` skills, and hints
  the model toward rote when it would otherwise call APIs directly.

rote is the engine. pi-rote is the guidance layer. They are independent — rote works
without pi-rote, pi-rote requires rote on `PATH`.

## Core mental model

```
   discover  →  execute  →  cache  →  crystallize  →  reuse
   (search)     (probe/      (@1,      (export →     (rote flow
                 call)        @2 …)     flow.sh)      run / pipe)
```

Every API response becomes a queryable cell. Successful traces become parameterized
flows. Flows are searchable, shareable, and replace re-exploration with deterministic
re-execution.

## Reading order

| # | Doc | Purpose |
|---|-----|---------|
| 1 | [01-rote-overview.md](./01-rote-overview.md) | What rote is, the problem it solves, primitives, value proposition |
| 2 | [02-rote-cli.md](./02-rote-cli.md) | Complete CLI command reference, grouped by domain |
| 3 | [03-adapters.md](./03-adapters.md) | Adapter lifecycle: discover, install, authenticate, call, share |
| 4 | [04-flows.md](./04-flows.md) | Flow lifecycle: search, capture, export, run, compose |
| 5 | [05-pi-rote-overview.md](./05-pi-rote-overview.md) | What pi-rote is, the skills system, manifest format |
| 6 | [06-integration.md](./06-integration.md) | How rote + pi-rote integrate end-to-end |
| 7 | [07-quickstart-recipes.md](./07-quickstart-recipes.md) | Common task patterns from CLI |

## Key primitives at a glance

| Primitive | One-line definition |
|-----------|---------------------|
| **Adapter** | An API spec (OpenAPI / GraphQL / gRPC / Discovery / MCP) installed locally and exposed as three virtual MCP tools: `probe`, `call`, `batch_call`. |
| **Workspace** | A sandboxed execution directory under `~/.rote/workspaces/<name>/`. Captures every command, response, variable. |
| **Response cell** | Numbered cached response (`@1`, `@2`, …) inside a workspace. Queryable with jq-style syntax. Permanent. |
| **Variable** | Named workspace value set via `rote set` or extracted via `-s`. Substituted in templated requests with `-t`. |
| **Session** | An MCP connection state for one endpoint inside a workspace. Reused across calls via `-s`. |
| **Flow** | A parameterized, deterministic script compiled from a workspace trace. Lives under `~/.rote/flows/`. |
| **Pending stub** | A scaffolding marker created during exploration that survives session restarts and resumes flow crystallization. |
| **Registry** | Shared org-scoped distribution layer for adapters and flows (`rote registry …`). |
| **Skill** | A markdown manifest (frontmatter + body) that teaches an agent how to use a tool. Discovered by Claude Code / pi via slash commands and the Skill tool. |

## At what layer does each command operate

```
              ┌───────────────────────────────────────────────┐
   user/agent │  rote flow search   rote explore              │  discovery
              ├───────────────────────────────────────────────┤
              │  rote init / cd / where / ls / clean          │  workspace
              ├───────────────────────────────────────────────┤
              │  rote init-session / tools / @N / set / vars  │  exploration
              │  rote POST/GET/PUT/DELETE                     │
              │  rote <adapter>_probe / _call / _batch_call   │
              ├───────────────────────────────────────────────┤
              │  rote export / decompile / replay             │  crystallization
              ├───────────────────────────────────────────────┤
              │  rote flow run / list / health / validate     │  reuse
              │  rote registry flow push / pull / search      │
              ├───────────────────────────────────────────────┤
              │  rote adapter new / install / list / set      │  adapter mgmt
              │  rote adapter catalog / policies / reindex    │
              ├───────────────────────────────────────────────┤
              │  rote oauth / token / login / profile         │  auth
              └───────────────────────────────────────────────┘
```

See [02-rote-cli.md](./02-rote-cli.md) for the full command tree.
