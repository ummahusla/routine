---
name: rote
description: >
  Use rote BEFORE calling any MCP server or CLI tool directly. rote wraps installed adapters
  (MCP servers and CLI-based tools) and adds flow reuse, response caching, and crystallized
  workflows. Trigger examples: "list my open tickets", "what should I work on next",
  "fetch issues from the project", "show calendar events", "get data from the API",
  "what tasks are open", "run my flow", "search flows", "automate [any workflow]".
  Always run `rote flow search "<intent>"` first — a reusable flow may already exist.
  Run `rote how` to see the full onboarding guide.
---

# rote - Adapter Workflow Orchestration

rote sits in front of your adapters — both MCP servers and CLI-based tools. Instead of calling
adapter tools directly, use rote — it checks for reusable crystallized flows first, caches
responses, and tracks what works.

## TOP PRIORITY (flow-build harness): use the `rote_exec` MCP tool, NOT bash

When running inside the flow-build harness, the host's bash shell tool **hangs indefinitely on
rote invocations** (a known interaction bug between rote and the underlying SDK shell). It will
issue `tool_start`, never produce `tool_end`, and the turn stalls forever.

The harness ships a dedicated MCP server `rote-exec` that exposes a single tool:

- **`rote_exec`** — runs a rote command via spawned subprocess and returns
  `{ ok, stdout, stderr, exitCode, durationMs, timedOut, truncated }` as JSON.

Always call rote through this MCP tool. Do NOT call rote via the bash shell tool.

```
mcp tool call: rote-exec / rote_exec
arguments:
  command: 'rote flow search "polymarket"'
  timeoutMs: 30000   # optional; default 60000, max 600000
  cwd: '/path'       # optional; defaults to session workspace
```

The tool only accepts commands beginning with `rote ` — it is rote-only by design.
Output is capped at 1 MB (the `truncated` flag is set if you hit the cap).

If you find yourself about to issue `bash { command: "rote ..." }` — STOP and use `rote_exec`
instead. Every code path, every example below, every `rote ...` line — route through `rote_exec`.

### Reading code blocks in this skill

Examples below appear in two fence styles:

- ```` ```rote-exec ```` — every line is the literal `command` arg to `rote_exec`. Pipe
  characters, env vars, and shell redirects all work because the harness invokes the line
  via a subshell internally. **Never run these via the bash tool.**
- ```` ```bash ```` — true shell snippets. Lines that begin with `rote ` inside a `bash`
  block are still flagged with a `# Each \`rote ...\` line below: call via rote_exec MCP
  tool, not bash.` annotation; treat those lines the same as `rote-exec` blocks.

If you ever feel the urge to copy a `rote ...` line into a bash tool call, you are about
to trigger the hang. Re-route through `rote_exec`.

## CRITICAL: Prefer rote over direct adapter calls

**If you have called any MCP server or CLI tool directly in this project before, STOP.**
rote wraps those same adapters. Calling them directly bypasses flow reuse and response caching.

**Before calling any adapter tool directly, run:**

```rote-exec
rote flow search "<your intent>"
```

If a flow exists → run it. It calls the same adapter tools, but faster, cached, and reusable.
If no flow exists → use rote to explore and crystallize one.

## MANDATORY: Keep MEMORY.md in sync with rote adapter state

Write or update a `rote` memory entry whenever:
- You use rote successfully for the first time in a project
- An adapter is installed (`rote adapter new` / `rote adapter install`)
- An adapter is removed or updated
- A new flow is crystallized and released

Memory entry format:

```
rote is installed and working in this project.
ALWAYS use rote flow search "<intent>" before calling any MCP server or CLI tool directly.
If no flow and no installed adapter matches, run `rote adapter catalog search "<intent>"`
before falling back out-of-band — the catalog may have an installable adapter.
Installed adapters: [current output of `rote adapter list`]
Crystallized flows: [current output of `rote flow search ""`]
```

Keeping this current prevents the bias reversal problem where stale memory of direct MCP usage
makes future sessions skip rote entirely, or where a removed adapter still gets attempted.

## Discovery sequence — check the catalog BEFORE falling back out-of-band

If `rote flow search "<intent>"` and `rote explore "<intent>"` both come up empty, DO NOT
jump straight to WebFetch / direct MCP / curl. Those search *already-installed* adapters
only — they say nothing about what's available to install. Run one more step first:

1. **Search the installable adapter catalog:**
   ```rote-exec
   rote adapter catalog search "<intent>"       # e.g. "weather", "prediction markets", "stripe"
   rote adapter catalog info <id>               # details on a hit
   ```

   The catalog lists first-party and curated community adapters with ready-to-go specs.
   If a hit exists, install it non-interactively and continue:
   ```rote-exec
   rote adapter new <id> --yes
   rote adapter info <id>                       # sanity-check Base URL is the API host;
                                                # if wrong (e.g. points at the spec-hosting URL):
                                                #   rote adapter set <id> base_url <correct-url>
   rote <id>_probe                              # list tools in the newly-installed adapter
   rote <id>_call <tool> '<json-args>'          # invoke one
   ```

   **Post-catalog-hit discipline:** if `rote adapter catalog search` returns ≥1 match,
   the **next rote command MUST be** `rote adapter catalog info <id>` or
   `rote adapter new <id>` for one of the hits. Do NOT run another `rote flow search`,
   `rote explore`, or `rote adapter catalog search` — those are discovery tools and you
   have already discovered. Retrying discovery after a hit is how agents drift off-task.
   Same rule for `rote flow search`: a `No flows directory found` / empty result means
   "no flows at all," not "bad query" — advance to the next step, do not retry with a
   different query string.

2. **Only if the catalog has nothing** for the intent, AND the user has not given you an
   explicit spec URL, fall back out-of-band:

   - **Tell the user explicitly:**
     ```
     rote has no adapter installed or catalogued for this type of request.
     rote adapter list shows: [list installed adapters]
     rote adapter catalog search "<intent>" shows: [catalog hits, or "no matches"]

     To handle this in rote, you would need to install an adapter for [the service]
     from an OpenAPI / Google Discovery / MCP spec.
     ```

   - **Offer the out-of-band path:**
     ```
     I can handle this outside rote using [direct MCP / available CLI tool] if you prefer,
     but the result won't be cached or crystallizable into a reusable flow.
     How would you like to proceed?
     ```

   - **Wait for user confirmation** before falling back — do not auto-decide.

Skipping step 1 is the most common failure mode — an empty `rote explore` is NOT evidence
that no adapter exists, only that none is installed yet.

## Inspecting installed adapter + workspace state — use rote, never `cat` / `ls`

To debug or inspect rote state (adapter config, workspace contents, cached
responses), use the rote surface. **Do not** `cat`, `ls`, `find`, or hand-edit
files under `${ROTE_HOME}/adapters/` or `${ROTE_HOME}/**/workspaces/<name>/.rote/`.

| Goal                                       | Use                                          |
|--------------------------------------------|----------------------------------------------|
| Summary of adapter config + health         | `rote adapter info <id>`                     |
| List installed adapters                    | `rote adapter list`                          |
| List tools this adapter exposes            | `rote <id>_probe` (inside a workspace)       |
| Validate a `.adapt` archive before install | `rote adapter check <file.adapt>`            |
| Discover which adapter fields are mutable  | `rote adapter keys <id>`                     |
| Update a mutable adapter field (`base_url`, `description`, `tags`, `additional_headers.*`, …) | `rote adapter set <id> <key> <value>` — validated, fingerprint-stable; see **Command Reference → Adapter Configuration** for the full list. For **secret** `additional_headers.*` values, write a `${TOKEN_NAME}` reference (e.g. `'${X_API_SECRET}'`) — the executor resolves it from the token store / environment at request time, never persists the cleartext. |
| List cached responses (`@1`, `@2`, …) in a workspace | `rote ls`                            |
| Inspect the current workspace (meta, seq, adapters) | `rote workspace inspect`            |
| Extract a field from a cached response     | `rote @<N> '<jq>' -r` (e.g. `rote @7 '.content[0].text \| fromjson \| .result.message_id' -r`) |

**Do NOT:**
- `cat ${ROTE_HOME}/adapters/<id>/manifest.json` — use `rote adapter info <id>` to read it.
- Hand-edit / `python -c` / `sed -i` `manifest.json`, `spec.json`, `config/*.json`, `runtime/*.json`
  to change adapter fields. Use `rote adapter set <id> <key> <value>` — it validates the value and
  preserves the adapter fingerprint. Raw writes skip validation and can break flows silently.
- `rote adapter remove` + `rote adapter new` just to change `base_url` (multi-tenant re-point)
  or tweak `description` / `tags`. Recreating regenerates the adapter fingerprint and orphans
  every crystallized flow that references the adapter. Mutate in place with `rote adapter set`.
- `ls` / `ls -la` / `find` inside `.rote/responses/` or any workspace dir — use
  `rote ls` and `rote workspace inspect`. The filesystem layout is an implementation
  detail; rote-side commands survive schema changes.
- `rote @N … | python3 -c "import json…"` to parse a response — use the built-in
  jq pipeline (`rote @N '.path.to.field | fromjson' -r`). `rote` already decodes
  doubly-encoded MCP content blocks when you use `fromjson`.
- `curl` an adapter's base URL directly, even if it's a localhost URL shown by
  `rote adapter info`. The URL is an implementation detail of the adapter wiring;
  all traffic goes through `rote <id>_call`. If `rote <id>_call` fails because
  the adapter's `base_url` is wrong, fix it with `rote adapter set <id> base_url <url>`
  — not curl.
- `export TOKEN=$(rote token get …)` to shove secrets into shell env — rote injects
  them from the vault at call time; the agent never needs the raw string.


## When to Use rote

**Always use rote when the user asks about:**
- Tickets, issues, tasks, or priorities from any project tracker ("what should I work on", "list open issues")
- Repos, pull requests, commits, or reviews from any code host ("show open PRs", "list issues")
- Pages, databases, or entries from any workspace tool
- Calendar events or meetings from any calendar adapter
- Any data fetch from an API that has a rote adapter installed
- Any workflow the user has asked about before (a flow may already be crystallized)

**Also use rote for:**
- Caching API responses for repeated queries
- Exporting reusable parameterized flows
- Browser automation via Playwright
- Tracking model performance across workflows

**When NOT to use rote:**
- Tasks with no API involved (pure local file manipulation, math, writing)
- When you need real-time streaming responses (rote caches responses)

## Task Execution Flow (CRITICAL - Follow This Order)

**ALWAYS follow this 5-step flow for any rote task:**

### Step 1: Search for Existing Flows FIRST

Before doing ANYTHING else, search for a reusable flow:

```rote-exec
rote flow search "your intent here"
```

Examples:

```rote-exec
rote flow search "fetch emails"
rote flow search "list github issues"
rote flow search "calendar events"
```

**If a flow is found** → Execute it directly from `/tmp`:

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
cd /tmp

# For .sh flows (shell scripts):
${ROTE_HOME:-$HOME/.rote}/flows/{endpoint}/{name}.sh [args]

# For .ts flows (TypeScript) - CRITICAL: use rote deno:
rote deno run --allow-all ${ROTE_HOME:-$HOME/.rote}/flows/{endpoint}/{name}.ts [args]
```

**CRITICAL for .ts flows**: Do NOT execute TypeScript files directly or use system `deno`. Deno is managed by rote and is NOT on the system PATH. **ALWAYS** use `rote deno run --allow-all` to run TypeScript flows. The `rote` binary itself IS on the system PATH — never prefix it with `~/.rote/bin/`.

**Why `/tmp`?** Flows create temporary workspaces internally. Running from `/tmp` ensures you're outside `~/.rote/rote/workspaces/`.

**Alternative: Run with model tracking** (for analytics):

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
# 1. Create and enter workspace (required for @N storage)
rote init my-task --seq
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/my-task

# 2. Execute the flow with model tracking (results stored as @1, @2, ...)
rote run --inference-id $(uuidgen) \
  --model claude-sonnet-4-5 \
  --model-type chat \
  --model-version 20250514 \
  ${ROTE_HOME:-$HOME/.rote}/flows/{path}/flow-name.sh [params]

# 3. Query the cached results
rote @1 '.result' -r
```

**Model tracking flags** (required for `rote run`):

- `--inference-id`: Unique ID for this execution (use `$(uuidgen)`)
- `--model`: Model name (e.g., `claude-sonnet-4-5`, `gpt-4-turbo`)
- `--model-type`: Model type (e.g., `chat`, `completion`)
- `--model-version`: Model version string

**If no flow found** → Continue to Step 2.

### Step 2: Discover the Right Adapter

Use `rote explore` to find which adapter(s) can handle the task:

```rote-exec
rote explore "your intent here"
```

Examples:

```rote-exec
rote explore "fetch recent messages"    # → messaging adapter
rote explore "list repositories"        # → code host adapter
rote explore "create calendar event"    # → calendar adapter
rote explore "list open tickets"        # → project tracker adapter
```

This tells you which adapter(s) have relevant capabilities and whether it's a single-adapter or cross-adapter task.

### Step 3: Route Based on Adapter Count

**Before spawning anything**, check whether a subagent exists for the adapter:

```rote-exec
rote adapter agent list
```

Look at the `Agent` column. If it says `no` — do NOT spawn. Handle everything directly in the main skill.

**Single adapter WITH agent** → Spawn the specialized subagent AT THE START, before any workspace work:

```text
rote explore "fetch messages" → shows messaging adapter
rote adapter agent list → messaging adapter shows Agent: yes
→ Spawn: rote-<adapter-id> agent with the full task (hand off immediately)

rote explore "list tickets" → shows project tracker adapter
rote adapter agent list → project tracker shows Agent: yes
→ Spawn: rote-<adapter-id> agent with the full task (hand off immediately)
```

**Single adapter WITHOUT agent** → Handle directly in main skill (do not spawn):

```text
rote explore "query data" → shows an adapter
rote adapter agent list → adapter shows Agent: no
→ Stay in main skill, run the task directly in bash
→ Generate agent: rote adapter agent generate <adapter-id> (then rote install skill --agents)
```

**Multiple adapters** → Handle orchestration in main skill:

```text
rote explore "sync issues to docs" → shows linear AND notion
→ Stay in main skill, orchestrate both adapters
```

**CRITICAL — never spawn mid-workflow**: The subagent decision is made ONCE at the start, before any `rote init` or workspace work. If you are already in a workspace and hit a write-guard wall or any other obstacle, do NOT spawn a subagent — a new subagent creates a fresh workspace and loses all cached responses and session state from the current workspace.

**Follow-up requests — workspace continuity**: Claude Code does not have `SendMessage`. Subagents are fire-and-forget. For follow-up requests to the same adapter, spawn a new subagent but **lead the prompt with a re-entry block** so the subagent skips `rote init` and goes straight to the existing workspace:

```text
User: "list all projects"
  → spawn rote-supabase-mcp, it creates workspace: supabase-list-projects
  → subagent completes, returns results

User: "now list all tables in rote project"
  → spawn new rote-supabase-mcp with prompt that STARTS with:

    "EXISTING WORKSPACE — DO NOT run rote init, DO NOT create a new workspace.
     Step 1: cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/supabase-list-projects
     Prior context: [what was already done, key variables like project_id]
     New task: [the follow-up task]"
```

The subagent's Workflow Step 1 checks for this block and skips `rote init` when it's present. All cached responses (`@1`, `@2`, etc.) are still on disk.

### Step 4: Execute in Workspace

Run `rote init`, enter the workspace, **immediately set the model identity (CHECK 0)**, then probe, call, query responses. The last two commands you run before leaving the workspace are always steps 4a and 4b — non-negotiable.

```rote-exec
rote init <name> --seq
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/<name>
rote model set <model> --provider <provider>      # CHECK 0 — mandatory, or flow records "model: not-captured"
```

Skipping `rote model set` is the single most-missed protocol step — `rote start` CHECK 0 exists for it. Workflow judges flag a missing `model set` after `rote init --seq` as a protocol failure even when the rest of the task succeeds.

#### Step 4a: Write Pending Stub (LAST ACTION IN WORKSPACE — before any output to user)

**Do this before typing a single word of results to the user.** This is not a post-task cleanup step — it is the final action inside the workspace execution, immediately after you have validated the response path.

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
rote flow pending write <workspace> \
  --name <suggested-slug> \
  --adapter <adapter-id> \
  --response-path "<validated jq path>" \
  --notes "<encoding quirks, data shape notes>"
```

The stub survives context compression and session restarts. If the user gets distracted and comes back later, the workspace context is still recoverable. **Without the stub, it is gone.**

#### Step 4b: Generate Scaffold Command (IMMEDIATELY after 4a — still before output to user)

```rote-exec
rote flow pending save <workspace>
```

This prints the pre-filled `rote flow template create` command. **Capture this output.** You will include it in your response.

Backstop: `rote ls` and `rote workspace health <workspace>` emit `[MANDATORY PROTOCOL]` warnings when the stub is missing. Act on any such warning before presenting results.

### Step 5: Present Results and Ask to Save (MANDATORY — never auto-crystallize)

Only now do you write your response to the user. Include the results **and end with an
explicit yes/no question**:

```
Results: <summary of findings>

Want to save this as a reusable flow? (yes/no)
  Scaffold command ready — I'll run it for you if you confirm.
```

**CRITICAL — STOP and wait for the user's reply.** Do not run `rote flow template create`,
do not crystallize, do not discard the stub, and do not begin any follow-up work until the
user answers. Auto-crystallizing without an explicit "yes" is a protocol violation — the
stub is a question, not permission.

**If the user says yes** — you run the full save sequence yourself, do not instruct the user to run commands manually:

```rote-exec
# 1. Run the scaffold command from pending save output
rote flow template create --name <slug> --adapter adapter/<id> --workspace <ws> ...

# 2. Test the flow
rote deno run --allow-all ${ROTE_HOME:-$HOME/.rote}/flows/<slug>/main.ts

# 3. Discard the stub
rote flow pending discard <workspace>

# 4. Tell the user: "Flow saved at ${ROTE_HOME:-$HOME/.rote}/flows/<slug>/main.ts and tested successfully."
```

**If the user says no** → `rote flow pending discard <workspace>` and move on.

If the session is interrupted and the user returns later, run `rote flow pending save <workspace>` again to retrieve the scaffold command — then ask the same yes/no question again.

**The order is non-negotiable:**
```
workspace execution → pending write → pending save → present results → ASK (yes/no)
  → WAIT for user reply
  → if yes: run scaffold + test + discard
  → if no:  discard
```

## Subagent Routing

rote has specialized subagents for each installed adapter. After discovering the adapter via `rote explore`, spawn the appropriate subagent.

### Single-Adapter Tasks → Spawn Subagent

```text
User: "Get my 10 most recent messages"
1. rote flow search "fetch messages" → no results
2. rote explore "fetch recent messages" → messaging adapter
3. Spawn: rote-<adapter-id> agent

User: "Create an issue for the bug"
1. rote flow search "create issue" → no results
2. rote explore "create issue" → project tracker adapter
3. Spawn: rote-<adapter-id> agent

User: "Show me my API costs for the last week"
1. rote flow search "analytics" → archive-analytics flow
2. Spawn: rote-analytics agent
```

### Cross-Adapter Tasks → Stay in Main Skill

```text
User: "Send me a summary of my upcoming events"
1. rote flow search "events summary notification" → no results
2. rote explore "calendar events" → calendar adapter
   rote explore "send message" → messaging adapter
3. Stay in main skill (requires BOTH calendar AND messaging)
4. Orchestrate: fetch events, compose summary, send
```

### Available Subagents

Run to see installed adapter subagents:

```rote-exec
rote adapter agent list
```

The available subagents depend on which adapters you have installed. Each installed adapter with
an `agent.md` file gets a corresponding `rote-<adapter-id>` subagent. Run `rote adapter agent list`
to see the full list with their capabilities.

### Write-Guard in Subagent Context

When a subagent hits a write-guard confirmation wall, it pauses and surfaces the token to the orchestrating agent. The orchestrating agent must get approval from the user and **resume the same subagent** — not spawn a new one.

**CRITICAL: A paused subagent has a workspace, cached responses, and an active session. Spawning a new agent creates a fresh workspace and loses all of that context permanently.**

#### Correct protocol (orchestrating agent)

1. Subagent returns a `confirmation_required` result with a `confirm_token` and workspace path
2. Use `AskUserQuestion` to present the impact and token to the user
3. If user approves: spawn a **new** subagent with the token and workspace path — it re-enters the existing workspace and retries

**Claude Code does not have `SendMessage`** — subagents are fire-and-forget. You cannot resume a paused agent. Instead, pass the workspace path and token to a new subagent:

```text
Subagent pauses:
  @@result contains:
    confirm_token: <token>
    workspace: ~/.rote/rote/workspaces/<workspace-name>   ← copy verbatim

Orchestrator:
  → AskUserQuestion: "Write guard requires approval for '<tool>'. Token: <token>. Approve?"
  → User approves
  → Spawn new subagent with prompt:
    "Re-enter existing workspace: cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/<workspace-name>
     All cached responses (@1, @2, etc.) are still on disk.
     Retry the blocked call verbatim with --confirm <token> appended.
     Then continue the flow from where it left off — pending write → pending save → results."
```

#### Wrong protocol — NEVER do this

```text
Subagent pauses with confirmation_required
  → Orchestrating agent spawns new subagent WITHOUT passing workspace path   ✗ WRONG
  → New agent creates a fresh workspace, loses all cached responses           ✗ Lost context

Correct: spawn new subagent WITH the workspace path from the @@result block
  → New agent re-enters existing workspace: cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/<name>
  → Retries with --confirm <token>, all @N responses still accessible
```

## Getting Started

### Step 1: Run rote how

Always start by running `rote how` to see the complete onboarding flow:

```rote-exec
rote how
```

This shows a 5-step tree:
1. Read protocol (`rote start`)
2. Read essential guidance (`rote guidance agent essential`, `rote guidance adapters essential`, `rote guidance browser essential`)
3. Learn command syntax (`rote grammar <topic>`)
4. Understand architecture (`rote machine <topic>`)
5. Ready to execute

For a compact version:
```rote-exec
rote how --compact
```

For pure ASCII tree (no colors):
```rote-exec
rote how --tree
```

### Step 2: Read Protocol Requirements

Run `rote start` to see mandatory agent protocol requirements:

```rote-exec
rote start
```

This shows:
- Three mandatory checks before starting any task
- Flow search patterns (don't rebuild existing flows!)
- Endpoint selection guidance
- Required reading list

### Step 3: Read Essential Guidance

Read the core guidance documents:

```rote-exec
# Core agent patterns (700 lines)
rote guidance agent essential

# TypeScript complexity tiers (400 lines)
rote guidance typescript essential

# Adapter probe/call patterns
rote guidance adapters essential

# Browser automation patterns
rote guidance browser essential
```

### Step 4: Learn Command Syntax

Use `rote grammar` to see examples for specific topics:

```rote-exec
rote grammar query      # JSON queries (@N syntax)
rote grammar http       # HTTP requests
rote grammar session    # Session management
rote grammar iteration # Loops and parallel execution
rote grammar export     # Flow export
rote grammar deno       # TypeScript transformations
```

## Core Concepts

### Workspace Isolation

Each task gets its own isolated workspace:
- Responses cached as `@1`, `@2`, `@3`...
- Variables stored as `$name=value`
- Independent MCP sessions
- Separate cache namespace

```rote-exec
rote init my-task --seq
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/my-task
```

### Response Caching

Execute once, query unlimited:

```rote-exec
# Execute MCP call
rote POST /github '{"method":"tools/call",...}' -s

# Response cached as @1, query it multiple times
rote @1 '.result.data.items[].name' -r
rote @1 '.result.data.items | length' -r
rote @1 '.result.data.items[] | select(.active)' -r
```

Cache queries are <100 microseconds (vs 500ms for HTTP re-execution).

### Flow Creation: Explore → Scaffold → Test

**REQUIRED BEFORE MARKING RELEASED** — echo this checklist back **in this order** and confirm each item. Do not skip the lint step. Do not edit `main.ts` to change `status` — that bypasses every gate.

```
[ ] FlowOutput wired: `new FlowOutput()` + out.human("...") / out.summary("...") / out.result({...}) — see Step 2b below for the required shape
[ ] API-driven parameters: every server-side filter/input dimension exposed by
    the tool's `inputSchema` is either a CLI flag, hardcoded with a reason, or
    omitted with a reason. (Pagination/output knobs alone do NOT satisfy this —
    those are runner mechanics. See Step 1.5.)
[ ] Frontmatter mirrors flags: every CLI flag has a matching entry under
    `metadata.parameters` in the @rote-frontmatter, with `name` (without `--`
    prefix), `type` (string|number|boolean), `required`, `default`, and a
    `description` that names the underlying API field it controls.
[ ] Raw passthrough escape hatch: if the tool accepts a structured
    filter/where/query input, the flow exposes a `--filter` (or equivalent) flag
    that takes raw JSON and overrides the typed flags.
[ ] Test diversity: 3+ test runs that exercise different filter dimensions,
    not the same flag with different values. At least one run uses the
    raw-passthrough flag.
[ ] Tested with 3+ distinct inputs including at least one edge case and one default-only run

[ ] >>> MANDATORY PREREQUISITE — RUN BEFORE TOUCHING STATUS <<<
[ ] `rote flow lint <name>` exits 0 (this is the gate — it runs static checks AND
    invokes the flow once per output mode in lint mode. If it fails, FIX THE
    VIOLATIONS before continuing. Do not flip status, do not run release, do
    not edit main.ts. Re-run lint after each fix until it passes.)
[ ] >>> END PREREQUISITE <<<

[ ] Release confirmation obtained — user said yes to the release prompt, OR their original request explicitly asked for a released/crystallized flow. "Save as a reusable flow" (Step 5) alone does NOT authorize release.
[ ] Released via `rote flow release <name>` (this re-runs lint as a belt-and-braces check, then flips `status: draft` → `status: released` and records the `flow_released` chronicle event. **Do NOT Edit main.ts manually to flip status — manual edits skip the lint gate, the chronicle event, and the search badge.**)
[ ] rote flow index --rebuild run AFTER `rote flow release` (release does not auto-rebuild; rebuilding on a draft flow is a no-op)
[ ] Verified searchable: rote flow search "<intent>" returns a hit for the new flow with no `[!]` lint marker — 0 hits means release or rebuild did not land, go back to Step 4
```

> **Hard gate — `rote flow release` refuses on lint failure.**
>
> The release pipeline now runs `rote flow lint <name>` automatically and refuses to flip `status: draft → released` if any check fails. The lint:
>
> 1. **Static checks** (no execution) — verifies `new FlowOutput()` is constructed exactly once with no arguments, at least 3 calls across `out.human` / `out.summary` / `out.result`, no bare `console.log` for user output, no calls to non-existent API like `out.emit()` or callback-style overloads, and `out.result(...)` takes an object literal (not an array).
>
> 2. **Runtime checks** — runs the flow three times with `ROTE_FLOW_LINTING=1` (one per output mode). The SDK in lint mode short-circuits adapter calls and preflight to return synthetic data, so no real I/O happens. Each invocation's stdout is checked: default mode is non-empty, summary mode is bounded, **json mode parses as a JSON object** (catches the array/object-spread bug from `out.result([...])`).
>
> Run it manually any time:
>
> ```bash
> rote flow lint <flow-name>             # full check
> rote flow lint <flow-name> --skip-runtime   # static only, faster
> rote flow lint <flow-name> --json | jq .violations
> ```
>
> Bypass only with `--force`, which writes a `flow_released_with_lint_violations` chronicle event and a warning marker that surfaces in `rote flow search` results. Never bypass without explicit user instruction.

**Workflow**: Explore the API, scaffold with `rote flow template create`, then test.

**Step 0: ELICIT REQUIREMENTS** - Before doing anything, use `AskUserQuestion` to collect inputs in one step:

Use the `AskUserQuestion` tool to ask the user (all in a single call):
1. **What should the flow do?** — e.g. "fetch recent emails", "list open GitHub issues"
2. **Which adapters are needed?** — confirm after running `rote explore "<intent>"`
3a. **What server-side inputs does the tool expose?** — run the probe, read the
    `inputSchema` for the chosen tool, list every field. Don't filter yet; enumerate.
    This is the parameter universe the flow could expose.
3b. **Which of those should be CLI flags vs hardcoded vs omitted?** — for each
    field, decide and record the reason. "I don't need it" is not a reason —
    "the API doesn't expose it" or "it conflicts with another flag" is.
    Add a raw-passthrough flag (`--filter` / `--where` / `--query` / `--body`)
    if the tool has a structured filter input. See Step 1.5 below.
4. **Description** — one-line summary for the registry

This avoids multiple clarification rounds and ensures `rote flow template create` is
correct on the first attempt. Only skip this step if the user has already provided
all the above information explicitly in their request.

**Step 1: EXPLORE** - Use workspace to understand the API:

```rote-exec
rote init my-exploration --seq
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/my-exploration
rote explore "your intent"
rote POST adapter/github '{"method":"tools/call",...}' -s
rote @1 '.result' -r  # Understand response structure
```

**Step 1.5: PARAMETER DISCOVERY (MANDATORY before scaffold)**

Before running `rote flow template create`, you must enumerate the tool's input
surface and decide what to expose. Skipping this is the #1 cause of "looks
parameterized but isn't reusable" flows — the agent picks knobs from imagination
(pagination, output mode, max) instead of from the API.

**Enumerate first, then select.** Do not write `--param` flags from memory.

#### 1.5a — Read the input schema

For the tool you're about to call, get the full input shape:

```rote-exec
rote @<probe-response> '.content[0].text | fromjson | .results[] | select(.name == "<tool>") | .inputSchema' -r
```

For every input field of type `object` OR type `string` whose description hints
at structured content (`filter`, `where`, `query`, `criteria`, `body`, `params`),
drill in with a test call before scaffolding:

```rote-exec
rote <adapter>_call <tool> '{"<field>": "<probe-shape>"}' -s
rote is-error @N && rote @N '.content[0].text' -r   # read the API's error message — it tells you the real schema
```

GraphQL adapters (Linear, GitHub v4, Notion DB) frequently declare a filter as
`type: string` in the probe schema while the server expects a JSON-encoded
input type with deeply nested predicates. The probe schema is a hint, not the
contract — the live API is.

#### 1.5b — Build the parameter table

Write down a table (in your head or in scratch) with one row per input dimension:

| API field | Reusable? | CLI flag | Frontmatter param | Default |
|---|---|---|---|---|
| `filter.priority` | yes | `--priority` | `priority` | (empty) |
| `filter.state.type` | yes | `--state-type` | `state-type` | (empty) |
| `filter.assignee.isMe` | yes | `--me` | `me` | `false` |
| `orderBy` | yes | `--order` | `order` | first valid enum value |
| `first` (page size) | derived | `--first` | `first` | `100` |
| ... | | | | |

For each row, decide: **expose as flag**, **hardcode with reason**, or **omit
with reason**. "I don't need it" is not a reason — "the API doesn't expose it"
or "it conflicts with another flag" is.

#### 1.5c — Always include an escape hatch for structured inputs

If the tool accepts a structured filter/where/query input (anything that's a
JSON-encoded sub-object on the wire), add a raw-passthrough flag:

```text
--filter=JSON   # or --where, --query, --body — match the API's terminology
```

This handles the long tail of queries that typed flags can't express. It's
about three lines of code and turns the flow from "covers the cases I thought
of" into "covers everything the API can do."

#### 1.5d — Severity / aliases / dual-naming

Check whether the user's vocabulary matches the API's. If a user asks for
"severity" but Linear calls it "priority," document the mapping in the
parameter description — don't silently rename. Same for "owner" vs "assignee,"
"status" vs "state," "milestone" vs "cycle." The flag name should match the
API field; the description bridges the gap.

#### Red flags — you skipped Step 1.5 if any of these are true

| Thought / observation | What it means |
|---|---|
| "I parameterized `--max`, `--first`, `--output` and called it done" | You parameterized the runner, not the API. Pagination and output mode are derived knobs that exist in every flow. They don't make the flow reusable — server-side filters do. |
| "I didn't probe the input schema, I just looked at the response" | Half the work. Response shape tells you what comes back; input schema tells you what you can ask for. Both are needed. |
| "The probe says `filter: string`, so I'll pass strings" | Probably wrong for GraphQL. Test one filter shape live — the API's error message will spell out the real input type. |
| "I'll skip the raw-passthrough flag, the typed flags cover everything" | They cover everything *you* thought of. Add the `--filter` escape hatch — three lines of code, infinite long-tail coverage. |
| "All three of my test runs vary `--max`" | You tested the runner, not the parameterization. At least one run per filter dimension. |
| "I added flags but didn't update frontmatter" | The flow registry, help system, and any caller introspecting `metadata.parameters` won't see them. Flags and frontmatter must stay in lockstep. |

---

**Step 1b: WRITE PENDING STUB** — BEFORE presenting results to the user, write a context anchor:

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
rote flow pending write <workspace> \
  --name <suggested-slug> \
  --adapter <adapter-id> \
  --response-path "<validated jq path to result data>" \
  --notes "<encoding quirks, caveats>"
```

This stub survives context compression and session restarts. It stores enough context
to resume the flow-creation lifecycle without re-running the API calls.

After writing the stub, **present results** and ask:

> "Results above. Want to save this as a reusable flow?
> Run `rote flow pending save <workspace-name>` to get the scaffold command."

**If user confirms** → run `rote flow pending save <workspace-name>`:

```rote-exec
rote flow pending save <workspace-name>
# Emits the pre-filled rote flow template create command — copy and run it
```

**If user declines** → discard:

```rote-exec
rote flow pending discard <workspace-name>
```

To inspect or list pending stubs:

```rote-exec
rote flow pending show <workspace>    # inspect one stub
rote flow pending list                # all workspaces with pending stubs
```

#### Resuming after interruption (MANDATORY)

If the user sends a distraction (side-task, unrelated question, long thread of noise) between the initial flow exploration and the "save as a flow?" ask — and then comes back with "OK, crystallize that flow" — you have likely lost the workspace name from near-context. Do NOT guess it, do NOT skip straight to `rote flow template create`. Run this sequence, in order, every time:

```rote-exec
# 1. Enumerate which workspaces still have unsaved flow work
rote flow pending list

# 2. Re-emit the scaffold command from the pending stub
rote flow pending save <workspace>

# 3. THEN run the scaffold command printed by step 2
rote flow template create --name <slug> --adapter adapter/<id> ...
```

Skipping step 1 or step 2 is the single most common cause of lost context after distraction. The pending stub survived compression precisely so this recovery path exists — use it.

**Step 2: SCAFFOLD** - Use `rote flow template create` (recommended):

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
# Single adapter:
rote flow template create --name fetch-issues --adapter adapter/github

# Multiple adapters:
rote flow template create --name sync-tasks --adapter adapter/gmail --adapter adapter/calendar

# With parameters, description, and tags:
rote flow template create --name fetch-recent-emails \
  --adapter adapter/gmail \
  --description "Fetch recent emails with filtering" \
  --param "count:number:false:10:Number of emails" \
  --param "date:string:false:today:Date filter" \
  --tag gmail --tag email
```

**`--param` format**: `name:type:required:default:description` (type: string|number|boolean)

This scaffolds a complete TypeScript flow at `${ROTE_HOME:-$HOME/.rote}/flows/<name>/main.ts` with:
- `@rote-frontmatter` with fingerprints and metadata
- Dynamic SDK import (shareable across machines)
- `runPreflight()` — consolidated fingerprint + token + session validation
- Auto-tracking (invocation recording on exit)
- Error handling with `Rote.exit()`

**Alternative (manual)** — only if you need custom structure:

```typescript
const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "~";
const { Rote, initAutoTracking, runPreflight } = await import(
  `${homeDir}/.rote/lib/sdk/ts/mod.ts`
);

const rote = await Rote.workspace("fetch-issues");
await initAutoTracking(rote.executor);

const { adapters } = await runPreflight(rote, {
  adapters: ["adapter/github"],
});
const github = adapters["adapter/github"];

const queue = rote.tasks;
const task = await github.callBg("issues/list", { owner: "...", repo: "..." }, {
  queue, label: "list-issues",
});
const issues = await rote.extractContent(task.result);
console.log(issues);
```

**Step 2b: VERIFY FlowOutput** — `rote flow template create` scaffolds `main.ts` with FlowOutput already wired (since flow-quality-100). Confirm and adapt:

```typescript
const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "~";
const { FlowOutput } = await import(`${homeDir}/.rote/lib/sdk/ts/mod.ts`);
const out = new FlowOutput();
const args = FlowOutput.args;  // Deno.args with --output=X stripped

// ... fetch/compute data ...

out.human("Weather market digest");
out.human(`  ${market.question}`);
out.human(`  current temp: ${temp}°F`);

out.summary(`${market.slug} ${temp}F`);          // one-line proof-of-life for pipes
out.result({ market, temperature: temp });       // JSON mode payload (called once at end)
```

The actual API exported by `sdk/ts/src/output.ts`:

| Method | Signature | Mode emitted in |
| --- | --- | --- |
| `new FlowOutput()` | constructor (no args) | — |
| `out.human(line)` | `(line: string) => void` | human (default) |
| `out.summary(line)` | `(line: string) => void` | `--output=summary` |
| `out.json(key, value)` | `(key: string, value: unknown) => void` (buffer) | `--output=json` |
| `out.result(data)` | `(data: object) => void` (emit final JSON) | `--output=json` |
| `FlowOutput.args` | `string[]` (static) | — |

There is **no** `out.emit()` and **no** callback-style overloads. If you've seen
`out.human(() => { ... })` or `await out.emit(Deno.args)` somewhere, that
documentation is wrong — the real signatures are above and in
`~/.rote/lib/sdk/ts/src/output.ts`.

Rules:
- Every user-visible line goes through `out.human(...)` / `out.summary(...)` — never bare `console.log()`. Stderr (`console.error`) is fine for operational diagnostics.
- Call `out.result({...})` **exactly once** at the end with the structured payload.
- Use `FlowOutput.args` instead of `Deno.args` for positional args (it strips `--output=...`).

The hard gate (above) runs three greps; rerun them after editing `main.ts` to confirm coverage.

**Step 3: TEST** - Run with multiple different inputs (generalization testing):

```rote-exec
# Test with at least 3 different inputs
rote deno run --allow-all ${ROTE_HOME:-$HOME/.rote}/flows/github/fetch-issues/main.ts facebook react
rote deno run --allow-all ${ROTE_HOME:-$HOME/.rote}/flows/github/fetch-issues/main.ts anthropic claude
rote deno run --allow-all ${ROTE_HOME:-$HOME/.rote}/flows/github/fetch-issues/main.ts microsoft vscode

# Test edge cases
rote deno run --allow-all ${ROTE_HOME:-$HOME/.rote}/flows/github/fetch-issues/main.ts  # Empty (should show usage)
```

**Step 4: RELEASE (terminal gate — crystallized = released + searchable)**

Release is a lifecycle transition the user owns — the same "never auto-crystallize" principle that gates Step 5 applies here. `rote flow release` records a `flow_released` chronicle event and makes the flow discoverable to every subsequent `rote flow search`. Do not run it autonomously.

**Release confirmation (mandatory before any release command).** After tests pass, present state and ask:

> "Flow `<name>` tested and working (status: draft). Ready to release it? This flips `status: draft` → `status: released`, making it discoverable via `rote flow search`. Reply 'release' to proceed, or keep it as draft."

Skip this confirmation **only** when the user's original request used words like "release", "crystallize", "mark as released", "make discoverable", or "save as a released flow". "Save as a reusable flow" from Step 5 alone does NOT authorize release — that prompt gates the scaffold, not the lifecycle flip. Silence or ambiguity means ask.

If the user declines → stop here. The flow stays usable via `rote deno run <path>` but is hidden from search. That is a valid end state, not a failure.

**Release sequence (only after the user confirms).** Run exactly these three commands in this order:

1. **Release the flow** — use the dedicated command, not a manual edit:

   ```rote-exec
   rote flow release <name>
   ```

   Flips frontmatter `status: draft` → `status: released`, validates the current state was `draft` (errors on unexpected values), and records a `flow_released` chronicle event. Do NOT Edit `main.ts` by hand — the jsdoc-wrapped frontmatter (`* status: draft`) is easy to misedit and a manual flip skips the chronicle event.

2. **Rebuild the index once** — release does not auto-rebuild:

   ```rote-exec
   rote flow index --rebuild
   ```

3. **Verify the flow is discoverable** — this is the gate, not optional:

   ```rote-exec
   rote flow search <name>   # MUST return a hit for <name>
   ```

   If step 3 returns 0 hits, release or rebuild did not land. Run `rote flow release <name>` again (it's idempotent — already-released returns an info message), then repeat step 2. Do not proceed to any other action until step 3 succeeds.

> **Red flags — you are about to release without the user asking, or you're rationalizing around the gate:**
>
> | Thought | Reality |
> |---------|---------|
> | "Tests passed, I'll just release it now" | Release is a user decision. Ask the release-confirmation prompt unless the user already said "release" / "crystallize" in their original request. |
> | "They said 'save it as a reusable flow' so release is implied" | No — that phrase gated the Step 5 scaffold. Release is a separate commitment. Ask. |
> | "`rote flow search` returned 0 hits — maybe the index is stale" | The index only surfaces `status: released` flows. A rebuild on a draft flow is a no-op. Release first, then rebuild. |
> | "Let me `rote flow validate` first to check the flow is OK" | Validate is a Step 3 test helper. It does not release the flow. A draft flow can validate cleanly and still be invisible to search. |
> | "Let me `ls ~/.rote/flows/` to confirm the file exists" | If `rote flow template create` exited 0, the file exists. Listing directories does not release it. |
> | "Let me try `rote flow search --all` or a broader query" | No such flag. Search hides drafts by design. Run `rote flow release` (after user confirms). |
> | "The flow runs end-to-end — that means it's released" | Execution ≠ release. `status:` is checked by the index and by scenario verifies, not by the deno runtime. |
> | "I'll just Edit `main.ts` to change `status:` directly" | The scaffold uses jsdoc-wrapped frontmatter (`* status: draft`). Manual edits break indentation or skip the chronicle event. Use `rote flow release <name>`. |
>
> Correct sequence once user confirms: `rote flow release <name>`, `rote flow index --rebuild`, `rote flow search <name>` — in that order.

**Flow Requirements Checklist:**

- [ ] **runPreflight()**: Use `runPreflight()` for fingerprint + token + session validation (replaces manual checks)
- [ ] **Early exit on errors**: Validate args first, then `runPreflight()`, then business logic
- [ ] **Structured output**: Use `FlowOutput` for human/summary/json output modes (see `rote guidance typescript flow-creation` section 5g)
- [ ] **API-driven parameters**: Every server-side filter/input dimension exposed by the tool's `inputSchema` is either a CLI flag, hardcoded with a reason, or omitted with a reason. (Pagination/output knobs alone do NOT satisfy this — those are runner mechanics.)
- [ ] **Frontmatter mirrors flags**: Every CLI flag has a matching entry under `metadata.parameters` in the @rote-frontmatter, with `name` (without `--` prefix), `type` (string|number|boolean), `required`, `default`, and a `description` that names the underlying API field it controls.
- [ ] **Raw passthrough escape hatch**: If the tool accepts a structured filter/where/query input, the flow exposes a `--filter` (or equivalent) flag that takes raw JSON and overrides the typed flags.
- [ ] **Test diversity**: 3+ test runs that exercise different filter dimensions, not the same flag with different values. At least one run uses the raw-passthrough flag.
- [ ] **No emoji slop**: Clean console output, no excessive emojis
- [ ] **Shareable import**: Uses `$HOME` dynamic resolution, not hardcoded paths
- [ ] **Auto-tracking**: `mcp_servers` section with fingerprints in frontmatter
- [ ] **Run with `rote deno`**: Always execute via `rote deno run --allow-all`, never `~/.rote/bin/deno` directly

**Auto-tracking benefits:**

- Success/failure recorded automatically on script exit
- Measures exploration vs exploitation token savings
- No explicit tracking code needed
- Requires `mcp_servers` section in frontmatter (with fingerprints)

**CRITICAL**: Read `rote guidance typescript flow-creation` for complete requirements

### Flow Forking

Fork existing flows with new parameters (~3 seconds vs 30s from scratch):

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
# Find existing flow
rote flow search "fetch github issues"

# Fork with new parameters
rote flow fork ${ROTE_HOME:-$HOME/.rote}/flows/github/fetch-issues.sh \
  --as my-react-issues \
  --params owner=facebook,repo=react,state=open \
  --replay

# Extend and export
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/my-react-issues
rote @2 '...' -r  # Query parent's data
rote POST /github '...'  # Add new commands
rote export my-flow.sh --params owner,repo,state
```

## Common Patterns

### Adapter Probe/Call Pattern

For REST APIs via adapters:

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
# Step 1: Probe - search for capability
rote POST adapter/github-api '{
  "method": "tools/call",
  "params": {
    "name": "github_api_probe",
    "arguments": {
      "query": "create repository",
      "limit": 5
    }
  }
}' -s

# Response: @1 (ranked tools with schemas)

# Step 2: Call - execute discovered tool
rote POST adapter/github-api '{
  "method": "tools/call",
  "params": {
    "name": "github_api_call",
    "arguments": {
      "tool_name": "repos/create",
      "arguments": {
        "name": "my-project",
        "owner": "myorg"
      }
    }
  }
}' -s

# Response: @2 (execution result)
```

### Browser Automation Pattern

**CRITICAL RULES:**

1. **SNAPSHOT FIRST** - Never use code mode without snapshot!
2. **STAY IN ROTE** - NEVER switch to native Playwright/Puppeteer/curl/scripts!

**Why staying in rote matters:**

- Captures your exploration trajectory for reuse
- Enables flow export from browser workflows
- Native tools break trajectory capture and render exploration useless
- You lose the ability to make work reusable

**Correct Pattern:**

```rote-exec
# Navigate and auto-snapshot
rote browse https://example.com

# Query efficiently (95-99% token savings)
rote browser-extract @N button
rote browser-find @N --text "search"
rote browser-find @N --ref eNNN --context 2

# Interact using discovered refs
rote browse click <ref>

# Code mode: LAST resort only (still in rote!)
rote POST '{...}' -s
```

**Wrong Pattern - FORBIDDEN:**

```bash
# ✗ Switching to Playwright directly
# ✗ Writing Python/Node.js scripts
# ✗ Using curl for web scraping
# ✗ Any tool outside rote browse
```

Pattern: Navigate → Snapshot → Understand → Interact (ALL IN ROTE)

### Query & Transform Pattern

rote has 98% jq compatibility - no external tools needed:

```rote-exec
# Extract fields
rote @1 '.items[].name' -r

# Filter
rote @1 '.items[] | select(.active)' -r

# Transform
rote @1 '.items | map(.name)' -r
rote @1 '.items | sort_by(.score)' -r
rote @1 '.items | group_by(.type)' -r

# Aggregations
rote @1 '.scores | sum' -r
rote @1 '.prices | min' -r
rote @1 '.temperatures | max' -r
rote @1 '.ratings | avg' -r

# Multi-response operations
rote aggregate @2..@50 '$.contact' --filter 'status == active'
rote aggregate @2..@100 '$.amount' --sum
rote aggregate @2..@50 '$.email' --unique
```

### Batch Call Pattern (Parallel Operations)

**CRITICAL**: Use `batch_call` when fetching multiple items from the SAME adapter. This is MUCH faster than sequential calls.

**When to use batch_call:**

- Fetching multiple emails by ID
- Getting details for multiple GitHub issues
- Retrieving multiple calendar events
- Any "list then fetch details" workflow

#### Pattern: List → Build Batch → Execute in Parallel

```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
# Step 1: Get list of IDs
rote gmail_call 'gmail.users.messages.list' '{"userId":"me","maxResults":"5"}' -s  # @1

# Step 2: Build and execute batch call (parallel execution)
rote gmail_batch_call '[
  {"tool_name": "gmail.users.messages.get", "arguments": {"userId": "me", "id": "msg1"}},
  {"tool_name": "gmail.users.messages.get", "arguments": {"userId": "me", "id": "msg2"}},
  {"tool_name": "gmail.users.messages.get", "arguments": {"userId": "me", "id": "msg3"}}
]' --parallel -s  # @2

# Step 3: Access aggregated results (stay inside rote; don't pipe to jq/python)
rote @2 '.content[0].text | fromjson | {total, succeeded, failed}' -r
rote @2 '.content[0].text | fromjson | .results[].result.snippet' -r
```

**Response Format:**
```json
{
  "total": 3,
  "succeeded": 3,
  "failed": 0,
  "results": [
    {"index": 0, "tool_name": "...", "success": true, "result": {...}},
    {"index": 1, "tool_name": "...", "success": true, "result": {...}},
    {"index": 2, "tool_name": "...", "success": true, "result": {...}}
  ]
}
```

**TypeScript SDK (recommended for complex flows):**

```typescript
const queue = rote.tasks;

// Build batch calls from list — with progress display
const batchTask = await gmail.batchCallBg(
  gmail.buildBatchCalls(
    messageIds,
    "gmail.users.messages.get",
    (id) => ({ userId: "me", id })
  ),
  { parallel: true, queue, label: "fetch-messages" }
);

// Extract results with type safety
const batch = await rote.extractBatch<Message>(batchTask.result!);
console.log(`Fetched ${batch.succeeded}/${batch.total} messages`);
```

**Batch Call vs Other Parallel Options:**

| Use Case                       | Command                            |
| ------------------------------ | ---------------------------------- |
| Multiple calls to SAME adapter | `batch_call` (recommended)         |
| Calls to DIFFERENT adapters    | `rote -p POST /a ... POST /b ...`   |
| Iteration with templates       | `rote for @N '...' --parallel ...`  |

**Reference:** `rote grammar batch` for complete documentation

### Background Task Queue (Progress Display)

Use `callBg()` and `batchCallBg()` for adapter calls with animated progress spinners.

**TypeScript SDK:**

```typescript
const queue = rote.tasks;

// Progress mode (default) — blocks with animated spinner
const task = await adapter.callBg("tool_name", { param: "value" }, {
  queue, label: "my-operation",
});
const data = await rote.extractContent(task.result);

// Background mode — fire and poll later
const handle = await adapter.callBg("tool_name", { param: "value" }, {
  queue, label: "my-operation", background: true,
});
// ... do other work ...
const result = await handle.wait();
```

**Python SDK:**

```python
async with Rote.create() as rote:
    adapter = rote.adapter("gmail")
    await adapter.init_session()

    # Progress mode (default)
    task = await adapter.call_bg("gmail.users.messages.list",
        {"userId": "me"}, label="list-messages")
    data = await rote.extract_content(task.result)

    # Background mode
    handle = await adapter.call_bg("gmail.users.messages.list",
        {"userId": "me"}, label="list-messages", background=True)
    result = await handle.wait()
```

**Progress output** (on stderr):

```text
  ⠹ list-messages  1.2s  [running]
  ✔ list-messages  1.3s  completed
  ✘ fetch-details  2.8s  failed: Error: boom
```

### TypeScript Transformations (Complexity Tiers)

**IMPORTANT**: Before adding TypeScript, run `rote guidance typescript essential` to choose the right tier.

**Tier 1 - Simple (90%)**: Use native rote commands (~5ms)
```rote-exec
rote @1 '.items[] | select(.active)' -r
```

**Tier 2 - Medium (8%)**: Inline TypeScript for display/calculations (~70-200ms)
```rote-exec
rote @1 '$' --transform-ts 'return response.filter(x => x.score > 0.8)'
rote @1 '$' --filter-ts 'item => item.stars > 1000'
rote @1 '$' --map-ts 'item => ({name: item.name, score: item.stars})'
```

**Tier 3 - High (2%)**: TypeScript-driven for conditionals/loops
```bash
# TypeScript file that calls rote commands
# See: rote guidance typescript essential
```

**Decision Quick Reference:**

- Need if/else based on response? → Tier 3
- Need custom table formatting? → Tier 2
- Need calculations? → Tier 2
- Just filtering/extracting? → Tier 1

Setup (one-time):
```rote-exec
rote deno install  # Downloads Deno runtime (~88MB)
```

Syntax reference: `rote grammar deno`

## Command Reference

### Discovery
```rote-exec
rote flow search "intent"        # Search flows by natural language
rote flow list                    # List all flows
rote explore "intent"            # Cross-adapter tool search (BM25)
rote inventory                    # List all endpoints
```

### Workspace Management
```rote-exec
rote init <name> [--seq|--par]   # Create workspace
rote ls                           # List responses
rote cd <name>                    # Switch workspace
rote set name=value               # Set variable
```

### MCP Operations
```rote-exec
# For adapters, always use adapter/<id> prefix:
rote init-session adapter/github   # Initialize adapter session
rote POST adapter/github '{}' -s   # Execute tool call (-s = session)
rote tools adapter/github -s       # List tools
rote resources adapter/github -s   # List resources

# Adapter shorthand (preferred - handles session automatically):
rote github_probe "list repos"     # Semantic search for operations
rote github_call <tool> '{}' -s    # Execute specific operation
```

### Adapter Configuration (post-creation)
```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
# Discover what's mutable
rote adapter keys <id>                  # human-readable
rote adapter keys <id> --json           # machine-readable

# Update a field (validated; fingerprint preserved)
rote adapter set <id> <key> <value>

# Example — multi-tenant APIs like Astronomer-hosted Airflow:
# the spec is shared, but each org has its own deployment URL.
rote adapter set apache-airflow base_url \
  https://<your-org>.zo.astronomer.run/<deployment-id>

# Never `rote adapter remove` + `rote adapter new` just to change a URL —
# that regenerates the fingerprint and orphans any compiled flows.
```

### Query & Transform
```rote-exec
rote @N '<query>' -r              # Query cached response (raw output)
rote @N '<query>' -s <var>       # Store result in variable
rote @N '<query>' -m              # MCP unwrap (extract content)
rote query-stdin '<query>' -r     # Process stdin
```

### MCP envelope post-processing — stay inside rote

Most adapter calls return an MCP envelope where the useful JSON is a string
inside `.content[0].text`. To filter it, chain `fromjson` inside ONE rote
query — do NOT pipe `.content[0].text` into jq, python, or another shell:

```rote-exec
# ✅ one-liner, stays inside rote
rote @N '.content[0].text | fromjson | map(select(.tag == "weather"))' -r
rote @N '.content[0].text | fromjson | .results[:5][] | "\(.id)\t\(.name)"' -r

# ❌ antipatterns — rote grammar flags these as bypass
rote @N '.content[0].text' -r | python3 -c "import json; ..."
rote @N '.content[0].text' -r | jq '.results[]'
```

`fromjson` is the jq built-in that decodes a JSON string back into structured
data. Everything after it is ordinary jq syntax that rote already supports.
If the filter gets long, save with `-s var` and query again: `rote @N '<path>' -s var`,
`rote @N '$var.field' -r`.

**Before trusting `fromjson` on a response, verify it is not an error envelope.** If the
adapter returned `{"is_error": true, "content": [{"text": "HTTP 4xx ..."}]}`, then
`fromjson` will fail on the non-JSON error string and rote reports "configuration error"
— which looks like your jq is wrong, but the real failure is upstream. Check once:

```rote-exec
rote is-error @N && rote @N '$' -r   # bail out and inspect raw if the response was flagged
```

Do NOT retry the same `fromjson` chain with different jq variants against an error
envelope — fix the underlying call (wrong base URL, missing auth, bad params) instead.

### Flow Management
```rote-exec
rote export <path> --params x,y  # Export workspace as flow
rote flow fork <flow.sh>          # Fork flow with new params
rote decompile <flow.sh>          # Extract command log
rote replay <params>              # Execute decompiled commands
```

### Architecture & Guidance
```rote-exec
rote how                          # Agent onboarding flow
rote start                        # Protocol checklist
rote guidance <topic> [module]   # Embedded guidance
rote grammar <topic>              # Command examples
rote machine <topic>             # Architecture explanations
```

## Integration with Other Tools

**rote vs MCP**: rote orchestrates MCP workflows. Use MCP directly for simple calls, rote for multi-step workflows.

**rote vs Skills**: Skills teach Claude *how* to use tools; rote *provides* workflow automation. They complement each other.

**rote vs Subagents**: rote manages workflow state; subagents provide isolated contexts. Use rote for stateful workflows, subagents for isolation.

## Pay Attention to HINTS

rote provides inline `[HINT]` messages to guide your workflow. These are NOT errors - they're steering advice to help you decide what to do next.

### Types of HINTS

1. **Response Structure Hints**: After successful operations, suggests queries to explore data
2. **Anti-Pattern Hints**: After analyzing your workflow, suggests optimizations
3. **Error Recovery Hints**: When operations fail, suggests fixes
4. **Navigation Hints**: Based on data shape, suggests next steps

### How to Use HINTS

**On Success** - Execute suggested queries:
```rote-exec
rote POST /github '{...}' -s
# [HINT] Response Structure Detected:
#   → Extract name: rote @2 '$ | .[] | .name'

# Do this: Execute the suggested query
rote @2 '$ | .[] | .name' -r
```

**On Failure** - Reflect and retry with suggested fix:
```rote-exec
rote POST /api '{...}' -s
# [HINT] HTTP requests without error checking
# [HINT] Consider: is-error @5 || exit 1

# Do this: Check error, apply fix, retry
rote @5 '$' -r              # Understand the error
rote is-error @5 && exit 1  # Apply suggested fix
```

**Anti-Pattern** - Evaluate and refactor if applicable:
```rote-exec
# [HINT] Sequential requests could be parallel
# [HINT] Consider: rote -p POST /a '{...}' -s POST /b '{...}' -s

# Do this: If operations are independent, use parallel execution
rote -p POST /a '{...}' -s POST /b '{...}' -s
```

### HINTS Protocol

1. **STOP** - Don't proceed with commands
2. **READ** - Read the entire hint
3. **REFLECT** - Understand what it tells you
4. **STEER** - Decide what to do next based on the hint

**Remember**: HINTS help you learn correct patterns and self-steer efficiently. Always read and act on them.

## Troubleshooting

### Flow Not Found
```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
# Search before building!
rote flow search "your intent"

# If found, create workspace and run with model tracking
rote init my-task --seq
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/my-task
rote run --inference-id $(uuidgen) \
  --model claude-sonnet-4-5 \
  --model-type chat \
  --model-version 20250514 \
  ${ROTE_HOME:-$HOME/.rote}/flows/{endpoint}/{name}.sh args
```

### Session Errors
```rote-exec
# Always use -s flag for MCP operations
rote POST adapter/github '{}' -s

# Check session status
rote has-session adapter/github
```

### Wrong Base URL / 404 on adapter calls

Symptom: `rote <id>_call` returns HTTP 404, connection-refused, or wrong-tenant
data — `base_url` is stale or points at the spec-hosting URL instead of the
API host. Fix in place; do not recreate.

```rote-exec
rote adapter keys <id>                        # confirm base_url is settable
rote adapter set <id> base_url <correct-url>  # validated, fingerprint preserved
rote <id>_call <same-tool> '{}'               # retry
```

`rote adapter remove` + `rote adapter new` regenerates the fingerprint and
orphans every crystallized flow that references the adapter — avoid. See
**Command Reference → Adapter Configuration** for the full settable-key list.

### Query Errors

Before retrying a failing `rote @N` query with different jq syntax, **always inspect the raw response first** — most "configuration error" / "malformed jq" messages actually mean the response itself is an error envelope (`is_error: true`), not that your jq is wrong.

```rote-exec
# First: inspect the raw response shape
rote @N '$' -r

# If the output shows {"is_error": true, "content": [{"text": "HTTP 401 ..."}]}
# the problem is upstream (auth/request), NOT your jq expression.
# Fix the upstream call — don't keep retrying the query.
rote is-error @N && echo "response is an error envelope, stop querying it"

# If the response is healthy but jq still fails, avoid these combinations
# (rote's embedded jq is a subset — prefer one transform step at a time):
#   .[slice] | .[] | {obj_constructor}   # chain slice + iterate + object — use map({…}) instead
#   multi-line braces with comma-space    # {a, b}  — brace-expansion foot-gun
rote @N '.content[0].text | fromjson | map({question, volume, slug})' -r   # safe
```

`rote is-error @N` returns non-zero exit if the response was flagged as error — cheap gate before any deep query.

Reference: `rote grammar query` for full examples.

### Need Help?
```rote-exec
rote how                    # Onboarding flow
rote grammar <topic>        # Command examples
rote guidance <topic>       # Detailed guides
rote machine <topic>        # Architecture docs
```

## Examples

### Example 1: Fetch GitHub Issues
```bash
# Each `rote ...` line below: call via rote_exec MCP tool, not bash.
rote init github-issues --seq
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/github-issues
rote set owner=facebook repo=react state=open
rote init-session adapter/github-api
rote POST adapter/github-api '{
  "method": "tools/call",
  "params": {
    "name": "github_api_probe",
    "arguments": {"query": "list issues", "limit": 5}
  }
}' -s
# Response: @1
rote POST adapter/github-api '{
  "method": "tools/call",
  "params": {
    "name": "github_api_call",
    "arguments": {
      "tool_name": "issues/list",
      "arguments": {"owner": "$owner", "repo": "$repo", "state": "$state"}
    }
  }
}' -t -s
# Response: @2
rote @2 '.items[].title' -r
rote export ${ROTE_HOME:-$HOME/.rote}/flows/github/list-issues.sh --params owner,repo,state
```

### Example 2: Browser Automation
```rote-exec
rote init web-scrape --seq
cd ${ROTE_HOME:-$HOME/.rote}/rote/workspaces/web-scrape
rote browse https://example.com
# Snapshot: @1
rote browser-extract @1 "button[type='submit']"
rote browse click <ref>
# Response: @2
rote @2 'content' -m | rote lines-grep "results" -A 5
```

## Key Principles

1. **Always search flows first**: `rote flow search` before building
2. **Write pending stub before presenting results**: MANDATORY at task completion
3. **Snapshot before code**: Browser automation requires snapshots first
4. **Use native rote**: 90% of transformations don't need external tools
5. **Export successful workflows**: Make them reusable
6. **Fork don't rebuild**: Use `rote flow fork` for variations
7. **Pay attention to HINTS**: rote provides `[HINT]` messages for inline steering - read them and use them to decide what to do next

## References

- **Onboarding**: Run `rote how` for complete flow
- **Protocol**: Run `rote start` for mandatory checks
- **Guidance**: `rote guidance agent essential` (700 lines)
- **TypeScript**: `rote guidance typescript essential` (400 lines) - complexity tier decisions
- **Examples**: `rote grammar <topic>` for command examples
- **Architecture**: `rote machine <topic>` for deep dives

Remember: rote is designed to let agents learn from each other. Export successful workflows so future agents (and you) can reuse them!
