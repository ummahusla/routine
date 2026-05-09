# Integration — rote + pi-rote together

How the two projects fit at runtime, what data flows where, and how to deploy them
together.

---

## Layer cake

```
┌───────────────────────────────────────────┐
│  user / coding agent (pi, Claude Code)    │
├───────────────────────────────────────────┤
│  pi-rote                                  │   ← guidance only
│   ├─ extension: probe, hint, track ctx    │
│   └─ skills:    rote, rote-adapter        │
├───────────────────────────────────────────┤
│  rote CLI                                 │   ← execution
│   ├─ adapters     (~/.rote/adapters)      │
│   ├─ workspaces   (~/.rote/workspaces)    │
│   ├─ flows        (~/.rote/flows)         │
│   ├─ token vault  (encrypted)             │
│   └─ registry client (org/team API)       │
├───────────────────────────────────────────┤
│  remote APIs / MCP servers                │
└───────────────────────────────────────────┘
```

pi-rote calls rote only by spawning bash commands. Skills are static markdown bundled
inside pi-rote. Everything that touches an API goes through rote.

---

## Distribution model

| | rote | pi-rote |
|---|---|---|
| Language | Rust (CLI binary) | Node.js (pi extension package) |
| Where | `https://…/rote-releases/install.sh` | git repo / npm-style pi install |
| Installs to | `$PATH` | `~/.pi/extensions/…` |
| Config root | `~/.rote/` (or `$ROTE_HOME`) | nothing persistent |

---

## Setup sequence (new user)

```bash
# 1. install rote (mandatory)
curl -fsSL https://raw.githubusercontent.com/modiqo/rote-releases/main/install.sh | bash

# 2. confirm
rote --version
rote how                # full onboarding guide

# 3. (optional) install pi-rote for in-pi guidance
pi install /path/to/pi-rote

# 4. start a fresh pi session
pi
```

That's it. From there: `rote adapter install <…>`, then `rote flow search "<intent>"`
or `rote explore "<intent>"`.

---

## End-to-end flow: prompt → result

User says **"list my GitHub issues and save the workflow"**.

```
1. pi-rote (extension) injects rote-first prompt:
   "rote 0.11.0 available. Pending stubs: 0. Lifecycle: search → execute → crystallize → reuse."

2. Agent loads the `rote` skill (Skill tool / auto-trigger).
   Skill body teaches the lifecycle.

3. Agent invokes:        rote flow search "list github issues"
   pi-rote sees `rote …` → no hint. Result returned unchanged.
   No flow yet → continue.

4. Agent invokes:        rote explore "list github issues"
   Returns: adapter/github → tools: issues/list, issues/get, ...

5. Agent invokes (in workspace):
        rote init github-issues --seq
        eval $(rote cd github-issues)
        rote init-session adapter/github
        rote github_call issues/list '{"owner":"…","repo":"…"}' -s
        rote @1 '.items[] | {title, number}' -r

6. Agent writes a pending stub:
        rote flow pending write github-issues \
          --name list-repo-issues --adapter adapter/github \
          --response-path '.items' --notes "envelope shape"

7. Agent (after user confirms): scaffold and release the flow:
        rote flow template create --name list-repo-issues --adapter adapter/github
        rote flow release list-repo-issues
        rote flow index --rebuild

8. Subsequent sessions:
        rote flow search "list repo issues"  → finds it
        rote flow run list-repo-issues <owner> <repo>
        # 2 seconds, zero LLM tokens, deterministic.
```

If at step 4 the agent had been about to run `gh issue list` instead, pi-rote would
have appended a hint block suggesting the rote path.

---

## Data flow & seams

| Boundary | Direction | Mechanism |
|---|---|---|
| pi-rote → rote | one-way | bash spawn (`rote …`) |
| rote → pi-rote | parsed | rote stdout/stderr; workspace path inference |
| rote → agent | direct | tool output, `[HINT]` blocks embedded by rote itself |
| pi-rote skills | static | markdown bundled at packaging time |
| rote → registry | network | `rote registry …` over HTTPS |

pi-rote never imports rote programmatically. rote works fine without pi-rote.

---

## Persistent state

| State | Owner | Location | Survives |
|---|---|---|---|
| Adapters | rote | `~/.rote/adapters/<id>/` | forever |
| Workspaces | rote | `~/.rote/workspaces/<name>/` | until cleaned |
| Response cells | rote | `<workspace>/responses/NNN.json` | with workspace |
| Variables | rote | `<workspace>/state.json` | with workspace |
| Flows | rote | `~/.rote/flows/<category>/<name>.sh` | forever |
| Pending stubs | rote | `<workspace>/pending/*.json` | session restarts, compaction |
| Token vault | rote | `~/.rote/auth/` (encrypted) | forever |
| pi-rote chat context | pi-rote | in-memory | one chat |

---

## Versioning & coupling

- **rote** ships independently on its own semver cadence.
- **pi-rote** depends on rote at runtime via `PATH`. It bundles **copies** of skill
  markdown — those go stale when rote adds commands until pi-rote is re-released.
- **Skill source of truth** lives inside the rote repo and is copied into pi-rote at
  packaging time. Treat the copy as a vendored artifact.

When rolling out together to a team:

1. Pin a rote version on a shared registry.
2. Pin a pi-rote version known to be compatible.
3. CI test: spin up a fresh box, install both, run a smoke flow.
4. On rote upgrade: rev pi-rote, re-run smoke.

---

## Operational model — what each side owns

| Concern | Owner |
|---|---|
| Encrypted credentials | rote |
| Rate limits, retries, circuit breakers | rote (per-adapter policies) |
| Caching of API responses | rote |
| Deterministic execution | rote (flows) |
| Drift detection | rote (fingerprints) |
| Org / team registry | rote |
| Encouraging the agent to use the above | pi-rote |
| Bundling skill docs into pi | pi-rote |
| Tracking active workspace inside a chat | pi-rote |

---

## Two ways to use rote without pi-rote

1. **From a regular shell**: every command in `02-rote-cli.md` works. Compose with
   bash, jq, pipes.
2. **From any agent / IDE**: the `rote` skill in this repo is portable — drop it into
   any agent harness that loads markdown skills.

pi-rote is *one* integration. The CLI is the lingua franca.

---

## Mental shortcut

> Install rote → install pi-rote → start pi. Three lines. The engine and the steering
> wheel. Workflows compound from there.
