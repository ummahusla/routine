# Cursor SDK Shell-Tool Hang Fix — Design

**Date:** 2026-05-09
**Status:** Draft, awaiting user review
**Owner:** flow-build harness

## Problem

The flow-build harness embeds `@cursor/sdk` (v1.0.12, latest as of 2026-05-09) for agent execution. The SDK's built-in shell tool exhibits a documented server-side regression where it emits a `tool_call` event with `status="running"` (which our normalizer maps to `tool_start`) but never a follow-up `status="completed"` or `status="error"`. The corresponding `tool_end` is therefore never produced, and `run.stream()` continues to await an event that never arrives.

Observed in session `s_lvfm3161ri4q`: a `grep -r ... "/Users/rob/Library/Application Support"` invocation hung, the harness watchdog at `packages/core/src/session/session.ts:336-347` fired after `args.timeout (30_000ms) + slack (5_000ms) = 35_000ms`, and aborted the entire turn.

**Confirmed by Cursor team** (Mohit Jain, forum.cursor.com/t/.../160003 and /159816): the regression is server-side, affects all SDK-launched runs across models, and there is no SDK-side fix shipped. There is no newer `@cursor/sdk` version to bump to.

The current harness behavior (kill the turn on watchdog fire) is a clean failure but not a recovery, and on the UI side leaves a stuck `tool_start` event with no matching `tool_end`, so the renderer's tool-call snapshot stays in the `running` state until the page is reloaded.

## Goal

1. **Prevent the hang at the source** for shell calls by routing them through a custom MCP server that we own end-to-end, so `tool_end` is always produced deterministically.
2. **Clean failure for any other tool** (Read, Glob, Grep) that hits the same SDK regression: synthesize a `tool_end ok=false` on the event bus before aborting the turn, so the UI reflects the failed state.

Non-goals: replacing Read/Glob/Grep, streaming stdout to UI, cancelling individual tool calls without aborting the run.

## Approach (chosen)

Custom MCP shell server + `PreToolUse`-deny hook + watchdog upgrade. Combines source prevention (built-in shell never runs; ours always emits `tool_end`) with a safety net for all other tools.

Rejected alternatives:
- *Wrapper-only via `PreToolUse` arg rewrite (`timeout 25 ...`)* — still uses broken built-in shell; SDK-side `tool_end` drop can still fire for any reason.
- *MCP only, no hook* — model may still pick built-in shell; hang risk persists.

## Architecture

```
flow-build harness (Electron)
├─ packages/safe-shell-mcp/         (NEW)
│   └─ src/server.ts                stdio MCP server, single tool `sh`
│
├─ packages/core/src/session/
│   ├─ session.ts                   (MODIFIED)
│   │   ├─ on Session.open: write .cursor/hooks.json into workspaceDir
│   │   ├─ Agent.create({mcpServers: {"safe-shell": {...}, ...userServers}})
│   │   └─ watchdog upgrade: emit synthetic tool_end before abort
│   ├─ hooks-file.ts                (NEW)  write/cleanup .cursor/hooks.json
│   └─ deny-shell-hook.cjs          (NEW)  hook command body, ships in package
│
└─ packages/rote/                   unchanged; rote-exec MCP already independent
```

**Boundaries**
- `safe-shell-mcp` is a self-contained npm package; depends only on `@modelcontextprotocol/sdk`. No `@flow-build/*` deps. Same shape as `rote-exec`.
- `hooks-file.ts` is the only place that writes `.cursor/hooks.json`; pairs `installHooks(workspaceDir)` / `restoreHooks(workspaceDir)`.
- `session.ts` calls install on open, restore on close, and merges `safe-shell` into the existing `mcpServers` map from `host.runProvideMcpServers(ctx)`.

**Lifecycle**
1. `Session.open()` → install hooks file (rename existing if any to `hooks.json.flowbuild-bak`).
2. `Session.send()` → `Agent.create({mcpServers: {...userServers, "safe-shell": {command: <node>, args: [<server.js>]}}})`.
3. Model issues a tool call.
   - If built-in `Shell`: `PreToolUse` hook denies with a steering message. Model retries using `mcp__safe-shell__sh`.
   - If `mcp__safe-shell__sh`: our MCP spawns a child with hard timeout + bounded buffers, returns a deterministic envelope. `tool_end` always fires.
4. `Session.close()` → restore hooks file.

## Component: `safe-shell-mcp` package

**Layout**
```
packages/safe-shell-mcp/
├─ package.json        name: @flow-build/safe-shell-mcp
├─ tsconfig.json
├─ src/
│   ├─ server.ts       stdio MCP server, registers tool `sh`
│   ├─ spawn.ts        spawn + timeout + buffer-cap, pure
│   └─ spawn.test.ts
└─ README.md
```

**Tool: `sh`**

Input (zod-validated):
```ts
{
  command: string,                  // required; passed to /bin/sh -c (POSIX) or cmd.exe /c (win32)
  cwd?: string,                     // default: env CURSOR_AGENT_CWD || process.cwd()
  timeoutMs?: number,               // default 60_000, max 600_000
  maxBytes?: number,                // default 1_048_576 (1 MiB) per stream, max 10_485_760
  env?: Record<string, string>,     // merged onto process.env; keys matching ^CURSOR_ are dropped
}
```

Output (JSON in MCP `text` content block):
```ts
{
  ok: boolean,                      // exitCode === 0 && !timedOut
  stdout: string,                   // utf8, truncated to maxBytes
  stderr: string,                   // utf8, truncated to maxBytes
  exitCode: number | null,          // null when killed by signal
  signal: string | null,
  durationMs: number,
  timedOut: boolean,
  truncated: { stdout: boolean, stderr: boolean }
}
```

**Spawn semantics (`spawn.ts`)**
- POSIX: `child_process.spawn("/bin/sh", ["-c", command], {cwd, env, stdio:["ignore","pipe","pipe"]})`. win32: `cmd.exe /c`.
- Two `Buffer[]` accumulators, capped at `maxBytes`; further chunks dropped, `truncated.*` flips true.
- On `timeoutMs`: send `SIGTERM`, start 2 s grace timer, then `SIGKILL` on grace expiry. `timedOut=true`, `exitCode=null`, `signal="SIGKILL"`.
- On parent exit: kill child via `process.on("exit"...)` so we don't orphan. Electron parent crash is the only known leak path.
- No shell metacharacter rewriting. No auto-`timeout` prefix — we own the timer.
- `cwd`: if not absolute or doesn't exist → reject as MCP error before spawn.
- env safety: drop keys matching `^CURSOR_`; pass `PATH`, `HOME`, `USER`, `LANG`, `TZ` from parent unless explicitly overridden.

**Errors**
- spawn `ENOENT`/`EACCES`/`EINVAL` → MCP tool error (not a success envelope).
- Anything that produced a child → success envelope with `ok:false`. The agent always sees a `tool_end`.

## Component: hooks file installer

**File location:** `<workspaceDir>/.cursor/hooks.json`. Picked up by SDK because `Agent.create()` is called with `local.settingSources: ["project", "user"]` (already wired at `session.ts:243`).

**Content**
```json
{
  "$flowbuild": { "marker": "flow-build-safe-shell@1", "installedAt": "<ISO>" },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Shell",
        "hooks": [
          { "type": "command", "command": "node <abs-path>/deny-shell-hook.cjs", "timeout": 5 }
        ]
      }
    ]
  }
}
```

Matcher `"Shell"` is the SDK's name for the built-in bash tool (mapping `Bash:"Shell"` is verifiable in `node_modules/@cursor/sdk/dist/cjs/index.js:8`).

**`deny-shell-hook.cjs`** (embedded command body):
```js
#!/usr/bin/env node
let buf = "";
process.stdin.on("data", c => (buf += c));
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: "Built-in shell is disabled in this harness due to a Cursor SDK shell-tool regression. Use the `sh` tool from the `safe-shell` MCP server (mcp__safe-shell__sh) — same semantics, deterministic completion."
  }));
  process.exit(0);
});
```

Returns `{decision:"block", reason}` in <5 ms. SDK feeds `reason` back to the model so it self-corrects to the MCP tool.

**`hooks-file.ts` API**
```ts
installHooks(workspaceDir: string): Promise<{ restored: () => Promise<void> }>
```

Behavior:
1. `mkdir -p <workspaceDir>/.cursor`.
2. If `hooks.json` exists:
   - Read + parse. If `$flowbuild.marker === "flow-build-safe-shell@1"` → already ours, no-op (caller's `restored` is a no-op too).
   - Else → atomic rename to `hooks.json.flowbuild-bak`. If a `.flowbuild-bak` already exists, refuse and throw with a hint to delete it (don't double-stomp; surfaces a real conflict).
3. Atomic write via tmp + rename: write our content to `hooks.json.tmp`, then `rename` to `hooks.json`.
4. Return `restored()`:
   - Read current `hooks.json`. If marker still ours → unlink. Else leave alone (user replaced it; respect that).
   - If `hooks.json.flowbuild-bak` exists → atomic rename back to `hooks.json`.

**Crash recovery:** If a previous run crashed and left both our file and `.flowbuild-bak`, next `Session.open()` sees marker matches and a backup exists → restores the backup first, then re-installs. Self-healing on startup.

**Cross-platform Node binary:** `deny-shell-hook.cjs` is invoked via `node`. The hook command path needs an absolute Node binary in Electron production builds. Resolution order in `installHooks`:
1. `process.env.FLOW_BUILD_NODE_PATH` if set.
2. `process.execPath` if it points at a Node binary (`process.versions.node` matches).
3. System `node` from `PATH` (`which node`).
4. Throw with actionable error.

The plan phase will pick the concrete approach; spec marks this as a known sharp edge.

## Component: watchdog upgrade

**Current** (`session.ts:336-347`): on tool_end timeout, sets `midStreamError`, `status="failed"`, calls `abort.abort()` and `live.run.cancel()`. UI keeps a stuck `tool_start` because no `tool_end` is ever emitted on the bus.

**New behavior:**
1. **Synthesize `tool_end` first.** Build a `HarnessEvent` `{type:"tool_end", name, callId, ok:false, args, result:{error:"watchdog timeout", deadlineMs}}` and run it through `host.intercept` → `persistEvent` → `onEvent` → `host.fireToolCall`, the same path real `tool_end` events use.
2. **Then abort.** Same as today: cancel run, mark status failed, surface error event.
3. **Tighter slack.** `TOOL_WATCHDOG_SLACK_MS` 5 s → 10 s. Default still 60 s when `args.timeout` is absent.
4. **Apply to all tools.** Watchdog stays armed for every tool; shell goes through our MCP, but Read/Glob/Grep are also affected per the SSH-hang forum thread.

**Code shape** (replaces the inline `setTimeout` callback at `session.ts:336`):
```ts
const t = setTimeout(() => {
  toolWatchdogs.delete(callId);
  this.logger.warn("tool watchdog fired", {
    callId, name, deadlineMs: deadline, sdkVersion: "1.0.12",
  });
  // 1) synthesize tool_end so the UI doesn't show a stuck running call
  const synthetic: HarnessEvent = {
    type: "tool_end", name, callId, ok: false,
    result: { error: "watchdog timeout", deadlineMs: deadline },
  };
  for (const e2 of host.intercept(synthetic, ctx)) {
    persistEvent(e2);
    onEvent({ ...e2, turnId });
    host.fireToolCall(
      { callId, name, status: "error",
        result: e2.type === "tool_end" ? e2.result : undefined },
      ctx,
    );
  }
  // 2) then surface error + abort, as before
  midStreamError = mapToHarnessError(new Error(
    `tool "${name}" produced no result after ${deadline}ms ` +
    `(no tool_end from Cursor SDK; known regression in @cursor/sdk 1.0.12). aborting turn.`
  ));
  status = "failed";
  abort.abort();
  live.run.cancel().catch(() => {});
}, deadline);
```

**What does NOT change**
- `armToolWatchdog` / `clearToolWatchdog` API.
- `toolWatchdogs` Map lifecycle.
- `mapToHarnessError`.
- Replay/persistence shape — synthesized `tool_end` flows through the normal path so JSONL captures it identically.

## Data flow (happy path under fix)

1. `Session.open()` → `installHooks(workspaceDir)` writes `.cursor/hooks.json` with PreToolUse-deny on `Shell`.
2. `Session.send(prompt)` → `Agent.create({mcpServers: {...host, "safe-shell"}, local: {cwd, settingSources}})` → `agent.send(prompt)` returns `Run`.
3. Model decides to run a shell command.
   - Path A (model picks built-in `Shell`): SDK invokes the `PreToolUse` hook, hook returns `{decision:"block", reason}`. SDK emits `tool_call status="error"` for that call (normalizer maps to `tool_end ok=false`). Model reads the reason, retries via `mcp__safe-shell__sh`.
   - Path B (model picks our MCP tool directly): SDK forwards to our stdio server, which spawns the child, captures output up to caps, kills on timeout, returns the envelope. SDK emits `tool_call status="completed"`.
4. Watchdog clears on the real `tool_end`. No timeout fires.

## Error handling matrix

| Failure mode | Detection | User-visible event | Turn outcome |
|---|---|---|---|
| MCP child exits non-zero | `exitCode !== 0` | `tool_end ok=false` with stdout/stderr/exitCode | continues (model decides) |
| MCP child times out | `timeoutMs` reached | `tool_end ok=false, timedOut:true` | continues |
| MCP child stdout/stderr exceeds cap | accumulator full | `tool_end ok=true, truncated.stdout:true` | continues |
| MCP server crashes | stdio EOF | SDK surfaces tool error → `tool_end ok=false` | continues |
| Built-in tool (Shell/Read/Grep) hangs | watchdog fires after `(args.timeout \|\| 60s) + 10s` | synthesized `tool_end ok=false`, then `error` event, then `turn_end status="failed"` | turn aborted, session usable |
| Hooks file install conflict (existing `.flowbuild-bak`) | `installHooks` throws | `error` event with hint to delete file | session fails to open |
| Hooks file restore on close fails | `restored()` throws inside `Session.close` finally | logged warn; user's `.cursor/hooks.json` may be stale | next `Session.open` self-heals via crash-recovery branch |

## Testing

**Unit — `packages/safe-shell-mcp/src/spawn.test.ts`**
- Happy: `echo hi` → `ok:true, stdout:"hi\n", exitCode:0, durationMs<200`.
- Timeout: `sleep 5` with `timeoutMs:200` → `timedOut:true, ok:false, exitCode:null, signal:"SIGKILL"`, duration in [200, 2400).
- Stdout cap: `yes | head -c 5000000` with `maxBytes:1000` → `truncated.stdout:true, stdout.length===1000`.
- Bad cwd: nonexistent path → MCP error before spawn.
- Env denylist: `CURSOR_API_KEY` in `env` arg dropped.
- SIGTERM grace: child traps SIGTERM; SIGKILL fires after 2 s grace.
- Exit non-zero: `false` → `ok:false, exitCode:1, timedOut:false`.

**Unit — `packages/safe-shell-mcp/src/server.test.ts`**
- In-process MCP client harness: `tools/list` → `["sh"]`. `sh` with valid args → success envelope. Missing `command` → schema error.

**Unit — `packages/core/src/session/hooks-file.test.ts`**
- Fresh dir → file created with marker; `restored()` removes it.
- Pre-existing user `hooks.json` → backed up to `.flowbuild-bak`, `restored()` puts it back.
- Already-installed (marker matches) → install no-ops, `restored()` no-ops.
- Backup exists from prior crash → install errors with hint to delete `.flowbuild-bak`.
- Crash-recovery: marker present + `.flowbuild-bak` present + no live session → install restores backup first, then re-installs.

**Unit — `packages/core/src/session/session.test.ts` (extend existing)**
- Watchdog fires → synthesized `tool_end ok=false` event observed on `onEvent` BEFORE `error` event; JSONL contains both in correct order.
- Watchdog fires for non-shell tool (`Read`) → error message contains tool name and SDK-version hint.
- `Session.open` writes hooks; `Session.close` restores.
- mcpServers from host plugin merge with `safe-shell` entry; collision on key `"safe-shell"` → harness wins, plugin entry ignored, warn logged.

**Integration smoke (manual, in PR description)**
- Run a real session in dev mode. Prompt: "list files in tmp". Expect: built-in Shell denied with steering message, model retries with `mcp__safe-shell__sh`, completes. Verify `.cursor/hooks.json` written and removed.
- Pathological grep prompt: "search Application Support for token". Expect: model uses our `sh`, `truncated.stdout:true`, completes deterministically.

## Rollout

- Feature-flag via env var `FLOW_BUILD_SAFE_SHELL`. Default on. `=0` skips both the hooks install and the `safe-shell` `mcpServers` merge. Lets us bypass if SDK fix ships and we want to A/B.
- No DB or schema changes. JSONL replay forward-compatible (synthesized events use existing `tool_end` shape).
- Document `mcp__safe-shell__sh` in `packages/rote/SKILL.md` next to the existing `rote_exec` blurb.

## Order of implementation

1. `safe-shell-mcp` package (works standalone, testable in isolation).
2. `hooks-file.ts` + tests.
3. Wire into `Session.open` / `Session.close` and the `Agent.create` `mcpServers` merge.
4. Watchdog upgrade.
5. Integration smoke + SKILL.md doc.

## Known limitations

- Two harness windows on the same workspace simultaneously: second `installHooks` sees marker, no-ops. First close restores. If second window outlives first close, brief gap where built-in shell is allowed again. Documented; not blocking.
- User with their own `.cursor/hooks.json` that defines a `PreToolUse Shell` hook: backup preserves it, but we override during the session. User is opting into the harness; acceptable.
- `deny-shell-hook.cjs` requires a usable Node binary on the host. Electron production build needs the resolution chain documented above.
- We do not stream MCP `sh` stdout to the UI in v1. Buffered + returned at end. Long-running commands look frozen until they finish (or the watchdog fires). Acceptable trade for v1; revisit if it bites.

## Open questions for plan phase

- Concrete Node-binary resolution (which of the four steps is enough for the dev build vs. packaged Electron).
- Exact location of `deny-shell-hook.cjs` after build (ships from `safe-shell-mcp` package? from `core`? path baked in at install vs. resolved at runtime?).
- Whether to add a `Session.test.ts` fixture that spies on `Agent.create` mcpServers arg vs. running a real Cursor SDK in tests.

## References

- Cursor SDK shell-tool regression confirmed: forum.cursor.com/t/cloud-agent-sdk-runs-error-in-5-76s-workflow-execution-failed-shell-tool-dead/160003
- run.stream missing tool_end: forum.cursor.com/t/cursor-sdk-run-stream-messages-do-not-receive-error-status-messages-for-tool-calls/159816
- Remote-SSH tool hang (Read/Glob/Grep also affected): forum.cursor.com/t/agent-tool-calls-shell-read-glob-hang-indefinitely-on-remote-ssh-sporadic-for-1-week/159577
- Cursor hooks docs: cursor.com/docs/hooks
- SDK source confirmation of `Bash:"Shell"` matcher mapping: `node_modules/@cursor/sdk/dist/cjs/index.js:8`
- Existing rote-exec MCP wrapper as reference shape: `packages/rote/SKILL.md:25-44`
