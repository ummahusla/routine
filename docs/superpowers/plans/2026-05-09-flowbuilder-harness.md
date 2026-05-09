# Flowbuilder Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-09-flowbuilder-harness-design.md`

**Goal:** Build harness-side support for an n8n-style flow builder. Per-session manifest + state on disk, edited by the agent through an in-process HTTP MCP server, with no UI work.

**Architecture:** New `@flow-build/flowbuilder` package plugs into the existing harness plugin system. It starts a localhost HTTP MCP server in `preRun`, exposes `flowbuilder_get_state` and `flowbuilder_set_state` tools, contributes the URL via a new `provideMcpServers` plugin hook, and shuts the server down in `cleanup`. The Cursor SDK consumes the URL via its `mcpServers` option. State writes are atomic (tmp + rename) and Zod-validated.

**Tech Stack:** Node 20+, TypeScript NodeNext, pnpm workspace, vitest. New deps: `@modelcontextprotocol/sdk`, `zod-to-json-schema`. Existing: `zod`, `@cursor/sdk`.

**Background docs the agent should skim before starting:**

- `docs/superpowers/specs/2026-05-09-flowbuilder-harness-design.md` — the spec for this plan.
- `packages/core/src/types.ts` — Plugin and RuntimeContext types being extended.
- `packages/core/src/plugin/host.ts` — pattern for new host method.
- `packages/core/src/run.ts` — where `Agent.create({ mcpServers })` is called.
- `packages/rote/src/plugin.ts` — sibling plugin to mirror.
- `packages/cli/src/main.ts` — where new plugin is registered + new flags parsed.
- `docs/rote-research/01-rote-overview.md` and `04-flows.md` — what a rote flow looks like (referenced in node `flow` field).

**Conventions:**

- Never include `Co-Authored-By` lines in commit messages.
- Each task is a TDD cycle: failing test first, run it to confirm failure, implement, run to confirm pass, commit.
- Use `pnpm` for all workspace commands; never `npm`.
- Run a package's tests with `pnpm --filter <name> test` from repo root.
- All new files use ES modules (`import ... from "...js"` for relative imports).
- All new files use exact path imports with `.js` suffix in TS source (NodeNext convention used elsewhere in the repo).

---

## Phase 0 — Core: extend Plugin contract for MCP

The Plugin type needs a `provideMcpServers` hook. The PluginHost needs a method to aggregate contributions across plugins. `runPrompt` needs to call it and pass the merged config into `Agent.create({ mcpServers })`.

### Task 1: Add `provideMcpServers` to Plugin type

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/src/test/types.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/test/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest";
import type { Plugin, RuntimeContext, McpServerConfig } from "../types.js";

describe("Plugin type", () => {
  it("supports provideMcpServers returning McpServerConfig record", () => {
    const p: Plugin = {
      name: "x",
      provideMcpServers: async (_ctx: RuntimeContext) => ({
        x: { type: "http", url: "http://127.0.0.1:1234/mcp" },
      }),
    };
    expectTypeOf(p.provideMcpServers).toMatchTypeOf<
      ((ctx: RuntimeContext) => Promise<Record<string, McpServerConfig>>) | undefined
    >();
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/core test -- types.test`
Expected: TS compile error — `McpServerConfig` and `provideMcpServers` not exported from types.

- [ ] **Step 3: Implement**

In `packages/core/src/types.ts`, add re-export of `McpServerConfig` from `@cursor/sdk` and add the hook to `Plugin`:

```ts
import type { McpServerConfig } from "@cursor/sdk";

export type { McpServerConfig };

export type Plugin = {
  name: string;
  preRun?: (ctx: RuntimeContext) => Promise<PreRunOutput | void>;
  systemPrompt?: (ctx: RuntimeContext) => Promise<SystemPromptContribution | void>;
  promptPrefix?: (ctx: RuntimeContext) => Promise<string | void>;
  provideMcpServers?: (
    ctx: RuntimeContext,
  ) => Promise<Record<string, McpServerConfig>>;
  interceptEvent?: (e: HarnessEvent, ctx: RuntimeContext) => HarnessEvent[] | void;
  onToolCall?: (call: ToolCallSnapshot, ctx: RuntimeContext) => Promise<void>;
  cleanup?: (ctx: RuntimeContext) => Promise<void>;
};
```

Place the `McpServerConfig` import at the top of the file (right under existing imports if any; the file currently has no imports — add it as the first line).

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @flow-build/core test -- types.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/test/types.test.ts
git commit -m "feat(core): add provideMcpServers hook to Plugin type"
```

---

### Task 2: Add `runProvideMcpServers` to PluginHost

**Files:**
- Modify: `packages/core/src/plugin/host.ts`
- Test: `packages/core/src/test/host-mcp.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/test/host-mcp.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { PluginHost } from "../plugin/host.js";
import type { Plugin, RuntimeContext, Logger } from "../types.js";

function makeCtx(): RuntimeContext {
  const logger: Logger = { warn: vi.fn() };
  return {
    cwd: "/tmp",
    model: "test-model",
    runId: "run-1",
    signal: new AbortController().signal,
    logger,
    state: new Map(),
  };
}

describe("PluginHost.runProvideMcpServers", () => {
  it("returns empty object when no plugins contribute", async () => {
    const host = new PluginHost([]);
    const out = await host.runProvideMcpServers(makeCtx());
    expect(out).toEqual({});
  });

  it("merges contributions across plugins", async () => {
    const a: Plugin = {
      name: "a",
      provideMcpServers: async () => ({
        alpha: { type: "http", url: "http://127.0.0.1:1/mcp" },
      }),
    };
    const b: Plugin = {
      name: "b",
      provideMcpServers: async () => ({
        beta: { type: "http", url: "http://127.0.0.1:2/mcp" },
      }),
    };
    const host = new PluginHost([a, b]);
    const out = await host.runProvideMcpServers(makeCtx());
    expect(out).toEqual({
      alpha: { type: "http", url: "http://127.0.0.1:1/mcp" },
      beta: { type: "http", url: "http://127.0.0.1:2/mcp" },
    });
  });

  it("warns and last-write-wins on key collision", async () => {
    const ctx = makeCtx();
    const warn = ctx.logger.warn as ReturnType<typeof vi.fn>;
    const a: Plugin = {
      name: "a",
      provideMcpServers: async () => ({
        same: { type: "http", url: "http://127.0.0.1:1/mcp" },
      }),
    };
    const b: Plugin = {
      name: "b",
      provideMcpServers: async () => ({
        same: { type: "http", url: "http://127.0.0.1:2/mcp" },
      }),
    };
    const host = new PluginHost([a, b]);
    const out = await host.runProvideMcpServers(ctx);
    expect(out.same).toEqual({ type: "http", url: "http://127.0.0.1:2/mcp" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("mcp server name collision"),
      expect.objectContaining({ name: "same" }),
    );
  });

  it("wraps plugin throws as PluginHostError", async () => {
    const a: Plugin = {
      name: "a",
      provideMcpServers: async () => {
        throw new Error("boom");
      },
    };
    const host = new PluginHost([a]);
    await expect(host.runProvideMcpServers(makeCtx())).rejects.toThrow(
      /plugin "a" provideMcpServers failed/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/core test -- host-mcp.test`
Expected: FAIL — `runProvideMcpServers` not a function.

- [ ] **Step 3: Implement**

Add to `packages/core/src/plugin/host.ts`, inside the `PluginHost` class (place after `runPromptPrefix`, before `intercept`):

```ts
  async runProvideMcpServers(
    ctx: RuntimeContext,
  ): Promise<Record<string, import("../types.js").McpServerConfig>> {
    const results = await Promise.all(
      this.plugins.map(async (p) => {
        if (!p.provideMcpServers) return null;
        try {
          return { name: p.name, config: await p.provideMcpServers(ctx) };
        } catch (cause) {
          throw new PluginHostError(
            `plugin "${p.name}" provideMcpServers failed`,
            { cause },
          );
        }
      }),
    );
    const merged: Record<string, import("../types.js").McpServerConfig> = {};
    for (const r of results) {
      if (!r) continue;
      for (const [name, cfg] of Object.entries(r.config)) {
        if (name in merged) {
          ctx.logger.warn("mcp server name collision; later contribution wins", {
            name,
            from: r.name,
          });
        }
        merged[name] = cfg;
      }
    }
    return merged;
  }
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @flow-build/core test -- host-mcp.test`
Expected: PASS, all four cases.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/plugin/host.ts packages/core/src/test/host-mcp.test.ts
git commit -m "feat(core): aggregate plugin mcpServers via PluginHost.runProvideMcpServers"
```

---

### Task 3: Wire `mcpServers` into `runPrompt` and `Agent.create`

**Files:**
- Modify: `packages/core/src/run.ts`
- Modify: `packages/core/src/test/fakeSdk.ts` (existing, see git status)
- Test: `packages/core/src/test/run-mcp.test.ts` (create)

- [ ] **Step 1: Inspect the existing fakeSdk to learn the seam**

Run: `cat packages/core/src/test/fakeSdk.ts`

This file is a test double for `@cursor/sdk`. Note how `Agent.create` is mocked. We need it to capture the `mcpServers` argument so the test can assert on it.

- [ ] **Step 2: Write the failing test**

Create `packages/core/src/test/run-mcp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Plugin } from "../types.js";

let captured: { mcpServers?: Record<string, unknown> } | undefined;

vi.mock("@cursor/sdk", async () => {
  const actual = await vi.importActual<typeof import("@cursor/sdk")>("@cursor/sdk");
  return {
    ...actual,
    Agent: {
      create: async (opts: { mcpServers?: Record<string, unknown> }) => {
        captured = opts;
        return {
          send: async () => ({
            stream: async function* () {
              /* no events */
            },
            wait: async () => ({ status: "completed", usage: undefined }),
            cancel: async () => {},
          }),
          close: async () => {},
        };
      },
    },
  };
});

beforeEach(() => {
  captured = undefined;
  process.env.CURSOR_API_KEY = "crsr_test";
});

afterEach(() => {
  delete process.env.CURSOR_API_KEY;
});

describe("runPrompt forwards plugin-contributed mcpServers", () => {
  it("passes merged mcpServers into Agent.create", async () => {
    const { runPrompt } = await import("../run.js");
    const plugin: Plugin = {
      name: "fb",
      provideMcpServers: async () => ({
        flowbuilder: { type: "http", url: "http://127.0.0.1:9999/mcp" },
      }),
    };
    await runPrompt({
      prompt: "hi",
      cwd: process.cwd(),
      onEvent: () => {},
      plugins: [plugin],
    });
    expect(captured?.mcpServers).toEqual({
      flowbuilder: { type: "http", url: "http://127.0.0.1:9999/mcp" },
    });
  });

  it("omits mcpServers when no plugin contributes", async () => {
    const { runPrompt } = await import("../run.js");
    await runPrompt({
      prompt: "hi",
      cwd: process.cwd(),
      onEvent: () => {},
      plugins: [],
    });
    expect(captured?.mcpServers).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify failure**

Run: `pnpm --filter @flow-build/core test -- run-mcp.test`
Expected: FAIL — `mcpServers` not in captured.

- [ ] **Step 4: Implement**

In `packages/core/src/run.ts`:

1. Update `startWithRetry` to accept and forward `mcpServers`:

```ts
async function startWithRetry(
  cfg: ReturnType<typeof resolveConfig>,
  prompt: string,
  signal: AbortSignal | undefined,
  logger: Logger | undefined,
  mcpServers: Record<string, import("@cursor/sdk").McpServerConfig> | undefined,
): Promise<LiveRun> {
  return withRetry<LiveRun>(
    async () => {
      let agent;
      try {
        agent = await Agent.create({
          apiKey: cfg.apiKey,
          model: { id: cfg.model },
          local: { cwd: cfg.cwd, settingSources: ["project", "user"] },
          ...(mcpServers && Object.keys(mcpServers).length > 0
            ? { mcpServers }
            : {}),
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

2. In `runPrompt`, call `host.runProvideMcpServers(ctx)` after `runPromptPrefix` and before `startWithRetry`. Forward the result:

```ts
    await host.runPreRun(ctx);
    await host.runSystemPrompt(ctx);
    const prefix = await host.runPromptPrefix(ctx);
    const finalPrompt = prefix.length > 0 ? `${prefix}\n\n${cfg.prompt}` : cfg.prompt;

    const mcpServers = await host.runProvideMcpServers(ctx);

    const live = await startWithRetry(cfg, finalPrompt, signal, logger, mcpServers);
```

- [ ] **Step 5: Run the test to verify pass**

Run: `pnpm --filter @flow-build/core test -- run-mcp.test`
Expected: PASS.

- [ ] **Step 6: Run all core tests to confirm no regression**

Run: `pnpm --filter @flow-build/core test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/run.ts packages/core/src/test/run-mcp.test.ts
git commit -m "feat(core): forward plugin-contributed mcpServers to Agent.create"
```

---

## Phase 1 — Scaffold the flowbuilder package

### Task 4: Create `packages/flowbuilder` skeleton

**Files:**
- Create: `packages/flowbuilder/package.json`
- Create: `packages/flowbuilder/tsconfig.json`
- Create: `packages/flowbuilder/vitest.config.ts`
- Create: `packages/flowbuilder/src/index.ts`
- Create: `packages/flowbuilder/test/.gitkeep`

- [ ] **Step 1: Create `packages/flowbuilder/package.json`**

```json
{
  "name": "@flow-build/flowbuilder",
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
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@flow-build/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "zod": "^3.23.8",
    "zod-to-json-schema": "^3.23.5"
  },
  "devDependencies": {
    "nanoid": "^5.0.7"
  }
}
```

- [ ] **Step 2: Create `packages/flowbuilder/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "test/**", "src/test/**"]
}
```

- [ ] **Step 3: Create `packages/flowbuilder/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create `packages/flowbuilder/src/index.ts` placeholder**

```ts
export {};
```

- [ ] **Step 5: Create `packages/flowbuilder/test/.gitkeep`**

Empty file.

- [ ] **Step 6: Verify the package installs**

Run from repo root: `pnpm install`
Expected: succeeds, `node_modules/@flow-build/flowbuilder` symlink exists.

If `@modelcontextprotocol/sdk@^1.0.4` does not resolve to a published version at install time, run `pnpm view @modelcontextprotocol/sdk version` and pin to the latest stable major-1 release (do not jump to a major-2 SDK without re-reviewing the API used in later tasks). Same procedure for `nanoid` and `zod-to-json-schema` if their pinned ranges fail.

- [ ] **Step 7: Verify build and test stubs work**

Run: `pnpm --filter @flow-build/flowbuilder build`
Expected: compiles to `dist/`.

Run: `pnpm --filter @flow-build/flowbuilder test`
Expected: passes (no tests yet).

- [ ] **Step 8: Commit**

```bash
git add packages/flowbuilder pnpm-lock.yaml
git commit -m "feat(flowbuilder): scaffold @flow-build/flowbuilder package"
```

---

## Phase 2 — Schema and errors

### Task 5: Implement Zod schemas

**Files:**
- Create: `packages/flowbuilder/src/schema.ts`
- Test: `packages/flowbuilder/src/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/flowbuilder/src/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ManifestSchema,
  StateSchema,
  validateRefIntegrity,
  type Manifest,
  type State,
} from "./schema.js";

const validManifest: Manifest = {
  schemaVersion: 1,
  id: "s_8x3k2pq7nw9r",
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const validState: State = {
  schemaVersion: 1,
  nodes: [
    { id: "n1", type: "input", value: { x: 1 } },
    { id: "n2", type: "flow", flow: "github/fetch-issues", params: { owner: "x" } },
    { id: "n3", type: "branch", cond: "x > 0" },
    { id: "n4", type: "merge" },
    { id: "n5", type: "output", value: null },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n3", to: "n4" },
    { from: "n4", to: "n5" },
  ],
};

describe("ManifestSchema", () => {
  it("accepts a valid manifest", () => {
    expect(ManifestSchema.parse(validManifest)).toEqual(validManifest);
  });

  it("rejects bad id format", () => {
    const bad = { ...validManifest, id: "abc" };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it("rejects schemaVersion != 1", () => {
    const bad = { ...validManifest, schemaVersion: 2 };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });
});

describe("StateSchema", () => {
  it("accepts a valid state", () => {
    expect(StateSchema.parse(validState)).toEqual(validState);
  });

  it("rejects flow node with invalid flow ref (no slash)", () => {
    const bad: unknown = {
      ...validState,
      nodes: [{ id: "n1", type: "flow", flow: "noslash", params: {} }],
      edges: [],
    };
    expect(() => StateSchema.parse(bad)).toThrow();
  });

  it("rejects unknown node type", () => {
    const bad: unknown = {
      ...validState,
      nodes: [{ id: "n1", type: "alien" }],
      edges: [],
    };
    expect(() => StateSchema.parse(bad)).toThrow();
  });
});

describe("validateRefIntegrity", () => {
  it("passes for valid state", () => {
    expect(() => validateRefIntegrity(validState)).not.toThrow();
  });

  it("fails on duplicate node ids", () => {
    const bad: State = {
      schemaVersion: 1,
      nodes: [
        { id: "n1", type: "merge" },
        { id: "n1", type: "merge" },
      ],
      edges: [],
    };
    expect(() => validateRefIntegrity(bad)).toThrow(/duplicate node id: n1/);
  });

  it("fails on edge.from referencing unknown node", () => {
    const bad: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [{ from: "ghost", to: "n1" }],
    };
    expect(() => validateRefIntegrity(bad)).toThrow(/edge.from references unknown node: ghost/);
  });

  it("fails on edge.to referencing unknown node", () => {
    const bad: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [{ from: "n1", to: "ghost" }],
    };
    expect(() => validateRefIntegrity(bad)).toThrow(/edge.to references unknown node: ghost/);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/flowbuilder test -- schema.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/flowbuilder/src/schema.ts`:

```ts
import { z } from "zod";

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^s_[0-9a-z]{12}$/),
  name: z.string().min(1),
  description: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

const InputNode = z.object({
  id: z.string().min(1),
  type: z.literal("input"),
  value: z.unknown(),
});
const OutputNode = z.object({
  id: z.string().min(1),
  type: z.literal("output"),
  value: z.unknown(),
});
const FlowNode = z.object({
  id: z.string().min(1),
  type: z.literal("flow"),
  flow: z.string().regex(/^[^/\s]+\/[^/\s]+$/, {
    message: "flow ref must be '<category>/<name>'",
  }),
  params: z.record(z.unknown()),
});
const BranchNode = z.object({
  id: z.string().min(1),
  type: z.literal("branch"),
  cond: z.string().min(1),
});
const MergeNode = z.object({
  id: z.string().min(1),
  type: z.literal("merge"),
});

export const NodeSchema = z.discriminatedUnion("type", [
  InputNode,
  OutputNode,
  FlowNode,
  BranchNode,
  MergeNode,
]);
export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const StateSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});
export type State = z.infer<typeof StateSchema>;

export function validateRefIntegrity(state: State): void {
  const seen = new Set<string>();
  for (const n of state.nodes) {
    if (seen.has(n.id)) {
      throw new Error(`duplicate node id: ${n.id}`);
    }
    seen.add(n.id);
  }
  for (const e of state.edges) {
    if (!seen.has(e.from)) {
      throw new Error(`edge.from references unknown node: ${e.from}`);
    }
    if (!seen.has(e.to)) {
      throw new Error(`edge.to references unknown node: ${e.to}`);
    }
  }
}

export const EMPTY_STATE: State = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test -- schema.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder/src/schema.ts packages/flowbuilder/src/schema.test.ts
git commit -m "feat(flowbuilder): zod schemas + ref-integrity validator"
```

---

### Task 6: Implement error class hierarchy

**Files:**
- Create: `packages/flowbuilder/src/errors.ts`
- Test: `packages/flowbuilder/src/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/flowbuilder/src/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FlowbuilderError,
  FlowbuilderSessionMissingError,
  FlowbuilderSchemaError,
  FlowbuilderRefIntegrityError,
  FlowbuilderIOError,
  FlowbuilderUnsupportedVersion,
  FlowbuilderMcpStartError,
} from "./errors.js";

describe("FlowbuilderError hierarchy", () => {
  it("all subclass FlowbuilderError", () => {
    const ctx = { sessionId: "s_test", path: "/tmp/x" };
    const errs = [
      new FlowbuilderSessionMissingError("missing", ctx),
      new FlowbuilderSchemaError("bad schema", ctx),
      new FlowbuilderRefIntegrityError("bad refs", ctx),
      new FlowbuilderIOError("io fail", ctx),
      new FlowbuilderUnsupportedVersion("v2 not supported", { ...ctx, version: 2 }),
      new FlowbuilderMcpStartError("port in use", ctx),
    ];
    for (const e of errs) {
      expect(e).toBeInstanceOf(FlowbuilderError);
      expect(e).toBeInstanceOf(Error);
      expect(e.sessionId).toBe("s_test");
      expect(e.path).toBe("/tmp/x");
      expect(e.name).toMatch(/^Flowbuilder/);
    }
  });

  it("wraps cause when provided", () => {
    const cause = new Error("root");
    const e = new FlowbuilderIOError("io fail", {
      sessionId: "s",
      path: "/x",
      cause,
    });
    expect(e.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/flowbuilder test -- errors.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/flowbuilder/src/errors.ts`:

```ts
type ErrorContext = {
  sessionId: string;
  path: string;
  cause?: unknown;
};

export class FlowbuilderError extends Error {
  readonly sessionId: string;
  readonly path: string;
  override readonly cause?: unknown;

  constructor(message: string, ctx: ErrorContext) {
    super(message);
    this.name = "FlowbuilderError";
    this.sessionId = ctx.sessionId;
    this.path = ctx.path;
    if (ctx.cause !== undefined) this.cause = ctx.cause;
  }
}

export class FlowbuilderSessionMissingError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderSessionMissingError";
  }
}

export class FlowbuilderSchemaError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderSchemaError";
  }
}

export class FlowbuilderRefIntegrityError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderRefIntegrityError";
  }
}

export class FlowbuilderIOError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderIOError";
  }
}

export class FlowbuilderUnsupportedVersion extends FlowbuilderError {
  readonly version: number;
  constructor(message: string, ctx: ErrorContext & { version: number }) {
    super(message, ctx);
    this.name = "FlowbuilderUnsupportedVersion";
    this.version = ctx.version;
  }
}

export class FlowbuilderMcpStartError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderMcpStartError";
  }
}
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test -- errors.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder/src/errors.ts packages/flowbuilder/src/errors.test.ts
git commit -m "feat(flowbuilder): typed error hierarchy"
```

---

## Phase 3 — Session manager

### Task 7: Implement `SessionManager`

**Files:**
- Create: `packages/flowbuilder/src/session.ts`
- Test: `packages/flowbuilder/src/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/flowbuilder/src/session.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "./session.js";
import {
  FlowbuilderSessionMissingError,
  FlowbuilderSchemaError,
  FlowbuilderUnsupportedVersion,
  FlowbuilderRefIntegrityError,
} from "./errors.js";
import type { Manifest, State } from "./schema.js";

let baseDir: string;
const sessionId = "s_abc123def456";

const validManifest: Manifest = {
  schemaVersion: 1,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const emptyState: State = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};

function setup(): SessionManager {
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
  return new SessionManager({ baseDir, sessionId, runId: "run-1" });
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-session-"));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("SessionManager.load", () => {
  it("loads valid manifest + state", () => {
    const mgr = setup();
    const out = mgr.load();
    expect(out.manifest.id).toBe(sessionId);
    expect(out.state.nodes).toEqual([]);
  });

  it("throws FlowbuilderSessionMissingError when dir is absent", () => {
    const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
    expect(() => mgr.load()).toThrow(FlowbuilderSessionMissingError);
  });

  it("throws FlowbuilderSchemaError on malformed manifest json", () => {
    const sdir = join(baseDir, "sessions", sessionId);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "manifest.json"), "{not json");
    writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
    const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
    expect(() => mgr.load()).toThrow(FlowbuilderSchemaError);
  });

  it("throws FlowbuilderUnsupportedVersion on schemaVersion mismatch", () => {
    const sdir = join(baseDir, "sessions", sessionId);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
    writeFileSync(
      join(sdir, "state.json"),
      JSON.stringify({ ...emptyState, schemaVersion: 99 }),
    );
    const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
    expect(() => mgr.load()).toThrow(FlowbuilderUnsupportedVersion);
  });
});

describe("SessionManager.saveState", () => {
  it("writes state atomically and bumps manifest.updatedAt", async () => {
    const mgr = setup();
    mgr.load();
    const before = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "manifest.json"), "utf8"),
    ).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const next: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [],
    };
    const result = mgr.saveState(next);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.updatedAt).not.toBe(before);
    const written = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "state.json"), "utf8"),
    );
    expect(written.nodes).toEqual([{ id: "n1", type: "merge" }]);
    const newManifest = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "manifest.json"), "utf8"),
    );
    expect(newManifest.updatedAt).toBe(result.updatedAt);
    expect(existsSync(join(baseDir, "sessions", sessionId, "state.json.tmp.run-1"))).toBe(false);
  });

  it("rejects state with bad ref integrity", () => {
    const mgr = setup();
    mgr.load();
    const bad: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [{ from: "n1", to: "ghost" }],
    };
    expect(() => mgr.saveState(bad)).toThrow(FlowbuilderRefIntegrityError);
  });

  it("rejects state failing zod schema", () => {
    const mgr = setup();
    mgr.load();
    const bad = { schemaVersion: 1, nodes: [{ id: "n1", type: "alien" }], edges: [] };
    expect(() => mgr.saveState(bad as unknown as State)).toThrow(FlowbuilderSchemaError);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/flowbuilder test -- session.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/flowbuilder/src/session.ts`:

```ts
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  ManifestSchema,
  StateSchema,
  validateRefIntegrity,
  type Manifest,
  type State,
} from "./schema.js";
import {
  FlowbuilderIOError,
  FlowbuilderRefIntegrityError,
  FlowbuilderSchemaError,
  FlowbuilderSessionMissingError,
  FlowbuilderUnsupportedVersion,
} from "./errors.js";

export type SessionManagerOptions = {
  baseDir: string;
  sessionId: string;
  runId: string;
};

export type LoadedSession = {
  manifest: Manifest;
  state: State;
  sessionDir: string;
  manifestPath: string;
  statePath: string;
};

export type SaveResult = {
  bytes: number;
  updatedAt: string;
};

export class SessionManager {
  private readonly baseDir: string;
  readonly sessionId: string;
  private readonly runId: string;
  readonly sessionDir: string;
  readonly manifestPath: string;
  readonly statePath: string;
  private cachedManifest?: Manifest;

  constructor(opts: SessionManagerOptions) {
    this.baseDir = opts.baseDir;
    this.sessionId = opts.sessionId;
    this.runId = opts.runId;
    this.sessionDir = join(opts.baseDir, "sessions", opts.sessionId);
    this.manifestPath = join(this.sessionDir, "manifest.json");
    this.statePath = join(this.sessionDir, "state.json");
  }

  load(): LoadedSession {
    if (!existsSync(this.sessionDir) || !statSync(this.sessionDir).isDirectory()) {
      throw new FlowbuilderSessionMissingError(
        `session directory missing: ${this.sessionDir}`,
        { sessionId: this.sessionId, path: this.sessionDir },
      );
    }
    if (!existsSync(this.manifestPath)) {
      throw new FlowbuilderSessionMissingError(
        `manifest.json missing: ${this.manifestPath}`,
        { sessionId: this.sessionId, path: this.manifestPath },
      );
    }
    if (!existsSync(this.statePath)) {
      throw new FlowbuilderSessionMissingError(
        `state.json missing: ${this.statePath}`,
        { sessionId: this.sessionId, path: this.statePath },
      );
    }

    const manifestRaw = this.readJson(this.manifestPath);
    const manifestParse = ManifestSchema.safeParse(manifestRaw);
    if (!manifestParse.success) {
      throw new FlowbuilderSchemaError(
        `invalid manifest.json: ${manifestParse.error.message}`,
        { sessionId: this.sessionId, path: this.manifestPath, cause: manifestParse.error },
      );
    }
    const manifest = manifestParse.data;

    const stateRawUnknown: unknown = this.readJson(this.statePath);
    const stateRaw = stateRawUnknown as { schemaVersion?: unknown };
    if (
      typeof stateRaw === "object" &&
      stateRaw !== null &&
      typeof stateRaw.schemaVersion === "number" &&
      stateRaw.schemaVersion !== 1
    ) {
      throw new FlowbuilderUnsupportedVersion(
        `unsupported_schema_version: ${stateRaw.schemaVersion}`,
        {
          sessionId: this.sessionId,
          path: this.statePath,
          version: stateRaw.schemaVersion,
        },
      );
    }
    const stateParse = StateSchema.safeParse(stateRawUnknown);
    if (!stateParse.success) {
      throw new FlowbuilderSchemaError(
        `invalid state.json: ${stateParse.error.message}`,
        { sessionId: this.sessionId, path: this.statePath, cause: stateParse.error },
      );
    }

    this.cachedManifest = manifest;
    return {
      manifest,
      state: stateParse.data,
      sessionDir: this.sessionDir,
      manifestPath: this.manifestPath,
      statePath: this.statePath,
    };
  }

  saveState(next: State): SaveResult {
    const stateParse = StateSchema.safeParse(next);
    if (!stateParse.success) {
      throw new FlowbuilderSchemaError(
        `invalid state: ${stateParse.error.message}`,
        { sessionId: this.sessionId, path: this.statePath, cause: stateParse.error },
      );
    }
    try {
      validateRefIntegrity(stateParse.data);
    } catch (cause) {
      throw new FlowbuilderRefIntegrityError(
        cause instanceof Error ? cause.message : String(cause),
        { sessionId: this.sessionId, path: this.statePath, cause },
      );
    }

    const body = `${JSON.stringify(stateParse.data, null, 2)}\n`;
    this.atomicWrite(this.statePath, body);

    const now = new Date().toISOString();
    const baseManifest =
      this.cachedManifest ??
      (() => {
        const m = ManifestSchema.parse(this.readJson(this.manifestPath));
        this.cachedManifest = m;
        return m;
      })();
    const nextManifest: Manifest = { ...baseManifest, updatedAt: now };
    this.atomicWrite(this.manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
    this.cachedManifest = nextManifest;

    return { bytes: Buffer.byteLength(body, "utf8"), updatedAt: now };
  }

  private readJson(path: string): unknown {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (cause) {
      throw new FlowbuilderIOError(`failed to read ${path}`, {
        sessionId: this.sessionId,
        path,
        cause,
      });
    }
    try {
      return JSON.parse(raw);
    } catch (cause) {
      throw new FlowbuilderSchemaError(`malformed JSON in ${path}`, {
        sessionId: this.sessionId,
        path,
        cause,
      });
    }
  }

  private atomicWrite(target: string, body: string): void {
    const tmp = `${target}.tmp.${this.runId}`;
    try {
      writeFileSync(tmp, body);
      renameSync(tmp, target);
    } catch (cause) {
      throw new FlowbuilderIOError(`atomic write failed for ${target}`, {
        sessionId: this.sessionId,
        path: target,
        cause,
      });
    }
  }
}
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test -- session.test`
Expected: PASS, all six cases.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder/src/session.ts packages/flowbuilder/src/session.test.ts
git commit -m "feat(flowbuilder): SessionManager with atomic writes and validation"
```

---

## Phase 4 — MCP server

### Task 8: Implement the in-process HTTP MCP server

**Files:**
- Create: `packages/flowbuilder/src/mcp-server.ts`
- Test: `packages/flowbuilder/src/mcp-server.test.ts`

This task wires up `@modelcontextprotocol/sdk`'s `McpServer` with a `StreamableHTTPServerTransport`. The server has two tools whose handlers delegate to a `SessionManager`. The test exercises the server end-to-end via an MCP HTTP client (also from the SDK).

- [ ] **Step 1: Write the failing test**

Create `packages/flowbuilder/src/mcp-server.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startFlowbuilderMcpServer } from "./mcp-server.js";
import { SessionManager } from "./session.js";
import type { Manifest, State } from "./schema.js";

let baseDir: string;
const sessionId = "s_abc123def456";

const validManifest: Manifest = {
  schemaVersion: 1,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const emptyState: State = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};

function setupSession(): SessionManager {
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
  const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
  mgr.load();
  return mgr;
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-mcp-"));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

async function withClient<T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await transport.close();
  }
}

describe("flowbuilder MCP server", () => {
  it("flowbuilder_get_state returns empty state on a fresh session", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr });
    try {
      const result = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_get_state", arguments: {} }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(true);
      expect(parsed.state.nodes).toEqual([]);
    } finally {
      await handle.close();
    }
  });

  it("flowbuilder_set_state accepts valid state and persists it", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr });
    try {
      const newState: State = {
        schemaVersion: 1,
        nodes: [{ id: "n1", type: "merge" }],
        edges: [],
      };
      const result = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_set_state",
          arguments: { state: newState },
        }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(true);
      expect(parsed.bytes).toBeGreaterThan(0);

      const reread = await withClient(handle.url, (c) =>
        c.callTool({ name: "flowbuilder_get_state", arguments: {} }),
      );
      const text2 = (reread.content as { type: string; text: string }[])[0]?.text ?? "";
      expect(JSON.parse(text2).state.nodes).toEqual([{ id: "n1", type: "merge" }]);
    } finally {
      await handle.close();
    }
  });

  it("flowbuilder_set_state returns ok:false on schema violation", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr });
    try {
      const result = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_set_state",
          arguments: {
            state: { schemaVersion: 1, nodes: [{ id: "n1", type: "alien" }], edges: [] },
          },
        }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/^validation:/);
    } finally {
      await handle.close();
    }
  });

  it("flowbuilder_set_state returns ok:false on ref integrity violation", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr });
    try {
      const result = await withClient(handle.url, (c) =>
        c.callTool({
          name: "flowbuilder_set_state",
          arguments: {
            state: {
              schemaVersion: 1,
              nodes: [{ id: "n1", type: "merge" }],
              edges: [{ from: "n1", to: "ghost" }],
            },
          },
        }),
      );
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toMatch(/^ref_integrity:/);
    } finally {
      await handle.close();
    }
  });

  it("binds only to 127.0.0.1 with a non-zero port", async () => {
    const mgr = setupSession();
    const handle = await startFlowbuilderMcpServer({ session: mgr });
    try {
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
      const port = Number(new URL(handle.url).port);
      expect(port).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/flowbuilder test -- mcp-server.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Confirm the MCP SDK API surface this task uses**

Before implementing, sanity check the import paths against the installed package by listing the SDK's compiled outputs. The implementation uses:

- `@modelcontextprotocol/sdk/server/mcp.js` → `McpServer`
- `@modelcontextprotocol/sdk/server/streamableHttp.js` → `StreamableHTTPServerTransport`
- `@modelcontextprotocol/sdk/client/index.js` → `Client`
- `@modelcontextprotocol/sdk/client/streamableHttp.js` → `StreamableHTTPClientTransport`

Run: `ls node_modules/@modelcontextprotocol/sdk/dist/esm/server/ node_modules/@modelcontextprotocol/sdk/dist/esm/client/ 2>/dev/null`

If `streamableHttp.js` is missing (older SDK versions named it `streamableHttp.js` only after 1.0.x), upgrade the dep range in `packages/flowbuilder/package.json` to a version that ships the streamable HTTP transport. The MCP SDK's deprecated SSE transport must not be used.

- [ ] **Step 4: Implement**

Create `packages/flowbuilder/src/mcp-server.ts`:

```ts
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { StateSchema } from "./schema.js";
import {
  FlowbuilderError,
  FlowbuilderMcpStartError,
} from "./errors.js";
import type { SessionManager } from "./session.js";

export type FlowbuilderMcpHandle = {
  url: string;
  port: number;
  close(): Promise<void>;
};

export type StartOptions = {
  session: SessionManager;
};

const SetStateInput = z.object({ state: StateSchema });

function asTextResult(payload: unknown): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

export async function startFlowbuilderMcpServer(
  opts: StartOptions,
): Promise<FlowbuilderMcpHandle> {
  const { session } = opts;
  const mcp = new McpServer(
    { name: "flowbuilder", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  mcp.tool(
    "flowbuilder_get_state",
    "Read the current flowbuilder state.json for this session.",
    {},
    async () => {
      try {
        const loaded = session.load();
        return asTextResult({ ok: true, state: loaded.state });
      } catch (e) {
        return asTextResult({
          ok: false,
          error: errorToToolMessage(e),
        });
      }
    },
  );

  mcp.tool(
    "flowbuilder_set_state",
    "Write the full flowbuilder state.json. Always supply the complete graph; partial updates are not supported.",
    zodToJsonSchema(SetStateInput) as Record<string, unknown>,
    async (raw) => {
      const parsed = SetStateInput.safeParse(raw);
      if (!parsed.success) {
        return asTextResult({
          ok: false,
          error: `validation: ${parsed.error.message}`,
        });
      }
      try {
        const out = session.saveState(parsed.data.state);
        return asTextResult({ ok: true, ...out });
      } catch (e) {
        return asTextResult({
          ok: false,
          error: errorToToolMessage(e),
        });
      }
    },
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await mcp.connect(transport);

  const http: HttpServer = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const host = req.headers.host;
    const port = (http.address() as { port: number } | null)?.port;
    if (host !== `127.0.0.1:${port}`) {
      res.statusCode = 403;
      res.end();
      return;
    }
    try {
      await transport.handleRequest(req, res);
    } catch (e) {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", (e) => {
      reject(
        new FlowbuilderMcpStartError(
          `mcp http server failed to start: ${(e as Error).message}`,
          { sessionId: session.sessionId, path: session.sessionDir, cause: e },
        ),
      );
    });
    http.listen(0, "127.0.0.1", () => resolve());
  });

  const port = (http.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/mcp`;

  let closed = false;
  return {
    url,
    port,
    async close() {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => {});
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function errorToToolMessage(e: unknown): string {
  if (e instanceof FlowbuilderError) {
    const code = e.name.replace(/^Flowbuilder/, "").replace(/Error$/, "");
    const norm = code
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase();
    return `${norm}: ${e.message}`;
  }
  if (e instanceof Error) return `io: ${e.message}`;
  return `io: ${String(e)}`;
}
```

- [ ] **Step 5: Run the test to verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test -- mcp-server.test`
Expected: PASS, all five cases.

If a case fails because the SDK's `mcp.tool` signature differs from what is shown above (the MCP TS SDK has had two shapes: a Zod-shape variant and a JSON-Schema variant), inspect `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` to get the exact overloads, and adjust the `.tool()` calls accordingly. The contract being tested — tool names, behavior, output shape — does not change.

- [ ] **Step 6: Commit**

```bash
git add packages/flowbuilder/src/mcp-server.ts packages/flowbuilder/src/mcp-server.test.ts
git commit -m "feat(flowbuilder): in-process HTTP MCP server with get_state/set_state"
```

---

## Phase 5 — Plugin assembly

### Task 9: Implement the prompt-prefix renderer

**Files:**
- Create: `packages/flowbuilder/src/prompt.ts`
- Test: `packages/flowbuilder/src/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/flowbuilder/src/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderFlowbuilderPrefix } from "./prompt.js";
import type { Manifest, State } from "./schema.js";

const manifest: Manifest = {
  schemaVersion: 1,
  id: "s_abc123def456",
  name: "GitHub digest pipeline",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T11:42:13.421Z",
};

const state: State = {
  schemaVersion: 1,
  nodes: [
    { id: "n1", type: "input", value: null },
    { id: "n2", type: "flow", flow: "github/fetch-issues", params: {} },
    { id: "n3", type: "merge" },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
  ],
};

describe("renderFlowbuilderPrefix", () => {
  it("includes session id, name, updatedAt, node and edge counts", () => {
    const out = renderFlowbuilderPrefix({ manifest, state });
    expect(out).toContain("active session: s_abc123def456");
    expect(out).toContain('name="GitHub digest pipeline"');
    expect(out).toContain("2026-05-09T11:42");
    expect(out).toContain("3 nodes, 2 edges");
    expect(out).toContain("flowbuilder_get_state");
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/flowbuilder test -- prompt.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/flowbuilder/src/prompt.ts`:

```ts
import type { Manifest, State } from "./schema.js";

export function renderFlowbuilderPrefix(args: {
  manifest: Manifest;
  state: State;
}): string {
  const { manifest, state } = args;
  const updatedShort = manifest.updatedAt.slice(0, 16) + "Z";
  return [
    `[flowbuilder] active session: ${manifest.id}`,
    `manifest: name="${manifest.name}" updated=${updatedShort}`,
    `current state: ${state.nodes.length} nodes, ${state.edges.length} edges`,
    "call flowbuilder_get_state to read full state; call flowbuilder_set_state to write a new full state.",
  ].join("\n");
}
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test -- prompt.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder/src/prompt.ts packages/flowbuilder/src/prompt.test.ts
git commit -m "feat(flowbuilder): promptPrefix renderer"
```

---

### Task 10: Implement the rules-file content

**Files:**
- Create: `packages/flowbuilder/src/rules.ts`
- Test: `packages/flowbuilder/src/rules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/flowbuilder/src/rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FLOWBUILDER_RULES_PATH, renderFlowbuilderRules } from "./rules.js";

describe("rules", () => {
  it("rules path lives under .cursor/rules/", () => {
    expect(FLOWBUILDER_RULES_PATH).toBe(".cursor/rules/.flow-build-flowbuilder.mdc");
  });

  it("rules body documents the two MCP tools and the full-state contract", () => {
    const body = renderFlowbuilderRules();
    expect(body).toContain("flowbuilder_get_state");
    expect(body).toContain("flowbuilder_set_state");
    expect(body).toContain("FULL state");
    expect(body).toContain("schemaVersion");
    expect(body).toContain("rote flow");
  });

  it("rules body has alwaysApply frontmatter for cursor", () => {
    const body = renderFlowbuilderRules();
    expect(body.startsWith("---")).toBe(true);
    expect(body).toMatch(/alwaysApply:\s*true/);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/flowbuilder test -- rules.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/flowbuilder/src/rules.ts`:

```ts
export const FLOWBUILDER_RULES_PATH = ".cursor/rules/.flow-build-flowbuilder.mdc";

const BODY = `---
alwaysApply: true
---

# Flowbuilder

This session edits a flow graph. The graph lives at \`<flowbuilder-base>/sessions/<sessionId>/state.json\`. The session is fixed for the lifetime of this run; you cannot switch sessions.

Use the MCP tools registered as \`flowbuilder_get_state\` and \`flowbuilder_set_state\`.

## Tools

- \`flowbuilder_get_state()\` — read the current full state.
- \`flowbuilder_set_state({ state })\` — write the **full** state.

You must always pass the **complete** state to \`flowbuilder_set_state\`. Partial patches are not supported. To delete a node, omit it from the new \`nodes\` array; to remove an edge, omit it from \`edges\`.

## Schema

\`state.json\` shape (schemaVersion: 1):

\`\`\`json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "n1", "type": "input",  "value": <any> },
    { "id": "n2", "type": "flow",   "flow": "<category>/<name>", "params": { ... } },
    { "id": "n3", "type": "branch", "cond": "<expression>" },
    { "id": "n4", "type": "merge" },
    { "id": "n5", "type": "output", "value": <any> }
  ],
  "edges": [
    { "from": "n1", "to": "n2" }
  ]
}
\`\`\`

Constraints:

- Node ids are unique strings.
- Every \`edge.from\` and \`edge.to\` must reference an existing node id.
- A \`flow\` node's \`flow\` field must be a rote flow reference in \`<category>/<name>\` form (see the rote skill for details on listing and creating flows).
- \`params\` is free-form. The agent maps upstream output to downstream params at execution time; the file does not encode wiring beyond the edge graph.

## Workflow

1. Call \`flowbuilder_get_state\` to read the current graph.
2. Plan the change. Pick or create rote flows using the rote skill.
3. Build the next full state object.
4. Call \`flowbuilder_set_state({ state })\`.
5. If the tool returns \`{ ok: false, error }\`, fix and retry.

Do not run two agents against the same session. The harness assumes one writer per session.
`;

export function renderFlowbuilderRules(): string {
  return BODY;
}
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test -- rules.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder/src/rules.ts packages/flowbuilder/src/rules.test.ts
git commit -m "feat(flowbuilder): rules file content for the agent"
```

---

### Task 11: Implement `createFlowbuilderPlugin`

**Files:**
- Create: `packages/flowbuilder/src/plugin.ts`
- Modify: `packages/flowbuilder/src/index.ts`
- Test: `packages/flowbuilder/test/plugin.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `packages/flowbuilder/test/plugin.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createFlowbuilderPlugin } from "../src/plugin.js";
import { FLOWBUILDER_RULES_PATH } from "../src/rules.js";
import type { Logger, RuntimeContext } from "@flow-build/core";

let baseDir: string;
let cwd: string;
const sessionId = "s_abc123def456";

const validManifest = {
  schemaVersion: 1 as const,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const emptyState = {
  schemaVersion: 1 as const,
  nodes: [],
  edges: [],
};

function makeCtx(): RuntimeContext {
  const logger: Logger = { warn: vi.fn() };
  return {
    cwd,
    model: "test-model",
    runId: "run-1",
    signal: new AbortController().signal,
    logger,
    state: new Map(),
  };
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-plugin-base-"));
  cwd = mkdtempSync(join(tmpdir(), "flowbuilder-plugin-cwd-"));
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("flowbuilder plugin lifecycle", () => {
  it("preRun -> systemPrompt -> promptPrefix -> provideMcpServers -> tool call -> cleanup", async () => {
    const plugin = createFlowbuilderPlugin({ baseDir, sessionId });
    const ctx = makeCtx();

    expect(plugin.name).toBe("flowbuilder");

    await plugin.preRun!(ctx);
    expect(ctx.state.has("flowbuilder")).toBe(true);

    const sysContrib = await plugin.systemPrompt!(ctx);
    expect(sysContrib).toBeTruthy();
    expect(sysContrib!.rulesFile.relativePath).toBe(FLOWBUILDER_RULES_PATH);
    expect(sysContrib!.rulesFile.contents).toContain("flowbuilder_set_state");

    const prefix = await plugin.promptPrefix!(ctx);
    expect(prefix).toContain(sessionId);

    const servers = await plugin.provideMcpServers!(ctx);
    expect(servers.flowbuilder).toBeDefined();
    expect(servers.flowbuilder).toMatchObject({ type: "http" });
    const url = (servers.flowbuilder as { url: string }).url;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(transport);
    try {
      const setRes = await client.callTool({
        name: "flowbuilder_set_state",
        arguments: {
          state: {
            schemaVersion: 1,
            nodes: [{ id: "n1", type: "merge" }],
            edges: [],
          },
        },
      });
      const setText = (setRes.content as { type: string; text: string }[])[0]?.text ?? "";
      expect(JSON.parse(setText).ok).toBe(true);
    } finally {
      await client.close();
      await transport.close();
    }

    const writtenState = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "state.json"), "utf8"),
    );
    expect(writtenState.nodes).toEqual([{ id: "n1", type: "merge" }]);

    await plugin.cleanup!(ctx);

    const transport2 = new StreamableHTTPClientTransport(new URL(url));
    const client2 = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await expect(client2.connect(transport2)).rejects.toThrow();
  });

  it("preRun throws when session is missing", async () => {
    rmSync(join(baseDir, "sessions", sessionId), { recursive: true, force: true });
    const plugin = createFlowbuilderPlugin({ baseDir, sessionId });
    const ctx = makeCtx();
    await expect(plugin.preRun!(ctx)).rejects.toThrow(/session/i);
  });

  it("rules file written under cwd is reachable at FLOWBUILDER_RULES_PATH", async () => {
    const plugin = createFlowbuilderPlugin({ baseDir, sessionId });
    const ctx = makeCtx();
    await plugin.preRun!(ctx);
    const contrib = await plugin.systemPrompt!(ctx);
    expect(contrib!.rulesFile.relativePath).toBe(".cursor/rules/.flow-build-flowbuilder.mdc");
    await plugin.cleanup!(ctx);
    expect(existsSync(join(cwd, ".cursor"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --filter @flow-build/flowbuilder test -- plugin.integration`
Expected: FAIL — `createFlowbuilderPlugin` not exported.

- [ ] **Step 3: Implement**

Create `packages/flowbuilder/src/plugin.ts`:

```ts
import type { Plugin, RuntimeContext } from "@flow-build/core";
import type { McpServerConfig } from "@flow-build/core";
import { SessionManager, type LoadedSession } from "./session.js";
import { renderFlowbuilderPrefix } from "./prompt.js";
import { FLOWBUILDER_RULES_PATH, renderFlowbuilderRules } from "./rules.js";
import { startFlowbuilderMcpServer, type FlowbuilderMcpHandle } from "./mcp-server.js";

export type FlowbuilderPluginOptions = {
  baseDir: string;
  sessionId: string;
};

type StashedState = {
  session: SessionManager;
  loaded: LoadedSession;
  handle: FlowbuilderMcpHandle;
};

const STATE_KEY = "flowbuilder";

export function createFlowbuilderPlugin(opts: FlowbuilderPluginOptions): Plugin {
  if (!opts.baseDir || !opts.sessionId) {
    throw new Error("createFlowbuilderPlugin: baseDir and sessionId are required");
  }
  const { baseDir, sessionId } = opts;

  return {
    name: "flowbuilder",

    async preRun(ctx: RuntimeContext) {
      const session = new SessionManager({
        baseDir,
        sessionId,
        runId: ctx.runId,
      });
      const loaded = session.load();
      const handle = await startFlowbuilderMcpServer({ session });
      const stash: StashedState = { session, loaded, handle };
      ctx.state.set(STATE_KEY, stash);
    },

    async systemPrompt() {
      return {
        rulesFile: {
          relativePath: FLOWBUILDER_RULES_PATH,
          contents: renderFlowbuilderRules(),
        },
      };
    },

    async promptPrefix(ctx: RuntimeContext) {
      const stash = ctx.state.get(STATE_KEY) as StashedState | undefined;
      if (!stash) return undefined;
      return renderFlowbuilderPrefix({
        manifest: stash.loaded.manifest,
        state: stash.loaded.state,
      });
    },

    async provideMcpServers(ctx: RuntimeContext): Promise<Record<string, McpServerConfig>> {
      const stash = ctx.state.get(STATE_KEY) as StashedState | undefined;
      if (!stash) {
        throw new Error("flowbuilder: provideMcpServers called before preRun");
      }
      return {
        flowbuilder: { type: "http", url: stash.handle.url },
      };
    },

    async cleanup(ctx: RuntimeContext) {
      const stash = ctx.state.get(STATE_KEY) as StashedState | undefined;
      if (!stash) return;
      await stash.handle.close();
    },
  };
}
```

- [ ] **Step 4: Replace the placeholder index**

Overwrite `packages/flowbuilder/src/index.ts`:

```ts
export { createFlowbuilderPlugin } from "./plugin.js";
export type { FlowbuilderPluginOptions } from "./plugin.js";
export { FLOWBUILDER_RULES_PATH } from "./rules.js";
export {
  ManifestSchema,
  StateSchema,
  NodeSchema,
  EdgeSchema,
  type Manifest,
  type State,
  type Node,
  type Edge,
} from "./schema.js";
export {
  FlowbuilderError,
  FlowbuilderSessionMissingError,
  FlowbuilderSchemaError,
  FlowbuilderRefIntegrityError,
  FlowbuilderIOError,
  FlowbuilderUnsupportedVersion,
  FlowbuilderMcpStartError,
} from "./errors.js";
```

- [ ] **Step 5: Run the integration test to verify pass**

Run: `pnpm --filter @flow-build/flowbuilder test -- plugin.integration`
Expected: PASS, all three cases.

- [ ] **Step 6: Run all flowbuilder tests**

Run: `pnpm --filter @flow-build/flowbuilder test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/flowbuilder/src/plugin.ts packages/flowbuilder/src/index.ts packages/flowbuilder/test/plugin.integration.test.ts
git commit -m "feat(flowbuilder): assemble createFlowbuilderPlugin and export public surface"
```

---

## Phase 6 — CLI integration

### Task 12: Add `--session` and `--flowbuilder-base` flags to the CLI

**Files:**
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/package.json` (add `@flow-build/flowbuilder` dep)
- Test: `packages/cli/src/main.test.ts` (modify existing) **and/or** add a new file `packages/cli/src/main.flowbuilder.test.ts`

- [ ] **Step 1: Read the current `main.ts` to locate insertion points**

Run: `cat packages/cli/src/main.ts | head -120`

Note where `commander` defines the `run` subcommand options and where `plugins` is constructed inside `executeRun`.

- [ ] **Step 2: Write the failing test**

Add a new test file `packages/cli/src/main.flowbuilder.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let baseDir: string;
let cwd: string;
const sessionId = "s_abc123def456";

const manifest = {
  schemaVersion: 1,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};
const state = { schemaVersion: 1, nodes: [], edges: [] };

vi.mock("@flow-build/core", async () => {
  const actual = await vi.importActual<typeof import("@flow-build/core")>("@flow-build/core");
  return {
    ...actual,
    runPrompt: vi.fn(async (opts: { plugins?: { name: string }[] }) => {
      capturedPluginNames = (opts.plugins ?? []).map((p) => p.name);
      return { status: "completed" as const, finalText: "" };
    }),
  };
});

let capturedPluginNames: string[] = [];

function fakeStreams() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: { write: (s: string) => (out.push(s), true) } as unknown as NodeJS.WritableStream,
    stderr: { write: (s: string) => (err.push(s), true) } as unknown as NodeJS.WritableStream,
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

beforeEach(() => {
  capturedPluginNames = [];
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-cli-base-"));
  cwd = mkdtempSync(join(tmpdir(), "flowbuilder-cli-cwd-"));
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(state));
  process.env.CURSOR_API_KEY = "crsr_test";
  vi.resetModules();
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  delete process.env.CURSOR_API_KEY;
  vi.doUnmock("@flow-build/core");
});

describe("CLI flowbuilder integration", () => {
  it("registers flowbuilder plugin when --session and --flowbuilder-base provided", async () => {
    const { runCli } = await import("./main.js");
    const streams = fakeStreams();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: [
          "node",
          "flow-build",
          "run",
          "hello",
          "--cwd",
          cwd,
          "--session",
          sessionId,
          "--flowbuilder-base",
          baseDir,
        ],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: (code: number) => {
          throw new Error(`__exit:${code}`);
        },
      }),
    ).rejects.toThrow("__exit:0");
    expect(capturedPluginNames).toContain("flowbuilder");
    expect(capturedPluginNames).toContain("rote");
  });

  it("exits 1 with a usage message when --session is missing", async () => {
    const { runCli } = await import("./main.js");
    const streams = fakeStreams();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: [
          "node",
          "flow-build",
          "run",
          "hello",
          "--cwd",
          cwd,
          "--flowbuilder-base",
          baseDir,
        ],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: (code: number) => {
          throw new Error(`__exit:${code}`);
        },
      }),
    ).rejects.toThrow("__exit:1");
    expect(streams.err()).toMatch(/--session/);
  });

  it("exits 1 with a usage message when --flowbuilder-base is missing", async () => {
    const { runCli } = await import("./main.js");
    const streams = fakeStreams();
    const ctl = new AbortController();
    await expect(
      runCli({
        argv: [
          "node",
          "flow-build",
          "run",
          "hello",
          "--cwd",
          cwd,
          "--session",
          sessionId,
        ],
        stdout: streams.stdout,
        stderr: streams.stderr,
        isTTY: false,
        signal: ctl.signal,
        exit: (code: number) => {
          throw new Error(`__exit:${code}`);
        },
      }),
    ).rejects.toThrow("__exit:1");
    expect(streams.err()).toMatch(/--flowbuilder-base/);
  });
});
```

- [ ] **Step 3: Run the new test to verify failure**

Run: `pnpm --filter @flow-build/cli test -- main.flowbuilder.test`
Expected: FAIL — flags not recognized.

- [ ] **Step 4: Add `@flow-build/flowbuilder` to CLI deps**

Edit `packages/cli/package.json`. Add to `dependencies`:

```json
"@flow-build/flowbuilder": "workspace:*"
```

Run: `pnpm install`

- [ ] **Step 5: Implement the CLI changes**

Edit `packages/cli/src/main.ts`. Three changes.

1. Add an import at the top, next to the existing `createRotePlugin` import:

```ts
import { createFlowbuilderPlugin } from "@flow-build/flowbuilder";
```

2. Extend the `program.command("run")` definition (lines 30–40 in the current file) with two required options. The block should read in full:

```ts
  program
    .command("run")
    .argument("<prompt>", "prompt to send to the agent")
    .option("--cwd <path>", "working directory", process.cwd())
    .option("--model <id>", "model id", "composer-2")
    .option("--max-retries <n>", "max retry attempts", (v) => parseInt(v, 10), 3)
    .option("--no-retry", "disable retries (sets attempts=1)")
    .option("--verbose", "enable debug logs", false)
    .requiredOption("--session <id>", "flowbuilder session id")
    .requiredOption("--flowbuilder-base <dir>", "flowbuilder base directory")
    .action(async (prompt: string, opts: RunCmdOpts) => {
      await executeRun(prompt, opts, deps);
    });
```

The existing error handler in `runCli` already maps `commander.*` codes (including `commander.missingMandatoryOptionError`) to `deps.exit(1)`, so missing-flag exit code stays at 1 — no error-handler changes needed. Commander's standard message includes the option name (e.g. `error: required option '--session <id>' not specified`), which satisfies the `expect(...err()).toMatch(/--session/)` assertion in the test.

3. Update `RunCmdOpts` (currently lines 56–62) to include the two new fields:

```ts
type RunCmdOpts = {
  cwd: string;
  model: string;
  maxRetries: number;
  retry: boolean;
  verbose: boolean;
  session: string;
  flowbuilderBase: string;
};
```

4. In `executeRun`, replace the existing `plugins` construction (lines 92–93) with:

```ts
  const plugins: Plugin[] = [
    createRotePlugin({}),
    createFlowbuilderPlugin({
      baseDir: opts.flowbuilderBase,
      sessionId: opts.session,
    }),
  ];
```

The `FLOW_BUILD_DISABLE_PLUGINS === "1"` branch is removed entirely — the spec eliminates the disable env var. Existing tests that rely on it will be updated in Task 13.

- [ ] **Step 6: Run the new test to verify pass**

Run: `pnpm --filter @flow-build/cli test -- main.flowbuilder.test`
Expected: PASS, all three cases.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/main.ts packages/cli/src/main.flowbuilder.test.ts packages/cli/package.json pnpm-lock.yaml
git commit -m "feat(cli): wire flowbuilder plugin behind --session and --flowbuilder-base"
```

---

### Task 13: Update existing CLI tests for the new required flags

**Files:**
- Modify: `packages/cli/src/main.test.ts`
- Modify: `packages/cli/src/smoke.test.ts` (the file from git status)
- Create: `packages/cli/src/test-helpers/flowbuilder-fixture.ts`

The new `--session` and `--flowbuilder-base` flags are required at all times. Every existing test that invokes `runCli` must set up a session directory and pass both flags.

- [ ] **Step 1: Create the fixture helper**

Create `packages/cli/src/test-helpers/flowbuilder-fixture.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FlowbuilderFixture = {
  baseDir: string;
  sessionId: string;
  cleanup: () => void;
};

export function setupFlowbuilderFixture(prefix = "flow-build-cli-fb-"): FlowbuilderFixture {
  const baseDir = mkdtempSync(join(tmpdir(), prefix));
  const sessionId = "s_test_session1";
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  const now = "2026-05-09T10:00:00.000Z";
  writeFileSync(
    join(sdir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: sessionId,
      name: "Test",
      description: "",
      createdAt: now,
      updatedAt: now,
    }),
  );
  writeFileSync(
    join(sdir, "state.json"),
    JSON.stringify({ schemaVersion: 1, nodes: [], edges: [] }),
  );
  return {
    baseDir,
    sessionId,
    cleanup: () => {
      // caller is expected to rmSync as part of afterEach
    },
  };
}
```

Note: the helper mints a fixture id `s_test_session1`. That matches the manifest id regex `^s_[0-9a-z]{12}$` (12 chars after `s_`).

- [ ] **Step 2: Update `packages/cli/src/main.test.ts`**

Find every call to `runCli({ argv: [...] })` in the file. For each one:

1. Inject a fixture in `beforeEach` and clean up in `afterEach`:

```ts
import { setupFlowbuilderFixture, type FlowbuilderFixture } from "./test-helpers/flowbuilder-fixture.js";
import { rmSync } from "node:fs";

let fb: FlowbuilderFixture;

beforeEach(() => {
  fb = setupFlowbuilderFixture();
  // ... other existing setup ...
});

afterEach(() => {
  rmSync(fb.baseDir, { recursive: true, force: true });
  // ... other existing teardown ...
});
```

2. In every `argv` array, append `--session`, `fb.sessionId`, `--flowbuilder-base`, `fb.baseDir`. Example:

```ts
argv: [
  "node",
  "flow-build",
  "run",
  "hello",
  "--cwd",
  dir,
  "--session",
  fb.sessionId,
  "--flowbuilder-base",
  fb.baseDir,
],
```

If the test is asserting an error path that expects the run to exit before flag validation runs, leave it alone — those exits happen earlier than the commander parser.

If any test exists specifically to assert behavior when `FLOW_BUILD_DISABLE_PLUGINS=1`, delete it. The disable env var is gone per the spec.

- [ ] **Step 3: Update `packages/cli/src/smoke.test.ts`**

Apply the same fixture pattern. The smoke test currently shells out to a real `flow-build run`; ensure both flags are passed and the fixture dir is cleaned up.

- [ ] **Step 4: Run the full CLI test suite**

Run: `pnpm --filter @flow-build/cli test`
Expected: all green. If anything still references `FLOW_BUILD_DISABLE_PLUGINS`, remove the reference.

- [ ] **Step 5: Run the full workspace test suite**

Run: `pnpm -r test`
Expected: all packages green.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/main.test.ts packages/cli/src/smoke.test.ts packages/cli/src/test-helpers/flowbuilder-fixture.ts
git commit -m "test(cli): pass --session and --flowbuilder-base in every runCli invocation"
```

---

## Phase 7 — Final verification

### Task 14: Workspace-wide typecheck and test

**Files:** none (verification only)

- [ ] **Step 1: Typecheck every package**

Run: `pnpm -r typecheck`
Expected: no errors.

If typecheck fails, fix the offending file in place and re-run. Common cause after this plan: re-exports in `packages/flowbuilder/src/index.ts` that reference unexported names — adjust the index file rather than weakening type strictness.

- [ ] **Step 2: Run every test**

Run: `pnpm -r test`
Expected: every package green.

- [ ] **Step 3: Build every package**

Run: `pnpm -r build`
Expected: every package compiles to `dist/`.

- [ ] **Step 4: Smoke run (manual sanity check)**

Set up a temporary session and invoke the CLI:

```bash
TMP=$(mktemp -d)
SID="s_smoketest1234"
mkdir -p "$TMP/sessions/$SID"
cat > "$TMP/sessions/$SID/manifest.json" <<JSON
{
  "schemaVersion": 1,
  "id": "$SID",
  "name": "smoke",
  "description": "",
  "createdAt": "2026-05-09T10:00:00.000Z",
  "updatedAt": "2026-05-09T10:00:00.000Z"
}
JSON
echo '{"schemaVersion":1,"nodes":[],"edges":[]}' > "$TMP/sessions/$SID/state.json"

CURSOR_API_KEY=<your-key> pnpm --filter @flow-build/cli exec -- flow-build run \
  "list the flowbuilder tools you can see" \
  --cwd "$TMP" \
  --session "$SID" \
  --flowbuilder-base "$TMP"
```

Expected: the agent's response references both `flowbuilder_get_state` and `flowbuilder_set_state` — confirming the MCP server is reachable and the rules file landed.

If the agent does not see the tools, recheck `provideMcpServers` actually returns the URL and `runPrompt` actually forwards it. Inspect the captured agent options by adding a `console.log` in `runPrompt` (revert before commit).

- [ ] **Step 5: No new commit unless something was fixed**

If Step 1–3 found anything to fix, commit each fix as its own message under the convention used in earlier tasks. If everything passed first try, this task closes without a commit.

---

## Self-Review Checklist (run before handoff)

After completing all tasks, the implementer should re-read the spec at `docs/superpowers/specs/2026-05-09-flowbuilder-harness-design.md` and confirm each requirement maps to a task above:

| Spec section                       | Tasks that cover it |
| ---------------------------------- | ------------------- |
| Architecture / package layout      | 4, 11               |
| Disk layout                        | 7                   |
| Manifest schema                    | 5                   |
| State schema (nodes, edges, types) | 5                   |
| Ref integrity                      | 5                   |
| MCP server lifecycle               | 8, 11               |
| Tool: `flowbuilder_get_state`      | 8                   |
| Tool: `flowbuilder_set_state`      | 8                   |
| Plugin hooks                       | 11                  |
| Composition with rote              | 12                  |
| CLI wiring + required flags        | 12, 13              |
| Atomic writes                      | 7                   |
| Schema versioning                  | 5, 7                |
| Error taxonomy                     | 6                   |
| Tests (unit + integration)         | 5, 6, 7, 8, 9, 10, 11, 12, 13 |
| Dependencies                       | 4                   |
| Plugin contract extension (core)   | 1, 2, 3             |

If any spec section has no row, add a task for it before declaring the plan complete.
