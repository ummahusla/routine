# Plugin System & Rote Integration Implementation Plan (KISS)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer a `Plugin` extension surface onto `@flow-build/core` and ship a first-party `@flow-build/rote` plugin so every `flow-build` run automatically materializes rote workflow guidance as a `.cursor/rules/*.mdc` file and prepends a runtime-facts block to the user prompt.

**Architecture:** New `Plugin` interface and `PluginHost` orchestrator inside core; new `@flow-build/rote` package depending only on `@flow-build/core`'s public surface; CLI hard-wires the rote plugin into every `runPrompt` call.

**Tech Stack:** TypeScript, Node ≥20, pnpm workspaces, `@cursor/sdk`, `commander`, `vitest`, `tsx`, `tsup`.

**Spec:** `docs/superpowers/specs/2026-05-09-plugin-system-and-rote-integration-design.md`

**Builds on:** existing harness implementation in `packages/core` and `packages/cli` (commits `ef90965` … `bb25930`). Do NOT regress existing test suites.

---

## Approach

KISS: each task is **edit files → run typecheck → run existing tests still pass → commit**. No per-task new tests, no failing-test-first cycle. One end-to-end smoke test lands at the very end (Task 16) as the only new test in this plan.

- **Existing tests must keep passing.** When you touch `run.ts`, the existing `run.test.ts` cases still need to pass with `plugins` unset.
- **No `Co-Authored-By` lines** in any commit.
- **Conventional Commits** (`feat:`, `chore:`, `test:`, `docs:`).
- **Style:** match existing code — double quotes, semicolons, trailing commas, `.js` import extensions (NodeNext).
- **Probe shells are dependency-injected**; the smoke test feeds a fake `exec`. No real `rote` is invoked anywhere in CI.

After each task, sanity-check by running:

```
pnpm -r typecheck
pnpm -r test
```

If anything regresses, fix forward in the same commit before moving on.

---

## Task 1: Add Plugin types to `core/src/types.ts`

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Append the new types and extend `RunOptions`**

Append (do NOT remove existing exports):

```typescript
export type RuntimeContext = {
  cwd: string;
  model: string;
  runId: string;
  signal: AbortSignal;
  logger: Logger;
  state: Map<string, unknown>;
};

export type PreRunOutput = {
  facts?: Record<string, unknown>;
};

export type SystemPromptContribution = {
  rulesFile: {
    relativePath: string;
    contents: string;
  };
};

export type ToolCallSnapshot = {
  callId: string;
  name: string;
  status: "running" | "completed" | "error";
  args?: unknown;
  result?: unknown;
};

export type Plugin = {
  name: string;
  preRun?: (ctx: RuntimeContext) => Promise<PreRunOutput | void>;
  systemPrompt?: (ctx: RuntimeContext) => Promise<SystemPromptContribution | void>;
  promptPrefix?: (ctx: RuntimeContext) => Promise<string | void>;
  interceptEvent?: (e: HarnessEvent, ctx: RuntimeContext) => HarnessEvent[] | void;
  onToolCall?: (call: ToolCallSnapshot, ctx: RuntimeContext) => Promise<void>;
  cleanup?: (ctx: RuntimeContext) => Promise<void>;
};
```

Modify the existing `RunOptions` (do not duplicate it — edit) to add `plugins?: Plugin[]` at the end:

```typescript
export type RunOptions = {
  prompt: string;
  cwd: string;
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
  onEvent: (e: HarnessEvent) => void;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/core typecheck && pnpm --filter @flow-build/core test`
Expected: typecheck and existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add Plugin, RuntimeContext and related types"
```

---

## Task 2: Add `PluginHostError` to `core/src/errors.ts`

**Files:**
- Modify: `packages/core/src/errors.ts`

- [ ] **Step 1: Append the new class**

```typescript
export class PluginHostError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: false, ...opts });
    this.name = "PluginHostError";
  }
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/core typecheck && pnpm --filter @flow-build/core test`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/errors.ts
git commit -m "feat(core): add PluginHostError class"
```

---

## Task 3: Rules-file writer

**Files:**
- Create: `packages/core/src/plugin/rules-writer.ts`

- [ ] **Step 1: Create the file with full implementation**

```typescript
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { PluginHostError } from "../errors.js";

export type WrittenFile = {
  pluginName: string;
  absPath: string;
  backupPath?: string;
  createdDirs: string[];
};

const RULES_DIR = ".cursor" + sep + "rules";

export function writeRulesFile(args: {
  cwd: string;
  pluginName: string;
  relativePath: string;
  contents: string;
  runId: string;
}): WrittenFile | null {
  const { cwd, pluginName, relativePath, contents, runId } = args;

  if (isAbsolute(relativePath)) {
    throw new PluginHostError(
      `plugin "${pluginName}" rulesFile path must be relative: ${relativePath}`,
    );
  }

  const normalizedRel = normalize(relativePath);
  const absPath = resolve(cwd, normalizedRel);
  const cwdAbs = resolve(cwd);
  const rel = relative(cwdAbs, absPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PluginHostError(
      `plugin "${pluginName}" rulesFile path escapes cwd: ${relativePath}`,
    );
  }

  const parent = dirname(rel);
  if (parent !== RULES_DIR && !parent.startsWith(RULES_DIR + sep)) {
    throw new PluginHostError(
      `plugin "${pluginName}" rulesFile must live under .cursor/rules/: ${relativePath}`,
    );
  }

  if (existsSync(absPath)) {
    const existing = readFileSync(absPath);
    if (existing.equals(Buffer.from(contents))) {
      return null;
    }
  }

  const createdDirs: string[] = [];
  const dirAbs = dirname(absPath);
  const segments = relative(cwdAbs, dirAbs).split(sep).filter(Boolean);
  let walk = cwdAbs;
  for (const seg of segments) {
    walk = join(walk, seg);
    if (!existsSync(walk)) {
      mkdirSync(walk);
      createdDirs.push(walk);
    }
  }

  let backupPath: string | undefined;
  if (existsSync(absPath)) {
    backupPath = `${absPath}.flow-build-bak.${runId}`;
    renameSync(absPath, backupPath);
  }

  const tmp = `${absPath}.tmp.${runId}`;
  writeFileSync(tmp, contents);
  renameSync(tmp, absPath);

  return { pluginName, absPath, ...(backupPath ? { backupPath } : {}), createdDirs };
}

export function restoreRulesFile(w: WrittenFile): void {
  if (existsSync(w.absPath)) {
    unlinkSync(w.absPath);
  }
  if (w.backupPath && existsSync(w.backupPath)) {
    renameSync(w.backupPath, w.absPath);
  }
  for (const d of [...w.createdDirs].reverse()) {
    try {
      rmdirSync(d);
    } catch {
      // dir not empty or already gone — leave alone
    }
  }
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/core typecheck && pnpm --filter @flow-build/core test`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/plugin/rules-writer.ts
git commit -m "feat(core): add atomic rules-file writer with backup and escape rejection"
```

---

## Task 4: `PluginHost` orchestrator

**Files:**
- Create: `packages/core/src/plugin/host.ts`

- [ ] **Step 1: Create the file with the full host implementation**

```typescript
import { PluginHostError } from "../errors.js";
import { writeRulesFile, restoreRulesFile, type WrittenFile } from "./rules-writer.js";
import type {
  HarnessEvent,
  Plugin,
  RuntimeContext,
  ToolCallSnapshot,
} from "../types.js";

export class PluginHost {
  private readonly plugins: Plugin[];
  private written: WrittenFile[] = [];

  constructor(plugins: Plugin[]) {
    const seen = new Set<string>();
    for (const p of plugins) {
      if (!p.name || p.name.trim() === "") {
        throw new PluginHostError("plugin name must be a non-empty string");
      }
      if (seen.has(p.name)) {
        throw new PluginHostError(`duplicate plugin name: ${p.name}`);
      }
      seen.add(p.name);
    }
    this.plugins = plugins;
  }

  async runPreRun(ctx: RuntimeContext): Promise<void> {
    await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.preRun) return;
        let out;
        try {
          out = await p.preRun(ctx);
        } catch (cause) {
          throw new PluginHostError(`plugin "${p.name}" preRun failed`, { cause });
        }
        const facts = (out && out.facts) ?? {};
        ctx.state.set(p.name, { facts });
      }),
    );
  }

  async runSystemPrompt(ctx: RuntimeContext): Promise<void> {
    const results = await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.systemPrompt) return null;
        let contrib;
        try {
          contrib = await p.systemPrompt(ctx);
        } catch (cause) {
          throw new PluginHostError(`plugin "${p.name}" systemPrompt failed`, { cause });
        }
        if (!contrib) return null;
        try {
          return writeRulesFile({
            cwd: ctx.cwd,
            pluginName: p.name,
            relativePath: contrib.rulesFile.relativePath,
            contents: contrib.rulesFile.contents,
            runId: ctx.runId,
          });
        } catch (cause) {
          throw new PluginHostError(
            `plugin "${p.name}" rules file write failed`,
            { cause },
          );
        }
      }),
    );
    for (const r of results) {
      if (r) this.written.push(r);
    }
  }

  async runPromptPrefix(ctx: RuntimeContext): Promise<string> {
    const parts = await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.promptPrefix) return undefined;
        try {
          const out = await p.promptPrefix(ctx);
          return typeof out === "string" && out.length > 0 ? out : undefined;
        } catch (cause) {
          throw new PluginHostError(`plugin "${p.name}" promptPrefix failed`, { cause });
        }
      }),
    );
    return parts.filter((p): p is string => typeof p === "string").join("\n\n");
  }

  intercept(e: HarnessEvent, ctx: RuntimeContext): HarnessEvent[] {
    let stream: HarnessEvent[] = [e];
    for (const p of this.plugins) {
      if (!p.interceptEvent) continue;
      const next: HarnessEvent[] = [];
      for (const evt of stream) {
        try {
          const out = p.interceptEvent(evt, ctx);
          if (out === undefined) {
            next.push(evt);
          } else {
            next.push(...out);
          }
        } catch (cause) {
          ctx.logger.warn(`plugin "${p.name}" interceptEvent threw`, {
            cause: String(cause),
          });
          next.push(evt);
        }
      }
      stream = next;
    }
    return stream;
  }

  fireToolCall(call: ToolCallSnapshot, ctx: RuntimeContext): void {
    for (const p of this.plugins) {
      if (!p.onToolCall) continue;
      p.onToolCall(call, ctx).catch((cause) => {
        ctx.logger.warn(`plugin "${p.name}" onToolCall threw`, {
          cause: String(cause),
        });
      });
    }
  }

  async cleanup(ctx: RuntimeContext): Promise<void> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const p = this.plugins[i];
      if (!p?.cleanup) continue;
      try {
        await p.cleanup(ctx);
      } catch (cause) {
        ctx.logger.warn(`plugin "${p.name}" cleanup threw`, {
          cause: String(cause),
        });
      }
    }
    while (this.written.length > 0) {
      const w = this.written.pop()!;
      try {
        restoreRulesFile(w);
      } catch (cause) {
        ctx.logger.warn(`rules-file restore failed for plugin "${w.pluginName}"`, {
          cause: String(cause),
        });
      }
    }
  }
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/core typecheck && pnpm --filter @flow-build/core test`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/plugin/host.ts
git commit -m "feat(core): add PluginHost orchestrating all six plugin hooks"
```

---

## Task 5: Wire `PluginHost` into `runPrompt`

**Files:**
- Modify: `packages/core/src/run.ts`
- Modify: `packages/core/src/test/fakeSdk.ts`

- [ ] **Step 1: Extend `fakeSdk.ts` so the smoke test can read what was sent**

Replace the `installFakeSdk` body and return type so callers can inspect the most recent `Agent.create` config and `agent.send` prompt:

```typescript
export type InstalledFakeSdk = {
  create: ReturnType<typeof vi.fn>;
  lastCreateConfig: () => unknown;
  lastSendPrompt: () => string | undefined;
};

export function installFakeSdk(cfg: FakeSdkConfig): InstalledFakeSdk {
  let createCallIdx = 0;
  let lastCreateConfig: unknown;
  let lastSendPrompt: string | undefined;
  const create = vi.fn(async (config: unknown) => {
    lastCreateConfig = config;
    const next = cfg.createBehavior[createCallIdx++];
    if (!next) throw new Error("fake SDK ran out of createBehavior entries");
    if (next.throws) throw next.throws;
    if (!next.agent) throw new Error("fake SDK behavior missing agent");
    const fa = next.agent;
    const send = vi.fn(async (prompt: string) => {
      lastSendPrompt = prompt;
      if (cfg.sendBehavior?.throws) throw cfg.sendBehavior.throws;
      return fa.run;
    });
    return { ...fa.agent, send };
  });
  vi.doMock("@cursor/sdk", () => ({
    Agent: { create },
  }));
  return {
    create,
    lastCreateConfig: () => lastCreateConfig,
    lastSendPrompt: () => lastSendPrompt,
  };
}
```

- [ ] **Step 2: Replace `packages/core/src/run.ts`**

```typescript
import { randomUUID } from "node:crypto";
import { Agent } from "@cursor/sdk";
import { resolveConfig } from "./config.js";
import { mapToHarnessError } from "./errors.js";
import { normalize } from "./normalizer.js";
import { withRetry } from "./retry.js";
import { PluginHost } from "./plugin/host.js";
import type {
  HarnessEvent,
  Logger,
  RunOptions,
  RunResult,
  RunStatus,
  RuntimeContext,
  ToolCallSnapshot,
} from "./types.js";

type LiveRun = {
  agent: Awaited<ReturnType<typeof Agent.create>>;
  run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>;
};

async function startWithRetry(
  cfg: ReturnType<typeof resolveConfig>,
  prompt: string,
  signal: AbortSignal | undefined,
  logger: Logger | undefined,
): Promise<LiveRun> {
  return withRetry<LiveRun>(
    async () => {
      let agent;
      try {
        agent = await Agent.create({
          apiKey: cfg.apiKey,
          model: { id: cfg.model },
          local: { cwd: cfg.cwd, settingSources: ["project", "user"] },
        });
      } catch (e) {
        throw mapToHarnessError(e);
      }
      try {
        const run = await agent.send(prompt);
        return { agent, run };
      } catch (e) {
        try {
          await agent.close();
        } catch {
          /* ignore disposal failure during retry path */
        }
        throw mapToHarnessError(e);
      }
    },
    {
      attempts: cfg.retry.attempts,
      baseDelayMs: cfg.retry.baseDelayMs,
      ...(signal ? { signal } : {}),
      ...(logger ? { logger } : {}),
    },
  );
}

export async function runPrompt(opts: RunOptions): Promise<RunResult> {
  const cfg = resolveConfig(opts);
  const { signal, logger } = opts;
  const plugins = opts.plugins ?? [];
  const host = new PluginHost(plugins);

  const ctx: RuntimeContext = {
    cwd: cfg.cwd,
    model: cfg.model,
    runId: randomUUID(),
    signal: signal ?? new AbortController().signal,
    logger: logger ?? { warn: () => {} },
    state: new Map(),
  };

  opts.onEvent({ type: "status", phase: "starting" });

  let finalText = "";
  let status: RunStatus = "completed";
  let usage: RunResult["usage"];

  try {
    await host.runPreRun(ctx);
    await host.runSystemPrompt(ctx);
    const prefix = await host.runPromptPrefix(ctx);
    const finalPrompt = prefix.length > 0 ? `${prefix}\n\n${cfg.prompt}` : cfg.prompt;

    const live = await startWithRetry(cfg, finalPrompt, signal, logger);

    try {
      for await (const msg of live.run.stream()) {
        if (signal?.aborted) {
          await live.run.cancel();
          status = "cancelled";
          break;
        }
        const events = normalize(msg, logger);
        for (const e of events) {
          const out = host.intercept(e, ctx);
          for (const e2 of out) {
            if (e2.type === "text") finalText += e2.delta;
            opts.onEvent(e2);
            if (e2.type === "tool_start") {
              const snap: ToolCallSnapshot = {
                callId: e2.callId,
                name: e2.name,
                status: "running",
              };
              host.fireToolCall(snap, ctx);
            }
            if (e2.type === "tool_end") {
              const snap: ToolCallSnapshot = {
                callId: e2.callId,
                name: e2.name,
                status: e2.ok ? "completed" : "error",
              };
              host.fireToolCall(snap, ctx);
            }
          }
        }
      }
      if (status !== "cancelled") {
        const wait = await live.run.wait();
        const waitStatus = (wait as { status?: string }).status;
        if (waitStatus === "cancelled") status = "cancelled";
        else if (waitStatus && waitStatus !== "completed") status = "failed";
        const u = (wait as { usage?: { inputTokens: number; outputTokens: number } }).usage;
        if (u) usage = u;
      }
    } catch (e) {
      throw mapToHarnessError(e);
    } finally {
      try {
        await live.agent.close();
      } catch {
        /* swallow disposal errors; primary error already in flight if any */
      }
    }

    opts.onEvent({ type: "status", phase: "done" });
    const result: RunResult = { status, finalText };
    if (usage) result.usage = usage;
    return result;
  } finally {
    await host.cleanup(ctx);
  }
}
```

- [ ] **Step 3: Sanity check — existing tests must still pass with `plugins` unset**

Run: `pnpm --filter @flow-build/core typecheck && pnpm --filter @flow-build/core test`
Expected: every existing test (run / cancellation / retry / config / errors / normalizer / index) still passes.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/run.ts packages/core/src/test/fakeSdk.ts
git commit -m "feat(core): wire PluginHost into runPrompt with settingSources project"
```

---

## Task 6: Re-export plugin types from `core/src/index.ts`

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Replace the file**

```typescript
export { runPrompt } from "./run.js";
export type {
  Logger,
  RetryOptions,
  RunOptions,
  HarnessEvent,
  RunStatus,
  RunResult,
  Plugin,
  RuntimeContext,
  PreRunOutput,
  SystemPromptContribution,
  ToolCallSnapshot,
} from "./types.js";
export {
  HarnessError,
  AuthError,
  ConfigError,
  NetworkError,
  PluginHostError,
} from "./errors.js";
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/core typecheck && pnpm --filter @flow-build/core test`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): re-export Plugin types and PluginHostError from index"
```

---

## Task 7: Scaffold `packages/rote`

**Files:**
- Create: `packages/rote/package.json`
- Create: `packages/rote/tsconfig.json`
- Create: `packages/rote/vitest.config.ts`
- Create: `packages/rote/src/types.ts`
- Create: `packages/rote/src/index.ts`
- Create: `packages/rote/src/plugin.ts` (stub — replaced in Task 14)

- [ ] **Step 1: Create `packages/rote/package.json`**

```json
{
  "name": "@flow-build/rote",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@flow-build/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/rote/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/test/**"]
}
```

- [ ] **Step 3: Create `packages/rote/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create `packages/rote/src/types.ts`**

```typescript
export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { timeoutMs: number; signal?: AbortSignal },
) => Promise<ExecResult>;

export type RoteFacts = {
  version: string | null;
  adapters: Array<{ id: string; fingerprint: string; toolsetCount: number }> | null;
  pendingStubs: Array<{ workspace: string; name: string; adapter: string }> | null;
  flowCount: number | null;
  activeWorkspace: { name: string; path: string } | null;
};

export type BypassMatch = {
  rationale: string;
  suggestions: string[];
};

export type BypassPattern = {
  match: (toolName: string, command: string) => boolean;
  build: (command: string) => BypassMatch;
};

export type BypassPatternSet = BypassPattern[];

export type RotePluginOptions = {
  bin?: string;
  probeTimeoutMs?: number;
  hintBypassPatterns?: BypassPatternSet;
  rulesFilePath?: string;
  enableHints?: boolean;
  enableProbe?: boolean;
  exec?: ExecFn;
};
```

- [ ] **Step 5: Create `packages/rote/src/index.ts`**

```typescript
export { createRotePlugin } from "./plugin.js";
export type { RotePluginOptions, RoteFacts } from "./types.js";
```

- [ ] **Step 6: Create stub `packages/rote/src/plugin.ts`** (replaced in Task 14)

```typescript
import type { Plugin } from "@flow-build/core";
import type { RotePluginOptions } from "./types.js";

export function createRotePlugin(_opts: RotePluginOptions = {}): Plugin {
  return { name: "rote" };
}
```

- [ ] **Step 7: Install workspace deps and sanity-check**

Run:
```
pnpm install
pnpm --filter @flow-build/rote typecheck
```
Expected: lockfile updated, typecheck passes.

- [ ] **Step 8: Commit**

```bash
git add packages/rote pnpm-lock.yaml
git commit -m "feat(rote): scaffold @flow-build/rote package"
```

---

## Task 8: `workspace.ts` — infer active rote workspace

**Files:**
- Create: `packages/rote/src/workspace.ts`

- [ ] **Step 1: Create the file**

```typescript
import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";

export type ActiveWorkspace = { name: string; path: string };

export function inferActiveWorkspace(opts: {
  cwd: string;
  roteHome: string;
}): ActiveWorkspace | null {
  const cwdAbs = resolve(opts.cwd);
  const homeAbs = resolve(opts.roteHome);
  const wsRoot = resolve(homeAbs, "workspaces") + sep;

  if ((cwdAbs + sep).startsWith(wsRoot)) {
    const tail = cwdAbs.slice(wsRoot.length);
    const name = tail.split(sep)[0];
    if (name) {
      return { name, path: resolve(wsRoot, name) };
    }
  }

  let walk = cwdAbs;
  while (true) {
    const marker = resolve(walk, ".rote", "state.json");
    if (existsSync(marker)) {
      try {
        if (statSync(marker).isFile()) {
          return { name: basename(walk), path: walk };
        }
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(walk);
    if (parent === walk) break;
    walk = parent;
  }
  return null;
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/rote typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rote/src/workspace.ts
git commit -m "feat(rote): infer active rote workspace from cwd"
```

---

## Task 9: `intercept/bypass-patterns.ts`

**Files:**
- Create: `packages/rote/src/intercept/bypass-patterns.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { BypassMatch, BypassPattern, BypassPatternSet } from "../types.js";

const SHELL_TOOLS = new Set(["shell", "bash", "terminal"]);

export function extractCommand(args: unknown): string | null {
  if (typeof args === "string") return args;
  if (args && typeof args === "object") {
    const a = args as Record<string, unknown>;
    if (typeof a.command === "string") return a.command;
    if (typeof a.cmd === "string") return a.cmd;
  }
  return null;
}

function ghPattern(): BypassPattern {
  const re = /^\s*gh\s+(issue|pr|repo|workflow|run|gist|api)\b/;
  return {
    match: (_t, c) => re.test(c),
    build: () => ({
      rationale: "GitHub CLI detected — rote has a GitHub adapter",
      suggestions: [
        'rote flow search "<intent>"',
        'rote explore "<intent>"',
        'rote adapter catalog search "github"',
      ],
    }),
  };
}

function curlGitHubPattern(): BypassPattern {
  const re = /^\s*curl\b.*\bgithub\.com\b/;
  return {
    match: (_t, c) => re.test(c),
    build: () => ({
      rationale: "Direct curl against GitHub API — rote has a GitHub adapter",
      suggestions: [
        'rote flow search "<intent>"',
        'rote explore "<intent>"',
      ],
    }),
  };
}

function vendorPattern(name: string, suggestion: string): BypassPattern {
  const re = new RegExp(`^\\s*${name}\\b`);
  return {
    match: (_t, c) => re.test(c),
    build: () => ({
      rationale: `${name} CLI detected — prefer rote adapter`,
      suggestions: [suggestion, `rote adapter catalog search "${name}"`],
    }),
  };
}

export const defaultBypassPatterns: BypassPatternSet = [
  ghPattern(),
  curlGitHubPattern(),
  vendorPattern("stripe", 'rote stripe_probe "<intent>"'),
  vendorPattern("linear", 'rote linear_probe "<intent>"'),
  vendorPattern("supabase", 'rote adapter catalog search "supabase"'),
];

export function classifyBypass(
  toolName: string,
  command: string,
  patterns: BypassPatternSet,
): BypassMatch | null {
  if (!SHELL_TOOLS.has(toolName)) return null;
  for (const p of patterns) {
    if (p.match(toolName, command)) return p.build(command);
  }
  return null;
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/rote typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rote/src/intercept/bypass-patterns.ts
git commit -m "feat(rote): bypass classifier for gh/curl/stripe/linear/supabase"
```

---

## Task 10: `intercept/hint.ts`

**Files:**
- Create: `packages/rote/src/intercept/hint.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { HarnessEvent } from "@flow-build/core";
import type { BypassMatch } from "../types.js";

export function buildHintEvent(m: BypassMatch): HarnessEvent {
  const tries = m.suggestions.join(" ; ");
  return {
    type: "text",
    delta: `\n[rote hint] ${m.rationale} — try: ${tries}\n`,
  };
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/rote typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rote/src/intercept/hint.ts
git commit -m "feat(rote): hint event builder for bypass classifier output"
```

---

## Task 11: `render/rules.ts` — static body

**Files:**
- Create: `packages/rote/src/render/rules.ts`

- [ ] **Step 1: Create the file**

```typescript
export type RulesBodyInput = {
  versionLabel: string;
};

export function renderRulesBody(input: RulesBodyInput): string {
  return `---
alwaysApply: true
description: "rote workflow guidance"
globs: "**/*"
---
<!-- flow-build:rote v=${input.versionLabel} -->

# rote workflow guidance (always-on)

You are running inside an environment that has the rote CLI available
(version: ${input.versionLabel}). rote is the workflow engine for adapter
calls, response caching, and crystallized reusable flows.

Lifecycle: search → execute → crystallize → reuse.
Always run \`rote flow search "<intent>"\` before building anything new.

## Primitives

- Adapter — installed local artifact for an API; exposes \`<id>_probe\`,
  \`<id>_call\`, \`<id>_batch_call\`.
- Workspace — sandboxed dir under \`~/.rote/workspaces/<name>/\`.
- Response cell — numbered cached response (\`@1\`, \`@2\`, …); jq-queryable.
- Variable — set with \`rote set k=v\`; substituted with \`-t\`.
- Session — MCP connection; reused across calls with \`-s\`.
- Flow — parameterized script under \`~/.rote/flows/\`.
- Pending stub — resumable scaffolding marker.

## Most-common workflow

\`\`\`bash
rote flow search "<intent>"
rote explore "<intent>"
rote init <ws> --seq
rote init-session adapter/<id>
rote <id>_probe "<intent>" -s
rote <id>_call <tool> '{ ... }' -t -s
rote @N '<jq>' -r
rote export <name>.sh --params a,b --tag t --atomic --release
rote flow run <name> <args...>
\`\`\`

## Bypass policy

When tempted to call any of these directly, prefer rote first:

- \`gh issue/pr/repo …\` → \`rote flow search\` then \`rote explore\`.
- \`curl … github.com\` → same.
- \`stripe …\`            → \`rote stripe_probe "<intent>"\`.
- \`linear …\`            → \`rote linear_probe "<intent>"\`.
- \`supabase …\`          → \`rote adapter catalog search "supabase"\`.

Local dev commands (\`git\`, \`npm\`, \`cargo\`, \`pnpm\`, \`make\`, \`just\`,
\`ls\`, \`find\`, \`rg\`) are unaffected.

## Reference pointers

- \`rote how\` — onboarding guide.
- \`rote guidance agent\` — embedded full reference.
- \`rote man <topic>\` — man-page style reference.
- \`rote --help\` — CLI command list.
`;
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/rote typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rote/src/render/rules.ts
git commit -m "feat(rote): render static rules-file body with alwaysApply frontmatter"
```

---

## Task 12: `render/prefix.ts` — dynamic prefix

**Files:**
- Create: `packages/rote/src/render/prefix.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { RoteFacts } from "../types.js";

const INSTALL_LINE =
  "rote unavailable; install with: curl -fsSL https://raw.githubusercontent.com/modiqo/rote-releases/main/install.sh | bash";

export function renderPrefix(f: RoteFacts): string {
  const allNull =
    f.version === null &&
    f.adapters === null &&
    f.pendingStubs === null &&
    f.flowCount === null &&
    f.activeWorkspace === null;
  if (allNull) return INSTALL_LINE;

  const lines: string[] = ["[rote runtime — flow-build]"];
  if (f.version) lines.push(`version: ${f.version}`);
  if (f.adapters && f.adapters.length > 0) {
    const sample = f.adapters.slice(0, 5).map((a) => a.id).join(", ");
    lines.push(`adapters: ${f.adapters.length} (${sample})`);
  }
  if (typeof f.flowCount === "number") {
    const stubs = f.pendingStubs ?? [];
    if (stubs.length > 0) {
      const wsList = Array.from(new Set(stubs.map((s) => s.workspace))).join(", ");
      lines.push(
        `flows: ${f.flowCount} indexed; ${stubs.length} pending stubs in workspaces: ${wsList}`,
      );
    } else {
      lines.push(`flows: ${f.flowCount} indexed`);
    }
  } else if (f.pendingStubs && f.pendingStubs.length > 0) {
    const wsList = Array.from(new Set(f.pendingStubs.map((s) => s.workspace))).join(", ");
    lines.push(`pending stubs in workspaces: ${wsList}`);
  }
  if (f.activeWorkspace) {
    lines.push(`active workspace: ${f.activeWorkspace.name}`);
  }
  lines.push('remember: rote flow search "<intent>" before building anything new.');
  return lines.join("\n");
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/rote typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rote/src/render/prefix.ts
git commit -m "feat(rote): render dynamic per-run prompt prefix"
```

---

## Task 13: `probe.ts` and `default-exec.ts`

**Files:**
- Create: `packages/rote/src/default-exec.ts`
- Create: `packages/rote/src/probe.ts`

- [ ] **Step 1: Create `packages/rote/src/default-exec.ts`**

```typescript
import { execFile } from "node:child_process";
import type { ExecFn } from "./types.js";

export const defaultExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    let timedOut = false;
    const child = execFile(cmd, args, { timeout: opts.timeoutMs }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ETIMEDOUT") timedOut = true;
      resolve({
        stdout: typeof stdout === "string" ? stdout : stdout.toString("utf8"),
        stderr: typeof stderr === "string" ? stderr : stderr.toString("utf8"),
        exitCode:
          err && typeof (err as NodeJS.ErrnoException).code === "number"
            ? Number((err as NodeJS.ErrnoException).code)
            : err
              ? 1
              : 0,
        timedOut,
      });
    });
    opts.signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
  });
```

- [ ] **Step 2: Create `packages/rote/src/probe.ts`**

```typescript
import { inferActiveWorkspace } from "./workspace.js";
import type { ExecFn, ExecResult, RoteFacts } from "./types.js";

async function safeExec(
  exec: ExecFn,
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<ExecResult | null> {
  try {
    const r = await exec(bin, args, { timeoutMs });
    if (r.timedOut || r.exitCode !== 0) return null;
    return r;
  } catch {
    return null;
  }
}

function parseVersion(out: string): string | null {
  const m = /([0-9]+\.[0-9]+(?:\.[0-9]+)?)/.exec(out.trim());
  return m && m[1] ? m[1] : null;
}

function parseJson<T>(out: string): T | null {
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

export type ProbeInput = {
  bin: string;
  cwd: string;
  roteHome: string;
  timeoutMs: number;
  exec: ExecFn;
};

export async function runProbe(input: ProbeInput): Promise<RoteFacts> {
  const { bin, cwd, roteHome, timeoutMs, exec } = input;

  const [verRes, advRes, penRes, floRes] = await Promise.all([
    safeExec(exec, bin, ["--version"], timeoutMs),
    safeExec(exec, bin, ["machine", "inventory", "--json"], timeoutMs),
    safeExec(exec, bin, ["flow", "pending", "list", "--json"], timeoutMs),
    safeExec(exec, bin, ["flow", "list", "--json"], timeoutMs),
  ]);

  const version = verRes ? parseVersion(verRes.stdout) : null;

  const advParsed = advRes
    ? parseJson<{
        adapters?: Array<{ id: string; fingerprint: string; toolsetCount: number }>;
      }>(advRes.stdout)
    : null;
  const adapters =
    advParsed?.adapters && Array.isArray(advParsed.adapters)
      ? advParsed.adapters.map((a) => ({
          id: String(a.id),
          fingerprint: String(a.fingerprint),
          toolsetCount: Number(a.toolsetCount) || 0,
        }))
      : null;

  const penParsed = penRes
    ? parseJson<Array<{ workspace: string; name: string; adapter: string }>>(penRes.stdout)
    : null;
  const pendingStubs = Array.isArray(penParsed)
    ? penParsed.map((s) => ({
        workspace: String(s.workspace),
        name: String(s.name),
        adapter: String(s.adapter),
      }))
    : null;

  let flowCount: number | null = null;
  if (floRes) {
    const fl = parseJson<unknown>(floRes.stdout);
    if (Array.isArray(fl)) flowCount = fl.length;
    else if (fl && typeof fl === "object" && Array.isArray((fl as { flows?: unknown }).flows)) {
      flowCount = ((fl as { flows: unknown[] }).flows).length;
    }
  }

  const activeWorkspace = inferActiveWorkspace({ cwd, roteHome });

  return { version, adapters, pendingStubs, flowCount, activeWorkspace };
}
```

- [ ] **Step 3: Sanity check**

Run: `pnpm --filter @flow-build/rote typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/rote/src/default-exec.ts packages/rote/src/probe.ts
git commit -m "feat(rote): rote CLI probe with DI exec and per-fact null fallbacks"
```

---

## Task 14: Replace `plugin.ts` with the real `createRotePlugin`

**Files:**
- Modify: `packages/rote/src/plugin.ts`

- [ ] **Step 1: Replace the file**

```typescript
import type { HarnessEvent, Plugin, RuntimeContext, ToolCallSnapshot } from "@flow-build/core";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultExec } from "./default-exec.js";
import { runProbe } from "./probe.js";
import { renderRulesBody } from "./render/rules.js";
import { renderPrefix } from "./render/prefix.js";
import {
  classifyBypass,
  defaultBypassPatterns,
  extractCommand,
} from "./intercept/bypass-patterns.js";
import { buildHintEvent } from "./intercept/hint.js";
import type { RoteFacts, RotePluginOptions } from "./types.js";

const DEFAULT_RULES_PATH = ".cursor/rules/.flow-build-rote.mdc";
const DEFAULT_TIMEOUT_MS = 1500;
const STATE_FACTS_KEY = "rote";
const STATE_TOOL_ARGS_KEY = "rote:lastToolArgs";

function getRoteHome(): string {
  return process.env.ROTE_HOME ?? join(homedir(), ".rote");
}

function getFacts(ctx: RuntimeContext): RoteFacts {
  const slot = ctx.state.get(STATE_FACTS_KEY) as { facts?: RoteFacts } | undefined;
  return (
    slot?.facts ?? {
      version: null,
      adapters: null,
      pendingStubs: null,
      flowCount: null,
      activeWorkspace: null,
    }
  );
}

export function createRotePlugin(opts: RotePluginOptions = {}): Plugin {
  const bin = opts.bin ?? "rote";
  const probeTimeoutMs = opts.probeTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const enableProbe = opts.enableProbe ?? true;
  const enableHints = opts.enableHints ?? true;
  const rulesPath = opts.rulesFilePath ?? DEFAULT_RULES_PATH;
  const patterns = opts.hintBypassPatterns ?? defaultBypassPatterns;
  const exec = opts.exec ?? defaultExec;

  return {
    name: "rote",

    async preRun(ctx) {
      let facts: RoteFacts;
      if (!enableProbe) {
        facts = {
          version: null,
          adapters: null,
          pendingStubs: null,
          flowCount: null,
          activeWorkspace: null,
        };
      } else {
        try {
          facts = await runProbe({
            bin,
            cwd: ctx.cwd,
            roteHome: getRoteHome(),
            timeoutMs: probeTimeoutMs,
            exec,
          });
        } catch (cause) {
          ctx.logger.warn("rote probe threw unexpectedly", { cause: String(cause) });
          facts = {
            version: null,
            adapters: null,
            pendingStubs: null,
            flowCount: null,
            activeWorkspace: null,
          };
        }
      }
      if (facts.version === null) {
        ctx.logger.warn("rote binary not found", { bin });
      }
      ctx.state.set(STATE_FACTS_KEY, { facts });
      return { facts: facts as unknown as Record<string, unknown> };
    },

    async systemPrompt(ctx) {
      const facts = getFacts(ctx);
      const versionLabel = facts.version ?? "unknown";
      return {
        rulesFile: {
          relativePath: rulesPath,
          contents: renderRulesBody({ versionLabel }),
        },
      };
    },

    async promptPrefix(ctx) {
      const facts = getFacts(ctx);
      return renderPrefix(facts);
    },

    async onToolCall(call: ToolCallSnapshot, ctx) {
      if (!enableHints) return;
      if (call.args === undefined) return;
      const slot =
        (ctx.state.get(STATE_TOOL_ARGS_KEY) as Record<string, unknown> | undefined) ?? {};
      slot[call.callId] = call.args;
      ctx.state.set(STATE_TOOL_ARGS_KEY, slot);
    },

    interceptEvent(e: HarnessEvent, ctx) {
      if (!enableHints) return undefined;
      if (e.type !== "tool_end") return undefined;
      const slot = ctx.state.get(STATE_TOOL_ARGS_KEY) as
        | Record<string, unknown>
        | undefined;
      const argv = slot?.[e.callId];
      const cmd = extractCommand(argv);
      if (!cmd) return undefined;
      const m = classifyBypass(e.name, cmd, patterns);
      if (!m) return undefined;
      return [e, buildHintEvent(m)];
    },
  };
}
```

- [ ] **Step 2: Sanity check**

Run: `pnpm --filter @flow-build/rote typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rote/src/plugin.ts
git commit -m "feat(rote): assemble createRotePlugin with hooks for prefix/rules/hints"
```

---

## Task 15: CLI integration — always wire the rote plugin

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/main.ts`

- [ ] **Step 1: Add the dependency**

In `packages/cli/package.json`, replace the `dependencies` block with:

```json
"dependencies": {
  "@flow-build/core": "workspace:*",
  "@flow-build/rote": "workspace:*",
  "commander": "^12.0.0",
  "picocolors": "^1.0.0"
}
```

Run: `pnpm install`
Expected: lockfile updated, `@flow-build/rote` symlinked into the CLI package.

- [ ] **Step 2: Modify `packages/cli/src/main.ts`**

Add to the imports near the top:

```typescript
import { createRotePlugin } from "@flow-build/rote";
import type { Plugin } from "@flow-build/core";
```

Inside `executeRun`, just before the `runPrompt` call, add:

```typescript
const plugins: Plugin[] =
  process.env.FLOW_BUILD_DISABLE_PLUGINS === "1" ? [] : [createRotePlugin({})];
```

Pass `plugins` into `runPrompt`:

```typescript
const result = await runPrompt({
  prompt,
  cwd: opts.cwd,
  model: opts.model,
  signal: deps.signal,
  onEvent: render,
  logger,
  retry: { attempts },
  plugins,
});
```

- [ ] **Step 3: Sanity check**

Run: `pnpm --filter flow-build typecheck && pnpm --filter flow-build test`
Expected: existing render tests still pass; typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json packages/cli/src/main.ts pnpm-lock.yaml
git commit -m "feat(cli): always wire rote plugin into runPrompt; honor disable env"
```

---

## Task 16: End-to-end smoke test

The single new test in this plan. Drives the harness with a fake SDK and a fake `exec`, asserts: rules file is materialized during the run, prompt prefix is sent to `agent.send`, hint event fans out on a `gh issue list` shell tool result, rules file is gone after.

**Files:**
- Create: `packages/cli/src/smoke.test.ts`

- [ ] **Step 1: Create `packages/cli/src/smoke.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flow-build-smoke-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  delete process.env.FLOW_BUILD_DISABLE_PLUGINS;
  vi.doUnmock("@cursor/sdk");
  vi.doUnmock("@flow-build/rote");
});

describe("flow-build end-to-end smoke", () => {
  it("materializes the rote rules file, sends a prefixed prompt, fans hint, then cleans up", async () => {
    const rulesPath = join(dir, ".cursor/rules/.flow-build-rote.mdc");
    let sentPrompt: string | undefined;
    let rulesPresentDuringSend = false;

    // Fake @cursor/sdk: a streaming agent that emits one shell tool_call (gh issue list)
    // and one assistant text chunk.
    vi.doMock("@cursor/sdk", () => ({
      Agent: {
        create: vi.fn(async () => ({
          agentId: "a",
          close: async () => {},
          [Symbol.asyncDispose]: async () => {},
          send: vi.fn(async (prompt: string) => {
            sentPrompt = prompt;
            rulesPresentDuringSend = existsSync(rulesPath);
            return {
              cancel: async () => {},
              wait: async () => ({ status: "completed" }),
              stream: async function* () {
                yield {
                  type: "tool_call",
                  call_id: "c1",
                  name: "shell",
                  status: "running",
                  args: { command: "gh issue list" },
                };
                yield {
                  type: "tool_call",
                  call_id: "c1",
                  name: "shell",
                  status: "completed",
                  args: { command: "gh issue list" },
                };
                yield {
                  type: "assistant",
                  message: { content: [{ type: "text", text: "ok" }] },
                };
              },
            };
          }),
        })),
      },
    }));

    // Fake @flow-build/rote: keep the real plugin but feed a fake exec that pretends rote
    // is installed at version 0.99.0 with two adapters and one pending stub.
    vi.doMock("@flow-build/rote", async (orig) => {
      const real = (await orig()) as typeof import("@flow-build/rote");
      const fakeExec = async (_cmd: string, args: string[]) => {
        const key = args.join(" ");
        if (key === "--version") {
          return { stdout: "rote 0.99.0\n", stderr: "", exitCode: 0, timedOut: false };
        }
        if (key === "machine inventory --json") {
          return {
            stdout: JSON.stringify({
              adapters: [
                { id: "github-api", fingerprint: "f1", toolsetCount: 5 },
                { id: "stripe", fingerprint: "f2", toolsetCount: 3 },
              ],
            }),
            stderr: "",
            exitCode: 0,
            timedOut: false,
          };
        }
        if (key === "flow pending list --json") {
          return {
            stdout: JSON.stringify([
              { workspace: "demo", name: "list-issues", adapter: "github-api" },
            ]),
            stderr: "",
            exitCode: 0,
            timedOut: false,
          };
        }
        if (key === "flow list --json") {
          return { stdout: "[]", stderr: "", exitCode: 0, timedOut: false };
        }
        return { stdout: "", stderr: "no", exitCode: 1, timedOut: false };
      };
      return {
        ...real,
        createRotePlugin: () => real.createRotePlugin({ exec: fakeExec }),
      };
    });

    // Drive the CLI directly (avoids spawning a subprocess).
    const { Writable } = await import("node:stream");
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdout = new Writable({
      write(chunk, _e, cb) {
        stdoutChunks.push(chunk.toString());
        cb();
      },
    });
    const stderr = new Writable({
      write(chunk, _e, cb) {
        stderrChunks.push(chunk.toString());
        cb();
      },
    });
    const ctl = new AbortController();
    let exitCode: number | undefined;

    const { runCli } = await import("./main.js");
    await runCli({
      argv: ["node", "flow-build", "run", "summarize", "--cwd", dir],
      stdout,
      stderr,
      isTTY: false,
      signal: ctl.signal,
      exit: ((c: number) => {
        exitCode = c;
        // throw so commander aborts cleanly without continuing the action
        throw new Error("__exit__");
      }) as unknown as (code: number) => never,
    }).catch((e) => {
      if ((e as Error).message !== "__exit__") throw e;
    });

    // Rules file existed during the send, gone after cleanup.
    expect(rulesPresentDuringSend).toBe(true);
    expect(existsSync(rulesPath)).toBe(false);

    // Prompt was prefixed with rote runtime block.
    expect(sentPrompt).toBeDefined();
    expect(sentPrompt!).toContain("[rote runtime");
    expect(sentPrompt!).toContain("0.99.0");
    expect(sentPrompt!).toContain("\n\nsummarize");

    // Hint surfaced in stdout after the gh tool call.
    const allOut = stdoutChunks.join("");
    expect(allOut).toContain("[rote hint]");
    expect(allOut).toContain("GitHub CLI detected");

    // Run completed cleanly.
    expect(exitCode).toBe(0);

    // Optional: confirm the rules file content matches what we expected during the run.
    // We can't read it after cleanup; instead spot-check that the prefix references
    // the version and adapter sample.
    expect(sentPrompt!).toContain("github-api");
  });

  it("completes cleanly when rote is missing — no rules version, install hint in prefix", async () => {
    let sentPrompt: string | undefined;

    vi.doMock("@cursor/sdk", () => ({
      Agent: {
        create: vi.fn(async () => ({
          agentId: "a",
          close: async () => {},
          [Symbol.asyncDispose]: async () => {},
          send: vi.fn(async (prompt: string) => {
            sentPrompt = prompt;
            return {
              cancel: async () => {},
              wait: async () => ({ status: "completed" }),
              stream: async function* () {
                yield {
                  type: "assistant",
                  message: { content: [{ type: "text", text: "ok" }] },
                };
              },
            };
          }),
        })),
      },
    }));

    vi.doMock("@flow-build/rote", async (orig) => {
      const real = (await orig()) as typeof import("@flow-build/rote");
      return {
        ...real,
        createRotePlugin: () =>
          real.createRotePlugin({
            exec: async () => ({
              stdout: "",
              stderr: "not found",
              exitCode: 127,
              timedOut: false,
            }),
          }),
      };
    });

    const { Writable } = await import("node:stream");
    const stdout = new Writable({ write(_c, _e, cb) { cb(); } });
    const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
    const ctl = new AbortController();
    let exitCode: number | undefined;

    const { runCli } = await import("./main.js");
    await runCli({
      argv: ["node", "flow-build", "run", "hi", "--cwd", dir],
      stdout,
      stderr,
      isTTY: false,
      signal: ctl.signal,
      exit: ((c: number) => {
        exitCode = c;
        throw new Error("__exit__");
      }) as unknown as (code: number) => never,
    }).catch((e) => {
      if ((e as Error).message !== "__exit__") throw e;
    });

    expect(exitCode).toBe(0);
    expect(sentPrompt!).toContain("rote unavailable");
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `pnpm --filter flow-build test -- src/smoke.test.ts`
Expected: both smoke cases pass.

- [ ] **Step 3: Run the full workspace test suite**

Run: `pnpm -r test`
Expected: every existing core test, the existing CLI render test, plus the new smoke test pass.

- [ ] **Step 4: Run typecheck and lint across the workspace**

Run: `pnpm -r typecheck && pnpm lint`
Expected: zero errors. Fix any lint issue inline.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/smoke.test.ts
git commit -m "test(cli): end-to-end smoke covering plugin layer + rote integration"
```

---

## Manual smoke (post-implementation)

Run once on a real machine after Task 16, with `rote` actually installed and `CURSOR_API_KEY` set:

```bash
pnpm -r build
node packages/cli/dist/main.js run "list my GitHub issues" --cwd "$(pwd)"
```

Verify by eye:
- A `.cursor/rules/.flow-build-rote.mdc` appears for the duration of the run and is gone afterwards.
- The agent picks up the rote guidance (it talks about `rote flow search`, `rote explore`, etc.).
- If you trigger a `gh issue list` shell call, an `[rote hint] …` line shows up inline.

If something goes wrong, the automated smoke test in Task 16 is still the source of truth for non-real-API regressions.

---

## Self-review checklist

- Spec §3 architecture → Tasks 7 + 15.
- Spec §4 Plugin interface → Tasks 1, 2, 6.
- Spec §4.4 hook ordering → Task 5 (single orchestration site).
- Spec §4.5/4.6 guarantees & failure model → Task 4 (host implementation).
- Spec §4.7 rules-file write protocol → Task 3.
- Spec §4.8 Cursor SDK wiring (`settingSources`) → Task 5.
- Spec §5.1 layout → Tasks 7, 8, 9, 10, 11, 12, 13, 14.
- Spec §5.2 public surface → Tasks 7, 14.
- Spec §5.3 probe → Task 13.
- Spec §5.4 / 5.5 templates → Tasks 11, 12.
- Spec §5.6 / 5.7 bypass classifier + hint → Tasks 9, 10.
- Spec §5.8 workspace inference → Task 8.
- Spec §5.9 crash recovery — out of scope; documented as post-v1 in spec.
- Spec §6 CLI changes → Task 15.
- Spec §7 data flow — encoded in Task 5.
- Spec §8 testing — collapsed to one end-to-end smoke (Task 16) plus a manual checklist.
- Spec §9 v1 scope vs deferred — plan only ships v1 items.

Type / signature consistency:
- `Plugin`, `RuntimeContext`, `RoteFacts`, `BypassMatch`, `WrittenFile` defined once and referenced by exact name.
- Hook names (`preRun`, `systemPrompt`, `promptPrefix`, `interceptEvent`, `onToolCall`, `cleanup`) consistent across core, host, and rote plugin.
- State keys `"rote"` (facts) and `"rote:lastToolArgs"` (tool args) are constants in `plugin.ts`, used identically in the smoke test.
