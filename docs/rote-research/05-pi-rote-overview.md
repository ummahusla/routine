# pi-rote — Overview & Skills System

## What pi-rote is

A thin pi (Claude Code) plugin that injects **rote-first guidance** into the agent
prompt and bundles the canonical `rote` and `rote-adapter` skills.

It is a guidance layer, not an execution layer:

- It does **not** implement workflows.
- It does **not** replace the `rote` CLI.
- It does **not** force the agent to use rote.
- It does **not** rewrite shell commands before execution.

What it *does*:

- Probes for rote at session start (`rote --version`, pending stubs).
- Appends a system-prompt block that tells the agent: prefer rote for workflow / API /
  automation tasks; the lifecycle is **search → execute → crystallize → reuse**.
- Watches bash tool results; on commands that look like rote bypasses
  (`gh issue list`, `curl … github.com`, `stripe`, `linear`, `supabase`) it appends a
  one-liner `rote hint:` block suggesting `rote flow search`, `rote explore`, or
  `rote adapter catalog search`.
- Tracks the active rote workspace context within a chat (workspace name, path,
  initialized adapter sessions) so follow-up requests don't have to re-init.

## Relationship to rote

| Component | Role |
|---|---|
| **rote** | Engine. Standalone CLI, runs without pi. Owns adapters, workspaces, flows, registry. |
| **pi-rote** | Plugin. Optional. Bundles skills and adds guidance to a pi session. Requires `rote` on `PATH`. |

Coupling is **soft**:

- pi-rote never imports rote programmatically; it only reads rote's stdout/stderr.
- pi-rote bundles **copies** of rote skill markdown — there is no runtime fetch.
- A rote version bump may produce stale guidance until pi-rote is re-released.

## Distribution

| Project | Language | Package | Install |
|---|---|---|---|
| rote | Rust | GitHub-released binary | `curl … install.sh \| bash` |
| pi-rote | Node.js | pi extension package | `pi install <path-or-url>` |

pi-rote `package.json` declares discovery for both surfaces:

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "skills":     ["./skills"]
  }
}
```

---

## The skills system

A **skill** in pi-rote is a markdown file with YAML frontmatter that teaches an agent
how to use a tool or perform a workflow pattern.

### Manifest format

```markdown
---
name: <skill-id>
description: >
  When to use this skill. The model reads this to decide whether to invoke.
  Trigger phrases, intent examples.
---

# <Skill Title>

# … free-form markdown body …
# Patterns, rules, command examples, common failure modes.
```

The frontmatter is the contract:

| Field | Purpose |
|---|---|
| `name` | Skill ID (used by Skill tool, slash command) |
| `description` | When to use; trigger phrases. The matcher reads this. |
| Optional fields | `tools`, `args`, etc. — depend on the platform |

The body is unlimited markdown: rules, code examples, anti-patterns, command tables.

### Discovery & loading

pi finds skills two ways:

1. **Package manifest** — `pi.skills` array points at directories.
2. **Resource discovery hook** — the bundled extension exposes the skills via a
   discovery callback at session-init.

When pi loads pi-rote it scans `skills/`, parses every `SKILL.md`, and registers each
as available. The skills are then accessible via:

- The Skill tool: `Skill(skill="rote", args="<intent>")`
- Slash command: `/rote`, `/rote-adapter`
- Auto-trigger: model decides to invoke based on the description match

When triggered, the body is injected into context — the model operates within that
guidance for the duration of the relevant turn(s).

### Skills bundled with pi-rote

| Skill | Purpose |
|---|---|
| `rote` | Master skill for any workflow / API / automation task. Covers discovery, execution, flow creation, subagent routing, browser automation, troubleshooting, and the full command reference. |
| `rote-adapter` | Autonomous adapter creation. The 8-phase pipeline: discovery → analysis → research → auth → scope → create → safety → verify. Requires explicit user confirmation at each gate. |

### Skill conventions

- One concept per skill (`rote` does workflows; `rote-adapter` does adapter creation).
- Trigger phrases listed verbatim in the description ("list my open tickets",
  "what tasks are open", "automate X"). The matcher is keyword-heavy.
- Body always contains:
  - When to invoke
  - Step-by-step playbook
  - Concrete CLI examples
  - Common failure modes and recoveries

---

## Extensions vs skills

pi-rote ships **both**. They serve different layers.

| | Extension | Skill |
|---|---|---|
| Type | TypeScript module | Markdown + YAML |
| Lifecycle | Hooks pi at session start | Loaded into context on demand |
| Purpose | System-level (prompt injection, bash interception, state tracking) | Agent-level (teach how to use tools) |
| Invocation | Automatic | Auto-trigger or `/<skill-name>` |
| Location | `extensions/` | `skills/` |

In pi-rote concretely:

- The **extension** does the probing, prompt augmentation, and bash-result hinting.
- The **skills** are the playbooks the model uses once it decides to act.

---

## Three intervention points

What the extension actually does, in order:

### 1. Session-start probing

```
rote --version                   → detects installed version
rote flow pending list --json    → finds resumable stubs
detect active workspace          → if user is in a rote workspace dir
```

Facts get injected into the system prompt so the agent knows what's available and
what's resumable.

### 2. Prompt augmentation

A guidance block is appended once at session start:

- "Use native pi file tools for local code/files."
- "Use raw `rote …` for workflow / API / automation."
- "Lifecycle: search → execute → crystallize → reuse."
- Live runtime facts: rote version, pending stub count, active workspace path.

### 3. Bash-result hinting

After each bash result, the command is classified:

| Classification | Behavior |
|---|---|
| `rote …` | No hint. |
| `git`, `cargo`, `npm`, `ls`, `find`, `rg`, `make`, `just`, … | No hint. |
| Likely rote bypass — `gh issue list`, `curl … github.com`, `stripe`, `linear`, `supabase` | Append a `rote hint:` block. |

Example hint:

```
rote hint: GitHub API detected. Consider:
  rote flow search "list issues"            # check for an existing flow
  rote explore "list issues"                # discover the github adapter
  rote adapter catalog search "github"      # find an installable adapter
```

---

## Workspace context tracking

Within one pi chat, pi-rote infers and remembers:

- Current rote workspace name + path
- Adapter sessions initialized in this chat
- Active endpoints

This is **chat-local and best-effort** — not persisted to disk and not guaranteed
across sessions. Its purpose is to let follow-up requests skip re-init.

---

## Behavior contract

### What pi-rote guarantees

- Raw `rote …` commands always pass through cleanly.
- Local dev commands (git, npm, cargo, …) are never hinted.
- Likely workflow bypasses *may* receive a hint.
- Active rote context *may* carry forward within one chat.

### What pi-rote does **not** guarantee

- Every direct API call is recognized as a rote opportunity.
- Every workspace state is recovered after a context compression.
- The model always obeys hints.
- Detection covers every CLI in the world (heuristics target a small set).

---

## Installation

```bash
# requires rote already on PATH:
curl -fsSL https://raw.githubusercontent.com/modiqo/rote-releases/main/install.sh | bash

# install pi-rote
pi install /absolute/path/to/pi-rote
# or run without installing:
cd /absolute/path/to/pi-rote
pi -e ./extensions/rote.ts
```

Then start a fresh pi session — the extension probes, the skills register.

---

## Versioning

| | rote | pi-rote |
|---|---|---|
| Current | `0.11.x` (semver, automated releases) | `0.1.0` (early stage) |
| License | BUSL-1.1 | Apache-2.0 |
| Coupling | independent | soft, runtime-only |

When rote ships a new command set, pi-rote's bundled skill markdown may lag until the
next pi-rote release. Recommended practice: test pi-rote against rote in CI on each
rote release; pin a known-good pi-rote per environment.

---

## Mental shortcut

> rote is the **engine**.
> pi-rote is the **steering wheel**.
> The engine works without the wheel. The wheel does nothing without the engine.
