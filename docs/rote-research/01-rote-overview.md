# rote — Overview & Purpose

## The problem

Agents solve a task once, then forget. The next agent — same model, same task, next day —
re-explores the API from scratch and burns the same tokens and seconds. Knowledge that
cost thousands of tokens to earn evaporates the moment the session ends.

rote calls this "the replication tax." Traditional agent frameworks optimize for novelty;
once a workflow stabilizes that flexibility is pure overhead.

> "Your agent solved it. Nobody saved the answer. The moment the session ended, it
> vanished. Tomorrow, a different agent starts at zero. rote fixes the amnesia."

## What rote is, conceptually

A **stateless execution runtime + compilation layer** that sits between agents and the
APIs they call. Three roles:

1. **Adapter layer** — wraps any API spec (OpenAPI / GraphQL / gRPC / Google Discovery /
   live MCP server) into a searchable, MCP-compliant tool surface, without running any
   server process.
2. **Workspace layer** — captures every API request, response, query, and variable in a
   sandboxed directory. Responses become numbered, permanent, queryable cells.
3. **Compilation layer** — analyzes a successful trace, prunes failed attempts, parameterizes
   constants, builds a dependency graph, and emits a deterministic shell script (a *flow*).

Everything runs in-process. No daemons, no gateways, no hosted dependencies — adapters and
flows are filesystem artifacts, executed by the rote CLI.

## The five gears

rote describes its operation as five reinforcing capabilities:

| # | Verb | What it does |
|---|------|--------------|
| 1 | **ADAPT** | Index any API spec in ~30s. Expose three virtual tools per adapter: `probe` (semantic search), `call` (execute), `batch_call` (parallel). Agent never reads 300 schemas — it asks `probe` for what it needs. |
| 2 | **PERSIST** | Cache every response as a named cell (`@1`, `@2`, `@3`, …). Re-querying with a different path costs microseconds, not a round trip. Being wrong is free. |
| 3 | **GUIDE** | Inject contextual hints into tool output. On success: suggest the next logical step. On failure: classify the error and propose a recovery. Guidance lives in live output, not stale system prompts. |
| 4 | **CRYSTALLIZE** | Compile a workspace trace into a parameterized, deterministic program. Failed attempts pruned. Constants replaced with typed parameters. API identity fingerprinted. |
| 5 | **SHARE** | Push compiled flows and adapters to a team registry. Other agents — different model, different machine — pull and execute. |

## Key primitives

### Adapter

Local artifact that represents a remote API. Holds a manifest (auth, base URL, fingerprint)
plus an indexed catalog of operations. From the user's perspective it is three tools:

- `<adapter>_probe "<intent>"` — semantic search for matching operations
- `<adapter>_call <tool> '{...}'` — execute one operation
- `<adapter>_batch_call '[ … ]'` — execute many in parallel

Adapter identity is captured in a **fingerprint** so flows can detect API drift.

### Workspace

Sandbox under `~/.rote/workspaces/<name>/`. Created by `rote init`. Holds:

- A chronological command log
- Numbered response files (`@1`, `@2`, …)
- Named variables (`rote set foo=bar`)
- Session state per endpoint
- Token / health metrics

Workspaces are isolated by default — cross-contamination is impossible.

### Response cell

A response cached at index `N`, addressed as `@N`. Queryable instantly with jq-style
syntax: `rote @3 '.result.items[0].name'`. Permanent until the workspace is cleaned.

### Variable

A named value scoped to a workspace. Set explicitly (`rote set repo=rote`) or extracted
from a response (`rote @1 '.id' -s issue_id`). Substituted into request bodies when the
`-t` (template) flag is on.

### Session

An MCP-protocol session against one endpoint, kept alive across calls in a workspace.
Initialized once with `rote init-session <endpoint>`, reused via the `-s` flag on
subsequent requests.

### Flow

A reusable, parameterized script compiled from a workspace. Stored under
`~/.rote/flows/<category>/<name>.sh`. Carries:

- Required positional parameters
- Embedded API fingerprint (drift detection)
- Searchable frontmatter (name, description, domain, tags, I/O contract)
- Health metrics (success rate, last-run, dirtiness)

### Registry

The shared distribution layer. `rote registry adapter push/pull` and
`rote registry flow push/pull` move artifacts between local and an org-scoped server.
Includes orgs, teams, members, and search.

### Pending stub

A marker written during exploration that survives session restarts. Records the
candidate flow name, the workspace it came from, the adapter, the response path used,
and notes. The agent picks it up later via `rote flow pending list` and continues
crystallization without re-exploring.

## What "progressive tool revelation" means in practice

A naïve MCP setup loads every operation of every API into the agent's context window.
GitHub alone has 1,000+ operations — tens of thousands of tokens before the agent has
done anything.

rote replaces that with one virtual probe tool per adapter. The agent describes its
intent in natural language, `probe` returns a ranked shortlist, and only the chosen
operation's schema enters context. Token consumption for tool discovery drops by
roughly 95%.

## The exploit / explore split

| | Exploration (first time) | Exploitation (Nth time, via flow) |
|-|--------------------------|-----------------------------------|
| Time | ~30s | ~2s |
| Tokens | thousands | hundreds |
| Determinism | trial and error | exact reproduction |
| What changes | high variance | parameters only |

The reduction is not a heuristic — it is structural. A flow is a recorded, pruned,
parameterized program. Re-running it does not re-invoke an LLM at all.

## Mental model for first-time users

```
1. DISCOVERY     — agent gets a task
2. WORKSPACE     — rote init <name>            (clean sandbox)
3. EXPLORATION   — probe / call / query        (errors free, all responses cached)
4. CRYSTALLIZATION — rote export <flow>.sh     (compiler prunes + parameterizes)
5. SHARE         — rote registry flow push     (other agents pull and run)
6. REUSE         — flow runs in 2s, no LLM     (until API fingerprint drifts)
```

The shifts from default agent thinking:

- Responses are permanent, queries are free.
- Errors during exploration are valuable signal, not failure.
- Compilation is automatic and deterministic — you never write the flow by hand.
- Knowledge compounds: every crystallized flow is one less thing the next agent figures out.

## Positioning

- **For agents** — embedded guidance (`rote guidance agent`), instant recall, no
  re-exploration variance.
- **For developers** — single binary, no server, composes with Unix pipes.
- **For teams** — knowledge accrues into a searchable registry. Once a flow exists,
  every subsequent execution costs orders of magnitude less time and tokens.

> "rote is the curl + jq of MCP. Like Git for code, rote is for agent workflows: version
> the intelligence, share it, reuse it, keep it from disappearing."
