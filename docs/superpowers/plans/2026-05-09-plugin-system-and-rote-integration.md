# Plugin System & Rote Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer a `Plugin` extension surface onto `@flow-build/core` and ship a first-party `@flow-build/rote` plugin so every `flow-build` run automatically materializes rote workflow guidance as a `.cursor/rules/*.mdc` file and prepends a runtime-facts block to the user prompt.

**Architecture:** New `Plugin` interface and `PluginHost` orchestrator inside core; new `@flow-build/rote` package depending only on `@flow-build/core`'s public surface; CLI hard-wires the rote plugin into every `runPrompt` call. The rules-file writer, hook ordering, and cleanup are in core; rote-specific knowledge (CLI shells, bypass patterns, prompt templates) lives only in `@flow-build/rote`.

**Tech Stack:** TypeScript, Node ≥20, pnpm workspaces, `@cursor/sdk`, `commander`, `vitest`, `tsx`, `tsup`. All probe shells are dependency-injected so tests never call real `rote`.

**Spec:** `docs/superpowers/specs/2026-05-09-plugin-system-and-rote-integration-design.md`

**Builds on:** existing harness implementation in `packages/core` and `packages/cli` (commits `ef90965` … `bb25930`). Do NOT regress existing test suites.

---

## Notes for the implementer

- **TDD discipline:** every behavior task writes a failing test first, runs it to confirm failure, writes the minimal impl, runs again to confirm pass. Do not skip the failing-run step.
- **Commits:** every task ends with one commit. Conventional Commits (`feat:`, `chore:`, `test:`, `docs:`). **NEVER include `Co-Authored-By` lines.**
- **No real network or rote shells in tests.** All probe execution is gated behind a dependency-injected `ExecFn`.
- **Style:** match existing code — double quotes, semicolons, trailing commas, `.js` import extensions (NodeNext).
- **Module resolution:** every relative import inside the package source ends with `.js` (TypeScript NodeNext).
- **Existing tests must keep passing.** When modifying `run.ts` (Task 11), do not change the behavior observed by existing tests when `plugins` is unset.

---

## Task 1: Plugin types — extend `core/src/types.ts`

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/types.test.ts`

- [ ] **Step 1: Write the failing type-shape test**

Create `packages/core/src/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type {
  Plugin,
  RuntimeContext,
  PreRunOutput,
  SystemPromptContribution,
  ToolCallSnapshot,
  RunOptions,
  HarnessEvent,
  Logger,
} from "./types.js";

describe("plugin types", () => {
  it("Plugin is structurally compatible with a no-op implementation", () => {
    const p: Plugin = { name: "noop" };
    expectTypeOf(p).toMatchTypeOf<Plugin>();
  });

  it("Plugin allows all hook fields to be optional", () => {
    const p: Plugin = {
      name: "all-hooks",
      preRun: async () => ({ facts: { a: 1 } }),
      systemPrompt: async () => ({
        rulesFile: { relativePath: ".cursor/rules/x.mdc", contents: "x" },
      }),
      promptPrefix: async () => "prefix",
      interceptEvent: (_e, _ctx) => undefined,
      onToolCall: async () => {},
      cleanup: async () => {},
    };
    expectTypeOf(p).toMatchTypeOf<Plugin>();
  });

  it("RuntimeContext exposes the expected fields", () => {
    expectTypeOf<RuntimeContext>().toMatchTypeOf<{
      cwd: string;
      model: string;
      runId: string;
      signal: AbortSignal;
      logger: Logger;
      state: Map<string, unknown>;
    }>();
  });

  it("RunOptions accepts an optional plugins array", () => {
    const opts: RunOptions = {
      prompt: "p",
      cwd: "/tmp",
      onEvent: (_e: HarnessEvent) => {},
      plugins: [{ name: "x" }],
    };
    expectTypeOf(opts.plugins).toEqualTypeOf<Plugin[] | undefined>();
  });

  it("PreRunOutput allows facts to be omitted", () => {
    const out: PreRunOutput = {};
    expectTypeOf(out).toMatchTypeOf<PreRunOutput>();
  });

  it("ToolCallSnapshot status is constrained", () => {
    expectTypeOf<ToolCallSnapshot["status"]>().toEqualTypeOf<
      "running" | "completed" | "error"
    >();
  });

  it("SystemPromptContribution requires rulesFile", () => {
    const c: SystemPromptContribution = {
      rulesFile: { relativePath: ".cursor/rules/r.mdc", contents: "x" },
    };
    expectTypeOf(c).toMatchTypeOf<SystemPromptContribution>();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @flow-build/core test -- src/types.test.ts`
Expected: TS errors — `Plugin`, `RuntimeContext`, `PreRunOutput`, `SystemPromptContribution`, `ToolCallSnapshot` not exported, and `RunOptions.plugins` does not exist.

- [ ] **Step 3: Extend `packages/core/src/types.ts`**

Append (do NOT remove or alter the existing exports):

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

Then modify the existing `RunOptions` type (do not duplicate it — edit the existing one) so it ends with `plugins?: Plugin[];`:

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

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @flow-build/core test -- src/types.test.ts`
Expected: 7 tests pass, 0 fail.

- [ ] **Step 5: Run all core tests to ensure no regression**

Run: `pnpm --filter @flow-build/core test`
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/types.test.ts
git commit -m "feat(core): add Plugin, RuntimeContext and related types"
```

---

## Task 2: `PluginHostError` class

**Files:**
- Modify: `packages/core/src/errors.ts`
- Modify: `packages/core/src/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Open `packages/core/src/errors.test.ts` and append:

```typescript
import { PluginHostError, HarnessError } from "./errors.js";

describe("PluginHostError", () => {
  it("extends HarnessError and is non-retryable", () => {
    const e = new PluginHostError("boom");
    expect(e).toBeInstanceOf(HarnessError);
    expect(e.retryable).toBe(false);
    expect(e.name).toBe("PluginHostError");
    expect(e.message).toBe("boom");
  });

  it("preserves cause", () => {
    const cause = new Error("inner");
    const e = new PluginHostError("wrap", { cause });
    expect(e.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @flow-build/core test -- src/errors.test.ts`
Expected: import error — `PluginHostError` not exported.

- [ ] **Step 3: Append to `packages/core/src/errors.ts`**

```typescript
export class PluginHostError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: false, ...opts });
    this.name = "PluginHostError";
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @flow-build/core test -- src/errors.test.ts`
Expected: all `errors.test.ts` cases pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/errors.ts packages/core/src/errors.test.ts
git commit -m "feat(core): add PluginHostError class"
```

---

## Task 3: Rules-file writer (atomic + backup + escape rejection)

**Files:**
- Create: `packages/core/src/plugin/rules-writer.ts`
- Create: `packages/core/src/plugin/rules-writer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/plugin/rules-writer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeRulesFile, restoreRulesFile } from "./rules-writer.js";
import { PluginHostError } from "../errors.js";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "rules-writer-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("writeRulesFile", () => {
  it("creates the file under .cursor/rules and returns metadata", () => {
    const w = writeRulesFile({
      cwd,
      pluginName: "p1",
      relativePath: ".cursor/rules/p1.mdc",
      contents: "hello",
      runId: "run-1",
    });
    expect(w).not.toBeNull();
    expect(readFileSync(join(cwd, ".cursor/rules/p1.mdc"), "utf8")).toBe("hello");
    expect(w!.absPath).toBe(join(cwd, ".cursor/rules/p1.mdc"));
    expect(w!.backupPath).toBeUndefined();
    expect(w!.createdDirs).toContain(join(cwd, ".cursor/rules"));
  });

  it("returns null when the file already exists with byte-identical content", () => {
    mkdirSync(join(cwd, ".cursor/rules"), { recursive: true });
    writeFileSync(join(cwd, ".cursor/rules/p1.mdc"), "same");
    const w = writeRulesFile({
      cwd,
      pluginName: "p1",
      relativePath: ".cursor/rules/p1.mdc",
      contents: "same",
      runId: "run-1",
    });
    expect(w).toBeNull();
  });

  it("backs up a pre-existing different file before writing", () => {
    mkdirSync(join(cwd, ".cursor/rules"), { recursive: true });
    writeFileSync(join(cwd, ".cursor/rules/p1.mdc"), "user-content");
    const w = writeRulesFile({
      cwd,
      pluginName: "p1",
      relativePath: ".cursor/rules/p1.mdc",
      contents: "plugin-content",
      runId: "run-7",
    });
    expect(w).not.toBeNull();
    expect(w!.backupPath).toBeDefined();
    expect(readFileSync(w!.backupPath!, "utf8")).toBe("user-content");
    expect(readFileSync(join(cwd, ".cursor/rules/p1.mdc"), "utf8")).toBe("plugin-content");
  });

  it("rejects relative paths that escape cwd with PluginHostError", () => {
    expect(() =>
      writeRulesFile({
        cwd,
        pluginName: "p1",
        relativePath: "../escape.mdc",
        contents: "x",
        runId: "r",
      }),
    ).toThrow(PluginHostError);
  });

  it("rejects paths not under .cursor/rules/", () => {
    expect(() =>
      writeRulesFile({
        cwd,
        pluginName: "p1",
        relativePath: ".cursor/other.mdc",
        contents: "x",
        runId: "r",
      }),
    ).toThrow(PluginHostError);
  });

  it("rejects absolute relative paths", () => {
    expect(() =>
      writeRulesFile({
        cwd,
        pluginName: "p1",
        relativePath: "/etc/passwd",
        contents: "x",
        runId: "r",
      }),
    ).toThrow(PluginHostError);
  });
});

describe("restoreRulesFile", () => {
  it("removes our file when no backup existed", () => {
    const w = writeRulesFile({
      cwd,
      pluginName: "p1",
      relativePath: ".cursor/rules/p1.mdc",
      contents: "x",
      runId: "r",
    });
    expect(existsSync(w!.absPath)).toBe(true);
    restoreRulesFile(w!);
    expect(existsSync(w!.absPath)).toBe(false);
  });

  it("restores the original file when a backup existed", () => {
    mkdirSync(join(cwd, ".cursor/rules"), { recursive: true });
    writeFileSync(join(cwd, ".cursor/rules/p1.mdc"), "original");
    const w = writeRulesFile({
      cwd,
      pluginName: "p1",
      relativePath: ".cursor/rules/p1.mdc",
      contents: "plugin",
      runId: "r",
    });
    restoreRulesFile(w!);
    expect(readFileSync(join(cwd, ".cursor/rules/p1.mdc"), "utf8")).toBe("original");
  });

  it("removes parent dirs that the writer created", () => {
    const w = writeRulesFile({
      cwd,
      pluginName: "p1",
      relativePath: ".cursor/rules/p1.mdc",
      contents: "x",
      runId: "r",
    });
    restoreRulesFile(w!);
    expect(existsSync(join(cwd, ".cursor/rules"))).toBe(false);
    expect(existsSync(join(cwd, ".cursor"))).toBe(false);
  });

  it("does not remove a pre-existing parent dir", () => {
    mkdirSync(join(cwd, ".cursor/rules"), { recursive: true });
    const w = writeRulesFile({
      cwd,
      pluginName: "p1",
      relativePath: ".cursor/rules/p1.mdc",
      contents: "x",
      runId: "r",
    });
    restoreRulesFile(w!);
    expect(existsSync(join(cwd, ".cursor/rules"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @flow-build/core test -- src/plugin/rules-writer.test.ts`
Expected: import resolution error — `rules-writer.js` does not exist.

- [ ] **Step 3: Implement `packages/core/src/plugin/rules-writer.ts`**

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

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @flow-build/core test -- src/plugin/rules-writer.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/rules-writer.ts packages/core/src/plugin/rules-writer.test.ts
git commit -m "feat(core): add atomic rules-file writer with backup and escape rejection"
```

---

## Task 4: `PluginHost` constructor — name uniqueness

**Files:**
- Create: `packages/core/src/plugin/host.ts`
- Create: `packages/core/src/plugin/host.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/plugin/host.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { PluginHost } from "./host.js";
import { PluginHostError } from "../errors.js";
import type { Plugin } from "../types.js";

describe("PluginHost constructor", () => {
  it("accepts an empty plugin list", () => {
    expect(() => new PluginHost([])).not.toThrow();
  });

  it("accepts plugins with unique names", () => {
    const plugins: Plugin[] = [{ name: "a" }, { name: "b" }];
    expect(() => new PluginHost(plugins)).not.toThrow();
  });

  it("throws PluginHostError on duplicate names", () => {
    const plugins: Plugin[] = [{ name: "a" }, { name: "a" }];
    expect(() => new PluginHost(plugins)).toThrow(PluginHostError);
  });

  it("throws on empty plugin name", () => {
    expect(() => new PluginHost([{ name: "" }])).toThrow(PluginHostError);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: module not found.

- [ ] **Step 3: Create `packages/core/src/plugin/host.ts`**

```typescript
import { PluginHostError } from "../errors.js";
import type { Plugin } from "../types.js";

export class PluginHost {
  private readonly plugins: Plugin[];

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
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/plugin/host.test.ts
git commit -m "feat(core): add PluginHost with unique-name enforcement"
```

---

## Task 5: `PluginHost.runPreRun`

**Files:**
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/core/src/plugin/host.test.ts`

- [ ] **Step 1: Append failing tests to `host.test.ts`**

```typescript
import type { RuntimeContext } from "../types.js";

function makeCtx(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    cwd: "/tmp",
    model: "composer-2",
    runId: "run-1",
    signal: new AbortController().signal,
    logger: { warn: () => {} },
    state: new Map(),
    ...overrides,
  };
}

describe("PluginHost.runPreRun", () => {
  it("calls preRun on every plugin in parallel and stores facts under plugin name", async () => {
    const order: string[] = [];
    const host = new PluginHost([
      {
        name: "a",
        preRun: async () => {
          order.push("a-start");
          await new Promise((r) => setTimeout(r, 10));
          order.push("a-end");
          return { facts: { x: 1 } };
        },
      },
      {
        name: "b",
        preRun: async () => {
          order.push("b-start");
          return { facts: { y: 2 } };
        },
      },
    ]);

    const ctx = makeCtx();
    await host.runPreRun(ctx);

    expect(order[0]).toBe("a-start");
    expect(order).toContain("b-start");
    expect((ctx.state.get("a") as { facts: unknown }).facts).toEqual({ x: 1 });
    expect((ctx.state.get("b") as { facts: unknown }).facts).toEqual({ y: 2 });
  });

  it("skips plugins without preRun", async () => {
    const host = new PluginHost([{ name: "noop" }]);
    const ctx = makeCtx();
    await host.runPreRun(ctx);
    expect(ctx.state.has("noop")).toBe(false);
  });

  it("rethrows preRun failures as PluginHostError", async () => {
    const host = new PluginHost([
      {
        name: "bad",
        preRun: async () => {
          throw new Error("kaboom");
        },
      },
    ]);
    await expect(host.runPreRun(makeCtx())).rejects.toBeInstanceOf(PluginHostError);
  });

  it("stores facts as empty object when preRun returns void", async () => {
    const host = new PluginHost([{ name: "v", preRun: async () => undefined }]);
    const ctx = makeCtx();
    await host.runPreRun(ctx);
    expect(ctx.state.has("v")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: `host.runPreRun is not a function`.

- [ ] **Step 3: Add `runPreRun` to `PluginHost` in `host.ts`**

Add this method to the class:

```typescript
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
```

Add the `RuntimeContext` import at the top:

```typescript
import type { Plugin, RuntimeContext } from "../types.js";
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/plugin/host.test.ts
git commit -m "feat(core): plugin host runPreRun in parallel with fact storage"
```

---

## Task 6: `PluginHost.runSystemPrompt` (writes rules files)

**Files:**
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/core/src/plugin/host.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach } from "vitest";

let runDir: string;
beforeEach(() => {
  runDir = mkdtempSync(join(tmpdir(), "host-sp-"));
});
afterEach(() => {
  rmSync(runDir, { recursive: true, force: true });
});

describe("PluginHost.runSystemPrompt", () => {
  it("writes each plugin's rules file under cwd/.cursor/rules", async () => {
    const host = new PluginHost([
      {
        name: "p1",
        systemPrompt: async () => ({
          rulesFile: { relativePath: ".cursor/rules/p1.mdc", contents: "ONE" },
        }),
      },
      {
        name: "p2",
        systemPrompt: async () => ({
          rulesFile: { relativePath: ".cursor/rules/p2.mdc", contents: "TWO" },
        }),
      },
    ]);
    const ctx = makeCtx({ cwd: runDir });
    await host.runSystemPrompt(ctx);
    expect(readFileSync(join(runDir, ".cursor/rules/p1.mdc"), "utf8")).toBe("ONE");
    expect(readFileSync(join(runDir, ".cursor/rules/p2.mdc"), "utf8")).toBe("TWO");
  });

  it("skips plugins without systemPrompt", async () => {
    const host = new PluginHost([{ name: "n" }]);
    await expect(host.runSystemPrompt(makeCtx({ cwd: runDir }))).resolves.toBeUndefined();
    expect(existsSync(join(runDir, ".cursor"))).toBe(false);
  });

  it("rethrows write failures as PluginHostError", async () => {
    const host = new PluginHost([
      {
        name: "p1",
        systemPrompt: async () => ({
          rulesFile: { relativePath: "../escape.mdc", contents: "x" },
        }),
      },
    ]);
    await expect(host.runSystemPrompt(makeCtx({ cwd: runDir }))).rejects.toBeInstanceOf(
      PluginHostError,
    );
  });

  it("backs up a colliding pre-existing file", async () => {
    mkdirSync(join(runDir, ".cursor/rules"), { recursive: true });
    writeFileSync(join(runDir, ".cursor/rules/p1.mdc"), "ORIGINAL");
    const host = new PluginHost([
      {
        name: "p1",
        systemPrompt: async () => ({
          rulesFile: { relativePath: ".cursor/rules/p1.mdc", contents: "NEW" },
        }),
      },
    ]);
    await host.runSystemPrompt(makeCtx({ cwd: runDir }));
    expect(readFileSync(join(runDir, ".cursor/rules/p1.mdc"), "utf8")).toBe("NEW");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: `host.runSystemPrompt is not a function`.

- [ ] **Step 3: Add `runSystemPrompt` to `PluginHost`**

Add to the imports at top of `host.ts`:

```typescript
import { writeRulesFile, type WrittenFile } from "./rules-writer.js";
```

Add a private field and method:

```typescript
private written: WrittenFile[] = [];

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
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: all new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/plugin/host.test.ts
git commit -m "feat(core): plugin host runSystemPrompt materializes rules files"
```

---

## Task 7: `PluginHost.runPromptPrefix`

**Files:**
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/core/src/plugin/host.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
describe("PluginHost.runPromptPrefix", () => {
  it("returns empty string when no plugin contributes a prefix", async () => {
    const host = new PluginHost([{ name: "n" }]);
    const out = await host.runPromptPrefix(makeCtx());
    expect(out).toBe("");
  });

  it("joins contributions with a blank line in plugin order", async () => {
    const host = new PluginHost([
      { name: "a", promptPrefix: async () => "AAA" },
      { name: "b", promptPrefix: async () => "BBB" },
    ]);
    const out = await host.runPromptPrefix(makeCtx());
    expect(out).toBe("AAA\n\nBBB");
  });

  it("ignores plugins that return void or empty string", async () => {
    const host = new PluginHost([
      { name: "a", promptPrefix: async () => "AAA" },
      { name: "b", promptPrefix: async () => undefined },
      { name: "c", promptPrefix: async () => "" },
    ]);
    const out = await host.runPromptPrefix(makeCtx());
    expect(out).toBe("AAA");
  });

  it("rethrows promptPrefix failures as PluginHostError", async () => {
    const host = new PluginHost([
      {
        name: "x",
        promptPrefix: async () => {
          throw new Error("nope");
        },
      },
    ]);
    await expect(host.runPromptPrefix(makeCtx())).rejects.toBeInstanceOf(PluginHostError);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: `host.runPromptPrefix is not a function`.

- [ ] **Step 3: Add `runPromptPrefix` to `PluginHost`**

```typescript
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
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/plugin/host.test.ts
git commit -m "feat(core): plugin host runPromptPrefix concatenates contributions"
```

---

## Task 8: `PluginHost.intercept` (event chain)

**Files:**
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/core/src/plugin/host.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
import type { HarnessEvent } from "../types.js";

describe("PluginHost.intercept", () => {
  it("returns the original event when no plugin intercepts", () => {
    const host = new PluginHost([{ name: "n" }]);
    const e: HarnessEvent = { type: "text", delta: "x" };
    expect(host.intercept(e, makeCtx())).toEqual([e]);
  });

  it("passes through when a plugin returns void", () => {
    const host = new PluginHost([
      { name: "a", interceptEvent: () => undefined },
    ]);
    const e: HarnessEvent = { type: "text", delta: "x" };
    expect(host.intercept(e, makeCtx())).toEqual([e]);
  });

  it("drops the event when a plugin returns []", () => {
    const host = new PluginHost([
      { name: "a", interceptEvent: () => [] },
    ]);
    const e: HarnessEvent = { type: "text", delta: "x" };
    expect(host.intercept(e, makeCtx())).toEqual([]);
  });

  it("fans out into multiple events", () => {
    const host = new PluginHost([
      {
        name: "a",
        interceptEvent: (e) =>
          e.type === "text"
            ? [e, { type: "text", delta: "[hint]" }]
            : undefined,
      },
    ]);
    const e: HarnessEvent = { type: "text", delta: "hello" };
    expect(host.intercept(e, makeCtx())).toEqual([
      e,
      { type: "text", delta: "[hint]" },
    ]);
  });

  it("threads each plugin sequentially over the (possibly fanned-out) stream", () => {
    const host = new PluginHost([
      {
        name: "a",
        interceptEvent: (e) =>
          e.type === "text" ? [e, { type: "text", delta: "+a" }] : undefined,
      },
      {
        name: "b",
        interceptEvent: (e) =>
          e.type === "text" ? [{ type: "text", delta: e.delta + "!" }] : undefined,
      },
    ]);
    const e: HarnessEvent = { type: "text", delta: "x" };
    expect(host.intercept(e, makeCtx())).toEqual([
      { type: "text", delta: "x!" },
      { type: "text", delta: "+a!" },
    ]);
  });

  it("swallows interceptor throws and warns via logger, passing original through", () => {
    const warns: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
    const ctx = makeCtx({
      logger: { warn: (msg, c) => warns.push({ msg, ...(c ? { ctx: c } : {}) }) },
    });
    const host = new PluginHost([
      {
        name: "bad",
        interceptEvent: () => {
          throw new Error("oops");
        },
      },
    ]);
    const e: HarnessEvent = { type: "text", delta: "x" };
    expect(host.intercept(e, ctx)).toEqual([e]);
    expect(warns.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: `host.intercept is not a function`.

- [ ] **Step 3: Add `intercept` to `PluginHost`**

```typescript
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
```

Update top-of-file imports:

```typescript
import type { HarnessEvent, Plugin, RuntimeContext } from "../types.js";
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/plugin/host.test.ts
git commit -m "feat(core): plugin host intercept chains and fans out events"
```

---

## Task 9: `PluginHost.fireToolCall`

**Files:**
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/core/src/plugin/host.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
import type { ToolCallSnapshot } from "../types.js";

describe("PluginHost.fireToolCall", () => {
  it("invokes onToolCall on every plugin without awaiting the caller", async () => {
    const calls: string[] = [];
    const host = new PluginHost([
      { name: "a", onToolCall: async (c) => void calls.push("a:" + c.callId) },
      { name: "b", onToolCall: async (c) => void calls.push("b:" + c.callId) },
    ]);
    const snap: ToolCallSnapshot = { callId: "1", name: "shell", status: "completed" };
    host.fireToolCall(snap, makeCtx());
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(calls.sort()).toEqual(["a:1", "b:1"]);
  });

  it("swallows throws and logs a warn", async () => {
    const warns: string[] = [];
    const ctx = makeCtx({ logger: { warn: (m) => warns.push(m) } });
    const host = new PluginHost([
      {
        name: "bad",
        onToolCall: async () => {
          throw new Error("oops");
        },
      },
    ]);
    expect(() =>
      host.fireToolCall(
        { callId: "1", name: "shell", status: "completed" },
        ctx,
      ),
    ).not.toThrow();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(warns.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: `host.fireToolCall is not a function`.

- [ ] **Step 3: Add `fireToolCall` to `PluginHost`**

```typescript
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
```

Update imports:

```typescript
import type { HarnessEvent, Plugin, RuntimeContext, ToolCallSnapshot } from "../types.js";
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/plugin/host.test.ts
git commit -m "feat(core): plugin host fireToolCall fan-out swallowing throws"
```

---

## Task 10: `PluginHost.cleanup`

**Files:**
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/core/src/plugin/host.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
describe("PluginHost.cleanup", () => {
  it("runs plugin cleanup hooks in reverse plugin order", async () => {
    const order: string[] = [];
    const host = new PluginHost([
      { name: "a", cleanup: async () => void order.push("a") },
      { name: "b", cleanup: async () => void order.push("b") },
      { name: "c", cleanup: async () => void order.push("c") },
    ]);
    await host.cleanup(makeCtx());
    expect(order).toEqual(["c", "b", "a"]);
  });

  it("removes rules files written during the run", async () => {
    const host = new PluginHost([
      {
        name: "p1",
        systemPrompt: async () => ({
          rulesFile: { relativePath: ".cursor/rules/p1.mdc", contents: "x" },
        }),
      },
    ]);
    const ctx = makeCtx({ cwd: runDir });
    await host.runSystemPrompt(ctx);
    expect(existsSync(join(runDir, ".cursor/rules/p1.mdc"))).toBe(true);
    await host.cleanup(ctx);
    expect(existsSync(join(runDir, ".cursor/rules/p1.mdc"))).toBe(false);
  });

  it("restores backups even when a plugin cleanup throws", async () => {
    mkdirSync(join(runDir, ".cursor/rules"), { recursive: true });
    writeFileSync(join(runDir, ".cursor/rules/p1.mdc"), "ORIGINAL");
    const host = new PluginHost([
      {
        name: "p1",
        systemPrompt: async () => ({
          rulesFile: { relativePath: ".cursor/rules/p1.mdc", contents: "PLUGIN" },
        }),
        cleanup: async () => {
          throw new Error("plugin cleanup blew up");
        },
      },
    ]);
    const ctx = makeCtx({ cwd: runDir });
    await host.runSystemPrompt(ctx);
    await host.cleanup(ctx);
    expect(readFileSync(join(runDir, ".cursor/rules/p1.mdc"), "utf8")).toBe("ORIGINAL");
  });

  it("swallows cleanup throws and warns", async () => {
    const warns: string[] = [];
    const ctx = makeCtx({ logger: { warn: (m) => warns.push(m) } });
    const host = new PluginHost([
      {
        name: "bad",
        cleanup: async () => {
          throw new Error("nope");
        },
      },
    ]);
    await expect(host.cleanup(ctx)).resolves.toBeUndefined();
    expect(warns.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: `host.cleanup is not a function`.

- [ ] **Step 3: Add `cleanup` to `PluginHost`**

Update import:

```typescript
import { writeRulesFile, restoreRulesFile, type WrittenFile } from "./rules-writer.js";
```

Add the method:

```typescript
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
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @flow-build/core test -- src/plugin/host.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/plugin/host.test.ts
git commit -m "feat(core): plugin host cleanup runs in reverse and restores backups"
```

---

## Task 11: Wire `PluginHost` into `runPrompt`

**Files:**
- Modify: `packages/core/src/run.ts`
- Modify: `packages/core/src/test/fakeSdk.ts`
- Create: `packages/core/src/run-plugins.test.ts`

- [ ] **Step 1: Extend `fakeSdk.ts` to capture the prompt sent to `agent.send` and the `Agent.create` config**

Modify `installFakeSdk` so callers can inspect what the SDK was called with. Replace the `installFakeSdk` body with:

```typescript
export type InstalledFakeSdk = {
  create: ReturnType<typeof vi.fn>;
  /** Resolved with the latest config passed to Agent.create */
  lastCreateConfig: () => unknown;
  /** Resolved with the latest prompt passed to agent.send */
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

- [ ] **Step 2: Write the failing tests in a new file `packages/core/src/run-plugins.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFakeSdk, makeFakeAgent } from "./test/fakeSdk.js";
import type { HarnessEvent, Plugin } from "./types.js";

const RUN_PATH = "./run.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "run-plugins-"));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@cursor/sdk");
});

describe("runPrompt with plugins", () => {
  it("runs without plugins exactly as before", async () => {
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa }] });
    const { runPrompt } = await import(RUN_PATH);
    const result = await runPrompt({ prompt: "hi", cwd: dir, onEvent: () => {} });
    expect(result.status).toBe("completed");
    expect(fake.lastSendPrompt()).toBe("hi");
  });

  it("prepends a plugin promptPrefix to the user prompt", async () => {
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa }] });
    const plugin: Plugin = {
      name: "p1",
      promptPrefix: async () => "[PFX]",
    };
    const { runPrompt } = await import(RUN_PATH);
    await runPrompt({
      prompt: "user prompt",
      cwd: dir,
      onEvent: () => {},
      plugins: [plugin],
    });
    expect(fake.lastSendPrompt()).toBe("[PFX]\n\nuser prompt");
  });

  it("materializes a rules file before send and removes it after", async () => {
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });
    const observed: { rulesPresentDuringSend: boolean } = { rulesPresentDuringSend: false };
    const target = join(dir, ".cursor/rules/p1.mdc");
    const plugin: Plugin = {
      name: "p1",
      systemPrompt: async () => ({
        rulesFile: { relativePath: ".cursor/rules/p1.mdc", contents: "RULES" },
      }),
      promptPrefix: async () => {
        observed.rulesPresentDuringSend = existsSync(target);
        return undefined;
      },
    };
    const { runPrompt } = await import(RUN_PATH);
    await runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: () => {},
      plugins: [plugin],
    });
    expect(observed.rulesPresentDuringSend).toBe(true);
    expect(existsSync(target)).toBe(false);
  });

  it("invokes settingSources including 'project' on Agent.create", async () => {
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
    });
    const fake = installFakeSdk({ createBehavior: [{ agent: fa }] });
    const { runPrompt } = await import(RUN_PATH);
    await runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: () => {},
      plugins: [{ name: "p1" }],
    });
    const cfg = fake.lastCreateConfig() as { local?: { settingSources?: string[] } };
    expect(cfg.local?.settingSources).toBeDefined();
    expect(cfg.local?.settingSources).toContain("project");
  });

  it("fans out interceptor events into onEvent", async () => {
    const fa = makeFakeAgent({
      streamItems: [{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }],
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });
    const events: HarnessEvent[] = [];
    const plugin: Plugin = {
      name: "p1",
      interceptEvent: (e) =>
        e.type === "text"
          ? [e, { type: "text", delta: "[hint]" }]
          : undefined,
    };
    const { runPrompt } = await import(RUN_PATH);
    await runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: (e) => events.push(e),
      plugins: [plugin],
    });
    const texts = events.filter((e) => e.type === "text");
    expect(texts).toContainEqual({ type: "text", delta: "ok" });
    expect(texts).toContainEqual({ type: "text", delta: "[hint]" });
  });

  it("notifies plugins of tool calls and runs cleanup on completion", async () => {
    const fa = makeFakeAgent({
      streamItems: [
        { type: "tool_call", call_id: "1", name: "shell", status: "running" },
        { type: "tool_call", call_id: "1", name: "shell", status: "completed" },
        { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
      ],
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });
    const seen: string[] = [];
    const plugin: Plugin = {
      name: "p1",
      onToolCall: async (c) => void seen.push(`${c.status}:${c.callId}`),
      cleanup: async () => void seen.push("cleanup"),
    };
    const { runPrompt } = await import(RUN_PATH);
    await runPrompt({
      prompt: "hi",
      cwd: dir,
      onEvent: () => {},
      plugins: [plugin],
    });
    await new Promise((r) => setImmediate(r));
    expect(seen).toContain("running:1");
    expect(seen).toContain("completed:1");
    expect(seen).toContain("cleanup");
  });

  it("runs cleanup even when the stream throws mid-run", async () => {
    const fail = Object.assign(new Error("net flap"), {
      name: "NetworkError",
      isRetryable: true,
    });
    const fa = makeFakeAgent({
      streamItems: [
        { type: "assistant", message: { content: [{ type: "text", text: "first" }] } },
      ],
      streamThrows: { afterIndex: 1, error: fail },
    });
    installFakeSdk({ createBehavior: [{ agent: fa }] });
    const seen: string[] = [];
    const plugin: Plugin = {
      name: "p1",
      cleanup: async () => void seen.push("cleanup"),
    };
    const { runPrompt } = await import(RUN_PATH);
    const { NetworkError } = await import("./errors.js");
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: dir,
        onEvent: () => {},
        plugins: [plugin],
      }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(seen).toContain("cleanup");
  });

  it("rejects duplicate plugin names with PluginHostError before any agent call", async () => {
    const fake = installFakeSdk({ createBehavior: [] });
    const { runPrompt } = await import(RUN_PATH);
    const { PluginHostError } = await import("./errors.js");
    await expect(
      runPrompt({
        prompt: "hi",
        cwd: dir,
        onEvent: () => {},
        plugins: [{ name: "x" }, { name: "x" }],
      }),
    ).rejects.toBeInstanceOf(PluginHostError);
    expect(fake.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests to confirm failure**

Run: `pnpm --filter @flow-build/core test -- src/run-plugins.test.ts`
Expected: failures (no plugin handling in `run.ts`).

- [ ] **Step 4: Modify `packages/core/src/run.ts`**

Replace the file's top imports:

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
```

Modify `startWithRetry` to take an explicit prompt and pass `local.settingSources`:

```typescript
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
```

Replace `runPrompt` with:

```typescript
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

- [ ] **Step 5: Run all core tests to confirm everything passes**

Run: `pnpm --filter @flow-build/core test`
Expected: every existing test (run / cancellation / retry / config / errors / normalizer / index / types / rules-writer / host) plus the new `run-plugins.test.ts` cases pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/run.ts packages/core/src/test/fakeSdk.ts packages/core/src/run-plugins.test.ts
git commit -m "feat(core): wire PluginHost into runPrompt with settingSources project"
```

---

## Task 12: Re-export plugin types from `core/src/index.ts`

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/index.test.ts`

- [ ] **Step 1: Append failing test**

Append to `index.test.ts`:

```typescript
import * as flowCore from "./index.js";

describe("public surface", () => {
  it("re-exports PluginHostError", () => {
    expect(typeof flowCore.PluginHostError).toBe("function");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/core test -- src/index.test.ts`
Expected: `PluginHostError` undefined.

- [ ] **Step 3: Update `packages/core/src/index.ts`**

Replace the content with:

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

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @flow-build/core test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "feat(core): re-export Plugin types and PluginHostError from index"
```

---

## Task 13: Scaffold `packages/rote`

**Files:**
- Create: `packages/rote/package.json`
- Create: `packages/rote/tsconfig.json`
- Create: `packages/rote/vitest.config.ts`
- Create: `packages/rote/src/types.ts`
- Create: `packages/rote/src/index.ts`
- Create: `packages/rote/src/index.test.ts`

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

- [ ] **Step 5: Create stub `packages/rote/src/index.ts`**

```typescript
export { createRotePlugin } from "./plugin.js";
export type { RotePluginOptions, RoteFacts } from "./types.js";
```

- [ ] **Step 6: Create stub `packages/rote/src/plugin.ts`**

```typescript
import type { Plugin } from "@flow-build/core";
import type { RotePluginOptions } from "./types.js";

export function createRotePlugin(_opts: RotePluginOptions = {}): Plugin {
  return { name: "rote" };
}
```

- [ ] **Step 7: Create `packages/rote/src/index.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createRotePlugin } from "./index.js";

describe("@flow-build/rote scaffolding", () => {
  it("exports createRotePlugin", () => {
    expect(typeof createRotePlugin).toBe("function");
  });

  it("returns a Plugin object named 'rote'", () => {
    const p = createRotePlugin();
    expect(p.name).toBe("rote");
  });
});
```

- [ ] **Step 8: Install workspace deps**

Run: `pnpm install`
Expected: `packages/rote/node_modules/@flow-build/core` symlinks to `packages/core`.

- [ ] **Step 9: Typecheck and test**

Run:
```
pnpm --filter @flow-build/rote typecheck
pnpm --filter @flow-build/rote test
```
Expected: typecheck passes; both tests pass.

- [ ] **Step 10: Commit**

```bash
git add packages/rote pnpm-lock.yaml
git commit -m "feat(rote): scaffold @flow-build/rote package"
```

---

## Task 14: `workspace.ts` — infer active rote workspace from cwd

**Files:**
- Create: `packages/rote/src/workspace.ts`
- Create: `packages/rote/src/workspace.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inferActiveWorkspace } from "./workspace.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rote-ws-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("inferActiveWorkspace", () => {
  it("returns null when cwd has no rote markers and is not under a workspaces dir", () => {
    expect(inferActiveWorkspace({ cwd: root, roteHome: root })).toBeNull();
  });

  it("matches when cwd is exactly $ROTE_HOME/workspaces/<name>", () => {
    const ws = join(root, "workspaces", "github-issues");
    mkdirSync(ws, { recursive: true });
    expect(inferActiveWorkspace({ cwd: ws, roteHome: root })).toEqual({
      name: "github-issues",
      path: ws,
    });
  });

  it("matches when cwd is nested under a workspace", () => {
    const ws = join(root, "workspaces", "gmail");
    const nested = join(ws, "deeper", "still");
    mkdirSync(nested, { recursive: true });
    expect(inferActiveWorkspace({ cwd: nested, roteHome: root })).toEqual({
      name: "gmail",
      path: ws,
    });
  });

  it("matches via .rote/state.json marker outside the workspaces dir", () => {
    const proj = join(root, "some-proj");
    mkdirSync(join(proj, ".rote"), { recursive: true });
    writeFileSync(join(proj, ".rote", "state.json"), "{}");
    const r = inferActiveWorkspace({ cwd: proj, roteHome: root });
    expect(r).toEqual({ name: "some-proj", path: proj });
  });

  it("walks upward to find .rote/state.json", () => {
    const proj = join(root, "outer");
    mkdirSync(join(proj, ".rote"), { recursive: true });
    writeFileSync(join(proj, ".rote", "state.json"), "{}");
    const inner = join(proj, "a", "b");
    mkdirSync(inner, { recursive: true });
    expect(inferActiveWorkspace({ cwd: inner, roteHome: root })).toEqual({
      name: "outer",
      path: proj,
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/rote test -- src/workspace.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `packages/rote/src/workspace.ts`**

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

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @flow-build/rote test -- src/workspace.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rote/src/workspace.ts packages/rote/src/workspace.test.ts
git commit -m "feat(rote): infer active rote workspace from cwd"
```

---

## Task 15: `intercept/bypass-patterns.ts`

**Files:**
- Create: `packages/rote/src/intercept/bypass-patterns.ts`
- Create: `packages/rote/src/intercept/bypass-patterns.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  defaultBypassPatterns,
  classifyBypass,
  extractCommand,
} from "./bypass-patterns.js";

describe("extractCommand", () => {
  it("returns null for non-string args", () => {
    expect(extractCommand(undefined)).toBeNull();
    expect(extractCommand({})).toBeNull();
    expect(extractCommand(42)).toBeNull();
  });

  it("returns the command field of an object args payload", () => {
    expect(extractCommand({ command: "gh issue list" })).toBe("gh issue list");
  });

  it("returns the cmd field as a fallback", () => {
    expect(extractCommand({ cmd: "stripe events list" })).toBe("stripe events list");
  });

  it("returns the string itself if args is a string", () => {
    expect(extractCommand("linear issues")).toBe("linear issues");
  });
});

describe("classifyBypass", () => {
  it("matches gh subcommands", () => {
    expect(
      classifyBypass("shell", "gh issue list", defaultBypassPatterns),
    ).not.toBeNull();
    expect(
      classifyBypass("shell", "gh pr view 42", defaultBypassPatterns),
    ).not.toBeNull();
  });

  it("matches curl against github.com", () => {
    expect(
      classifyBypass("shell", "curl -s https://api.github.com/repos", defaultBypassPatterns),
    ).not.toBeNull();
  });

  it("matches stripe / linear / supabase commands", () => {
    expect(classifyBypass("shell", "stripe events list", defaultBypassPatterns)).not.toBeNull();
    expect(classifyBypass("shell", "linear issues list", defaultBypassPatterns)).not.toBeNull();
    expect(classifyBypass("shell", "supabase db push", defaultBypassPatterns)).not.toBeNull();
  });

  it("does not match local dev tools", () => {
    for (const cmd of ["git status", "npm install", "cargo build", "pnpm test", "ls -la"]) {
      expect(classifyBypass("shell", cmd, defaultBypassPatterns)).toBeNull();
    }
  });

  it("does not match for non-shell tool names", () => {
    expect(classifyBypass("read_file", "gh issue list", defaultBypassPatterns)).toBeNull();
  });

  it("returns suggestions and a short rationale", () => {
    const m = classifyBypass("shell", "gh issue list", defaultBypassPatterns)!;
    expect(m.rationale.length).toBeGreaterThan(0);
    expect(m.suggestions.length).toBeGreaterThan(0);
    expect(m.suggestions[0]).toContain("rote");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/rote test -- src/intercept/bypass-patterns.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `packages/rote/src/intercept/bypass-patterns.ts`**

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

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @flow-build/rote test -- src/intercept/bypass-patterns.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rote/src/intercept/bypass-patterns.ts packages/rote/src/intercept/bypass-patterns.test.ts
git commit -m "feat(rote): bypass classifier for gh/curl/stripe/linear/supabase"
```

---

## Task 16: `intercept/hint.ts`

**Files:**
- Create: `packages/rote/src/intercept/hint.ts`
- Create: `packages/rote/src/intercept/hint.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buildHintEvent } from "./hint.js";

describe("buildHintEvent", () => {
  it("returns a single text event with a [rote hint] tag", () => {
    const e = buildHintEvent({
      rationale: "GitHub CLI detected",
      suggestions: ['rote flow search "<intent>"', 'rote explore "<intent>"'],
    });
    expect(e.type).toBe("text");
    expect(e.delta).toContain("[rote hint]");
    expect(e.delta).toContain("GitHub CLI detected");
    expect(e.delta).toContain('rote flow search "<intent>"');
    expect(e.delta).toContain(';');
  });

  it("ends with a newline so it does not run into following deltas", () => {
    const e = buildHintEvent({ rationale: "x", suggestions: ["y"] });
    expect(e.delta.endsWith("\n")).toBe(true);
    expect(e.delta.startsWith("\n")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/rote test -- src/intercept/hint.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `packages/rote/src/intercept/hint.ts`**

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

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @flow-build/rote test -- src/intercept/hint.test.ts`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rote/src/intercept/hint.ts packages/rote/src/intercept/hint.test.ts
git commit -m "feat(rote): hint event builder for bypass classifier output"
```

---

## Task 17: `render/rules.ts` — static body

**Files:**
- Create: `packages/rote/src/render/rules.ts`
- Create: `packages/rote/src/render/rules.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { renderRulesBody } from "./rules.js";

describe("renderRulesBody", () => {
  it("starts with the alwaysApply frontmatter", () => {
    const body = renderRulesBody({ versionLabel: "0.11.x" });
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toMatch(/alwaysApply:\s*true/);
    expect(body).toMatch(/description:\s*"rote workflow guidance"/);
    expect(body).toMatch(/globs:\s*"\*\*\/\*"/);
  });

  it("contains the lifecycle reminder", () => {
    const body = renderRulesBody({ versionLabel: "0.11.x" });
    expect(body).toMatch(/search\s*→\s*execute\s*→\s*crystallize\s*→\s*reuse/);
  });

  it("contains the bypass policy block", () => {
    const body = renderRulesBody({ versionLabel: "0.11.x" });
    expect(body).toMatch(/gh /);
    expect(body).toMatch(/curl/);
    expect(body).toMatch(/stripe/);
    expect(body).toMatch(/linear/);
    expect(body).toMatch(/supabase/);
  });

  it("contains the pointer block", () => {
    const body = renderRulesBody({ versionLabel: "0.11.x" });
    expect(body).toMatch(/rote how/);
    expect(body).toMatch(/rote guidance agent/);
    expect(body).toMatch(/rote man/);
  });

  it("includes a sentinel header so orphan files can be detected", () => {
    const body = renderRulesBody({ versionLabel: "0.11.x" });
    expect(body).toContain("flow-build:rote");
  });

  it("substitutes the major version label", () => {
    const body = renderRulesBody({ versionLabel: "0.42.0" });
    expect(body).toContain("0.42.0");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/rote test -- src/render/rules.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `packages/rote/src/render/rules.ts`**

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

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @flow-build/rote test -- src/render/rules.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rote/src/render/rules.ts packages/rote/src/render/rules.test.ts
git commit -m "feat(rote): render static rules-file body with alwaysApply frontmatter"
```

---

## Task 18: `render/prefix.ts` — dynamic prefix

**Files:**
- Create: `packages/rote/src/render/prefix.ts`
- Create: `packages/rote/src/render/prefix.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { renderPrefix } from "./prefix.js";
import type { RoteFacts } from "../types.js";

const empty: RoteFacts = {
  version: null,
  adapters: null,
  pendingStubs: null,
  flowCount: null,
  activeWorkspace: null,
};

describe("renderPrefix", () => {
  it("returns the install hint when every fact is null", () => {
    const out = renderPrefix(empty);
    expect(out).toMatch(/rote unavailable/);
    expect(out).toMatch(/install/);
  });

  it("renders version, adapter count, flow count, pending and workspace when present", () => {
    const facts: RoteFacts = {
      version: "0.11.4",
      adapters: [
        { id: "github-api", fingerprint: "f1", toolsetCount: 5 },
        { id: "stripe", fingerprint: "f2", toolsetCount: 3 },
      ],
      pendingStubs: [
        { workspace: "github-issues", name: "list-issues", adapter: "github-api" },
      ],
      flowCount: 23,
      activeWorkspace: { name: "github-issues", path: "/x/github-issues" },
    };
    const out = renderPrefix(facts);
    expect(out).toContain("[rote runtime");
    expect(out).toContain("0.11.4");
    expect(out).toMatch(/adapters:\s*2/);
    expect(out).toContain("github-api");
    expect(out).toMatch(/flows:\s*23/);
    expect(out).toContain("pending stubs");
    expect(out).toContain("github-issues");
    expect(out).toMatch(/active workspace/);
  });

  it("drops empty fields rather than printing 'unknown'", () => {
    const facts: RoteFacts = {
      version: "0.11.4",
      adapters: null,
      pendingStubs: null,
      flowCount: null,
      activeWorkspace: null,
    };
    const out = renderPrefix(facts);
    expect(out).toContain("0.11.4");
    expect(out).not.toMatch(/unknown/);
    expect(out).not.toMatch(/null/);
  });

  it("ends with the lifecycle reminder", () => {
    const facts: RoteFacts = {
      version: "0.11.4",
      adapters: null,
      pendingStubs: null,
      flowCount: null,
      activeWorkspace: null,
    };
    const out = renderPrefix(facts);
    expect(out).toMatch(/search\s*"<intent>"/);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/rote test -- src/render/prefix.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `packages/rote/src/render/prefix.ts`**

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

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @flow-build/rote test -- src/render/prefix.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rote/src/render/prefix.ts packages/rote/src/render/prefix.test.ts
git commit -m "feat(rote): render dynamic per-run prompt prefix"
```

---

## Task 19: `probe.ts` — DI exec, parallel probes with timeout

**Files:**
- Create: `packages/rote/src/probe.ts`
- Create: `packages/rote/src/probe.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { runProbe } from "./probe.js";
import type { ExecFn, ExecResult } from "./types.js";

function makeExec(table: Record<string, ExecResult | Error>): ExecFn {
  return async (cmd, args) => {
    const key = `${cmd} ${args.join(" ")}`;
    const v = table[key];
    if (!v) {
      return { stdout: "", stderr: `unknown ${key}`, exitCode: 127, timedOut: false };
    }
    if (v instanceof Error) throw v;
    return v;
  };
}

const ok = (stdout: string): ExecResult => ({ stdout, stderr: "", exitCode: 0, timedOut: false });
const fail: ExecResult = { stdout: "", stderr: "no", exitCode: 1, timedOut: false };

describe("runProbe", () => {
  it("returns all-null facts when bin is missing", async () => {
    const exec: ExecFn = async () => {
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    };
    const facts = await runProbe({
      bin: "rote",
      cwd: "/nope",
      roteHome: "/nope/home",
      timeoutMs: 100,
      exec,
    });
    expect(facts.version).toBeNull();
    expect(facts.adapters).toBeNull();
    expect(facts.pendingStubs).toBeNull();
    expect(facts.flowCount).toBeNull();
    expect(facts.activeWorkspace).toBeNull();
  });

  it("captures version, adapters, pendingStubs, flowCount when commands succeed", async () => {
    const exec = makeExec({
      "rote --version": ok("rote 0.11.4\n"),
      "rote machine inventory --json": ok(
        JSON.stringify({
          adapters: [
            { id: "github-api", fingerprint: "f1", toolsetCount: 5 },
            { id: "stripe", fingerprint: "f2", toolsetCount: 3 },
          ],
        }),
      ),
      "rote flow pending list --json": ok(
        JSON.stringify([{ workspace: "ws", name: "n", adapter: "a" }]),
      ),
      "rote flow list --json": ok(JSON.stringify({ flows: new Array(7).fill({}) })),
    });
    const facts = await runProbe({
      bin: "rote",
      cwd: "/tmp",
      roteHome: "/tmp/home",
      timeoutMs: 1000,
      exec,
    });
    expect(facts.version).toBe("0.11.4");
    expect(facts.adapters!.length).toBe(2);
    expect(facts.pendingStubs!.length).toBe(1);
    expect(facts.flowCount).toBe(7);
  });

  it("treats individual command failures as null without throwing", async () => {
    const exec = makeExec({
      "rote --version": ok("rote 0.11.4\n"),
      "rote machine inventory --json": fail,
      "rote flow pending list --json": fail,
      "rote flow list --json": fail,
    });
    const facts = await runProbe({
      bin: "rote",
      cwd: "/tmp",
      roteHome: "/tmp/home",
      timeoutMs: 1000,
      exec,
    });
    expect(facts.version).toBe("0.11.4");
    expect(facts.adapters).toBeNull();
    expect(facts.pendingStubs).toBeNull();
    expect(facts.flowCount).toBeNull();
  });

  it("treats timeouts as null", async () => {
    const exec: ExecFn = async () => ({
      stdout: "",
      stderr: "",
      exitCode: 124,
      timedOut: true,
    });
    const facts = await runProbe({
      bin: "rote",
      cwd: "/tmp",
      roteHome: "/tmp/home",
      timeoutMs: 1,
      exec,
    });
    expect(facts.version).toBeNull();
  });

  it("recovers a non-JSON flow list as null without throwing", async () => {
    const exec = makeExec({
      "rote --version": ok("rote 1.0.0\n"),
      "rote machine inventory --json": ok("not-json"),
      "rote flow pending list --json": ok("not-json"),
      "rote flow list --json": ok("not-json"),
    });
    const facts = await runProbe({
      bin: "rote",
      cwd: "/tmp",
      roteHome: "/tmp/home",
      timeoutMs: 1000,
      exec,
    });
    expect(facts.version).toBe("1.0.0");
    expect(facts.adapters).toBeNull();
    expect(facts.flowCount).toBeNull();
    expect(facts.pendingStubs).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/rote test -- src/probe.test.ts`
Expected: import error.

- [ ] **Step 3: Implement `packages/rote/src/probe.ts`**

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
    ? parseJson<{ adapters?: Array<{ id: string; fingerprint: string; toolsetCount: number }> }>(
        advRes.stdout,
      )
    : null;
  const adapters = advParsed?.adapters && Array.isArray(advParsed.adapters)
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

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @flow-build/rote test -- src/probe.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rote/src/probe.ts packages/rote/src/probe.test.ts
git commit -m "feat(rote): rote CLI probe with DI exec and per-fact null fallbacks"
```

---

## Task 20: `plugin.ts` — assemble the rote `Plugin`

**Files:**
- Modify: `packages/rote/src/plugin.ts`
- Create: `packages/rote/src/plugin.test.ts`
- Create: `packages/rote/src/default-exec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { createRotePlugin } from "./plugin.js";
import type { ExecFn, ExecResult } from "./types.js";
import type { HarnessEvent, RuntimeContext } from "@flow-build/core";

function makeCtx(cwd: string): RuntimeContext {
  return {
    cwd,
    model: "composer-2",
    runId: "r-1",
    signal: new AbortController().signal,
    logger: { warn: () => {} },
    state: new Map(),
  };
}

const ok = (stdout: string): ExecResult => ({ stdout, stderr: "", exitCode: 0, timedOut: false });
const exitFail: ExecResult = { stdout: "", stderr: "x", exitCode: 1, timedOut: false };

function table(rows: Record<string, ExecResult>): ExecFn {
  return async (cmd, args) => {
    const key = `${cmd} ${args.join(" ")}`;
    return rows[key] ?? exitFail;
  };
}

describe("createRotePlugin", () => {
  it("returns a Plugin named 'rote' with the expected hooks defined", () => {
    const p = createRotePlugin({ exec: async () => exitFail });
    expect(p.name).toBe("rote");
    expect(typeof p.preRun).toBe("function");
    expect(typeof p.systemPrompt).toBe("function");
    expect(typeof p.promptPrefix).toBe("function");
    expect(typeof p.interceptEvent).toBe("function");
  });

  it("preRun stores facts on ctx.state['rote'].facts", async () => {
    const exec = table({
      "rote --version": ok("rote 0.11.4\n"),
      "rote machine inventory --json": ok(JSON.stringify({ adapters: [] })),
      "rote flow pending list --json": ok("[]"),
      "rote flow list --json": ok("[]"),
    });
    const p = createRotePlugin({ exec });
    const ctx = makeCtx("/tmp");
    await p.preRun!(ctx);
    const slot = ctx.state.get("rote") as { facts: { version: string | null } };
    expect(slot.facts.version).toBe("0.11.4");
  });

  it("systemPrompt returns a contribution with rules content", async () => {
    const p = createRotePlugin({ exec: async () => exitFail });
    const ctx = makeCtx("/tmp");
    await p.preRun!(ctx);
    const c = await p.systemPrompt!(ctx);
    expect(c).toBeDefined();
    expect(c!.rulesFile.relativePath).toMatch(/\.cursor\/rules\//);
    expect(c!.rulesFile.contents).toMatch(/alwaysApply: true/);
  });

  it("promptPrefix returns the install hint when probe was empty", async () => {
    const p = createRotePlugin({ exec: async () => exitFail });
    const ctx = makeCtx("/tmp");
    await p.preRun!(ctx);
    const out = await p.promptPrefix!(ctx);
    expect(typeof out).toBe("string");
    expect(out).toMatch(/rote unavailable/);
  });

  it("interceptEvent fans a hint event after a tool_end matching a bypass", async () => {
    const p = createRotePlugin({ exec: async () => exitFail });
    const ctx = makeCtx("/tmp");
    await p.preRun!(ctx);
    // simulate the harness having seen the tool args via state under our slot
    ctx.state.set("rote:lastToolArgs", { "1": { command: "gh issue list" } });
    const evt: HarnessEvent = { type: "tool_end", name: "shell", callId: "1", ok: true };
    const out = p.interceptEvent!(evt, ctx);
    expect(Array.isArray(out)).toBe(true);
    expect((out as HarnessEvent[]).some((e) => e.type === "text" && e.delta.includes("[rote hint]"))).toBe(true);
  });

  it("onToolCall records args under ctx.state so interceptor can match", async () => {
    const p = createRotePlugin({ exec: async () => exitFail });
    const ctx = makeCtx("/tmp");
    await p.preRun!(ctx);
    await p.onToolCall!(
      { callId: "1", name: "shell", status: "running", args: { command: "gh issue list" } },
      ctx,
    );
    const slot = ctx.state.get("rote:lastToolArgs") as Record<string, unknown>;
    expect(slot["1"]).toEqual({ command: "gh issue list" });
  });

  it("does not hint when enableHints is false", async () => {
    const p = createRotePlugin({ exec: async () => exitFail, enableHints: false });
    const ctx = makeCtx("/tmp");
    await p.preRun!(ctx);
    ctx.state.set("rote:lastToolArgs", { "1": { command: "gh issue list" } });
    const out = p.interceptEvent!(
      { type: "tool_end", name: "shell", callId: "1", ok: true },
      ctx,
    );
    // no fan-out (returns void to pass through)
    expect(out).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @flow-build/rote test -- src/plugin.test.ts`
Expected: most assertions fail (stub plugin).

- [ ] **Step 3: Implement `packages/rote/src/default-exec.ts`**

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
        exitCode: err && typeof (err as NodeJS.ErrnoException).code === "number"
          ? Number((err as NodeJS.ErrnoException).code)
          : err ? 1 : 0,
        timedOut,
      });
    });
    opts.signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
  });
```

- [ ] **Step 4: Replace `packages/rote/src/plugin.ts`**

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

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @flow-build/rote test`
Expected: all rote-package tests pass (probe / workspace / render / intercept / plugin / index).

- [ ] **Step 6: Commit**

```bash
git add packages/rote/src/plugin.ts packages/rote/src/plugin.test.ts packages/rote/src/default-exec.ts
git commit -m "feat(rote): assemble createRotePlugin with hooks for prefix/rules/hints"
```

---

## Task 21: CLI integration — always wire the rote plugin

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/main.ts`
- Create: `packages/cli/src/main.test.ts`

- [ ] **Step 1: Add the dependency**

Edit `packages/cli/package.json` so the `dependencies` block becomes:

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

- [ ] **Step 2: Write the failing test in `packages/cli/src/main.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import type { Plugin } from "@flow-build/core";

function makeWritable() {
  const chunks: string[] = [];
  const w = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return Object.assign(w, { read: () => chunks.join("") });
}

let dir: string;
let calls: { plugins: Plugin[] | undefined; prompt: string }[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cli-main-"));
  calls = [];
  vi.resetModules();
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.doMock("@flow-build/core", () => ({
    runPrompt: async (opts: { plugins?: Plugin[]; prompt: string; onEvent: (e: unknown) => void }) => {
      calls.push({ plugins: opts.plugins, prompt: opts.prompt });
      opts.onEvent({ type: "status", phase: "starting" });
      opts.onEvent({ type: "status", phase: "done" });
      return { status: "completed", finalText: "" };
    },
    AuthError: class AuthError extends Error {},
    ConfigError: class ConfigError extends Error {},
    NetworkError: class NetworkError extends Error {},
    HarnessError: class HarnessError extends Error {},
  }));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  delete process.env.FLOW_BUILD_DISABLE_PLUGINS;
  vi.doUnmock("@flow-build/core");
});

describe("CLI main wires the rote plugin", () => {
  it("registers a plugin named 'rote' on every run", async () => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const ctl = new AbortController();
    const { runCli } = await import("./main.js");
    await runCli({
      argv: ["node", "flow-build", "run", "hello", "--cwd", dir],
      stdout,
      stderr,
      isTTY: false,
      signal: ctl.signal,
      exit: () => undefined as never,
    });
    expect(calls.length).toBe(1);
    expect(calls[0]!.plugins?.map((p) => p.name)).toEqual(["rote"]);
  });

  it("registers no plugins when FLOW_BUILD_DISABLE_PLUGINS=1", async () => {
    process.env.FLOW_BUILD_DISABLE_PLUGINS = "1";
    const stdout = makeWritable();
    const stderr = makeWritable();
    const ctl = new AbortController();
    const { runCli } = await import("./main.js");
    await runCli({
      argv: ["node", "flow-build", "run", "hello", "--cwd", dir],
      stdout,
      stderr,
      isTTY: false,
      signal: ctl.signal,
      exit: () => undefined as never,
    });
    expect(calls[0]!.plugins).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to confirm failure**

Run: `pnpm --filter flow-build test -- src/main.test.ts`
Expected: `calls[0].plugins` is `undefined` — main does not register plugins.

- [ ] **Step 4: Modify `packages/cli/src/main.ts`**

At the top, add:

```typescript
import { createRotePlugin } from "@flow-build/rote";
import type { Plugin } from "@flow-build/core";
```

Inside `executeRun`, just before the `runPrompt` call, build a plugins array:

```typescript
const plugins: Plugin[] =
  process.env.FLOW_BUILD_DISABLE_PLUGINS === "1" ? [] : [createRotePlugin({})];
```

And add `plugins` to the `runPrompt` options:

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

- [ ] **Step 5: Run tests**

Run: `pnpm --filter flow-build test`
Expected: all CLI tests pass (existing render tests + the two new main tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/package.json packages/cli/src/main.ts packages/cli/src/main.test.ts pnpm-lock.yaml
git commit -m "feat(cli): always wire rote plugin into runPrompt; honor disable env"
```

---

## Task 22: CLI smoke when rote is not installed

**Files:**
- Modify: `packages/cli/src/main.test.ts`

- [ ] **Step 1: Append failing test**

```typescript
import { runPrompt as realRunPrompt } from "@flow-build/core";
// (above import will be unused if mocked; remove if eslint complains)

describe("CLI completes cleanly when rote is missing", () => {
  it("returns exit 0 even when rote facts are all null", async () => {
    // unmock @flow-build/core for this test so the real harness runs against a fake SDK
    vi.doUnmock("@flow-build/core");
    vi.resetModules();

    // mock @cursor/sdk to a no-op streaming agent
    vi.doMock("@cursor/sdk", () => ({
      Agent: {
        create: async () => ({
          agentId: "a",
          close: async () => {},
          [Symbol.asyncDispose]: async () => {},
          send: async () => ({
            cancel: async () => {},
            wait: async () => ({ status: "completed" }),
            stream: async function* () {
              yield {
                type: "assistant",
                message: { content: [{ type: "text", text: "ok" }] },
              };
            },
          }),
        }),
      },
    }));

    // mock @flow-build/rote so its exec always reports "not installed"
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

    const stdout = makeWritable();
    const stderr = makeWritable();
    const ctl = new AbortController();
    let exitCode: number | undefined;
    const { runCli } = await import("./main.js");
    await runCli({
      argv: ["node", "flow-build", "run", "hello", "--cwd", dir],
      stdout,
      stderr,
      isTTY: false,
      signal: ctl.signal,
      exit: ((c: number) => {
        exitCode = c;
        throw new Error("exit"); // stop further work
      }) as unknown as (code: number) => never,
    });
    expect(exitCode).toBe(0);
    // run completed even though rote was unavailable
  });
});
```

(If the linter complains about the unused `realRunPrompt` import, delete the line.)

- [ ] **Step 2: Run test to confirm it passes (no implementation change needed if Task 21 is correct)**

Run: `pnpm --filter flow-build test`
Expected: test passes; if it fails, fix wiring rather than skip.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/main.test.ts
git commit -m "test(cli): smoke that runs cleanly when rote is not installed"
```

---

## Task 23: Final cross-package check

**Files:** none modified.

- [ ] **Step 1: Build everything**

Run: `pnpm -r build`
Expected: every package compiles with no TypeScript errors.

- [ ] **Step 2: Run all tests**

Run: `pnpm -r test`
Expected: every package's test suite passes; no test is skipped.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: zero ESLint errors. Fix any new ones inline.

- [ ] **Step 4: Typecheck (one last time across the whole workspace)**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 5: Commit any whitespace / lint fixes that came out of this pass**

If anything was changed:

```bash
git add -A
git commit -m "chore: fix lint and formatting after plugin layer landing"
```

If nothing changed, skip the commit.

---

## Self-review checklist (already applied while writing)

- Spec §3 architecture → Tasks 13 (rote scaffold), 21 (CLI wiring).
- Spec §4 Plugin interface → Tasks 1, 2, 12 (types + error + re-export).
- Spec §4.4 hook ordering → Tasks 5–10 (per hook), Task 11 (orchestration in run.ts).
- Spec §4.5/4.6 guarantees & failure model → Tasks 5–10 swallow / abort behaviors covered.
- Spec §4.7 rules-file write protocol → Task 3 (atomic, backup, escape rejection).
- Spec §4.8 Cursor SDK wiring (`settingSources`) → Task 11 includes `["project", "user"]`.
- Spec §5.1 layout → Task 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 cover every file.
- Spec §5.2 public surface → Task 13 (index.ts) + Task 20 (createRotePlugin).
- Spec §5.3 probe → Task 19 (DI exec, parallel, null fallbacks).
- Spec §5.4 / 5.5 rules + prefix templates → Tasks 17 + 18.
- Spec §5.6 / 5.7 bypass classifier + hint → Tasks 15 + 16.
- Spec §5.8 workspace inference → Task 14.
- Spec §5.9 crash recovery — **out of scope for this plan** (orphan scan is post-v1; spec acknowledges as best-effort. If desired, file a follow-up.)
- Spec §6 CLI changes → Tasks 21 + 22.
- Spec §7 data flow → encoded in Task 11.
- Spec §8 testing — every test category from the spec is wired into the corresponding task.
- Spec §9 v1 scope vs deferred — plan only ships v1 items.

Type / signature consistency:
- `Plugin`, `RuntimeContext`, `RoteFacts`, `BypassMatch`, `WrittenFile` are defined once and referenced by exact name throughout.
- Hook names (`preRun`, `systemPrompt`, `promptPrefix`, `interceptEvent`, `onToolCall`, `cleanup`) match between core types, host orchestrator, and rote plugin.
- The state keys `"rote"` (facts slot) and `"rote:lastToolArgs"` (tool-arg memo) are constants in `plugin.ts` and used identically in tests.
