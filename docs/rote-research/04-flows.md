# Flows

A **flow** is a crystallized, parameterized, reusable workflow — recorded from a working
exploration, compiled by stripping failed attempts and replacing constants with parameters,
and stored as a deterministic shell script under `~/.rote/flows/`.

> Conceptually: a flow is a *compiled execution trace*. Not code an agent wrote — code
> rote produced from things that demonstrably worked.

---

## How flows fit with adapters and sessions

| Primitive | Lifetime | Role |
|---|---|---|
| **Adapter** | Persistent on disk | Indexed catalog of API operations |
| **Session** | Per workspace | Live MCP connection state for one endpoint |
| **Flow** | Persistent, portable | A reusable program that opens its own sessions and calls adapters with parameters |

A flow contains its own session initialization. Running a flow does not require a
pre-existing workspace — it creates a fresh one each time.

---

## The flow lifecycle

```
        ┌─────────┐          ┌────────────┐         ┌─────────────┐
search  │  flow   │  miss →  │ workspace  │  ──→    │  exploration│
─────►  │ search  │          │  init/     │         │  (probe,    │
        └─────────┘          │  set vars  │         │   call, @N) │
             │ hit            └────────────┘         └─────┬───────┘
             ▼                                              │
        ┌─────────┐          ┌────────────┐         ┌──────▼──────┐
exec    │ rote    │   ◄─── reuse  ──────  │  release   │ ◄───   crystallize  │
        │ flow run│          │ → registry │         │ rote export │
        └─────────┘          └────────────┘         └─────────────┘
```

Five phases:

1. **Search** — `rote flow search "<intent>"`. If a reusable flow exists, stop here.
2. **Capture** — open a workspace, declare variables, run requests.
3. **Crystallize** — `rote export <name>.sh --params …`. Compiler prunes errors,
   parameterizes, fingerprints, generates a clean script.
4. **Release** — `rote flow release <name>` (and `rote flow index --rebuild`) to make
   the flow visible to search.
5. **Reuse** — execute with new parameters, compose with pipes, push to the registry.

---

## Searching for flows

```bash
rote flow search "fetch github issues"
rote flow search "summarize text"
rote flow search "create gmail draft" --explain
```

The search index covers every flow's frontmatter:

- Name (heavy weight)
- Description
- Tags / domain (heavy weight)
- Parameter names
- I/O contract (input shape, output shape)

`--explain` prints the relevance score breakdown.

> **Default rule**: always search before building. A reusable flow may already exist —
> the rote skill enforces this in agents.

---

## Capturing a flow (exploration)

### 1. Init a workspace

```bash
rote init my-github-flow --seq
eval $(rote cd my-github-flow)
```

`--seq` runs sequentially (predictable for compilation); `--par[=N]` allows parallelism.

### 2. Declare variables

Use `rote set` for values you intend to parameterize later. This signals the compiler
to lift them into the parameter list during export.

```bash
rote set owner=myorg
rote set repo=rote
```

### 3. Open a session

```bash
rote init-session /github           # or for adapter form:
rote init-session adapter/github
```

### 4. Make requests with templates

```bash
rote POST /github '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"github_search_issues",
    "arguments":{"owner":"$owner","repo":"$repo"}
  }
}' -t -s
```

`-t` enables `$var` substitution. `-s` reuses the active session. Result is `@1`.

### 5. Query and chain

```bash
rote @1 '.result.items[] | {title, number}' -r
rote @1 '.result.items[0].number' -s first_issue
rote github_call issues/get '{"owner":"$owner","repo":"$repo","number":"$first_issue"}' -t -s
```

Errors during this phase are *cached and pruned at export time*. Free experimentation.

---

## Exporting (compilation)

```bash
rote export ~/.rote/flows/github/fetch-issues.sh --params owner,repo
```

The compiler:

1. **Parses** the workspace command log; drops anything marked `skip_export: true`
   (errors and retries).
2. **Renumbers** dirty IDs (`@4`, `@7` …) to clean sequential ones (`@1`, `@2` …).
3. **Validates** that all references resolve and there are no cycles.
4. **Generates** a bash script with parameter binding, parameter-aware error messages,
   and substitution wired in.
5. **Fingerprints** the involved adapters so downstream runs can detect drift.

Useful flags:

| Flag | Effect |
|---|---|
| `--params p1,p2` | Required positional parameters |
| `--description "<text>"` | Human description in frontmatter |
| `--tag <T>` (repeatable) | Searchable tags |
| `--atomic` | Mark the flow as a single-domain atomic (recommended; composes via pipes) |
| `--release` | Mark released on export (skip the manual release step) |

---

## Generated script shape

```bash
#!/usr/bin/env bash
# Flow: fetch-issues
# Description: Fetch GitHub issues for a repository
# Endpoints: /github
#
# Parameters:
#   owner (required) — Repository owner
#   repo  (required) — Repository name

set -euo pipefail

OWNER="${1:?Error: owner is required}"
REPO="${2:?Error: repo is required}"

rote init-session /github
rote POST /github '{ … "$OWNER" … "$REPO" … }' -s
rote @2 '.result.issues[].title' -r
```

Frontmatter (in JSDoc-style or YAML) carries:

- `name`, `description`, `domain`
- `parameters` (name, type, required)
- `composable: true|false` — whether stdout is pipe-friendly
- API fingerprint
- Provenance (model, profile)

---

## Running a flow

### Direct execution (current)

```bash
~/.rote/flows/github/fetch-issues.sh modiqo rote
```

The script provisions its own workspace, runs the recorded steps with parameter
substitution, and prints results.

### `rote flow run` (preferred)

```bash
rote flow run github/fetch-issues modiqo rote
rote flow run github/fetch-issues --dry-run         # plan only
rote flow run github/fetch-issues --resume <id>     # resume after partial failure
```

Adds DAG-aware step execution, health metrics, confidence tracking, and resumable runs.

### Decompile / replay (debugging)

```bash
rote decompile ~/.rote/flows/github/fetch-issues.sh --output trace.log --verbose
rote replay owner=modiqo repo=rote
```

`decompile` reverses the compiler — useful for diffing against a fresh exploration.
`replay` reruns a decompiled trace with new parameter values.

---

## File layout

```
~/.rote/flows/
├── github/
│   ├── fetch-issues.sh
│   ├── create-issue.sh
│   └── search-code.sh
├── gmail/
│   ├── fetch-recent.sh
│   └── create-draft.sh
└── composite/
    └── github-to-gmail.sh
```

Flows are organized by domain. `composite/` holds multi-domain wrappers that compose
atomic flows.

---

## Composing flows

> Unix philosophy: small atomic flows + pipes > monolithic mega-flows.

```bash
~/.rote/flows/gmail/fetch-recent.sh 10 \
  | jq -r '.[].body' \
  | ~/.rote/flows/parallel/summarize-text.sh \
  | ~/.rote/flows/calendar/create-event.sh "Email summary"
```

The export compiler emits a warning if it detects a multi-domain flow:
`[SUGGESTION] Multi-domain flow detected. Consider --atomic.`

Atomic-first patterns:

1. Search for atomics (`rote flow search "fetch emails"`).
2. Build only the missing atomics, one domain per flow.
3. Compose via stdout / stdin.

Benefits: dry, discoverable, maintainable, token-efficient.

---

## Pending stubs

Long explorations may end before a flow is finalized. `rote flow pending` is the
resumption protocol:

```bash
# during exploration
rote flow pending write my-task \
  --name list-repo-issues \
  --adapter adapter/github \
  --response-path '.items' \
  --notes "GitHub envelope; uses $owner/$repo"

rote flow pending save my-task
# → emits: rote flow template create --name list-repo-issues --adapter adapter/github

# next session
rote flow pending list
# returns the stub; agent picks up where it left off
```

Stubs survive session restarts and context compression.

---

## Health & quality

```bash
rote flow list --unhealthy
rote flow doctor                       # all flows
rote flow health <path>                # one flow
rote flow stats <path> --show-errors
rote flow validate <path> --fix
```

Health signals:

- **Skip ratio** — fraction of pruned attempts in the source workspace
- **Dirtiness** — duplicate / overwritten state
- **Anti-patterns** — flagged via `rote detect`
- **Drift** — fingerprint mismatch with the live adapter
- **Success rate** — over recent runs

Unhealthy flows surface in `rote flow list --unhealthy`.

---

## Scaffolding helpers

| Command | Use |
|---|---|
| `rote flow template create --name <N> --adapter <A>` | Bootstrap a new flow from a stub. |
| `rote flow frontmatter --name <N> --adapter <A>` | Generate just the frontmatter block. |
| `rote flow bless <name>` | Approve write permissions on a flow. |
| `rote flow release <name>` | Promote draft → released (visible to search). |

---

## Sharing & registry

```bash
rote registry flow push ~/.rote/flows/github/fetch-issues.sh my-org --check-deps
rote registry flow pull my-org/fetch-issues
rote registry flow search "github issues"
rote registry flow info my-org/fetch-issues
```

`--check-deps` ensures every adapter the flow references is itself published.

---

## Performance shape

For the same task, run N times:

| | Without flows | With flows |
|---|---|---|
| Time | N × ~30–45s exploration | 1 × ~45s + (N − 1) × ~2s |
| Tokens | N × thousands | 1 × thousands + (N − 1) × ~250 |
| Variance | high | zero |

Crystallization is the single point at which an LLM is involved; every subsequent run is
deterministic shell.

---

## Mental shortcut

```
search    → rote flow search "<intent>"
capture   → rote init <ws> --seq;  rote set …;  rote POST/GET … -t -s;  rote @N '…'
export    → rote export <path>.sh --params a,b --tag t [--atomic] [--release]
run       → rote flow run <flow> <args…>     # or path/to/flow.sh args…
share     → rote registry flow push <flow> <org>
compose   → small atomics + Unix pipes
```
