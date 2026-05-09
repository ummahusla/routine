# Cursor Agent SDK — Research Compendium

> Compiled 2026-05-09 from 4 parallel web-research agents. Covers: foundational layer, code patterns, real-world use cases, and advanced internals. All claims cite primary sources where possible.

**Quick facts**
- Package: `@cursor/sdk` (npm), TypeScript only — Python "coming next"
- Status: **Public beta** (announced 2026-04-29)
- npm version observed: `1.0.12` (foundational research) / `0.1.x` (architecture research) — **mismatch noted; verify before production use**
- Default model: `composer-2` ($0.50/M input, $2.50/M output)
- Repo: [github.com/cursor/cursor](https://github.com/cursor/cursor) · Cookbook: [github.com/cursor/cookbook](https://github.com/cursor/cookbook)

---

# Part 1 — Foundational Layer

## 1.1 What It Is

The Cursor SDK is Anysphere's official TypeScript library that exposes "the same runtime, harness, and models that power Cursor" as a programmable API. The stated goal is to let you "build agents with the same runtime, harness, and models that power Cursor" — meaning the identical codebase-indexing engine, MCP-server integration, subagent scheduler, skills system, and hooks infrastructure that runs inside the Cursor desktop IDE, CLI, and web app are now callable from external code.

- **Official description (verbatim):** *"The agents that run in the Cursor desktop app, CLI, and web app are now accessible with a few lines of TypeScript. Run it on your machine or on Cursor's cloud against a dedicated VM, with any frontier model."* ([cursor.com/blog/typescript-sdk](https://cursor.com/blog/typescript-sdk))
- **Announced / released:** April 29, 2026 ([cursor.com/changelog/sdk-release](https://cursor.com/changelog/sdk-release))
- **Status:** Public beta — APIs may change before GA
- **GitHub source repo:** `github.com/cursor/cursor`; public cookbook at [github.com/cursor/cookbook](https://github.com/cursor/cookbook) (3.7 k stars, 95.8 % TypeScript)

The SDK shipped simultaneously with an overhauled **Cloud Agents API v1** (REST), which it wraps. The two surfaces are complementary: REST is documented separately; the TypeScript SDK is the recommended ergonomic layer.

## 1.2 Official Documentation URLs

| Resource | URL |
|---|---|
| SDK TypeScript docs | [cursor.com/docs/sdk/typescript](https://cursor.com/docs/sdk/typescript) |
| Cursor APIs overview | [cursor.com/docs/api](https://cursor.com/docs/api) |
| Cloud Agents REST | [cursor.com/docs/cloud-agent/api/endpoints](https://cursor.com/docs/cloud-agent/api/endpoints) |
| Hooks | [cursor.com/docs/hooks](https://cursor.com/docs/hooks) |
| Launch blog | [cursor.com/blog/typescript-sdk](https://cursor.com/blog/typescript-sdk) |
| Changelog | [cursor.com/changelog/sdk-release](https://cursor.com/changelog/sdk-release) |
| Cookbook | [github.com/cursor/cookbook](https://github.com/cursor/cookbook) |
| npm package | [npmjs.com/package/@cursor/sdk](https://www.npmjs.com/package/@cursor/sdk) |
| Models & Pricing | [cursor.com/docs/models-and-pricing](https://cursor.com/docs/models-and-pricing) |

No official PyPI package. Community-maintained `cursor-agent-sdk` exists on PyPI but is **not official**.

## 1.3 Languages / Runtimes

| Surface | Status |
|---|---|
| TypeScript / Node.js (`@cursor/sdk`) | Official, public beta |
| REST / HTTP (Cloud Agents API v1) | Official, public beta |
| Python | "Coming next" — announced, not shipped |
| CLI (`cursor` binary) | Separate product; SDK does not wrap |
| Community Python SDK | Unofficial REST wrapper |

Ships ESM + CJS bundles.

## 1.4 Installation & Setup

**Install:** `npm install @cursor/sdk`

**API key types:**
| Type | Source |
|---|---|
| User API key | Cursor Dashboard → Integrations |
| Service account key | Team settings → Service accounts (CI/automation) |

Team Admin keys not yet supported. Format: `crsr_` + 64 chars. Auth: **HTTP Basic Auth** (key as username, blank password).

**Env var:** `export CURSOR_API_KEY="crsr_..."` (or pass `apiKey` to `Agent.create()`). Cloud `envVars` cannot start with `CURSOR_`.

**Worker sub-tokens** for multi-tenant SaaS: service account keys can mint short-lived tokens scoped to a specific user via `POST /v1/sub-tokens`, valid 1 hour, non-renewable.

## 1.5 Core Primitives / API Surface

Five major entry-point concepts:

### `Agent` — durable agent object
| Method | Purpose |
|---|---|
| `Agent.create(config)` | Instantiate (local / cloud / cloud self-hosted) |
| `Agent.resume(agentId, config)` | Re-attach to existing durable agent |
| `Agent.prompt(text, options)` | One-shot — create, run, dispose |
| `agent.send(message)` | Enqueue prompt; returns `Run` |
| `agent.close()` / `agent[Symbol.asyncDispose]()` | Dispose; works with `await using` |
| `agent.reload()` | Re-read filesystem config |
| `agent.listArtifacts()` / `agent.downloadArtifact(path)` | Cloud-only output retrieval |

### `Run` — single prompt execution
Only one `Run` active per agent at a time; concurrent send → HTTP 409.

| Symbol | Purpose |
|---|---|
| `run.id`, `run.agentId`, `run.status` | Identity / state |
| `run.result` | Final assistant text |
| `run.stream()` | Async generator of `SDKMessage` events |
| `run.wait()` | Await completion |
| `run.cancel()` | Cancel in-flight |
| `run.conversation()` | Structured turn history |
| `run.onDidChangeStatus(fn)` | Subscription |

### Runtime modes (mutually exclusive in `Agent.create()`)
```typescript
local: { cwd: "/path/to/repo" }

cloud: {
  repos: [{ url: "https://github.com/org/repo", startingRef: "main" }],
  autoCreatePR: true,
  autoGenerateBranch: true,
}

cloud: { repos: [...], env: { type: "pool", name: "pool-name" } }   // self-hosted
```

### `Hooks` — lifecycle interception
Spawned processes (or LLM-prompt conditions) communicating JSON over stdin/stdout. Defined in `.cursor/hooks.json` (project / user / enterprise). Allow / deny / modify agent-loop stages. Events: `sessionStart/End`, `preToolUse`, `postToolUse`, `beforeShellExecution`, `beforeMCPExecution`, `beforeFileRead`, `afterFileEdit`, `beforeSubmitPrompt`, `stop`, `subagentStart/Stop`. Decision payload: `{ "permission": "allow|deny|ask", "user_message": "...", "agent_message": "..." }`. Hook commands execute 40× faster as of Cursor 2.4.

### MCP servers and Skills
- **MCP servers** declared inline or via `.cursor/mcp.json`; `stdio` (subprocess) or `http` (remote)
- **Skills** = Markdown files (`SKILL.md`) in `.cursor/skills/` with reusable commands; dynamically discovered, not always-on
- **Subagents** = named child agents spawned by parent; isolated context; own model/tools/prompts

### Streaming event types
`run.stream()` discriminated union: `"system"`, `"user"`, `"assistant"`, `"thinking"`, `"tool_call"`, `"status"`, `"task"`, `"request"`. SSE supports reconnect via `Last-Event-ID`; retention window in `X-Cursor-Stream-Retention-Seconds` header.

### Error hierarchy
All extend `CursorAgentError`. Subtypes: `AuthenticationError`, `RateLimitError`, `ConfigurationError`, `NetworkError`, `IntegrationNotConnectedError`, `UnknownAgentError`, `UnsupportedRunOperationError`. `error.isRetryable` for transient failures.

## 1.6 Pricing / Quota / Models

Token-based consumption pricing, separate from monthly seat fee.

| Model | Input ($/M) | Output ($/M) | Cache Read ($/M) |
|---|---|---|---|
| **Composer 2** (Standard) | $0.50 | $2.50 | $0.20 |
| Composer 2 (Fast) | $1.50 | $7.50 | $0.35 |
| Claude 4.6 Sonnet | $3.00 | $15.00 | $0.30 |
| Claude 4.7 Opus | $5.00 | $25.00 | $0.50 |
| GPT-5.4 | $2.50 | $15.00 | $0.25 |
| GPT-5.5 | $5.00 | $30.00 | $0.50 |
| Gemini 3.1 Pro | $2.00 | $12.00 | $0.20 |

Composer 2 (default, released 2026-03-19): CursorBench 61.3, SWE-bench Multilingual 73.7, Terminal-Bench 2.0 61.7. Trained with RL on extended agentic workflows.

**Rate limits (REST):**
| API | Limit |
|---|---|
| Admin (standard) | 20 req/min/team |
| Analytics | 100 req/min/team |
| AI Code Tracking | 20 req/min/team |
| `GET /v1/repositories` | 1 req/user/min, 30/user/hour |
| Cloud Agents / SDK | not published; `RateLimitError` thrown |

**Plan credits:** Pro $20→$20 · Pro Plus $60→$70 · Ultra $200→$400. Teams: +$0.25/M tokens on non-Auto requests.

**Constraints:** max 5 images/prompt @ 15 MB; 1 repo/cloud agent (v1); `envVars` cannot start with `CURSOR_`.

## 1.7 Comparison Framing

Cursor positions the SDK not as an LLM orchestration framework (OpenAI Agents SDK / Claude Agent SDK category) but as **harness-as-a-service**: you rent the production coding agent runtime that powers a multi-billion-dollar IDE — codebase indexing, semantic search, MCP, skills, hooks, subagents pre-integrated. Vercel AI SDK is generation-and-streaming abstraction with no first-party coding harness; OpenAI / Claude SDKs require devs to supply tool layer and are single-model. Cursor's SDK is model-agnostic — *"switching models is a single field change"* — and defaults to Composer 2 at $0.50/M input vs. $5/M for Opus-class. Tradeoff: flexibility vs. control. Informal harness benchmark: Claude Opus 4.7 hit 91.1 % task success in Cursor harness vs. 87.2 % in Claude Code harness — runtime contributes measurable capability independent of model.

---

# Part 2 — Code Patterns

> Targets `@cursor/sdk` npm package. TypeScript only. Verify against latest version before production use.

## 2.1 Hello-World

```typescript
// package.json: { "type": "module" }
// node --env-file=.env index.ts   (Node 22+)

import { Agent } from "@cursor/sdk";

const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
});

const run = await agent.send("Summarize what this repository does");

for await (const event of run.stream()) {
  console.log(event);           // raw SDKMessage objects
}
```

## 2.2 Tool / Function Calling via MCP

SDK does **not** expose raw "register a JS function as a tool" API. Instead integrates **MCP**: point agent at stdio process or HTTP endpoint; harness auto-discovers tools.

```typescript
const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
  mcpServers: {
    sentry: {
      type: "http",
      url: "https://mcp.sentry.io/sse",
      headers: { Authorization: `Bearer ${process.env.SENTRY_TOKEN!}` },
    },
    filesystem: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()],
    },
    linear: {
      type: "stdio",
      command: "npx",
      args: ["@linear/mcp"],
      env: { LINEAR_API_KEY: process.env.LINEAR_API_KEY! },
    },
  },
});

const run = await agent.send(
  "List Sentry issues affecting payments and open Linear tasks for each"
);

for await (const event of run.stream()) {
  if (event.type === "tool_call") {
    console.log(`[tool] ${event.name} — ${event.status}`);
    if (event.status === "completed") console.log("  result:", event.result);
  }
}
```

`.cursor/mcp.json` alternative:
```json
{
  "mcpServers": {
    "sentry": { "type": "http", "url": "https://mcp.sentry.io/sse" },
    "linear": { "type": "stdio", "command": "npx", "args": ["@linear/mcp"] }
  }
}
```

## 2.3 Streaming Responses

`run.stream()` returns `AsyncGenerator<SDKMessage>` — discriminated union across 8 message types. For per-token deltas: `onDelta` / `onStep` callbacks.

```typescript
// Option A: SDKMessage event loop
const run = await agent.send("Refactor the utils module");

for await (const event of run.stream()) {
  switch (event.type) {
    case "system":      console.log("[system] tools:", event.tools); break;
    case "assistant":
      for (const block of event.message.content) {
        if (block.type === "text") process.stdout.write(block.text);
      }
      break;
    case "thinking":    process.stdout.write(`[thinking] ${event.text}`); break;
    case "tool_call":   console.log(`\n[tool] ${event.name}: ${event.status}`); break;
    case "status":      console.log(`[cloud status] ${event.status}`); break;
    case "task":        break;
  }
}

// Option B: per-token deltas
const run2 = await agent.send("Write release notes", {
  onDelta: ({ update }) => {
    if (update.type === "text-delta")    process.stdout.write(update.text);
    if (update.type === "token-delta")  process.stdout.write(`[${update.tokens}tok]`);
    if (update.type === "tool-call-started")
      console.log(`\n[tool started] ${update.toolCall.type}`);
    if (update.type === "tool-call-completed")
      console.log(`\n[tool done] ${update.toolCall.type}`);
  },
  onStep: ({ step }) => console.log(`[step] ${step.type}`),
});
```

> **Known bug** (`@cursor/sdk@1.0.10`): `tool_call` `status: "error"` not always emitted for built-in tools. [Forum bug](https://forum.cursor.com/t/cursor-sdk-run-stream-messages-do-not-receive-error-status-messages-for-tool-calls/159816)

## 2.4 Multi-Turn / Session Management

`SDKAgent` is the conversation container. Each `send()` advances same thread. Cloud: 2nd `send()` while 1st active → `409 agent_busy`. Reconnect by ID with `Agent.resume()` after process restart.

> **Known bug:** local agents may not retain context across `send()` calls. Cloud unaffected. [Forum bug](https://forum.cursor.com/t/sdk-local-agents-do-not-retain-conversation-context-between-agent-send-calls/159440)

```typescript
await using agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
});

const run1 = await agent.send("Plan auth refactor — list files we'll touch");
await run1.wait();

const run2 = await agent.send("Now implement plan and add regression tests");
await run2.wait();

const turns = await run2.conversation();

// Reconnect by ID after restart
const savedAgentId = agent.agentId;
const reconnected = await Agent.resume(savedAgentId, {
  apiKey: process.env.CURSOR_API_KEY!,
});
```

## 2.5 File / Workspace / Codebase Context

Codebase context is **automatic**: `local.cwd` (or `cloud.repos`) → harness indexes repo, performs semantic search / grep / file reads autonomously. No explicit "attach files" API. Cloud agents clone repo into isolated VM.

```typescript
// Local: agent reads/edits files in cwd
const localAgent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: {
    cwd: "/absolute/path/to/your/repo",
    settingSources: ["project", "user"],
  },
});

// Cloud: clone GitHub repo into sandbox VM
const cloudAgent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  cloud: {
    repos: [{ url: "https://github.com/your-org/your-repo", startingRef: "main" }],
    autoCreatePR: true,
    skipReviewerRequest: false,
    envVars: {
      STAGING_API_TOKEN: process.env.STAGING_API_TOKEN!,
      DATABASE_URL:      process.env.DATABASE_URL!,
    },
  },
});

const cloudRun = await cloudAgent.send("Fix CI failure #1234 and open PR");

// Reconnect from different process
const handle = await Agent.getRun(cloudRun.id, {
  runtime: "cloud",
  agentId: cloudAgent.agentId,
  apiKey: process.env.CURSOR_API_KEY!,
});
const cloudResult = await handle.wait();
console.log("PR URL:", cloudResult.git?.branches?.[0]?.prUrl);

// Download artifacts
const artifacts = await cloudAgent.listArtifacts();
const buf = await cloudAgent.downloadArtifact("dist/bundle.js");
```

## 2.6 Subagents / Parallelism

Parent agent spawns subagents via built-in `Agent` (Task) tool. Isolated context windows prevent main-context bloat. Parallel triggered by prompt phrasing or `is_background: true` frontmatter. Inline definition in `Agent.create()` or `.cursor/agents/*.md` files.

```typescript
const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
  agents: {
    "code-reviewer": {
      description: "Expert code reviewer. Checks bugs, security, style. Use proactively after any code change.",
      prompt: "Review diff for correctness, security, project conventions. Return structured issue list.",
      model: "inherit",
    },
    "test-writer": {
      description: "Writes comprehensive tests for new code.",
      prompt: "Given changed files, write tests covering happy paths, edges, failures. Use project's existing framework.",
      model: { id: "composer-2" },
    },
  },
});

const run = await agent.send(
  "Implement /payments/refund endpoint, then have code-reviewer check and test-writer write tests — in parallel."
);
```

File-based: `.cursor/agents/code-reviewer.md`
```markdown
---
name: code-reviewer
description: Expert code reviewer for quality and security. Use proactively after any code change.
model: inherit
readonly: true
is_background: false
---

You are a skeptical code reviewer. When invoked:
1. Identify what changed.
2. Check for bugs, security issues, missed edges.
3. Return prioritised issue list with file:line references.
```

## 2.7 Hooks / Interceptors

External processes (shell / Node / Bun / Python) spawned at lifecycle points; JSON over stdin/stdout. Configured in `.cursor/hooks.json` only — no programmatic callback API. `failClosed: true` blocks action if hook crashes.

```json
// .cursor/hooks.json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      { "command": ".cursor/hooks/guard-shell.sh", "type": "command",
        "timeout": 10, "failClosed": true,
        "matcher": "rm|DROP|kubectl delete" }
    ],
    "afterFileEdit": [
      { "command": ".cursor/hooks/format.sh", "type": "command", "timeout": 30 }
    ],
    "stop": [
      { "command": ".cursor/hooks/iterate.ts", "type": "command", "loop_limit": 5 }
    ],
    "beforeMCPExecution": [
      { "type": "prompt",
        "prompt": "Does this MCP tool call look safe? $ARGUMENTS",
        "timeout": 15, "failClosed": true }
    ]
  }
}
```

```bash
# .cursor/hooks/guard-shell.sh
#!/usr/bin/env bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.command // empty')
if [[ "$cmd" =~ (rm[[:space:]]+-rf|DROP[[:space:]]+TABLE|kubectl[[:space:]]+delete) ]]; then
  printf '{"permission":"deny","user_message":"Destructive command blocked by policy."}'
else
  printf '{"permission":"allow"}'
fi
```

```typescript
// .cursor/hooks/iterate.ts — re-run until all tests pass (Bun)
import { stdin } from "bun";

const MAX = 5;
const payload = JSON.parse(await stdin.text());

if (payload.status === "completed" && payload.loop_count < MAX) {
  process.stdout.write(JSON.stringify({
    followup_message: `Run full test suite. If tests fail, fix them. Iter ${payload.loop_count + 1}/${MAX}.`,
  }));
} else {
  process.stdout.write("{}");
}
```

## 2.8 Error Handling / Retries / Cancellation

`CursorAgentError` base + typed subclasses. `isRetryable` for transient failures. Cloud enforces single-active-run-per-agent. `await using` for guaranteed cleanup; `run.cancel()` for cooperative abort.

```typescript
import {
  Agent, CursorAgentError, AuthenticationError,
  RateLimitError, NetworkError, IntegrationNotConnectedError,
} from "@cursor/sdk";

async function runWithRetry(prompt: string, maxAttempts = 3): Promise<string> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    await using agent = await Agent.create({
      apiKey: process.env.CURSOR_API_KEY!,
      model: { id: "composer-2" },
      local: { cwd: process.cwd() },
    });

    const run = await agent.send(prompt);
    const timeout = setTimeout(() => run.cancel(), 60_000);

    try {
      for await (const event of run.stream()) {
        if (event.type === "assistant") {
          for (const block of event.message.content) {
            if (block.type === "text") process.stdout.write(block.text);
          }
        }
      }
      const result = await run.wait();
      clearTimeout(timeout);
      if (result.status === "cancelled") throw new Error("Run timed out");
      return result.result ?? "";
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof AuthenticationError) throw error;
      if (error instanceof IntegrationNotConnectedError) {
        console.error(`Connect at: ${error.helpUrl}`);
        throw error;
      }
      if ((error instanceof RateLimitError || error instanceof NetworkError)
          && error.isRetryable && attempt < maxAttempts) {
        const delay = 1000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (error instanceof CursorAgentError && !error.isRetryable) throw error;
      throw error;
    }
  }
  throw new Error(`Failed after ${maxAttempts} attempts`);
}
```

| Class | Meaning |
|---|---|
| `AuthenticationError` | Bad/missing API key |
| `RateLimitError` | Rate exceeded (`isRetryable: true`) |
| `NetworkError` | Transport failure (`isRetryable: true`) |
| `ConfigurationError` | Invalid `AgentOptions` |
| `IntegrationNotConnectedError` | GitHub/cloud integration not authorised |
| `UnknownAgentError` | Agent ID not found |
| `UnsupportedRunOperationError` | Operation invalid for run state |

## 2.9 Quick-Reference Helpers

```typescript
const models = await Cursor.models.list();

// One-shot — no persistent Agent
const result = await Agent.prompt("What does auth middleware do?", {
  apiKey: process.env.CURSOR_API_KEY!,
  model: { id: "composer-2" },
  local: { cwd: process.cwd() },
});

const { items } = await Agent.list({ runtime: "local", cwd: process.cwd() });

await agent.reload();

await Agent.archive(agentId);
await Agent.unarchive(agentId);
await Agent.delete(agentId);   // permanent
```

## 2.10 Pattern Gaps (not yet documented)

- Python SDK — planned, not released
- Inline MCP tool registration (JS function as tool without separate process) — unknown
- Programmatic hooks (JS callback vs external process) — unknown; file-based only
- DAG / fan-out orchestration — only [cookbook DAG example](https://github.com/cursor/cookbook/tree/main/sdk/dag-task-runner), no first-class API

---

# Part 3 — Real-World Use Cases & Integrations

## 3.1 Use Cases Highlighted by Cursor

From [SDK launch blog](https://cursor.com/blog/typescript-sdk) and [changelog](https://cursor.com/changelog/sdk-release):

- **CI/CD failure triage** — Agents kicked off from CI to fetch logs, identify root cause, generate fix, verify, open PR. Claimed 30–50% reduction in routine CI maintenance time.
- **Automated PR summarization** — On merge.
- **Issue-to-PR automation** — Kanban demo where dragging a card spawns agent. Rippling and Notion run agents that pick up Linear/Jira tickets.
- **Internal no-code platforms** — Non-technical teams (GTM/sales) query product data.
- **Customer-facing embedded agents** — Inside host product.
- **Security audits / agentic codeowners** — Auto-approve low-risk; assign reviewers based on blast radius.
- **Repo maintenance** — Weekly summaries, coverage gaps, dependency migrations.

[Automations launch](https://cursor.com/blog/automations) (March 2026) added event triggers: Slack messages, Linear creation, GitHub PR merges, PagerDuty incidents, custom webhooks.

**Customer quotes:**
- George Jacob (Faire): "great cloud experience for running many agents in parallel"
- Tim Fall (Rippling): "automations make repetitive work easy to offload"
- Tal Peretz (Runlayer): "we move faster than teams 5× our size"

## 3.2 Third-Party Showcases

**[github.com/cursor/cookbook](https://github.com/cursor/cookbook):**
| Example | Description |
|---|---|
| Quickstart | Minimal Node.js: create, send, stream |
| app-builder | Web app spinning agents to scaffold projects in cloud sandbox |
| agent-kanban | Kanban grouping Cloud Agents by status/repo, previews artifacts |
| Coding Agent CLI | Lightweight terminal CLI |
| DAG Task Runner | JSON DAG, fans out to local subagents, streams to Cursor Canvas |

**Community projects:**
- **cursorconnect** — Python wrapper around REST API ([github.com/bloomresearch/cursorconnect](https://github.com/bloomresearch/cursorconnect))
- **OpenProse** — Multi-agent Markdown CLI integrated SDK (PR #64)
- **Helmor** — Tauri desktop app via `bun build --compile` (blocked by sqlite3 native addon)

**Assessment:** Third-party ecosystem sparse as of early May 2026 (beta < 4 weeks old). Most adoption inside Rippling, Brex, Money Forward, Notion, Faire. No independent commercial products publicly announced.

## 3.3 Integration Patterns

### GitHub
- [Cursor GitHub app](https://cursor.com/docs/integrations/github) — repo cloning, branch creation, PR creation, CI status
- GitHub Enterprise Server v3.8+ via PrivateLink/Private Service Connect or on-prem reverse proxy (outbound WebSocket only)

### GitHub Actions / CI
- [Integration docs](https://cursor.com/docs/cli/github-actions): CLI install via `curl https://cursor.com/install -fsS | bash`, auth via `CURSOR_API_KEY` secret
- Two autonomy modes: **Full** (unrestricted git/CLI) / **Restricted** (file edits only; CI handles commits/comments)
- Fine-grained JSON allow/deny on patterns, dirs, commands
- Works on any CI supporting shell + env vars
- Stormy AI's [Zero Bug Policy tutorial](https://stormy.ai/blog/automating-zero-bug-policy-cursor-cli-github-actions-ci-cd)

### Slack
- Official [Cursor Slack integration](https://cursor.com/docs/integrations/slack); `@cursor` mention in any channel
- Repo/model selection explicit or auto (content + recency + routing rules)
- Reads thread context; follow-ups picked up on subsequent invocations
- **Money Forward** (~1000 engineers) triggers PRs from Slack
- Channel defaults, routing rules, Privacy Mode configurable

### Linear
- Marketplace plugin — read/manage issues, projects, docs
- Automations trigger on issue creation: investigate → fix → PR back to issue
- Linear engineering uses for own "Zero Bug Policy"

### PagerDuty
- [GA MCP integration](https://support.pagerduty.com/main/changelog/pagerduty-cursor-mcp-integration-is-generally-available)
- Cursor agents query on-call, service status, incident history
- Automations on incident: query Datadog logs → propose fix via PR

### Subagents / Multi-Agent (DAG)
- Built-in `Agent` tool delegates to named subagents; no orchestration code
- Pattern: code-review agent spawns 4 parallel subagents (security/perf/correctness/readability) → synthesizes report
- DAG Task Runner cookbook externalizes as JSON DAG with live status streaming

### MCP
- Both stdio and HTTP/SSE; env vars + headers; configured per-agent
- Gap: MCP server state not resumed across `Agent.resume()`

## 3.4 Enterprise / Team

### Auth
- SSO/SAML, SCIM provisioning, Service Accounts, MDM policies
- API key auth for SDK; **Team Admin keys not yet supported**

### Audit / Compliance
- 19 audit log event types; SIEM streaming
- Hooks (`.cursor/hooks.json`) for custom observability/policy/logging — available without Enterprise
- SOC2 Type II, GDPR; HIPAA BAA available for Enterprise
- Privacy Mode = zero data retention with AI providers

### BYOK
- Available on Enterprise; Azure gateway routing one supported pattern

### Self-Hosted Workers
- [Self-hosted cloud agents](https://cursor.com/blog/self-hosted-cloud-agents) (GA 2026-03-25)
- Worker establishes **outbound HTTPS** to Cursor cloud — no inbound ports/VPN
- Cursor handles inference/planning; worker executes tools in customer network
- Helm chart + K8s operator with `WorkerDeployment` CRD; Fleet Management API for non-K8s
- Limits: 10 workers/user, 50/team
- Reference: Brex (test suites + internal tools), Money Forward (financial regulatory), Notion (secure tool access)

## 3.5 Notable Commentary

**Official:**
- [Cursor X announcement](https://x.com/cursor_ai/status/2049499866217185492)
- [Eric Zakariasson kanban demo](https://x.com/ericzakariasson/status/2049511147762753581)

**Developer reactions:**
- **Malte Ubl** (former Google) — key structural critique: ["this requires a Cursor API key. So, this is different from other harnesses which will run without cloud connection except for the model access."](https://x.com/cramforce/status/2049519803191460295) — Cursor SDK requires Cursor account + API key + cloud connection at runtime, unlike Claude/OpenAI SDKs.
- **@kimmonismus**: "Cursor is making a platform play... turning their agent runtime into programmable infrastructure... Every agent burns tokens via Cursor."

**[Hacker News Cursor 3 thread](https://news.ycombinator.com/item?id=47618084):**
- Dev reported "$2k/week with premium models" before switching to Claude Code at ~1/10 cost
- Reviewing parallel agent output "so mentally taxing it's practically impossible to achieve flow state"
- Cursor engineer (leerob) clarified IDE editor view continues alongside agent-first interface

**Press:**
- [The New Stack: "Several known limitations"](https://thenewstack.io/cursor-sdk-ai-agents/)
- Curtis Pyke (Kingy AI): "Cursor has taken its coding agent out of the IDE and made it programmable. That is a big deal."
- David Cramer (Sentry) on BugBot: "Hit rate from Bugbot is insane."

**BugBot — Cursor's own SDK proof-of-concept:**
- [Architecture post](https://cursor.com/blog/building-bugbot)
- Reviews 2M+ PRs/month for Rippling, Discord, Samsara, Airtable, Sierra AI
- Evolved from 8-pass parallel pipeline to fully agentic (fall 2025)
- Resolution rate 52% → 70%+; bugs/run 0.4 → 0.7
- Rippling: BugBot "gives back 40% of code review time"
- WorkOS [case study](https://workos.com/blog/cursor-bugbot-autoreview-claude-code-prs): 76% resolution on Claude-Code-generated PRs; 35% of autofix changes merged

## 3.6 Comparisons in the Wild

### vs. Claude Code SDK
[MindStudio comparison](https://www.mindstudio.ai/blog/cursor-sdk-vs-claude-code-harness-comparison):
- **Performance:** Claude Opus 4.7 → 87.2% SWE-bench in Claude Code harness vs. **91.1% in Cursor harness** (3.9pt gap). GPT-5.5 in Cursor (87.2%) vs. native Codex (61.5%) — **25.7pt swing**. "Harness quality now exceeds model improvements as performance driver."
- **Architecture:** "Cursor SDK isn't just calling LLM with tools" — production runtime with hooks, indexing, semantic search, optimized compaction
- **Claude Code strengths:** Progressive 3-level skill system, broader language support (Python/TS/CLI), no cloud dependency for model access
- **Cursor SDK strengths:** Distributed use cases (Gmail, Chrome plugins, standalone), durable agent containers, Composer 2

[Builder.io comparison](https://www.builder.io/blog/cursor-vs-claude-code): "Claude Code is agent-first; Cursor is IDE-first." Convergence: "Both have background agents, CLI, agentic capabilities." Independent finding: "Claude Code uses 5.5× fewer tokens than Cursor for identical tasks."

**Pricing (Teams):**
| Tool | $/user/month |
|---|---|
| Cursor Teams | $40 |
| Claude Code Teams | $125 |
| BugBot add-on | $40 |

**Consensus:** Most production teams in 2026 run both — Claude Code for autonomous engineering / large refactors; Cursor for interactive IDE work + parallel agent management.

### vs. OpenAI Agents SDK / Codex
- Malte Ubl observation = most-cited difference (Cursor requires cloud connection at runtime even with self-hosted workers, blocking fully air-gapped deployments)
- [ComputingForGeeks](https://computingforgeeks.com/opencode-vs-claude-code-vs-cursor/): SWE-bench Verified — Claude Code 78.4%, Codex 71.0%, Cursor 67.2%

---

# Part 4 — Advanced Architecture & Internals

## 4.1 Architecture

### Runtime Topology
| Runtime | Where inference runs | Where tools run | Durability |
|---|---|---|---|
| **Local** | Cursor cloud inference API | Developer's Node.js process | Process lifetime |
| **Cloud (Cursor-hosted)** | Cursor cloud | Dedicated Cursor-managed AWS VM | Survives network drops |
| **Cloud (self-hosted pool)** | Cursor cloud | Customer VMs / containers | Configurable |

**Critical:** inference **never runs locally**. Even "local" mode forwards model calls to Cursor backend. Local component = harness only.

### Process Model
- **Local:** runs inline inside calling Node.js process — no separate daemon. Process exit = session end. No local resumption.
- **Cloud:** isolated AWS VMs, repo clone, full dev env. Durable SSE streams with reconnection.
- **Self-hosted pool:** worker polls Cursor outbound via HTTPS — no inbound ports / VPN. Inference + planning still in Cursor cloud; only tool execution on customer infra. Limits: 10 workers/user, 50/team. Helm chart + K8s operator OR Fleet Management REST API. Prometheus metrics + health endpoints at `--management-addr`.

### Composer 2 Inference
- Default model
- Distributed inference partnership with **Fireworks AI**; weight syncs every training step via delta-compressed S3 uploads
- Custom **MLA (Multi-Head Latent Attention)** kernel + **Multi-Token Prediction** for speculative decoding — "2–3× faster inference with minimal quality degradation"
- Two pricing tiers: standard / fast
- Discoverable via `Cursor.models.list()`

## 4.2 Tool Execution Model

### Built-in Tools
`shell`, `edit`, `read`, `write`, `glob`, `grep`, `ls`, `semantic_search`, `mcp`, `task`, others. Docs warn: **"Tool schema is not stable"** — parse defensively.

### Tool Call Lifecycle
Two `tool_call` events per call:
1. `status: "running"` + `args`
2. `status: "completed"` (or `"error"`) + `result`

### Parallelism
- Subagents run parallel within parent session
- `/multitask` command (v3.3, May 2026) and `agents` config in `Agent.create()`
- Within single agent: **only one run active per agent**; concurrent `send()` → `409 agent_busy`

### Tool Call Limits
| Mode | Per-interaction tool calls | File read truncation |
|---|---|---|
| Standard | 25 | 250 lines |
| MAX (Claude / Gemini) | 200 | 750 lines |

Shell command timeout: **30s** (not configurable).

### Approval / Permission Flow
| Action | Default |
|---|---|
| File reads, code search, workspace edits | No approval |
| Terminal, config files, data exposure | Approval required |
| MCP tool calls | Approval per-tool after server connection |

ACP clients receive `session/request_permission`; respond `allow-once` / `allow-always` / `reject-once`. No response = blocks tool.

CLI flags: `--force` / `--yolo` skips file modification approvals; `--approve-mcps` documented but **insufficient to unblock MCP in `-p` mode** (see §4.8 bugs).

Hook permission decisions: `{ "permission": "allow|deny|ask" }` from `preToolUse`/`beforeShellExecution`/`beforeMCPExecution`. Exit code 2 = deny.

## 4.3 Context Management

### Codebase Indexing — Merkle Tree + Embeddings
1. Files chunked by syntactic units (functions, classes — not byte windows)
2. SHA-256 per chunk; tree root = cryptographic summary
3. Hash divergence detects changed branches; only modified chunks re-embedded
4. **Simhash** of tree matched against vector DB → enables **index reuse across team members** (median time-to-first-query 7.87s → **525ms**)
5. Embeddings in **Turbopuffer** (remote vector DB)

Security: server filters search results against client's Merkle tree → can't see code you don't possess.

### Context Window
- Standard: ~200K tokens; portion consumed by system prompts/rules/skills/MCP before user content
- MAX: model's max (1M+ for Gemini 3.1 Pro)
- **Composer 2 self-summarizes** via RL-trained compaction (intrinsic to generation policy, not external compaction like Morph)
- CLI `/compress` for manual invocation
- `preCompact` hook event
- v3.3 IDE shows context breakdown by rules / skills / MCPs / subagents

### Semantic Search
Cursor's own embedding model + background indexing. RAG over local codebase. Top-k results injected into model context.

## 4.4 Configuration Surface

### File Hierarchy
| File | Location | Purpose |
|---|---|---|
| `.cursor/mcp.json` | project / `~/` | MCP server defs |
| `.cursor/hooks.json` | project / `~/` | Hook defs |
| `.cursor/rules/` | project | Markdown rules (`.md` / `.mdc`) |
| `.cursor/skills/` | project | Skills (`SKILL.md` with frontmatter) |
| `.cursor/agents/*.md` | project | Subagent defs |
| `~/.cursor/permissions.json` | user | Terminal allowlists |
| `AGENTS.md` | project | Plain-MD alternative to `.cursor/rules/` |
| `.cursorignore` | project | Excludes from indexing |

`.cursorrules` (legacy) functional but soft-deprecated; new rules → `.cursor/rules/` folder format.

### Rules Frontmatter
```yaml
---
alwaysApply: boolean
description: string
globs: string         # e.g. "**/*.tsx"
---
```
Precedence: **Team → Project → User**.

### Hooks Schema
```json
{
  "version": 1,
  "hooks": {
    "<event>": [{
      "command": "path/to/script",
      "type": "command" | "prompt",
      "timeout": 30,
      "loop_limit": 5,
      "failClosed": false,
      "matcher": { ... }
    }]
  }
}
```

Events: `sessionStart/End`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart/Stop`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `stop`, `afterAgentResponse`, `afterAgentThought`.

Exit codes: 0 = success, 2 = deny, other non-zero = fail-open (unless `failClosed: true`).

Location priority: Enterprise (`/Library/Application Support/Cursor/hooks.json` macOS) > Team (cloud) > Project > User.

Hook env vars: `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, `CURSOR_USER_EMAIL`, `CURSOR_TRANSCRIPT_PATH`, `CURSOR_CODE_REMOTE`, `CLAUDE_PROJECT_DIR` (compat alias).

### `Agent.create()` Options Sketch
```typescript
Agent.create({
  apiKey: string,
  model: { id: string, params?: ModelParameterValue[] },
  name?: string,
  local?: {
    cwd?: string,
    settingSources?: SettingSource[],   // "project"|"user"|"team"|"mdm"|"plugins"|"all"
    sandboxOptions?: { enabled: boolean }
  },
  cloud?: {
    env?: { type: "cloud"|"pool"|"machine"; name?: string },
    repos?: { url, startingRef?, prUrl? }[],
    workOnCurrentBranch?: boolean,
    autoCreatePR?: boolean,
    skipReviewerRequest?: boolean,
    envVars?: Record<string,string>     // encrypted at rest, no CURSOR_ prefix
  },
  mcpServers?: Record<string, McpServerConfig>,
  agents?: Record<string, SubagentDefinition>
})
```

### CLI Flags
| Flag | Purpose |
|---|---|
| `-p`, `--print` | Headless / non-interactive |
| `--force`, `--yolo` | Allow file mods without approval |
| `--approve-mcps` | Pre-approve MCP tools (buggy — see §4.8) |
| `--output-format text\|json\|stream-json` | Output format |
| `--stream-partial-output` | Token-level deltas |
| `--resume [thread-id]` / `--continue` | Resume conversation |
| `--worktree` | Isolated git worktree under `~/.cursor/worktrees` |
| `--workspace <path>` | Repo root |
| `--mode=plan\|ask` | Start mode |
| `--pool-name <name>` | Self-hosted worker routing label |
| `--idle-release-timeout` | Worker exit timeout |

### Env Vars
| Var | Purpose |
|---|---|
| `CURSOR_API_KEY` | SDK + CLI auth |
| `CURSOR_AUTH_TOKEN` | Alt auth for ACP |
| `CURSOR_AGENT_BIN` | Pin CLI binary version (regression workaround) |
| `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, `CURSOR_TRANSCRIPT_PATH` | Set by hooks runtime |

## 4.5 MCP Support

**Role:** **Client only**. SDK does not act as MCP server.

**Transports:** `stdio` / `http` / `sse`.
```typescript
type McpServerConfig =
  | { type?: "stdio"; command: string; args?: string[]; env?: Record<string,string>; cwd?: string }
  | { type?: "http"; url: string; headers?: Record<string,string>; auth?: OAuthConfig }
  | { type?: "sse"; url: string; headers?: Record<string,string>; auth?: OAuthConfig }
```

**Loading precedence (local):**
1. Per-`send()` `mcpServers` (replaces creation-time for that run)
2. Creation-time `mcpServers`
3. Plugin servers (if `settingSources` includes `"plugins"`)
4. Project `.cursor/mcp.json` (if `"project"`)
5. User `~/.cursor/mcp.json` (if `"user"`)

**Loading precedence (cloud):**
1. Per-`send()` `mcpServers`
2. Creation-time `mcpServers`
3. User + team servers from `cursor.com/agents` dashboard

**Critical limitation:** MCP server configs **not persisted across `Agent.resume()`** — must re-pass on every resume.

**Security:** HTTP/SSE `headers` + `auth` handled by Cursor backend; sensitive fields **redacted before VM**. Stdio `env` injected directly into VM — treat as runtime secrets.

**CLI MCP commands:**
```bash
agent mcp list
agent mcp list-tools <identifier>
agent mcp login <identifier>
agent mcp enable/disable <identifier>
```

OAuth credentials for team-level servers remain **per-user**.

## 4.6 Observability

### Stream Events
**`run.stream()` `SDKMessage` types:**
| Type | Key fields |
|---|---|
| `"system"` | `subtype?`, `model?`, `tools?` (once at run start) |
| `"assistant"` | `message.content: (TextBlock \| ToolUseBlock)[]` |
| `"thinking"` | `text`, `thinking_duration_ms?` |
| `"tool_call"` | `call_id`, `name`, `status`, `args?`, `result?` |
| `"status"` | `status`, `message?` (cloud transitions) |
| `"task"` | `status?`, `text?` (subagent milestones) |
| `"request"` | `request_id` (approval gate) |

**`onDelta` / `onStep` callbacks expose:** `text-delta`, `thinking-delta`, `thinking-completed`, `tool-call-started`, `tool-call-completed`, `partial-tool-call`, `token-delta`, `step-started`, `step-completed`, `turn-ended` (with usage), `shell-output-delta`.

### Hooks-based Observability
Primary mechanism for external integration. `afterAgentResponse`, `afterAgentThought`, `postToolUse`, `sessionEnd` for logging/metrics/alerting. Base context: `conversation_id`, `generation_id`, `model`, `cursor_version`, `transcript_path` (local file with session transcript).

### CLI
- `--output-format stream-json` — message-level progress for external systems
- `--stream-partial-output` — token-level deltas

### Gaps
- **No native OpenTelemetry** — no `OTEL_EXPORTER_OTLP_ENDPOINT` hook, no trace context propagation as of May 2026
- Third-party (Braintrust / LangSmith / Langfuse) integrate via MCP servers Cursor queries, OR hook scripts emitting externally
- OTel GenAI semantic conventions stable early 2026 but Cursor not adopted natively
- Team dashboard tags usage as "SDK"; per-user/per-surface analytics added 2026-05-04
- No documented per-trace export or structured audit log API

## 4.7 Security & Sandboxing

### Local Sandbox
`sandboxOptions: { enabled: boolean }` — **mechanism (container / seccomp / macOS sandbox) NOT documented**. Without enabled flag → full process privileges in Node.js env.

### Cloud Sandbox
- Isolated AWS VMs
- Code on VM disks only during execution
- Privacy Mode default — Cursor states never trains on user code
- Cloud agent commits **cryptographically signed using HSM-backed Ed25519 key** → satisfies branch protection requiring signed commits

### Self-Hosted Workers
- Code/secrets/artifacts never leave customer network
- Outbound only to: `api2.cursor.sh`, `api2direct.cursor.sh`, `cloud-agent-artifacts.s3.us-east-1.amazonaws.com`
- Only those 3 hosts need egress allowlisting

### Network Egress Controls (Cloud)
1. Allow all
2. Default + allowlist
3. Allowlist only

Enterprise: **locked policies** prevent user override. Cursor publishes egress CIDR ranges at `cursor.com/docs/ips.json`. Separate Git egress proxy uses 3 stable IPs.

### Secrets Management
- `cloud.envVars` encrypted at rest, injected into cloud shell, deleted with agent. Cannot start with `CURSOR_`. Cannot use with caller-supplied `agentId` (creation only).
- MCP HTTP credentials handled by Cursor backend; **redacted before VM entry** — never appear in VM memory or transcripts
- "Redacted" commit classification scans messages + diffs, rejects commits with secrets

### Approval Modes
- Default deny for terminal commands
- `--force` / `--yolo` = escape hatch for CI/CD, explicit warning: "Run Everything mode skips all safety checks"
- Enterprise admins can configure auto-run allowlists for specific commands (`npm install`, `pip install`) — explicitly **"best-effort, not security boundary"**
- Prompt injection risk documented: auto-executing terminal commands enables attacker-controlled repo content to potentially exfiltrate code
- Artifact upload URLs require explicit allowlisting; wildcard S3 allowlists create exfiltration vulnerabilities

## 4.8 Limits & Gotchas (as of May 2026)

### Confirmed Bugs

**Bug 1: MCP tools not injected in CLI `-p` mode** ([Forum](https://forum.cursor.com/t/cursor-agent-p-mode-does-not-inject-mcp-server-tools-into-agent-context/155275))
- MCPs show "ready" but only generic proxy tools (`mcp_task`, `list_mcp_resources`, `fetch_mcp_resource`) appear callable
- Cursor team: "deeper injection gap rather than approval issue" in headless path
- Workaround: add `--force` / `--yolo` alongside `-p`

**Bug 2: MCP tool calls silently broken in CLI `2026.04.17`** ([Forum](https://forum.cursor.com/t/cursor-agent-cli-mcp-tool-calls-silently-stopped-working-in-2026-04-17/158988))
- `mcpToolCall` events stopped emitting; agent fell back to read-only listing; zero error messages
- Worked in `2026.04.14-ee4b43a`
- Workaround: `export CURSOR_AGENT_BIN="$HOME/.local/share/cursor-agent/versions/2026.04.14-ee4b43a/cursor-agent"`

**Bug 3: OAuth MCP servers inaccessible to local SDK agents**
- Documented limitation: "SDK local agents cannot access HTTP MCPs with OAuth from `settingSources`"
- Workaround: non-OAuth MCPs only, or pass credentials inline in HTTP headers

**Bug 4: SQLite locking on Linux**
- Some Linux setups: `SQLITE_BUSY: database is locked` errors
- No official workaround

### Stability Warnings
- "TypeScript SDK in public beta; APIs may change before GA"
- "Tool call schema is not stable; parse defensively"
- One active run per agent; concurrent → `409 agent_busy`
- MCP configs must be re-passed on every `Agent.resume()`
- Artifact downloads not implemented for local (`listArtifacts()` returns empty)
- `local.settingSources` ignored for cloud agents
- Hooks file-based only — no programmatic callbacks
- No Team Admin API key support — only user keys + service account keys

### npm Audit (SDK v0.1.3)
Fresh install on Node 22 → **10 vulnerabilities**:
- `sqlite3@^5.1.7` → transitive `node-gyp` deps "no fix available"
- `@connectrpc/connect-node@^1.6.1` → `undici ≤6.23.0` with 5 high-severity advisories

`sqlite3` native addon **prevents single-binary compilation** with `bun build --compile` (dlopen needs filesystem inodes) — blocks embedded/edge deployment.

### Cost Gotchas
- Cloud agents burn tokens at higher rates than interactive use (multiple model calls per step)
- No first-party per-task spending cap (limits are per billing cycle, not per agent run)
- MAX mode bills each tool call as additional request

## 4.9 Versioning & Roadmap

### Cadence
No fixed cadence. Major releases ~monthly:
- Cursor 3 → 2026-04-02
- v3.2 → 2026-04-24
- v3.3 → 2026-05-07

CLI versions: `YYYY.MM.DD-<git-sha>` (e.g., `2026.04.17-479fd04`) — exact pinning via `CURSOR_AGENT_BIN`.

### SDK Versioning
`@cursor/sdk` at `v0.1.x` (architecture research) — `0.x` semver = pre-stable; breaking changes possible without major bumps until GA.

> **Note:** Foundational research observed `v1.0.12`. Verify current version on npm before integration.

### Confirmed Upcoming
- **Python SDK** — "Coming next" per Cursor team; no date
- **Custom storage implementations** — under consideration to resolve sqlite native binary issue
- **Team Admin API key support** — absent; status unknown

### 2026 Milestones
| Date | Feature |
|---|---|
| 2026-01-16 | Cursor CLI released |
| 2026-02-17 | Plugin marketplace (v2.5) — MCP/skills/subagents/hooks/rules bundles |
| 2026-03-25 | Self-hosted Cloud Agents GA |
| 2026-04-02 | Cursor 3 launch (agent-first) |
| 2026-04-24 | v3.2 — async subagents, worktrees, multi-root workspaces |
| 2026-04-29 | TypeScript SDK public beta |
| 2026-04-30 | Security Review agents (beta) |
| 2026-05-01 | Team Marketplace for plugins |
| 2026-05-04 | Enterprise model controls, soft spend limits |
| 2026-05-07 | v3.3 — PR review, parallel plans, `/multitask`, MCP reliability fixes |

### No Public Roadmap
Cursor doesn't maintain public roadmap doc. Direction via blog / changelog / forum. Python SDK + Team Admin keys are only confirmed near-term SDK additions as of May 2026.

---

# Sources (Combined)

**Official:**
- [cursor.com/blog/typescript-sdk](https://cursor.com/blog/typescript-sdk) — SDK launch
- [cursor.com/docs/sdk/typescript](https://cursor.com/docs/sdk/typescript) — TS reference
- [cursor.com/docs/api](https://cursor.com/docs/api) — APIs overview
- [cursor.com/docs/cloud-agent/api/endpoints](https://cursor.com/docs/cloud-agent/api/endpoints) — REST reference
- [cursor.com/docs/hooks](https://cursor.com/docs/hooks)
- [cursor.com/docs/rules](https://cursor.com/docs/rules)
- [cursor.com/docs/cli/mcp](https://cursor.com/docs/cli/mcp)
- [cursor.com/docs/cli/acp](https://cursor.com/docs/cli/acp)
- [cursor.com/docs/cli/headless](https://cursor.com/docs/cli/headless)
- [cursor.com/docs/cli/shell-mode](https://cursor.com/docs/cli/shell-mode)
- [cursor.com/docs/cli/using](https://cursor.com/docs/cli/using)
- [cursor.com/docs/cli/github-actions](https://cursor.com/docs/cli/github-actions)
- [cursor.com/docs/agent/security](https://cursor.com/docs/agent/security)
- [cursor.com/docs/cloud-agent/security-network](https://cursor.com/docs/cloud-agent/security-network)
- [cursor.com/docs/enterprise/llm-safety-and-controls](https://cursor.com/docs/enterprise/llm-safety-and-controls)
- [cursor.com/docs/cloud-agent/self-hosted-pool](https://cursor.com/docs/cloud-agent/self-hosted-pool)
- [cursor.com/docs/context/max-mode](https://cursor.com/docs/context/max-mode)
- [cursor.com/docs/models/cursor-composer-2](https://cursor.com/docs/models/cursor-composer-2)
- [cursor.com/docs/integrations/github](https://cursor.com/docs/integrations/github)
- [cursor.com/docs/integrations/slack](https://cursor.com/docs/integrations/slack)
- [cursor.com/docs/subagents](https://cursor.com/docs/subagents)
- [cursor.com/docs/enterprise](https://cursor.com/docs/enterprise)
- [cursor.com/docs/enterprise/compliance-and-monitoring](https://cursor.com/docs/enterprise/compliance-and-monitoring)
- [cursor.com/docs/models-and-pricing](https://cursor.com/docs/models-and-pricing)
- [cursor.com/changelog](https://cursor.com/changelog)
- [cursor.com/changelog/sdk-release](https://cursor.com/changelog/sdk-release)
- [cursor.com/changelog/2-4](https://cursor.com/changelog/2-4) — Subagents/Skills/Image Gen
- [cursor.com/changelog/2-6](https://cursor.com/changelog/2-6) — MCP Apps/Team Marketplaces
- [cursor.com/changelog/03-25-26](https://cursor.com/changelog/03-25-26) — Self-Hosted GA
- [cursor.com/blog/composer-2](https://cursor.com/blog/composer-2)
- [cursor.com/blog/secure-codebase-indexing](https://cursor.com/blog/secure-codebase-indexing)
- [cursor.com/blog/self-hosted-cloud-agents](https://cursor.com/blog/self-hosted-cloud-agents)
- [cursor.com/blog/automations](https://cursor.com/blog/automations)
- [cursor.com/blog/building-bugbot](https://cursor.com/blog/building-bugbot)
- [github.com/cursor/cookbook](https://github.com/cursor/cookbook)
- [github.com/cursor/plugins](https://github.com/cursor/plugins)

**Forum:**
- [SDK & Cloud Agents API updates](https://forum.cursor.com/t/cursor-sdk-cloud-agents-api-updates/159284)
- [SDK in Public Beta](https://forum.cursor.com/t/cursor-sdk-in-public-beta/159285)
- [run.stream() error status bug](https://forum.cursor.com/t/cursor-sdk-run-stream-messages-do-not-receive-error-status-messages-for-tool-calls/159816)
- [Local agents context bug](https://forum.cursor.com/t/sdk-local-agents-do-not-retain-conversation-context-between-agent-send-calls/159440)
- [-p mode MCP injection bug](https://forum.cursor.com/t/cursor-agent-p-mode-does-not-inject-mcp-server-tools-into-agent-context/155275)
- [2026.04.17 MCP regression](https://forum.cursor.com/t/cursor-agent-cli-mcp-tool-calls-silently-stopped-working-in-2026-04-17/158988)
- [Cloud Run worker pools guide](https://forum.cursor.com/t/cursor-self-hosted-agents-with-cloud-run-worker-pools-user-guide/157651)

**Press / Community:**
- [MarkTechPost: Cursor SDK launch](https://www.marktechpost.com/2026/04/29/cursor-introduces-a-typescript-sdk-for-building-programmatic-coding-agents-with-sandboxed-cloud-vms-subagents-hooks-and-token-based-pricing/)
- [The New Stack: "Several known limitations"](https://thenewstack.io/cursor-sdk-ai-agents/)
- [MindStudio: Cursor SDK vs Claude Code Harness](https://www.mindstudio.ai/blog/cursor-sdk-vs-claude-code-harness-comparison)
- [Builder.io: Cursor vs Claude Code](https://www.builder.io/blog/cursor-vs-claude-code)
- [Kingy AI: Cursor SDK Review](https://kingy.ai/ai/cursor-sdk-review-cursors-coding-agent-becomes-programmable-infrastructure/)
- [BuildFastWithAI: Cursor SDK guide](https://www.buildfastwithai.com/blogs/cursor-sdk-coding-agents-typescript-2026)
- [DataCamp: Cursor SDK tutorial](https://www.datacamp.com/tutorial/cursor-sdk)
- [Stormy AI: Zero Bug Policy + Actions](https://stormy.ai/blog/automating-zero-bug-policy-cursor-cli-github-actions-ci-cd)
- [WorkOS: BugBot autoreview Claude Code PRs](https://workos.com/blog/cursor-bugbot-autoreview-claude-code-prs)
- [ComputingForGeeks: OpenCode vs Claude Code vs Cursor](https://computingforgeeks.com/opencode-vs-claude-code-vs-cursor/)
- [Phil Schmid: How Kimi/Cursor/Chroma train agentic models with RL](https://www.philschmid.de/kimi-composer-context)
- [APIdog: Cursor Tool Call Limits](https://apidog.com/blog/cursor-tool-call-limit/)
- [InfoQ: Cursor 3 agent-first interface](https://www.infoq.com/news/2026/04/cursor-3-agent-first-interface/)
- [Analytics Drift: SDK launch](https://analyticsdrift.com/cursor-sdk-ai-agents-launch/)
- [tessl.io: Cursor Automations](https://tessl.io/blog/cursor-launches-automations-for-always-on-coding-agents/)
- [Digital Applied: Automations guide](https://www.digitalapplied.com/blog/cursor-automations-always-on-agentic-coding-agents-guide)
- [Releasebot: Cursor release notes](https://releasebot.io/updates/cursor)
- [PagerDuty + Cursor MCP GA](https://support.pagerduty.com/main/changelog/pagerduty-cursor-mcp-integration-is-generally-available)
- [github.com/bloomresearch/cursorconnect](https://github.com/bloomresearch/cursorconnect) — Python wrapper

**Social:**
- [Cursor X announcement](https://x.com/cursor_ai/status/2049499866217185492)
- [Eric Zakariasson kanban demo](https://x.com/ericzakariasson/status/2049511147762753581)
- [Malte Ubl: Cursor SDK vs Anthropic/OpenAI](https://x.com/cramforce/status/2049519803191460295)
- [@kimmonismus: platform play commentary](https://x.com/kimmonismus/status/2049514922044792934)
- [HN Cursor 3 thread](https://news.ycombinator.com/item?id=47618084)
