# Research: Cursor Agent SDK Harness — Agent Loop Support

**Date:** 2026-05-09
**Git Commit:** c8723cdabb88e8e670b90008770ce18850979037
**Branch:** main

## Research Question

Does the current harness wrap the **full** Cursor Agent SDK agent loop with multi-turn agent calls? The prototype reportedly ended after a single message — confirm whether outer multi-turn dialogue, follow-up `agent.send()` calls, and agent resume are supported.

## Summary

Two distinct loops exist; harness implements one, not both.

1. **Inner agent loop** (one user prompt → assistant ↔ tool calls ↔ tool results ↔ … → final assistant text). **Supported.** This loop runs server-side inside a single `Run` returned by `agent.send()`. Harness consumes it via `run.stream()` until `run.wait()` resolves. All `tool_call` running/completed/error transitions, assistant text deltas, thinking deltas, and status transitions are normalized and forwarded.

2. **Outer multi-turn loop** (multiple user messages on the same `SDKAgent`, follow-up turns, agent resume across processes). **Not supported.** `runPrompt` is one-shot: it calls `Agent.create()` → single `agent.send(prompt)` → streams → `agent.close()` in `finally`. There is no API to feed a second user message into the same agent, no `Agent.resume(agentId)` integration, no `createSession()`/`Session` object, no agent-id persistence.

This matches the v1 spec, which explicitly lists multi-turn sessions and `Agent.resume()` as **non-goals** and "Open follow-ups (post-v1)" — `packages/core/src/run.ts` was written to that contract.

## Crate & Module Structure

```
flow-build (pnpm workspace)
├── packages/core               @flow-build/core           ← harness (one-shot)
│   └── src/run.ts              runPrompt() — single send
├── packages/cli                @flow-build/cli            ← thin presenter
│   └── src/main.ts             `run <prompt>` subcommand only
├── packages/flowbuilder        @flow-build/flowbuilder    (separate concern)
└── packages/rote               @flow-build/rote           plugin contributor
```

Only `packages/core/src/run.ts` touches `@cursor/sdk`. CLI imports `runPrompt` from core. No code references `Agent.resume`, `agent.send` after the first call, or persists `agentId`.

## Detailed Findings

### Inner agent loop — fully supported

`packages/core/src/run.ts:97-129` — stream loop:

```typescript
for await (const msg of live.run.stream()) {
  if (signal?.aborted) { await live.run.cancel(); status = "cancelled"; break; }
  const events = normalize(msg, logger);
  for (const e of events) {
    const out = host.intercept(e, ctx);
    for (const e2 of out) {
      if (e2.type === "text") finalText += e2.delta;
      opts.onEvent(e2);
      if (e2.type === "tool_start") host.fireToolCall({...running}, ctx);
      if (e2.type === "tool_end")   host.fireToolCall({...completed|error}, ctx);
    }
  }
}
if (status !== "cancelled") {
  const wait = await live.run.wait();
  ...
}
```

- `Run.stream()` is the SDK's `AsyncGenerator<SDKMessage>` over the entire turn. The Cursor runtime — local executor or cloud — runs the assistant ↔ tool ↔ assistant cycle internally and surfaces it as `SDKMessage`s (`assistant`, `tool_call (running|completed|error)`, `thinking`, `status`, `system`, `task`, `user`, `request`).
- `packages/core/src/normalizer.ts` maps these to `HarnessEvent` (`text`, `thinking`, `tool_start`, `tool_end`, `status`).
- `run.wait()` (`packages/core/src/run.ts:131`) resolves with `RunResult { status, result, model, durationMs, git }` once the inner loop concludes.

So inside one `agent.send()` you do get the full agent loop with arbitrarily many tool calls. That is delegated to the SDK; harness does not orchestrate it.

### Outer multi-turn loop — not supported

`packages/core/src/run.ts:33-54` (only `Agent.create` + first `agent.send`) and `:144` (`agent.close()` in `finally`):

```typescript
agent = await Agent.create({ apiKey, model, local: { cwd, settingSources }, ...mcp });
const run = await agent.send(prompt);     // ← only call site
...
} finally {
  try { await live.agent.close(); } catch { ... }   // ← agent torn down each runPrompt
}
```

Confirmed via grep — only one `agent.send` call site in the entire workspace:

```
packages/core/src/run.ts:45:        const run = await agent.send(prompt);
```

Also missing:
- `Agent.resume(agentId)` — never called.
- `agent.agentId` capture / return — never surfaced through `RunOptions` / `RunResult`.
- A `Session` / `createSession` API — `packages/core/src/index.ts` only exports `runPrompt` and types.
- Persistence layer for agent IDs — `packages/flowbuilder/src/session.ts` exists but is the *flowbuilder* state session, not Cursor agent session.

### SDK capabilities that exist but are unused

`node_modules/.../@cursor/sdk/dist/esm/agent.d.ts:5-18` — `SDKAgent` interface:

```typescript
interface SDKAgent {
  readonly agentId: string;
  readonly model: ModelSelection | undefined;
  send(message: string | SDKUserMessage, options?: SendOptions): Promise<Run>;
  close(): void;
  reload(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  listArtifacts(): Promise<SDKArtifact[]>;
  downloadArtifact(path: string): Promise<Buffer>;
}
```

`stubs.d.ts:35-72` — `Agent` static surface (all unused except `Agent.create`):

```
Agent.create(options)
Agent.resume(agentId, options)              ← unused
Agent.prompt(message, options)              ← unused
Agent.list(options)                          ← unused
Agent.listRuns(agentId, options)             ← unused
Agent.getRun(runId, options)                 ← unused
Agent.get / archive / unarchive / delete    ← unused (cloud-only)
Agent.messages.list(agentId, options)        ← unused
```

`SendOptions` (`agent.d.ts:19-42`) supports per-send `model`, per-send `mcpServers`, `onStep`, `onDelta`, and `local.force` (expire wedged local run). None plumbed through `RunOptions`.

`Run` (`run.d.ts:27-43`) exposes `conversation(): Promise<ConversationTurn[]>` (full structured turn history) and `onDidChangeStatus(listener)`. Neither used.

### What the SDK guarantees about multi-turn

From `cursor-agent-sdk-research.md:276-302`:

- `SDKAgent` is the conversation container. Each `send()` advances the same thread.
- Cloud: 2nd `send()` while 1st active → `409 agent_busy`.
- Reconnect by ID: `Agent.resume(agentId, { apiKey })`.
- **Known bug:** local agents may not retain context across `send()` calls (cloud unaffected). Forum link: <https://forum.cursor.com/t/sdk-local-agents-do-not-retain-conversation-context-between-agent-send-calls/159440>

So even if you implement multi-turn naively, **local mode** (currently the default — `local: { cwd }`) has an upstream context-retention bug. Cloud mode would work but is not wired.

### Spec already calls this out

`docs/superpowers/specs/2026-05-09-cursor-sdk-harness-design.md:16`:

> **Non-goals (v1):** multi-turn sessions, agent resume, MCP servers, hooks, subagents, cloud agents, persistence, telemetry, UI.

`:77`: "`runPrompt` is one-shot. Multi-turn → future `createSession()`."

`:440-451` Open follow-ups:

> - Multi-turn `createSession()` API + agent ID persistence.
> - `Agent.resume()` integration (note: SDK does not persist MCP across resume).
> - Replacing one-shot `runPrompt` with a `Session` object that exposes a real async iterator and a `send(prompt)` method.

## Code References

- `packages/core/src/run.ts:33-63` — `startWithRetry`: wraps `Agent.create` + first `agent.send`.
- `packages/core/src/run.ts:65-157` — `runPrompt`: lifecycle is start → stream → wait → close. No second send path.
- `packages/core/src/run.ts:144` — `agent.close()` in `finally`. Agent never outlives the call.
- `packages/core/src/types.ts:15-25` — `RunOptions`. No `agentId`, no `resume`, no follow-up callback.
- `packages/core/src/types.ts:36-40` — `RunResult`. No `agentId` returned, so caller can't resume even if SDK supported it.
- `packages/core/src/index.ts:1` — only `runPrompt` exported. No `Session`/`createSession`.
- `packages/cli/src/main.ts:30-40` — CLI only wires `flow-build run <prompt>`. No `--resume`, no follow-up REPL.
- `node_modules/.../@cursor/sdk/dist/esm/agent.d.ts:5-18` — `SDKAgent.send` is a method, not a one-shot.
- `node_modules/.../@cursor/sdk/dist/esm/stubs.d.ts:43-44` — `Agent.resume(agentId, options)` exists in SDK.
- `node_modules/.../@cursor/sdk/dist/esm/run.d.ts:33` — `Run.conversation()` returns full structured turn history.
- `cursor-agent-sdk-research.md:276-302` — multi-turn semantics + local-agent context bug.
- `docs/superpowers/specs/2026-05-09-cursor-sdk-harness-design.md:16,77,440-451` — multi-turn explicitly out of v1 scope.

## Architecture Documentation

- **Lifetime model**: agent lives only for the duration of one `runPrompt` call. `try/finally` around the stream loop calls `agent.close()` unconditionally. There is no "keep alive" path.
- **Event surface**: callback-based (`onEvent: (e: HarnessEvent) => void`), single shot per `runPrompt`. No event stream consumer exists that supports follow-up sends on the same context.
- **Plugin host** (`packages/core/src/plugin/host.ts` referenced from `run.ts:7`) hooks `preRun`, `systemPrompt`, `promptPrefix`, `provideMcpServers`, `interceptEvent`, `onToolCall`, `cleanup` — all scoped to a single run. No plugin hook for "between turns".
- **Retry semantics** (`startWithRetry`): wraps `Agent.create + first send`; on failure tears down agent and retries the whole pair. Designed around the one-shot model.
- **Cancellation**: `signal.aborted` → `run.cancel()` → loop exits → `agent.close()` in `finally`.

## Open Questions

- Does the eventual multi-turn API target local-only, cloud-only, or both? Local has the upstream context-retention bug; cloud has `409 agent_busy` semantics that make sequential `send()` straightforward.
- Should `Session` be the new primary type and `runPrompt` become a convenience wrapper (`Session.create().send().wait().close()`), or stay parallel?
- Does the agent-id need to round-trip through `RunResult` so callers can persist + resume across processes?
- How do plugins compose across turns — re-run `preRun` / `systemPrompt` each turn, or once per session?
- MCP across resume: per research, SDK does not persist MCP across `Agent.resume`. New session needs to re-contribute MCP servers on resume — design implication for `provideMcpServers`.
