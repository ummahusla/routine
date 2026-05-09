# LLM Blocks & Graph Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make flowbuilder graphs executable end-to-end. Add an `llm` node type, an `@flow-build/engine` package (sequential topo executor, fail-fast), MCP tools to drive runs from the agent (`flowbuilder_execute_flow` + `flowbuilder_get_run_result`), and a UI Play button + run sidebar driven by the same engine through IPC.

**Architecture:** New `@flow-build/engine` package owns execution: pure-ish, electron-free, takes injected `cursorClient` and `roteCmd` for testability. Both MCP tools and UI IPC funnel through one `RunRegistry` (main process) → `createRun()` (engine). Per-run state lives at `sessions/<sid>/runs/<runId>/{manifest,events.jsonl,outputs,snapshot}.json`. Edge envelope is `{ text, data? }`. LLM blocks are single-shot prompts with `{{input}}` / `{{input.data.X}}` template substitution. Branch/Merge nodes throw "not yet supported" before any node runs.

**Tech Stack:** TypeScript (ESM), zod (schema + IPC validation), vitest (tests), Cursor SDK (single-shot LLM via `cursorSingleShot` adapter), `child_process.spawn` (rote CLI), Electron IPC + preload, React 18 (renderer).

**Spec:** `docs/superpowers/specs/2026-05-09-llm-blocks-and-graph-execution-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `packages/engine/package.json` | Workspace package manifest |
| `packages/engine/tsconfig.json` | TS config extending base |
| `packages/engine/vitest.config.ts` | Test runner config |
| `packages/engine/src/index.ts` | Public exports |
| `packages/engine/src/types.ts` | `Envelope`, `RunStatus`, `NodeRunStatus`, `RunEvent`, `Run`, `RunManifest` |
| `packages/engine/src/topo.ts` | Topo sort + linear-only validator |
| `packages/engine/src/template.ts` | `{{input}}` / `{{input.data.X}}` substitution |
| `packages/engine/src/runStore.ts` | Per-run dir IO (manifest, events.jsonl, outputs, snapshot) |
| `packages/engine/src/cursorSingleShot.ts` | Cursor SDK adapter, exposing only single-shot completion |
| `packages/engine/src/executors/input.ts` | Input node executor |
| `packages/engine/src/executors/output.ts` | Output node executor |
| `packages/engine/src/executors/flow.ts` | Spawns `rote flow run` subprocess |
| `packages/engine/src/executors/llm.ts` | Calls `cursorSingleShot` with templated prompt |
| `packages/engine/src/engine.ts` | `createRun()` main executor |
| `packages/engine/src/errors.ts` | Typed engine errors |
| `packages/engine/test/topo.test.ts` | Topo + validator tests |
| `packages/engine/test/template.test.ts` | Template substitution tests |
| `packages/engine/test/runStore.test.ts` | Run-store roundtrip tests |
| `packages/engine/test/engine.linear.test.ts` | input → llm → output |
| `packages/engine/test/engine.flow.test.ts` | input → flow → output (fixture script) |
| `packages/engine/test/engine.failfast.test.ts` | Mid-run failure → skip downstream |
| `packages/engine/test/engine.cancel.test.ts` | AbortSignal mid-run |
| `packages/engine/test/engine.fanin.test.ts` | Two upstreams concat in topo order |
| `src/main/runRegistry.ts` | Live runs map + subscriptions + `waitForRunEnd` |
| `src/main/runRegistry.test.ts` | Registry unit tests |
| `src/main/ipc/run.ts` | `run:*` IPC handlers |
| `src/main/ipc/run.test.ts` | IPC handler tests |
| `src/renderer/src/components/RunSidebar.tsx` | Past-runs list |

### Modified files

| Path | Changes |
|---|---|
| `package.json` (root) | Add `@flow-build/engine` to workspace dep tree where consumed |
| `pnpm-workspace.yaml` | Already globs `packages/*` — no edit needed |
| `packages/flowbuilder/package.json` | Add `@flow-build/engine` workspace dep |
| `packages/flowbuilder/src/schema.ts` | Add `LlmNodeSchema` to discriminated union |
| `packages/flowbuilder/src/schema.test.ts` | Add llm node tests + backward-compat test |
| `packages/flowbuilder/src/mcp-server.ts` | Add `flowbuilder_execute_flow` + `flowbuilder_get_run_result` tools, accept `runStarter` + `runResultReader` injections |
| `packages/flowbuilder/src/mcp-server.test.ts` | Cover new tools |
| `packages/flowbuilder/src/rules.ts` | Document `llm` node, `{{input}}` syntax, execute→get_result pattern |
| `packages/flowbuilder/src/rules.test.ts` | Assert new sections present |
| `packages/flowbuilder/src/plugin.ts` | Thread `runStarter` / `runResultReader` injections to `startFlowbuilderMcpServer` |
| `src/main/ipc/schemas.ts` | Add `Run*InputSchema` zod schemas |
| `src/main/ipc/schemas.test.ts` | Strict-rejection tests for new schemas |
| `src/main/index.ts` | Construct `RunRegistry`, register run IPC, wire flowbuilder plugin runStarter |
| `src/preload/index.ts` | Add `window.api.run.*` |
| `src/renderer/src/types.ts` | `"llm"` in `NodeType` union |
| `src/renderer/src/data/typeColors.ts` | Color for llm |
| `src/renderer/src/data/icons.tsx` | Icon for llm |
| `src/renderer/src/App.tsx` | `SMART_ADD_ITEMS` entry; rewire `handleRun` → real engine via IPC |
| `src/renderer/src/components/TopBar.tsx` | Play button |
| `src/renderer/src/components/FlowNode.tsx` | Render llm block with streaming text + error badge |
| `docs/smoke.md` | Manual smoke flow for graph execution |

---

## Task 1: Scaffold `@flow-build/engine` package

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/index.ts`

- [ ] **Step 1: Create `packages/engine/package.json`**

```json
{
  "name": "@flow-build/engine",
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
    "@flow-build/flowbuilder": "workspace:*",
    "@cursor/sdk": "^1.0.12",
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Create `packages/engine/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/engine/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create `packages/engine/src/index.ts` placeholder**

```ts
export {};
```

- [ ] **Step 5: Install + typecheck**

Run: `pnpm install && pnpm -F @flow-build/engine typecheck`
Expected: install succeeds; typecheck passes (empty package).

- [ ] **Step 6: Commit**

```bash
git add packages/engine pnpm-lock.yaml
git commit -m "feat(engine): scaffold @flow-build/engine package"
```

---

## Task 2: Engine types

**Files:**
- Create: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Create `packages/engine/src/types.ts`**

```ts
import type { State } from "@flow-build/flowbuilder";

export type Envelope = {
  text: string;
  data?: unknown;
};

export type RunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type NodeRunStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped";

export type RunEvent =
  | { type: "run_start"; runId: string; sessionId: string; startedAt: string }
  | { type: "node_start"; runId: string; nodeId: string; nodeType: string; at: string }
  | { type: "node_text"; runId: string; nodeId: string; chunk: string }
  | {
      type: "node_end";
      runId: string;
      nodeId: string;
      status: NodeRunStatus;
      output?: Envelope;
      error?: string;
      at: string;
    }
  | {
      type: "run_end";
      runId: string;
      status: RunStatus;
      finalOutput?: Envelope;
      error?: string;
      at: string;
    };

export type RunManifest = {
  runId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  status: RunStatus;
  error?: string;
};

export type Run = {
  runId: string;
  sessionId: string;
  status: RunStatus;
  events: AsyncIterable<RunEvent>;
  cancel(): Promise<void>;
  done: Promise<{ status: RunStatus; finalOutput?: Envelope; error?: string }>;
};

export type CursorClient = {
  singleShot(opts: {
    prompt: string;
    system?: string;
    model: string;
    maxTokens: number;
    temperature: number;
    signal?: AbortSignal;
  }): {
    chunks: AsyncIterable<string>;
    done: Promise<{ text: string }>;
  };
};

export type CreateRunOptions = {
  sessionId: string;
  baseDir: string;
  state: State;
  cursorClient: CursorClient;
  roteCmd?: string;
  signal?: AbortSignal;
};
```

- [ ] **Step 2: Update `packages/engine/src/index.ts` to re-export types**

```ts
export type {
  Envelope,
  RunStatus,
  NodeRunStatus,
  RunEvent,
  RunManifest,
  Run,
  CursorClient,
  CreateRunOptions,
} from "./types.js";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @flow-build/engine typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): public types — Envelope, RunEvent, Run, CursorClient"
```

---

## Task 3: Topo sort + linear-only validator

**Files:**
- Create: `packages/engine/src/topo.ts`
- Create: `packages/engine/test/topo.test.ts`
- Create: `packages/engine/src/errors.ts`

- [ ] **Step 1: Create `packages/engine/src/errors.ts`**

```ts
export type EngineErrorCode =
  | "UNSUPPORTED_NODE_TYPE"
  | "GRAPH_HAS_CYCLE"
  | "GRAPH_INVALID"
  | "EXEC_FAILED"
  | "CANCELLED";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
```

- [ ] **Step 2: Create the failing test `packages/engine/test/topo.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { State } from "@flow-build/flowbuilder";
import { topoOrder } from "../src/topo.js";
import { EngineError } from "../src/errors.js";

function st(nodes: State["nodes"], edges: State["edges"]): State {
  return { schemaVersion: 1, nodes, edges };
}

describe("topoOrder", () => {
  it("orders linear input → flow → output", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "flow", flow: "x/y", params: {} },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    );
    expect(topoOrder(s)).toEqual(["a", "b", "c"]);
  });

  it("orders fan-in correctly (both upstreams precede downstream)", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "input", value: "y" },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "c" },
        { from: "b", to: "c" },
      ],
    );
    const order = topoOrder(s);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  it("throws UNSUPPORTED_NODE_TYPE on branch", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "branch", cond: "true" },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    );
    let caught: unknown;
    try { topoOrder(s); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(EngineError);
    expect((caught as EngineError).code).toBe("UNSUPPORTED_NODE_TYPE");
  });

  it("throws UNSUPPORTED_NODE_TYPE on merge", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "merge" },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    );
    expect(() => topoOrder(s)).toThrowError(EngineError);
  });

  it("throws GRAPH_HAS_CYCLE on cycle", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "flow", flow: "x/y", params: {} },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    );
    let caught: unknown;
    try { topoOrder(s); } catch (e) { caught = e; }
    expect((caught as EngineError).code).toBe("GRAPH_HAS_CYCLE");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F @flow-build/engine test`
Expected: FAIL — module `../src/topo.js` not found.

- [ ] **Step 4: Implement `packages/engine/src/topo.ts`**

```ts
import type { State } from "@flow-build/flowbuilder";
import { EngineError } from "./errors.js";

const UNSUPPORTED = new Set(["branch", "merge"]);

export function topoOrder(state: State): string[] {
  for (const node of state.nodes) {
    if (UNSUPPORTED.has(node.type)) {
      throw new EngineError(
        "UNSUPPORTED_NODE_TYPE",
        `node ${node.id} has unsupported type '${node.type}' (branch/merge are deferred to a future spec)`,
      );
    }
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of state.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of state.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue: string[] = [];
  for (const [id, deg] of incoming) if (deg === 0) queue.push(id);
  queue.sort();

  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const deg = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== state.nodes.length) {
    throw new EngineError(
      "GRAPH_HAS_CYCLE",
      `graph has a cycle (resolved ${order.length} of ${state.nodes.length} nodes)`,
    );
  }
  return order;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm -F @flow-build/engine test`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): topo sort with linear-only validator"
```

---

## Task 4: Template substitution

**Files:**
- Create: `packages/engine/src/template.ts`
- Create: `packages/engine/test/template.test.ts`

- [ ] **Step 1: Create the failing test `packages/engine/test/template.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { substitute } from "../src/template.js";

describe("substitute", () => {
  it("replaces {{input}} with envelope.text", () => {
    expect(substitute("hello {{input}}!", { text: "world" }))
      .toBe("hello world!");
  });

  it("tolerates whitespace inside braces", () => {
    expect(substitute("{{ input }}", { text: "x" })).toBe("x");
  });

  it("replaces {{input.data}} with JSON-stringified data", () => {
    expect(substitute("data={{input.data}}", { text: "", data: { a: 1 } }))
      .toBe('data={"a":1}');
  });

  it("returns empty string for {{input.data}} when data is undefined", () => {
    expect(substitute("[{{input.data}}]", { text: "" })).toBe("[]");
  });

  it("walks dotted paths into data", () => {
    const env = { text: "", data: { user: { name: "alice" } } };
    expect(substitute("hi {{input.data.user.name}}", env)).toBe("hi alice");
  });

  it("returns empty string for missing path", () => {
    expect(substitute("[{{input.data.missing}}]", { text: "", data: {} }))
      .toBe("[]");
  });

  it("string-coerces non-string values at path", () => {
    expect(substitute("n={{input.data.n}}", { text: "", data: { n: 42 } }))
      .toBe("n=42");
  });

  it("leaves unrelated {{xxx}} alone", () => {
    expect(substitute("{{other}} {{input}}", { text: "X" }))
      .toBe("{{other}} X");
  });

  it("handles multiple substitutions in one string", () => {
    expect(substitute("{{input}} and {{input.data.x}}", { text: "T", data: { x: 1 } }))
      .toBe("T and 1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @flow-build/engine test template`
Expected: FAIL — module `../src/template.js` not found.

- [ ] **Step 3: Implement `packages/engine/src/template.ts`**

```ts
import type { Envelope } from "./types.js";

const TOKEN = /\{\{\s*(input(?:\.data(?:\.[a-zA-Z_][\w]*)*)?)\s*\}\}/g;

function valueAtPath(env: Envelope, segments: string[]): unknown {
  if (segments.length === 0) return env.text;
  if (segments[0] !== "data") return undefined;
  if (env.data === undefined) return undefined;
  let cur: unknown = env.data;
  for (let i = 1; i < segments.length; i++) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[segments[i]];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function substitute(template: string, env: Envelope): string {
  return template.replace(TOKEN, (_match, expr: string) => {
    const segments = expr.split(".").slice(1); // drop leading "input"
    if (expr === "input") return env.text;
    if (expr === "input.data") {
      return env.data === undefined ? "" : JSON.stringify(env.data);
    }
    return stringify(valueAtPath(env, segments));
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm -F @flow-build/engine test template`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): template substitution for {{input}} / {{input.data.X}}"
```

---

## Task 5: Run store (per-run dir IO)

**Files:**
- Create: `packages/engine/src/runStore.ts`
- Create: `packages/engine/test/runStore.test.ts`

- [ ] **Step 1: Create the failing test `packages/engine/test/runStore.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initRunDir,
  appendEvent,
  writeOutputs,
  writeManifest,
  readRunResult,
  listRuns,
} from "../src/runStore.js";
import type { RunEvent, RunManifest } from "../src/types.js";

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "engine-runstore-"));
});

describe("runStore", () => {
  it("initRunDir creates directory + writes snapshot + initial manifest", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({
      baseDir,
      sessionId: "s1",
      runId: "r1",
      startedAt: "2026-01-01T00:00:00.000Z",
      state,
    });
    const dir = join(baseDir, "sessions", "s1", "runs", "r1");
    expect(existsSync(dir)).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf8"))).toEqual(state);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as RunManifest;
    expect(m.runId).toBe("r1");
    expect(m.status).toBe("running");
  });

  it("appendEvent writes one JSON line per call", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "t", state });
    const ev1: RunEvent = { type: "run_start", runId: "r1", sessionId: "s1", startedAt: "t" };
    const ev2: RunEvent = { type: "run_end", runId: "r1", status: "succeeded", at: "t2" };
    await appendEvent(baseDir, "s1", "r1", ev1);
    await appendEvent(baseDir, "s1", "r1", ev2);
    const path = join(baseDir, "sessions", "s1", "runs", "r1", "events.jsonl");
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(ev1);
    expect(JSON.parse(lines[1])).toEqual(ev2);
  });

  it("writeOutputs / writeManifest persist final state", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "t", state });
    await writeOutputs(baseDir, "s1", "r1", { n1: { text: "hi" } });
    await writeManifest(baseDir, "s1", "r1", {
      runId: "r1", sessionId: "s1", startedAt: "t", endedAt: "t2", status: "succeeded",
    });
    const result = await readRunResult(baseDir, "s1", "r1");
    expect(result.manifest.status).toBe("succeeded");
    expect(result.outputs).toEqual({ n1: { text: "hi" } });
  });

  it("listRuns returns manifests sorted newest-first", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "2026-01-01T00:00:00.000Z", state });
    await initRunDir({ baseDir, sessionId: "s1", runId: "r2", startedAt: "2026-01-02T00:00:00.000Z", state });
    const runs = await listRuns(baseDir, "s1");
    expect(runs.map((r) => r.runId)).toEqual(["r2", "r1"]);
  });

  it("readRunResult returns running status when manifest still in-flight", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "t", state });
    const r = await readRunResult(baseDir, "s1", "r1");
    expect(r.manifest.status).toBe("running");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @flow-build/engine test runStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/engine/src/runStore.ts`**

```ts
import { existsSync } from "node:fs";
import { mkdir, appendFile, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { State } from "@flow-build/flowbuilder";
import type { Envelope, RunEvent, RunManifest } from "./types.js";

function runDir(baseDir: string, sessionId: string, runId: string): string {
  return join(baseDir, "sessions", sessionId, "runs", runId);
}

export async function initRunDir(opts: {
  baseDir: string;
  sessionId: string;
  runId: string;
  startedAt: string;
  state: State;
}): Promise<void> {
  const dir = runDir(opts.baseDir, opts.sessionId, opts.runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "snapshot.json"), `${JSON.stringify(opts.state, null, 2)}\n`);
  const manifest: RunManifest = {
    runId: opts.runId,
    sessionId: opts.sessionId,
    startedAt: opts.startedAt,
    status: "running",
  };
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(dir, "events.jsonl"), "");
}

export async function appendEvent(
  baseDir: string,
  sessionId: string,
  runId: string,
  event: RunEvent,
): Promise<void> {
  const path = join(runDir(baseDir, sessionId, runId), "events.jsonl");
  await appendFile(path, `${JSON.stringify(event)}\n`);
}

export async function writeOutputs(
  baseDir: string,
  sessionId: string,
  runId: string,
  outputs: Record<string, Envelope>,
): Promise<void> {
  const path = join(runDir(baseDir, sessionId, runId), "outputs.json");
  await writeFile(path, `${JSON.stringify(outputs, null, 2)}\n`);
}

export async function writeManifest(
  baseDir: string,
  sessionId: string,
  runId: string,
  manifest: RunManifest,
): Promise<void> {
  const path = join(runDir(baseDir, sessionId, runId), "manifest.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export type RunResult = {
  manifest: RunManifest;
  events: RunEvent[];
  outputs: Record<string, Envelope>;
};

export async function readRunResult(
  baseDir: string,
  sessionId: string,
  runId: string,
): Promise<RunResult> {
  const dir = runDir(baseDir, sessionId, runId);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as RunManifest;
  const eventsRaw = await readFile(join(dir, "events.jsonl"), "utf8");
  const events: RunEvent[] = eventsRaw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as RunEvent);
  const outputsPath = join(dir, "outputs.json");
  const outputs: Record<string, Envelope> = existsSync(outputsPath)
    ? (JSON.parse(await readFile(outputsPath, "utf8")) as Record<string, Envelope>)
    : {};
  return { manifest, events, outputs };
}

export async function listRuns(baseDir: string, sessionId: string): Promise<RunManifest[]> {
  const root = join(baseDir, "sessions", sessionId, "runs");
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const out: RunManifest[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const mp = join(root, e.name, "manifest.json");
    if (!existsSync(mp)) continue;
    try {
      out.push(JSON.parse(await readFile(mp, "utf8")) as RunManifest);
    } catch {
      // ignore malformed run dirs
    }
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm -F @flow-build/engine test runStore`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): run store — per-run dir IO + read/list helpers"
```

---

## Task 6: Cursor single-shot adapter

**Files:**
- Create: `packages/engine/src/cursorSingleShot.ts`

This task has no unit test of its own — the adapter is exercised end-to-end by the LLM-executor test (Task 10) using a mock `CursorClient`. The real Cursor SDK call is verified manually during smoke (Task 28).

- [ ] **Step 1: Implement `packages/engine/src/cursorSingleShot.ts`**

```ts
import { Agent } from "@cursor/sdk";
import type { CursorClient } from "./types.js";

export function makeCursorClient(): CursorClient {
  return {
    singleShot({ prompt, system, model, maxTokens, temperature, signal }) {
      const queue: string[] = [];
      let resolveDone!: (v: { text: string }) => void;
      let rejectDone!: (e: unknown) => void;
      const done = new Promise<{ text: string }>((res, rej) => {
        resolveDone = res;
        rejectDone = rej;
      });
      let textNotifier: (() => void) | null = null;
      let finished = false;
      const fullText: string[] = [];

      const chunks: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          while (true) {
            while (queue.length) yield queue.shift()!;
            if (finished) return;
            await new Promise<void>((r) => (textNotifier = r));
            textNotifier = null;
          }
        },
      };

      (async () => {
        try {
          const agent = await Agent.create({
            model,
            // single-shot: no plugins, no extra tools
          });
          const stream = agent.send({
            input: prompt,
            ...(system ? { systemPrompt: system } : {}),
            maxTokens,
            temperature,
            ...(signal ? { signal } : {}),
          });
          for await (const ev of stream) {
            if (signal?.aborted) break;
            // Cursor SDK emits typed events; only forward text-like ones.
            // Other event types (tool-call, thinking, status) are ignored —
            // single-shot mode shouldn't produce them.
            if ((ev as { type?: string }).type === "text") {
              const t = (ev as { text?: string }).text ?? "";
              if (t.length > 0) {
                queue.push(t);
                fullText.push(t);
                textNotifier?.();
              }
            }
          }
          await agent.close().catch(() => {});
          finished = true;
          textNotifier?.();
          resolveDone({ text: fullText.join("") });
        } catch (e) {
          finished = true;
          textNotifier?.();
          rejectDone(e);
        }
      })();

      return { chunks, done };
    },
  };
}
```

- [ ] **Step 2: Re-export from `packages/engine/src/index.ts`**

```ts
export type {
  Envelope,
  RunStatus,
  NodeRunStatus,
  RunEvent,
  RunManifest,
  Run,
  CursorClient,
  CreateRunOptions,
} from "./types.js";
export { makeCursorClient } from "./cursorSingleShot.js";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @flow-build/engine typecheck`
Expected: PASS.

> If typecheck fails because Cursor SDK's `Agent.send` shape doesn't match the call above, adjust the call site to the actual SDK shape (`packages/core/src/run.ts` is a working reference). The contract this file presents externally — `CursorClient.singleShot({...})` — must be preserved.

- [ ] **Step 4: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): Cursor SDK single-shot adapter"
```

---

## Task 7: Input executor

**Files:**
- Create: `packages/engine/src/executors/input.ts`

- [ ] **Step 1: Implement `packages/engine/src/executors/input.ts`**

```ts
import type { Node } from "@flow-build/flowbuilder";
import type { Envelope } from "../types.js";

export function executeInput(node: Extract<Node, { type: "input" }>): Envelope {
  const value = node.value;
  return {
    text: value === undefined || value === null ? "" : typeof value === "string" ? value : String(value),
    data: value,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @flow-build/engine typecheck`
Expected: PASS.

> No standalone test — exercised by `engine.linear.test.ts` in Task 11.

- [ ] **Step 3: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): input node executor"
```

---

## Task 8: Output executor

**Files:**
- Create: `packages/engine/src/executors/output.ts`

- [ ] **Step 1: Implement `packages/engine/src/executors/output.ts`**

```ts
import type { Envelope } from "../types.js";

export function executeOutput(input: Envelope): Envelope {
  // pure passthrough — output is a sink; the engine treats it as the final node
  return { text: input.text, ...(input.data !== undefined ? { data: input.data } : {}) };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): output node executor"
```

---

## Task 9: Flow executor (rote subprocess)

**Files:**
- Create: `packages/engine/src/executors/flow.ts`
- Create: `packages/engine/test/flow.test.ts`
- Create: `packages/engine/test/fixtures/echo-rote.mjs`

The fixture is a node script we point `roteCmd` at. It echoes argv-derived JSON to stdout, simulating a rote flow that returns structured data.

- [ ] **Step 1: Create the fixture `packages/engine/test/fixtures/echo-rote.mjs`**

```js
#!/usr/bin/env node
// Stand-in for `rote`: echoes argv as JSON to stdout, exits 0.
// Usage: echo-rote.mjs flow run <flowRef> [--key=val ...]
const args = process.argv.slice(2);
const out = { argv: args };
process.stdout.write(JSON.stringify(out));
process.exit(0);
```

- [ ] **Step 2: Create the failing test `packages/engine/test/flow.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { executeFlow } from "../src/executors/flow.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "echo-rote.mjs");

describe("executeFlow", () => {
  it("spawns roteCmd with flow run argv, captures stdout, parses JSON into data", async () => {
    const env = await executeFlow({
      node: { id: "f1", type: "flow", flow: "github/list", params: { owner: "alice" } },
      input: { text: "" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
    });
    expect(env.text).toContain('"argv"');
    const data = env.data as { argv: string[] };
    expect(data.argv).toEqual(["flow", "run", "github/list", "--owner=alice"]);
  });

  it("substitutes {{input}} into string params before spawn", async () => {
    const env = await executeFlow({
      node: {
        id: "f1",
        type: "flow",
        flow: "x/y",
        params: { who: "{{input}}" },
      },
      input: { text: "world" },
      roteCmd: "node",
      roteArgsPrefix: [fixture],
    });
    const data = env.data as { argv: string[] };
    expect(data.argv).toContain("--who=world");
  });

  it("throws on non-zero exit, error includes stderr", async () => {
    // /usr/bin/false exits non-zero with no output — portable failure path
    await expect(
      executeFlow({
        node: { id: "f1", type: "flow", flow: "x/y", params: {} },
        input: { text: "" },
        roteCmd: "false",
      }),
    ).rejects.toThrow(/exit/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F @flow-build/engine test flow`
Expected: FAIL — module `../src/executors/flow.js` not found.

- [ ] **Step 4: Implement `packages/engine/src/executors/flow.ts`**

```ts
import { spawn } from "node:child_process";
import type { Node } from "@flow-build/flowbuilder";
import type { Envelope } from "../types.js";
import { substitute } from "../template.js";

export type ExecuteFlowOpts = {
  node: Extract<Node, { type: "flow" }>;
  input: Envelope;
  roteCmd: string;
  roteArgsPrefix?: string[];     // for testing — prepend args before "flow run ..."
  signal?: AbortSignal;
};

export async function executeFlow(opts: ExecuteFlowOpts): Promise<Envelope> {
  const argv: string[] = [
    ...(opts.roteArgsPrefix ?? []),
    "flow",
    "run",
    opts.node.flow,
  ];
  for (const [k, v] of Object.entries(opts.node.params)) {
    const resolved = typeof v === "string" ? substitute(v, opts.input) : JSON.stringify(v);
    argv.push(`--${k}=${resolved}`);
  }

  return new Promise<Envelope>((resolve, reject) => {
    const child = spawn(opts.roteCmd, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    if (opts.signal) {
      const onAbort = () => child.kill("SIGTERM");
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`rote subprocess exit ${code}: ${stderr.trim() || "<no stderr>"}`));
        return;
      }
      const env: Envelope = { text: stdout };
      try {
        env.data = JSON.parse(stdout);
      } catch {
        // best-effort — leave data undefined
      }
      resolve(env);
    });
  });
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm -F @flow-build/engine test flow`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): flow node executor — spawn rote subprocess"
```

---

## Task 10: LLM executor

**Files:**
- Create: `packages/engine/src/executors/llm.ts`
- Create: `packages/engine/test/llm.test.ts`

- [ ] **Step 1: Create the failing test `packages/engine/test/llm.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { executeLlm } from "../src/executors/llm.js";
import type { CursorClient } from "../src/types.js";

function mockClient(chunks: string[]): { client: CursorClient; calls: any[] } {
  const calls: any[] = [];
  const client: CursorClient = {
    singleShot(opts) {
      calls.push(opts);
      return {
        chunks: (async function* () { for (const c of chunks) yield c; })(),
        done: Promise.resolve({ text: chunks.join("") }),
      };
    },
  };
  return { client, calls };
}

describe("executeLlm", () => {
  it("substitutes {{input}} into prompt and calls client with model/temperature/maxTokens", async () => {
    const { client, calls } = mockClient(["hello"]);
    const onChunk = vi.fn();
    const env = await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "Say hi to {{input}}",
        model: "claude-sonnet-4-6",
        maxTokens: 100,
        temperature: 0.5,
      },
      input: { text: "world" },
      cursorClient: client,
      onChunk,
    });
    expect(env.text).toBe("hello");
    expect(calls[0].prompt).toBe("Say hi to world");
    expect(calls[0].model).toBe("claude-sonnet-4-6");
    expect(calls[0].maxTokens).toBe(100);
    expect(calls[0].temperature).toBe(0.5);
  });

  it("forwards system prompt when set", async () => {
    const { client, calls } = mockClient([""]);
    await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "x", model: "m", maxTokens: 1, temperature: 0,
        systemPrompt: "be terse",
      },
      input: { text: "" },
      cursorClient: client,
      onChunk: () => {},
    });
    expect(calls[0].system).toBe("be terse");
  });

  it("emits each chunk via onChunk", async () => {
    const { client } = mockClient(["a", "b", "c"]);
    const seen: string[] = [];
    await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "x", model: "m", maxTokens: 1, temperature: 0,
      },
      input: { text: "" },
      cursorClient: client,
      onChunk: (c) => seen.push(c),
    });
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("populates envelope.data when completion is fenced JSON", async () => {
    const { client } = mockClient(["```json\n", '{"k":1}', "\n```"]);
    const env = await executeLlm({
      node: {
        id: "l1", type: "llm",
        prompt: "x", model: "m", maxTokens: 1, temperature: 0,
      },
      input: { text: "" },
      cursorClient: client,
      onChunk: () => {},
    });
    expect(env.data).toEqual({ k: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F @flow-build/engine test llm`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/engine/src/executors/llm.ts`**

```ts
import type { Node } from "@flow-build/flowbuilder";
import type { CursorClient, Envelope } from "../types.js";
import { substitute } from "../template.js";

export type ExecuteLlmOpts = {
  node: Extract<Node, { type: "llm" }>;
  input: Envelope;
  cursorClient: CursorClient;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
};

const FENCED_JSON = /```json\s*\n([\s\S]*?)\n```/;

export async function executeLlm(opts: ExecuteLlmOpts): Promise<Envelope> {
  const prompt = substitute(opts.node.prompt, opts.input);
  const call = opts.cursorClient.singleShot({
    prompt,
    ...(opts.node.systemPrompt ? { system: opts.node.systemPrompt } : {}),
    model: opts.node.model,
    maxTokens: opts.node.maxTokens,
    temperature: opts.node.temperature,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  let collected = "";
  for await (const chunk of call.chunks) {
    collected += chunk;
    opts.onChunk(chunk);
  }
  const final = await call.done;
  const text = final.text || collected;

  const env: Envelope = { text };
  const m = text.match(FENCED_JSON);
  if (m) {
    try {
      env.data = JSON.parse(m[1]);
    } catch {
      // best-effort
    }
  }
  return env;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm -F @flow-build/engine test llm`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): llm node executor — substitute, single-shot, stream chunks"
```

---

## Task 11: `createRun()` main executor (linear path)

**Files:**
- Create: `packages/engine/src/engine.ts`
- Create: `packages/engine/test/engine.linear.test.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Create the failing test `packages/engine/test/engine.linear.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient, RunEvent } from "../src/types.js";
import { readRunResult } from "../src/runStore.js";

function mockClient(text: string): CursorClient {
  return {
    singleShot() {
      return {
        chunks: (async function* () { yield text; })(),
        done: Promise.resolve({ text }),
      };
    },
  };
}

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-linear-")); });

describe("createRun (linear input → llm → output)", () => {
  it("runs to completion with succeeded status and final envelope", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: mockClient("BONJOUR"),
      state: {
        schemaVersion: 1,
        nodes: [
          { id: "i", type: "input", value: "hello" },
          { id: "l", type: "llm", prompt: "Translate {{input}}", model: "m", maxTokens: 1, temperature: 0 },
          { id: "o", type: "output", value: null },
        ],
        edges: [
          { from: "i", to: "l" },
          { from: "l", to: "o" },
        ],
      },
    });

    const events: RunEvent[] = [];
    for await (const ev of run.events) events.push(ev);
    const result = await run.done;
    expect(result.status).toBe("succeeded");
    expect(result.finalOutput?.text).toBe("BONJOUR");

    expect(events[0].type).toBe("run_start");
    expect(events.at(-1)?.type).toBe("run_end");
    const order = events.filter((e) => e.type === "node_start").map((e: any) => e.nodeId);
    expect(order).toEqual(["i", "l", "o"]);

    // Persisted to disk
    const persisted = await readRunResult(baseDir, "s1", run.runId);
    expect(persisted.manifest.status).toBe("succeeded");
    expect(persisted.outputs.l.text).toBe("BONJOUR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @flow-build/engine test engine.linear`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/engine/src/engine.ts`**

```ts
import { randomBytes } from "node:crypto";
import type { Node } from "@flow-build/flowbuilder";
import type {
  CreateRunOptions,
  Envelope,
  Run,
  RunEvent,
  RunManifest,
  RunStatus,
} from "./types.js";
import { topoOrder } from "./topo.js";
import { EngineError } from "./errors.js";
import {
  initRunDir,
  appendEvent,
  writeOutputs,
  writeManifest,
} from "./runStore.js";
import { executeInput } from "./executors/input.js";
import { executeOutput } from "./executors/output.js";
import { executeFlow } from "./executors/flow.js";
import { executeLlm } from "./executors/llm.js";

function ulid(): string {
  // Sufficient for run IDs — 16 random hex chars, monotonic-ish via timestamp prefix.
  return Date.now().toString(36) + randomBytes(8).toString("hex");
}

export function createRun(opts: CreateRunOptions): Run {
  const runId = ulid();
  const startedAt = new Date().toISOString();
  const outputs = new Map<string, Envelope>();
  const queue: RunEvent[] = [];
  let waker: (() => void) | null = null;
  let finished = false;
  let status: RunStatus = "running";

  const internalAbort = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) internalAbort.abort();
    else opts.signal.addEventListener("abort", () => internalAbort.abort(), { once: true });
  }

  function push(ev: RunEvent): void {
    queue.push(ev);
    waker?.();
  }

  const events: AsyncIterable<RunEvent> = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (queue.length) yield queue.shift()!;
        if (finished) return;
        await new Promise<void>((r) => (waker = r));
        waker = null;
      }
    },
  };

  let resolveDone!: (v: { status: RunStatus; finalOutput?: Envelope; error?: string }) => void;
  const done = new Promise<{ status: RunStatus; finalOutput?: Envelope; error?: string }>(
    (res) => (resolveDone = res),
  );

  function inputsFor(nodeId: string): Envelope {
    const incoming = opts.state.edges
      .filter((e) => e.to === nodeId)
      .map((e) => e.from);
    if (incoming.length === 0) return { text: "", data: undefined };
    if (incoming.length === 1) return outputs.get(incoming[0])!;
    const text = incoming.map((id) => outputs.get(id)?.text ?? "").join("");
    const data = incoming.map((id) => outputs.get(id)?.data);
    return { text, data };
  }

  async function runOneNode(node: Node): Promise<void> {
    const at = () => new Date().toISOString();
    push({ type: "node_start", runId, nodeId: node.id, nodeType: node.type, at: at() });
    try {
      const input = inputsFor(node.id);
      let env: Envelope;
      switch (node.type) {
        case "input":
          env = executeInput(node);
          break;
        case "output":
          env = executeOutput(input);
          break;
        case "flow":
          env = await executeFlow({
            node,
            input,
            roteCmd: opts.roteCmd ?? "rote",
            signal: internalAbort.signal,
          });
          break;
        case "llm":
          env = await executeLlm({
            node,
            input,
            cursorClient: opts.cursorClient,
            onChunk: (chunk) => push({ type: "node_text", runId, nodeId: node.id, chunk }),
            signal: internalAbort.signal,
          });
          break;
        default:
          // branch/merge already rejected by topoOrder
          throw new EngineError("UNSUPPORTED_NODE_TYPE", `unreachable: ${(node as Node).type}`);
      }
      outputs.set(node.id, env);
      push({ type: "node_end", runId, nodeId: node.id, status: "done", output: env, at: at() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ type: "node_end", runId, nodeId: node.id, status: "error", error: msg, at: at() });
      throw err;
    }
  }

  (async () => {
    try {
      await initRunDir({
        baseDir: opts.baseDir,
        sessionId: opts.sessionId,
        runId,
        startedAt,
        state: opts.state,
      });
      push({ type: "run_start", runId, sessionId: opts.sessionId, startedAt });

      const order = topoOrder(opts.state);
      const nodesById = new Map(opts.state.nodes.map((n) => [n.id, n]));

      let failedAt = -1;
      let cancelledAt = -1;
      let runError: string | undefined;

      for (let i = 0; i < order.length; i++) {
        if (internalAbort.signal.aborted) {
          cancelledAt = i;
          break;
        }
        const node = nodesById.get(order[i])!;
        try {
          await runOneNode(node);
        } catch (err) {
          failedAt = i;
          runError = err instanceof Error ? err.message : String(err);
          break;
        }
      }

      const haltAt = failedAt >= 0 ? failedAt : cancelledAt >= 0 ? cancelledAt : -1;
      const skipStatus: "skipped" = "skipped";
      if (haltAt >= 0) {
        for (let i = haltAt + 1; i < order.length; i++) {
          push({
            type: "node_end",
            runId, nodeId: order[i],
            status: skipStatus,
            at: new Date().toISOString(),
          });
        }
      }

      let finalOutput: Envelope | undefined;
      const outputNode = opts.state.nodes.find((n) => n.type === "output");
      if (outputNode && outputs.has(outputNode.id)) {
        finalOutput = outputs.get(outputNode.id);
      }

      status = failedAt >= 0 ? "failed" : cancelledAt >= 0 ? "cancelled" : "succeeded";
      const endedAt = new Date().toISOString();

      const outputsObj: Record<string, Envelope> = {};
      for (const [k, v] of outputs) outputsObj[k] = v;
      await writeOutputs(opts.baseDir, opts.sessionId, runId, outputsObj);

      const manifest: RunManifest = {
        runId, sessionId: opts.sessionId, startedAt, endedAt, status,
        ...(runError ? { error: runError } : {}),
      };
      await writeManifest(opts.baseDir, opts.sessionId, runId, manifest);

      const endEvent: RunEvent = {
        type: "run_end", runId, status,
        ...(finalOutput ? { finalOutput } : {}),
        ...(runError ? { error: runError } : {}),
        at: endedAt,
      };
      push(endEvent);

      // append all queued events to disk in order so on-disk events.jsonl
      // matches what the iterator yielded
      // (the queue is drained by the iterator separately; appendEvent is called inline)
      // — actually we append inline above for streaming consumers; persist a copy here too:
      // (no-op: events were appended via push paths below — see persistTap)

      finished = true;
      waker?.();
      resolveDone({
        status,
        ...(finalOutput ? { finalOutput } : {}),
        ...(runError ? { error: runError } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // graph-level failure (e.g. branch/merge unsupported)
      status = "failed";
      const endedAt = new Date().toISOString();
      try {
        await writeManifest(opts.baseDir, opts.sessionId, runId, {
          runId, sessionId: opts.sessionId, startedAt, endedAt,
          status, error: msg,
        });
      } catch { /* ignore — best effort */ }
      push({ type: "run_end", runId, status, error: msg, at: endedAt });
      finished = true;
      waker?.();
      resolveDone({ status, error: msg });
    }
  })();

  // persistence tap: every push() also appends to events.jsonl
  // we re-bind push to wrap with disk append
  const originalQueueLen = () => queue.length;
  void originalQueueLen;

  const persistTap = async (ev: RunEvent) => {
    try {
      await appendEvent(opts.baseDir, opts.sessionId, runId, ev);
    } catch {
      // best-effort persistence
    }
  };

  // wrap push by replacing the closure variable — done via a Proxy on queue methods.
  // simpler: subscribe a separate consumer that fanouts to disk
  (async () => {
    for await (const ev of events) {
      // NOTE: This iteration would conflict with the public iterator.
      // Instead we record events directly inside runOneNode/init via persistTap.
      await persistTap(ev);
    }
  })();

  return {
    runId,
    sessionId: opts.sessionId,
    get status() { return status; },
    events,
    cancel: async () => {
      internalAbort.abort();
    },
    done,
  };
}
```

> **Note on persistence:** the inline `persistTap` consumer above conflicts with the public `events` iterator (an AsyncIterable can only be consumed once). Replace the trailing IIFE with the simpler approach: have `push()` itself call `appendEvent` synchronously-fire-and-forget. **Adjust `push` to:**

```ts
function push(ev: RunEvent): void {
  queue.push(ev);
  waker?.();
  void appendEvent(opts.baseDir, opts.sessionId, runId, ev).catch(() => {});
}
```

Remove the trailing IIFE consumer block.

- [ ] **Step 4: Apply the `push` adjustment described above**

Edit `engine.ts`:
- Replace the trailing IIFE that iterates `events` and calls `persistTap` with **nothing** (delete it).
- Replace the `push` function body with:

```ts
function push(ev: RunEvent): void {
  queue.push(ev);
  waker?.();
  void appendEvent(opts.baseDir, opts.sessionId, runId, ev).catch(() => {});
}
```

- [ ] **Step 5: Update `packages/engine/src/index.ts`**

```ts
export type {
  Envelope,
  RunStatus,
  NodeRunStatus,
  RunEvent,
  RunManifest,
  Run,
  CursorClient,
  CreateRunOptions,
} from "./types.js";
export { makeCursorClient } from "./cursorSingleShot.js";
export { createRun } from "./engine.js";
export { readRunResult, listRuns, type RunResult } from "./runStore.js";
export { EngineError, type EngineErrorCode } from "./errors.js";
```

- [ ] **Step 6: Run linear test to verify pass**

Run: `pnpm -F @flow-build/engine test engine.linear`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): createRun — sequential topo executor, persists events + outputs"
```

---

## Task 12: Engine fail-fast + cancellation tests

**Files:**
- Create: `packages/engine/test/engine.failfast.test.ts`
- Create: `packages/engine/test/engine.cancel.test.ts`
- Create: `packages/engine/test/engine.fanin.test.ts`

These exercise paths the linear test didn't cover. The `engine.ts` from Task 11 already implements them — these tests verify behavior is correct.

- [ ] **Step 1: Create `packages/engine/test/engine.failfast.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient } from "../src/types.js";

const throwingClient: CursorClient = {
  singleShot() {
    return {
      chunks: (async function* () { /* never yields */ })(),
      done: Promise.reject(new Error("boom")),
    };
  },
};

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-failfast-")); });

describe("createRun fail-fast", () => {
  it("middle node errors → downstream skipped, run failed", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: throwingClient,
      state: {
        schemaVersion: 1,
        nodes: [
          { id: "i", type: "input", value: "x" },
          { id: "l", type: "llm", prompt: "x", model: "m", maxTokens: 1, temperature: 0 },
          { id: "o", type: "output", value: null },
        ],
        edges: [{ from: "i", to: "l" }, { from: "l", to: "o" }],
      },
    });
    const events = [];
    for await (const ev of run.events) events.push(ev);
    const ends = events.filter((e: any) => e.type === "node_end") as any[];
    expect(ends.find((e) => e.nodeId === "l")?.status).toBe("error");
    expect(ends.find((e) => e.nodeId === "o")?.status).toBe("skipped");
    const result = await run.done;
    expect(result.status).toBe("failed");
    expect(result.error).toContain("boom");
  });
});
```

- [ ] **Step 2: Create `packages/engine/test/engine.cancel.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient } from "../src/types.js";

// A client that "hangs" so we can cancel mid-run.
const hangingClient: CursorClient = {
  singleShot() {
    return {
      chunks: (async function* () { /* never yields */ })(),
      done: new Promise<{ text: string }>(() => { /* never resolves */ }),
    };
  },
};

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-cancel-")); });

describe("createRun cancellation", () => {
  it("cancel() mid-run yields cancelled status, downstream skipped", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: hangingClient,
      state: {
        schemaVersion: 1,
        nodes: [
          { id: "i", type: "input", value: "x" },
          { id: "l", type: "llm", prompt: "x", model: "m", maxTokens: 1, temperature: 0 },
          { id: "o", type: "output", value: null },
        ],
        edges: [{ from: "i", to: "l" }, { from: "l", to: "o" }],
      },
    });

    // Wait for run_start and node_start "l" before cancelling
    const events: any[] = [];
    setTimeout(() => { void run.cancel(); }, 50);
    for await (const ev of run.events) events.push(ev);
    const result = await run.done;
    expect(["cancelled", "failed"]).toContain(result.status);
    // 'o' must not be 'done'
    const oEnd = events.find((e) => e.type === "node_end" && e.nodeId === "o");
    expect(oEnd?.status === "done").toBe(false);
  }, 5000);
});
```

> Cancellation may surface as `failed` if the underlying CursorClient surfaces the abort as a thrown error rather than the engine's cancelled-loop branch. Both end states are acceptable for this assertion — the load-bearing requirement is "downstream node `o` does not run to completion".

- [ ] **Step 3: Create `packages/engine/test/engine.fanin.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "../src/engine.js";
import type { CursorClient } from "../src/types.js";

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "engine-fanin-")); });

const passthroughClient: CursorClient = {
  singleShot({ prompt }) {
    return {
      chunks: (async function* () { yield prompt; })(),
      done: Promise.resolve({ text: prompt }),
    };
  },
};

describe("createRun fan-in", () => {
  it("two upstreams concat .text in topo order before downstream runs", async () => {
    const run = createRun({
      sessionId: "s1",
      baseDir,
      cursorClient: passthroughClient,
      state: {
        schemaVersion: 1,
        nodes: [
          { id: "a", type: "input", value: "ALPHA" },
          { id: "b", type: "input", value: "BETA" },
          { id: "l", type: "llm", prompt: "{{input}}", model: "m", maxTokens: 1, temperature: 0 },
          { id: "o", type: "output", value: null },
        ],
        edges: [
          { from: "a", to: "l" },
          { from: "b", to: "l" },
          { from: "l", to: "o" },
        ],
      },
    });
    for await (const _ of run.events) { /* drain */ }
    const result = await run.done;
    expect(result.status).toBe("succeeded");
    // The LLM saw concat of upstream text in topo order ("ALPHA" then "BETA")
    expect(result.finalOutput?.text).toBe("ALPHABETA");
  });
});
```

- [ ] **Step 4: Run all engine tests**

Run: `pnpm -F @flow-build/engine test`
Expected: PASS for all (topo, template, runStore, flow, llm, engine.linear, engine.failfast, engine.cancel, engine.fanin).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "test(engine): fail-fast, cancellation, fan-in coverage"
```

---

## Task 13: Add `LlmNodeSchema` to flowbuilder

**Files:**
- Modify: `packages/flowbuilder/src/schema.ts`
- Modify: `packages/flowbuilder/src/schema.test.ts`

- [ ] **Step 1: Add the failing test to `packages/flowbuilder/src/schema.test.ts`**

Append to the file:

```ts
import { NodeSchema, StateSchema, LlmNodeSchema } from "./schema.js";

describe("LlmNodeSchema", () => {
  it("accepts a valid llm node with required + defaulted fields", () => {
    const parsed = LlmNodeSchema.parse({
      id: "l1",
      type: "llm",
      prompt: "Translate {{input}}",
    });
    expect(parsed.model).toBe("claude-sonnet-4-6");
    expect(parsed.maxTokens).toBe(4096);
    expect(parsed.temperature).toBe(0.7);
  });

  it("rejects llm node with empty prompt", () => {
    expect(() =>
      LlmNodeSchema.parse({ id: "l1", type: "llm", prompt: "" }),
    ).toThrow();
  });

  it("NodeSchema accepts llm in the discriminated union", () => {
    const parsed = NodeSchema.parse({ id: "l1", type: "llm", prompt: "p" });
    expect(parsed.type).toBe("llm");
  });

  it("StateSchema parses a graph with input → llm → output (backward compat: pre-llm graphs still parse)", () => {
    const pre = {
      schemaVersion: 1,
      nodes: [
        { id: "i", type: "input", value: 1 },
        { id: "f", type: "flow", flow: "x/y", params: {} },
        { id: "o", type: "output", value: null },
      ],
      edges: [{ from: "i", to: "f" }, { from: "f", to: "o" }],
    };
    expect(() => StateSchema.parse(pre)).not.toThrow();

    const withLlm = {
      schemaVersion: 1,
      nodes: [
        { id: "i", type: "input", value: 1 },
        { id: "l", type: "llm", prompt: "p" },
        { id: "o", type: "output", value: null },
      ],
      edges: [{ from: "i", to: "l" }, { from: "l", to: "o" }],
    };
    expect(() => StateSchema.parse(withLlm)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @flow-build/flowbuilder test schema`
Expected: FAIL — `LlmNodeSchema` not exported.

- [ ] **Step 3: Add `LlmNodeSchema` to `packages/flowbuilder/src/schema.ts`**

After `MergeNodeSchema` and before `NodeSchema`, add:

```ts
export const LlmNodeSchema = BaseNodeSchema.extend({
  type: z.literal("llm"),
  prompt: z.string().min(1),
  model: z.string().default("claude-sonnet-4-6"),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  systemPrompt: z.string().optional(),
});
```

Then update `NodeSchema`:

```ts
export const NodeSchema = z.discriminatedUnion("type", [
  InputNodeSchema,
  OutputNodeSchema,
  FlowNodeSchema,
  BranchNodeSchema,
  MergeNodeSchema,
  LlmNodeSchema,
]);
```

- [ ] **Step 4: Run tests**

Run: `pnpm -F @flow-build/flowbuilder test`
Expected: all existing tests still pass + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder
git commit -m "feat(flowbuilder): add LlmNodeSchema to discriminated union"
```

---

## Task 14: Update `rules.ts` — document llm node + execute pattern

**Files:**
- Modify: `packages/flowbuilder/src/rules.ts`
- Modify: `packages/flowbuilder/src/rules.test.ts`

- [ ] **Step 1: Add failing assertions to `packages/flowbuilder/src/rules.test.ts`**

Append (or, if the file uses test cases, add new ones):

```ts
import { renderFlowbuilderRules } from "./rules.js";

describe("rules.ts new sections", () => {
  it("documents llm node type + {{input}} template", () => {
    const rules = renderFlowbuilderRules();
    expect(rules).toContain('"type": "llm"');
    expect(rules).toContain("{{input}}");
    expect(rules).toContain("{{input.data");
  });

  it("documents the execute → get_run_result pattern", () => {
    const rules = renderFlowbuilderRules();
    expect(rules).toContain("flowbuilder_execute_flow");
    expect(rules).toContain("flowbuilder_get_run_result");
    expect(rules).toContain("waitMs");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @flow-build/flowbuilder test rules`
Expected: FAIL — substrings missing.

- [ ] **Step 3: Update `packages/flowbuilder/src/rules.ts`**

Replace the `BODY` constant with:

```ts
const BODY = `---
alwaysApply: true
---

# Flowbuilder

This session edits a flow graph. The graph lives at \`<flowbuilder-base>/sessions/<sessionId>/state.json\`. The session is fixed for the lifetime of this run; you cannot switch sessions.

Use the MCP tools registered as \`flowbuilder_get_state\`, \`flowbuilder_set_state\`, \`flowbuilder_execute_flow\`, and \`flowbuilder_get_run_result\`.

## Tools

### Editing the graph
- \`flowbuilder_get_state()\` — read the current full state.
- \`flowbuilder_set_state({ state })\` — write the FULL state. You must always pass the complete state; partial patches are not supported.

### Executing the graph
- \`flowbuilder_execute_flow()\` — start a run of the saved graph. Returns \`{ runId, sessionId }\` immediately; the run executes asynchronously.
- \`flowbuilder_get_run_result({ runId, waitMs? })\` — fetch the result of a previously started run. If \`waitMs\` is provided (max 60000), the call blocks server-side up to that many ms waiting for the run to finish; otherwise it returns the current on-disk state. Returns \`{ status, finalOutput?, outputs, error? }\`.

**Recommended pattern:**
\`\`\`
const { runId } = flowbuilder_execute_flow();
const result = flowbuilder_get_run_result({ runId, waitMs: 30000 });
\`\`\`

You must always pass the **complete** state to \`flowbuilder_set_state\`. Partial patches are not supported. To delete a node, omit it from the new \`nodes\` array; to remove an edge, omit it from \`edges\`.

## Schema

\`state.json\` shape (schemaVersion: 1):

\`\`\`json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "n1", "type": "input",  "value": <any> },
    { "id": "n2", "type": "flow",   "flow": "<category>/<name>", "params": { ... } },
    { "id": "n3", "type": "llm",    "prompt": "<template>", "model": "claude-sonnet-4-6", "maxTokens": 4096, "temperature": 0.7 },
    { "id": "n4", "type": "branch", "cond": "<expression>" },
    { "id": "n5", "type": "merge" },
    { "id": "n6", "type": "output", "value": <any> }
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
- \`params\` is free-form. **String values support template substitution at run time:** \`{{input}}\` resolves to the upstream envelope's text, \`{{input.data.<path>}}\` resolves to a value at that path inside structured upstream data. Non-string values pass through unchanged.

## LLM node

An \`llm\` node runs a single-shot LLM completion. Its \`prompt\` is a template — use \`{{input}}\` to inject upstream text and \`{{input.data.<path>}}\` to inject structured fields. \`model\`, \`maxTokens\`, and \`temperature\` have sensible defaults; only set them when you have a reason. \`systemPrompt\` is optional.

LLM nodes have **no tool access** — they cannot call MCP tools or run shell commands. For multi-step work that needs tools, prefer a \`flow\` node (which invokes a rote flow) or chain multiple LLM nodes.

## Edge envelope

At run time, each node emits an \`{ text, data? }\` envelope. \`text\` is the canonical string an LLM node consumes via \`{{input}}\`. \`data\` is optional structured payload. \`flow\` nodes try to JSON-parse stdout into \`data\`; \`llm\` nodes parse fenced JSON in their completion.

## Execution constraints (v1)

- Branch and merge nodes are **not yet executable** — \`flowbuilder_execute_flow\` rejects graphs containing them. Build linear / fan-in graphs only when you intend to execute.
- A node failure halts the run; downstream nodes are marked \`skipped\`.
- Runs are sequential (no parallel branch traversal).

## Workflow

1. Call \`flowbuilder_get_state\` to read the current graph.
2. Plan the change. Pick or create rote flows using the rote skill.
3. Build the next full state object.
4. Call \`flowbuilder_set_state({ state })\`.
5. To run: \`flowbuilder_execute_flow()\` then \`flowbuilder_get_run_result({ runId, waitMs: 30000 })\`.
6. If a tool returns \`{ ok: false, error }\`, fix and retry.

Do not run two agents against the same session. The harness assumes one writer per session.
`;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm -F @flow-build/flowbuilder test rules`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder
git commit -m "feat(flowbuilder): rules.ts documents llm node + execute pattern"
```

---

## Task 15: MCP tool — `flowbuilder_execute_flow`

**Files:**
- Modify: `packages/flowbuilder/package.json` (add engine dep)
- Modify: `packages/flowbuilder/src/mcp-server.ts`
- Modify: `packages/flowbuilder/src/mcp-server.test.ts`
- Modify: `packages/flowbuilder/src/plugin.ts`

The flowbuilder package gets an injected `runStarter` so it doesn't depend on electron-side `RunRegistry` directly.

- [ ] **Step 1: Add engine dep to `packages/flowbuilder/package.json`**

Edit dependencies:

```json
"@flow-build/engine": "workspace:*",
```

(insert alongside `@flow-build/core`)

- [ ] **Step 2: Add failing test to `packages/flowbuilder/src/mcp-server.test.ts`**

(append; use existing test file's setup conventions)

```ts
describe("flowbuilder_execute_flow tool", () => {
  it("calls runStarter with sessionId and returns { runId, sessionId }", async () => {
    const calls: string[] = [];
    const session = makeFakeSession(); // existing helper, or inline a small SessionManager
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async (sid) => { calls.push(sid); return "RUN_ABC"; },
      runResultReader: async () => ({ manifest: { runId: "x", sessionId: "y", startedAt: "t", status: "succeeded" }, events: [], outputs: {} }),
      waitForRunEnd: async () => {},
    });
    try {
      const result = await callMcpTool(handle.url, "flowbuilder_execute_flow", {});
      expect(JSON.parse(result.content[0].text)).toEqual({ runId: "RUN_ABC", sessionId: session.sessionId });
      expect(calls).toEqual([session.sessionId]);
    } finally {
      await handle.close();
    }
  });
});
```

> If the existing test file does not have helpers `makeFakeSession` and `callMcpTool`, follow the existing test patterns in the file. Inline minimal helpers if needed; do not introduce a new test framework.

- [ ] **Step 3: Run test to verify fail**

Run: `pnpm -F @flow-build/flowbuilder test mcp-server`
Expected: FAIL — option `runStarter` not accepted.

- [ ] **Step 4: Update `packages/flowbuilder/src/mcp-server.ts`**

At the top of the file, after existing imports add:

```ts
import type { RunResult } from "@flow-build/engine";
```

Update `StartOptions` and `buildMcpServer` to take new injections:

```ts
export type RunStarter = (sessionId: string) => Promise<string>;
export type RunResultReader = (sessionId: string, runId: string) => Promise<RunResult>;
export type RunWaiter = (runId: string, timeoutMs: number) => Promise<void>;

export type StartOptions = {
  session: SessionManager;
  runStarter: RunStarter;
  runResultReader: RunResultReader;
  waitForRunEnd: RunWaiter;
};

function buildMcpServer(
  session: SessionManager,
  runStarter: RunStarter,
  runResultReader: RunResultReader,
  waitForRunEnd: RunWaiter,
): McpServer {
  const mcp = new McpServer(
    { name: "flowbuilder", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  // ... existing get_state / set_state tools unchanged ...

  mcp.tool(
    "flowbuilder_execute_flow",
    "Execute the current flowbuilder graph. Returns a runId immediately; the run executes asynchronously. Call flowbuilder_get_run_result({ runId, waitMs }) to await the final outcome.",
    {},
    async () => {
      try {
        const runId = await runStarter(session.sessionId);
        return asTextResult({ ok: true, runId, sessionId: session.sessionId });
      } catch (e) {
        return asTextResult({ ok: false, error: errorToToolMessage(e) });
      }
    },
  );

  return mcp;
}
```

In `startFlowbuilderMcpServer`, plumb the new options into the per-request `buildMcpServer(...)` call:

```ts
const mcp = buildMcpServer(session, opts.runStarter, opts.runResultReader, opts.waitForRunEnd);
```

- [ ] **Step 5: Update `packages/flowbuilder/src/plugin.ts`**

Add corresponding fields to the plugin's options/config (search for where the plugin currently calls `startFlowbuilderMcpServer` and thread `runStarter` / `runResultReader` / `waitForRunEnd` through). For CLI use (not Electron), the plugin's caller may pass no-op stubs if execution isn't wired:

```ts
runStarter: opts.runStarter ?? (async () => { throw new Error("execute_flow not available in this context"); }),
runResultReader: opts.runResultReader ?? (async () => { throw new Error("get_run_result not available"); }),
waitForRunEnd: opts.waitForRunEnd ?? (async () => {}),
```

- [ ] **Step 6: Run tests**

Run: `pnpm -F @flow-build/flowbuilder test`
Expected: PASS (existing + new tool tests).

- [ ] **Step 7: Commit**

```bash
git add packages/flowbuilder pnpm-lock.yaml
git commit -m "feat(flowbuilder): flowbuilder_execute_flow MCP tool with injected runStarter"
```

---

## Task 16: MCP tool — `flowbuilder_get_run_result`

**Files:**
- Modify: `packages/flowbuilder/src/mcp-server.ts`
- Modify: `packages/flowbuilder/src/mcp-server.test.ts`

- [ ] **Step 1: Add failing test**

Append to `mcp-server.test.ts`:

```ts
describe("flowbuilder_get_run_result tool", () => {
  it("returns disk state without waitMs", async () => {
    const session = makeFakeSession();
    const result: RunResult = {
      manifest: { runId: "r1", sessionId: session.sessionId, startedAt: "t", status: "succeeded" },
      events: [],
      outputs: { o: { text: "hi" } },
    };
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => result,
      waitForRunEnd: async () => {},
    });
    try {
      const r = await callMcpTool(handle.url, "flowbuilder_get_run_result", { runId: "r1" });
      const body = JSON.parse(r.content[0].text);
      expect(body.ok).toBe(true);
      expect(body.status).toBe("succeeded");
      expect(body.outputs.o.text).toBe("hi");
    } finally {
      await handle.close();
    }
  });

  it("invokes waitForRunEnd when waitMs > 0", async () => {
    const session = makeFakeSession();
    let waitCalledWith: { runId?: string; ms?: number } = {};
    const handle = await startFlowbuilderMcpServer({
      session,
      runStarter: async () => "r1",
      runResultReader: async () => ({
        manifest: { runId: "r1", sessionId: session.sessionId, startedAt: "t", status: "succeeded" },
        events: [],
        outputs: {},
      }),
      waitForRunEnd: async (runId, ms) => { waitCalledWith = { runId, ms }; },
    });
    try {
      await callMcpTool(handle.url, "flowbuilder_get_run_result", { runId: "r1", waitMs: 5000 });
      expect(waitCalledWith).toEqual({ runId: "r1", ms: 5000 });
    } finally {
      await handle.close();
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm -F @flow-build/flowbuilder test mcp-server`
Expected: FAIL — tool not registered.

- [ ] **Step 3: Add the tool to `packages/flowbuilder/src/mcp-server.ts`**

In `buildMcpServer`, after the `flowbuilder_execute_flow` registration:

```ts
const GetRunResultInput = z.object({
  runId: z.string().min(1),
  waitMs: z.number().int().min(0).max(60_000).optional(),
});

mcp.tool(
  "flowbuilder_get_run_result",
  "Fetch the result of a previously started run. If waitMs (max 60000) is set, blocks server-side up to that long for run completion; otherwise returns current on-disk state.",
  GetRunResultInput.shape,
  async (raw) => {
    const parsed = GetRunResultInput.safeParse(raw);
    if (!parsed.success) {
      return asTextResult({ ok: false, error: `validation: ${parsed.error.message}` });
    }
    try {
      if (parsed.data.waitMs && parsed.data.waitMs > 0) {
        await waitForRunEnd(parsed.data.runId, parsed.data.waitMs);
      }
      const result = await runResultReader(session.sessionId, parsed.data.runId);
      return asTextResult({
        ok: true,
        status: result.manifest.status,
        finalOutput: result.events.find((e) => e.type === "run_end" && "finalOutput" in e)?.["finalOutput"],
        outputs: result.outputs,
        error: result.manifest.error,
      });
    } catch (e) {
      return asTextResult({ ok: false, error: errorToToolMessage(e) });
    }
  },
);
```

- [ ] **Step 4: Run tests**

Run: `pnpm -F @flow-build/flowbuilder test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/flowbuilder
git commit -m "feat(flowbuilder): flowbuilder_get_run_result MCP tool with waitMs"
```

---

## Task 17: `RunRegistry` (main process)

**Files:**
- Create: `src/main/runRegistry.ts`
- Create: `src/main/runRegistry.test.ts`

- [ ] **Step 1: Create the failing test `src/main/runRegistry.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunRegistry } from "./runRegistry.js";
import type { Run, RunEvent, CursorClient } from "@flow-build/engine";

function fakeRun(runId: string, events: RunEvent[]): Run {
  let i = 0;
  const iter: AsyncIterable<RunEvent> = {
    async *[Symbol.asyncIterator]() {
      while (i < events.length) yield events[i++];
    },
  };
  return {
    runId,
    sessionId: "s1",
    status: "running",
    events: iter,
    cancel: async () => {},
    done: Promise.resolve({ status: "succeeded" }),
  };
}

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "registry-")); });

describe("RunRegistry", () => {
  it("start returns a runId, removes run from map after run_end", async () => {
    const reg = new RunRegistry({
      baseDir,
      cursorClient: {} as CursorClient,
      loadState: async () => ({ schemaVersion: 1, nodes: [], edges: [] }),
      makeRun: () => fakeRun("R1", [
        { type: "run_start", runId: "R1", sessionId: "s1", startedAt: "t" },
        { type: "run_end", runId: "R1", status: "succeeded", at: "t2" },
      ]),
    });
    const runId = await reg.start("s1");
    expect(runId).toBe("R1");
    // give the pump a tick to drain
    await new Promise((r) => setTimeout(r, 20));
    expect(reg.has("R1")).toBe(false);
  });

  it("waitForRunEnd resolves on run_end", async () => {
    const reg = new RunRegistry({
      baseDir,
      cursorClient: {} as CursorClient,
      loadState: async () => ({ schemaVersion: 1, nodes: [], edges: [] }),
      makeRun: () => fakeRun("R2", [
        { type: "run_start", runId: "R2", sessionId: "s1", startedAt: "t" },
        { type: "run_end", runId: "R2", status: "succeeded", at: "t2" },
      ]),
    });
    const runId = await reg.start("s1");
    await reg.waitForRunEnd(runId, 1000);
    expect(reg.has(runId)).toBe(false);
  });

  it("waitForRunEnd resolves on timeout when run never ends", async () => {
    const reg = new RunRegistry({
      baseDir,
      cursorClient: {} as CursorClient,
      loadState: async () => ({ schemaVersion: 1, nodes: [], edges: [] }),
      makeRun: () => {
        const events: AsyncIterable<RunEvent> = {
          async *[Symbol.asyncIterator]() {
            // hang
            await new Promise(() => {});
          },
        };
        return {
          runId: "R3",
          sessionId: "s1",
          status: "running",
          events,
          cancel: async () => {},
          done: new Promise(() => {}),
        };
      },
    });
    const runId = await reg.start("s1");
    const before = Date.now();
    await reg.waitForRunEnd(runId, 100);
    const elapsed = Date.now() - before;
    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(elapsed).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test -F @flow-build/main 2>/dev/null || pnpm vitest run src/main/runRegistry.test.ts` (the main process tests run via the root `pnpm test` if configured; otherwise see existing `src/main/ipc/*.test.ts` invocation)
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/runRegistry.ts`**

```ts
import { randomBytes } from "node:crypto";
import type { WebContents } from "electron";
import type {
  CursorClient,
  Run,
  RunEvent,
} from "@flow-build/engine";
import type { State } from "@flow-build/flowbuilder";

export type MakeRun = (opts: {
  sessionId: string;
  baseDir: string;
  state: State;
  cursorClient: CursorClient;
}) => Run;

export type RunRegistryDeps = {
  baseDir: string;
  cursorClient: CursorClient;
  loadState: (sessionId: string) => Promise<State>;
  makeRun: MakeRun;
};

type Subscription = { id: string; runId: string; webContents: WebContents };

export class RunRegistry {
  private readonly deps: RunRegistryDeps;
  private readonly runs = new Map<string, Run>();
  private readonly subs = new Map<string, Subscription>();
  private readonly endWaiters = new Map<string, Set<() => void>>();

  constructor(deps: RunRegistryDeps) {
    this.deps = deps;
  }

  async start(sessionId: string): Promise<string> {
    const state = await this.deps.loadState(sessionId);
    const run = this.deps.makeRun({
      sessionId,
      baseDir: this.deps.baseDir,
      state,
      cursorClient: this.deps.cursorClient,
    });
    this.runs.set(run.runId, run);
    void this.pump(run);
    return run.runId;
  }

  has(runId: string): boolean {
    return this.runs.has(runId);
  }

  async cancel(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    await run.cancel();
  }

  subscribe(runId: string, webContents: WebContents): string {
    const id = randomBytes(8).toString("hex");
    this.subs.set(id, { id, runId, webContents });
    return id;
  }

  unsubscribe(subscriptionId: string, owner: WebContents): void {
    const sub = this.subs.get(subscriptionId);
    if (!sub) return;
    if (sub.webContents !== owner) return;
    this.subs.delete(subscriptionId);
  }

  /**
   * Resolves on the run's run_end event or after timeoutMs, whichever first.
   * If the run is no longer in the live map (already completed), resolves immediately.
   */
  async waitForRunEnd(runId: string, timeoutMs: number): Promise<void> {
    if (!this.runs.has(runId)) return;
    return new Promise<void>((resolve) => {
      let done = false;
      const onEnd = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const set = this.endWaiters.get(runId) ?? new Set();
      set.add(onEnd);
      this.endWaiters.set(runId, set);
      setTimeout(() => {
        if (done) return;
        done = true;
        set.delete(onEnd);
        resolve();
      }, timeoutMs);
    });
  }

  private fanout(runId: string, event: RunEvent): void {
    for (const sub of this.subs.values()) {
      if (sub.runId !== runId) continue;
      if (sub.webContents.isDestroyed?.()) {
        this.subs.delete(sub.id);
        continue;
      }
      sub.webContents.send("run:event", { runId, event });
    }
  }

  private async pump(run: Run): Promise<void> {
    try {
      for await (const ev of run.events) {
        this.fanout(run.runId, ev);
        if (ev.type === "run_end") {
          const set = this.endWaiters.get(run.runId);
          if (set) {
            for (const w of set) w();
            this.endWaiters.delete(run.runId);
          }
        }
      }
    } catch {
      // run errors surface as run_end{status:"failed"} from the engine
    } finally {
      this.runs.delete(run.runId);
      // wake any remaining waiters that didn't see a run_end (defensive)
      const set = this.endWaiters.get(run.runId);
      if (set) {
        for (const w of set) w();
        this.endWaiters.delete(run.runId);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/main/runRegistry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/runRegistry.ts src/main/runRegistry.test.ts
git commit -m "feat(main): RunRegistry — pump events, fanout, waitForRunEnd"
```

---

## Task 18: `run:*` zod schemas

**Files:**
- Modify: `src/main/ipc/schemas.ts`
- Modify: `src/main/ipc/schemas.test.ts`

- [ ] **Step 1: Add failing tests to `src/main/ipc/schemas.test.ts`**

```ts
import {
  RunExecuteInputSchema,
  RunCancelInputSchema,
  RunListInputSchema,
  RunReadInputSchema,
  RunWatchInputSchema,
  RunUnwatchInputSchema,
} from "./schemas.js";

describe("run:* schemas", () => {
  it("RunExecuteInputSchema accepts { sessionId } and rejects unknown keys", () => {
    expect(() => RunExecuteInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).not.toThrow();
    expect(() => RunExecuteInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", junk: 1 })).toThrow();
  });
  it("RunCancelInputSchema requires sessionId + runId", () => {
    expect(() => RunCancelInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", runId: "r1" })).not.toThrow();
    expect(() => RunCancelInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).toThrow();
  });
  it("RunWatchInputSchema rejects extra keys", () => {
    expect(() => RunWatchInputSchema.parse({ sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", runId: "r1", x: 1 })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/main/ipc/schemas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add schemas to `src/main/ipc/schemas.ts`**

Append:

```ts
const RunIdSchema = z.string().min(1).max(64);

export const RunExecuteInputSchema = z.object({ sessionId: SessionIdSchema }).strict();
export const RunCancelInputSchema = z.object({ sessionId: SessionIdSchema, runId: RunIdSchema }).strict();
export const RunListInputSchema = z.object({ sessionId: SessionIdSchema }).strict();
export const RunReadInputSchema = z.object({ sessionId: SessionIdSchema, runId: RunIdSchema }).strict();
export const RunWatchInputSchema = z.object({ sessionId: SessionIdSchema, runId: RunIdSchema }).strict();
export const RunUnwatchInputSchema = z.object({ subscriptionId: z.string().min(1).max(64) }).strict();

export type RunExecuteInput = z.infer<typeof RunExecuteInputSchema>;
export type RunCancelInput = z.infer<typeof RunCancelInputSchema>;
export type RunListInput = z.infer<typeof RunListInputSchema>;
export type RunReadInput = z.infer<typeof RunReadInputSchema>;
export type RunWatchInput = z.infer<typeof RunWatchInputSchema>;
export type RunUnwatchInput = z.infer<typeof RunUnwatchInputSchema>;
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/main/ipc/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/schemas.ts src/main/ipc/schemas.test.ts
git commit -m "feat(main/ipc): zod schemas for run:* IPC"
```

---

## Task 19: `run:*` IPC handlers

**Files:**
- Create: `src/main/ipc/run.ts`
- Create: `src/main/ipc/run.test.ts`

- [ ] **Step 1: Create the failing test `src/main/ipc/run.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { registerRunIpc } from "./run.js";

function makeIpc() {
  const handlers = new Map<string, (e: any, raw: unknown) => unknown>();
  return {
    handle: (channel: string, fn: (e: any, raw: unknown) => unknown) => {
      handlers.set(channel, fn);
    },
    invoke: (channel: string, raw: unknown) => handlers.get(channel)!({ sender: {} }, raw),
  };
}

describe("registerRunIpc", () => {
  it("run:execute returns { ok:true, runId } on success", async () => {
    const ipc = makeIpc();
    registerRunIpc(ipc as any, {
      registry: {
        start: async (sid: string) => `R-${sid}`,
        cancel: async () => {},
        subscribe: () => "SUB",
        unsubscribe: () => {},
      } as any,
      baseDir: "/tmp/x",
    });
    const r = await ipc.invoke("run:execute", { sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(r).toEqual({ ok: true, runId: "R-01ARZ3NDEKTSV4RRFFQ69G5FAV" });
  });

  it("run:execute returns invalid on bad input", async () => {
    const ipc = makeIpc();
    registerRunIpc(ipc as any, {
      registry: { start: vi.fn() } as any,
      baseDir: "/tmp/x",
    });
    const r = (await ipc.invoke("run:execute", { sessionId: "bad", junk: 1 })) as any;
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INVALID");
  });

  it("run:watch returns { ok:true, subscriptionId }", async () => {
    const ipc = makeIpc();
    registerRunIpc(ipc as any, {
      registry: {
        start: async () => "x",
        cancel: async () => {},
        subscribe: (_runId: string) => "SUB123",
        unsubscribe: () => {},
      } as any,
      baseDir: "/tmp/x",
    });
    const r = await ipc.invoke("run:watch", {
      sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      runId: "r1",
    });
    expect(r).toEqual({ ok: true, subscriptionId: "SUB123" });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run src/main/ipc/run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/main/ipc/run.ts`**

```ts
import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { listRuns, readRunResult } from "@flow-build/engine";
import {
  RunExecuteInputSchema,
  RunCancelInputSchema,
  RunListInputSchema,
  RunReadInputSchema,
  RunWatchInputSchema,
  RunUnwatchInputSchema,
} from "./schemas.js";
import type { RunRegistry } from "../runRegistry.js";

export type RunIpcDeps = {
  baseDir: string;
  registry: RunRegistry;
};

type IpcResult<T> = ({ ok: true } & T) | { ok: false; code: string; error: string };

function invalid(error: string): IpcResult<never> {
  return { ok: false, code: "INVALID", error };
}

function fail(e: unknown): IpcResult<never> {
  const code = (e as { code?: string }).code ?? "UNKNOWN";
  const error = e instanceof Error ? e.message : String(e);
  return { ok: false, code, error };
}

export function registerRunIpc(ipc: IpcMain, deps: RunIpcDeps): void {
  ipc.handle("run:execute", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunExecuteInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const runId = await deps.registry.start(parsed.data.sessionId);
      return { ok: true, runId };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:cancel", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunCancelInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      await deps.registry.cancel(parsed.data.runId);
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:list", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunListInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const runs = await listRuns(deps.baseDir, parsed.data.sessionId);
      return { ok: true, runs };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:read", async (_e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunReadInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    try {
      const result = await readRunResult(deps.baseDir, parsed.data.sessionId, parsed.data.runId);
      return { ok: true, ...result };
    } catch (e) {
      return fail(e);
    }
  });

  ipc.handle("run:watch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunWatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    const subscriptionId = deps.registry.subscribe(parsed.data.runId, e.sender as WebContents);
    return { ok: true, subscriptionId };
  });

  ipc.handle("run:unwatch", async (e: IpcMainInvokeEvent, raw: unknown) => {
    const parsed = RunUnwatchInputSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.message);
    deps.registry.unsubscribe(parsed.data.subscriptionId, e.sender as WebContents);
    return { ok: true };
  });
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/main/ipc/run.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/run.ts src/main/ipc/run.test.ts
git commit -m "feat(main/ipc): run:* handlers — execute/cancel/list/read/watch"
```

---

## Task 20: Wire `RunRegistry` + IPC in `src/main/index.ts`

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Edit `src/main/index.ts`**

Add imports near the existing imports:

```ts
import { RunRegistry } from "./runRegistry.js";
import { registerRunIpc } from "./ipc/run.js";
import {
  createRun,
  makeCursorClient,
  type Run,
} from "@flow-build/engine";
import { ManifestSchema, StateSchema, validateRefIntegrity } from "@flow-build/flowbuilder";
import { readFileSync as readFileSyncFs } from "fs";
```

After the `SessionRegistry` instantiation, add:

```ts
const cursorClient = makeCursorClient();

const runRegistry = new RunRegistry({
  baseDir: getBaseDir(),
  cursorClient,
  loadState: async (sessionId: string): Promise<import("@flow-build/flowbuilder").State> => {
    const dir = join(getBaseDir(), "sessions", sessionId);
    const state = StateSchema.parse(JSON.parse(readFileSyncFs(join(dir, "state.json"), "utf8")));
    validateRefIntegrity(state);
    return state;
  },
  makeRun: ({ sessionId, baseDir, state, cursorClient }) =>
    createRun({ sessionId, baseDir, state, cursorClient }),
});
```

In `app.whenReady().then(...)`, after `registerSessionIpc(...)` add:

```ts
registerRunIpc(ipcMain, {
  baseDir: getBaseDir(),
  registry: runRegistry,
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (after `pnpm install` if needed for the new workspace dep).

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): construct RunRegistry, register run:* IPC"
```

---

## Task 21: Preload bridge `window.api.run.*`

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Read existing preload to identify the api object**

Run: `grep -n 'window.api\|contextBridge\|exposeInMainWorld\|flowbuilder:' src/preload/index.ts`

The exposed API is built around `ipcRenderer.invoke("...", payload)` calls. Add a `run` namespace following the `flowbuilder` / `cursorChat` pattern.

- [ ] **Step 2: Edit `src/preload/index.ts` — add run namespace inside the api object**

```ts
run: {
  execute: (input: { sessionId: string }) =>
    ipcRenderer.invoke("run:execute", input) as Promise<
      { ok: true; runId: string } | { ok: false; code: string; error: string }
    >,
  cancel: (input: { sessionId: string; runId: string }) =>
    ipcRenderer.invoke("run:cancel", input) as Promise<
      { ok: true } | { ok: false; code: string; error: string }
    >,
  list: (input: { sessionId: string }) =>
    ipcRenderer.invoke("run:list", input) as Promise<
      { ok: true; runs: Array<{ runId: string; sessionId: string; startedAt: string; endedAt?: string; status: string; error?: string }> } | { ok: false; code: string; error: string }
    >,
  read: (input: { sessionId: string; runId: string }) =>
    ipcRenderer.invoke("run:read", input) as Promise<unknown>,
  watch: (input: { sessionId: string; runId: string }) =>
    ipcRenderer.invoke("run:watch", input) as Promise<
      { ok: true; subscriptionId: string } | { ok: false; code: string; error: string }
    >,
  unwatch: (input: { subscriptionId: string }) =>
    ipcRenderer.invoke("run:unwatch", input) as Promise<{ ok: true } | { ok: false; code: string; error: string }>,
  onEvent: (cb: (msg: { runId: string; event: unknown }) => void) => {
    const listener = (_e: unknown, msg: { runId: string; event: unknown }) => cb(msg);
    ipcRenderer.on("run:event", listener);
    return () => ipcRenderer.removeListener("run:event", listener);
  },
},
```

Update the corresponding TypeScript declaration (`window.api` type) in the same file or whatever `.d.ts` mirrors it (commonly `src/preload/index.d.ts`).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/preload
git commit -m "feat(preload): window.api.run.* bridge"
```

---

## Task 22: UI — types, colors, icons, palette for `llm`

**Files:**
- Modify: `src/renderer/src/types.ts`
- Modify: `src/renderer/src/data/typeColors.ts`
- Modify: `src/renderer/src/data/icons.tsx`
- Modify: `src/renderer/src/App.tsx` (SMART_ADD_ITEMS)

- [ ] **Step 1: Add `"llm"` to `NodeType` in `src/renderer/src/types.ts`**

Find the existing `NodeType` union (~line 1-11) and add `"llm"`:

```ts
export type NodeType = "input" | "output" | "flow" | "branch" | "merge" | "llm" | /* existing UI-only types */;
```

(Preserve any extra UI-only entries already there.)

- [ ] **Step 2: Add llm color in `src/renderer/src/data/typeColors.ts`**

```ts
llm: { bg: "#5B2A86", border: "#8B5CF6", text: "#F3E8FF" },
```

(Choose a distinctive purple — exact values match repo's existing color style.)

- [ ] **Step 3: Add llm icon in `src/renderer/src/data/icons.tsx`**

Add a key `llm` rendering a stylized "✦" or a small SVG matching the existing icon style:

```tsx
llm: (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2 L13.5 9 L21 12 L13.5 15 L12 22 L10.5 15 L3 12 L10.5 9 Z" />
  </svg>
),
```

- [ ] **Step 4: Add llm to `SMART_ADD_ITEMS` in `src/renderer/src/App.tsx`**

Find `SMART_ADD_ITEMS` (~lines 30-50) and append:

```ts
{
  type: "llm",
  label: "LLM",
  description: "Run a single-shot prompt; consumes upstream {{input}}",
  defaults: {
    prompt: "Summarize {{input}}",
  },
},
```

(Match the existing item shape.)

- [ ] **Step 5: Run UI dev server briefly to confirm the palette renders**

Run: `pnpm dev` (then quit)
Expected: app opens, the smart-add palette includes the LLM entry.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/types.ts src/renderer/src/data src/renderer/src/App.tsx
git commit -m "feat(renderer): llm node — type, color, icon, palette entry"
```

---

## Task 23: UI — render LLM block on canvas with streaming text

**Files:**
- Modify: `src/renderer/src/components/FlowNode.tsx`

The existing `FlowNode.tsx` already has special handling for `prompt`-type nodes (taller height, textarea). Mirror that for `llm` and add a streaming-text readout area driven by a new prop.

- [ ] **Step 1: Add `streamingText?: string` and `errorMessage?: string` to `FlowNodeProps`**

In `src/renderer/src/components/FlowNode.tsx`:

```ts
type FlowNodeProps = {
  // ... existing fields ...
  streamingText?: string;
  errorMessage?: string;
  onPromptChange?: (id: string, value: string) => void;
};
```

- [ ] **Step 2: Add an llm-rendering branch**

Inside the component body, after the existing `prompt`-type special-case, add:

```tsx
{props.node.type === "llm" && (
  <>
    <textarea
      className="fc-llm-prompt"
      value={(props.node as any).prompt ?? ""}
      placeholder="Prompt template — {{input}} for upstream text"
      onChange={(e) => props.onPromptChange?.(props.node.id, e.target.value)}
      rows={3}
    />
    {props.streamingText && (
      <div className="fc-llm-stream">{props.streamingText}</div>
    )}
    {props.errorMessage && (
      <div className="fc-llm-error" title={props.errorMessage}>error</div>
    )}
  </>
)}
```

Adjust the height constant to use the existing larger prompt-style sizing (use the same `PROMPT_NODE_H` constant for `llm`).

- [ ] **Step 3: Add minimal CSS in the renderer's main stylesheet**

Append to whichever stylesheet currently styles `.fc-node` (search the repo for a definition, e.g. `src/renderer/src/index.css` or `src/renderer/src/App.css`):

```css
.fc-llm-prompt {
  width: 100%;
  font-family: inherit;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 4px;
  resize: none;
}
.fc-llm-stream {
  margin-top: 6px;
  padding: 4px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}
.fc-llm-error {
  margin-top: 6px;
  font-size: 11px;
  color: #fca5a5;
}
```

- [ ] **Step 4: Smoke-render via dev**

Run: `pnpm dev`
Expected: drag an LLM node onto the canvas, prompt textarea visible.

- [ ] **Step 5: Commit**

```bash
git add src/renderer
git commit -m "feat(renderer): FlowNode renders LLM block with streaming + error UI"
```

---

## Task 24: UI — Play button in TopBar

**Files:**
- Modify: `src/renderer/src/components/TopBar.tsx`

- [ ] **Step 1: Add Play button to TopBar**

In `TopBar.tsx`, find the right-side section (`tb-r` div, ~line 28) and add:

```tsx
<button
  className="tb-btn tb-btn-primary"
  onClick={props.onPlay}
  disabled={!props.canRun || props.running}
  title={
    !props.canRun
      ? "Add input + output nodes; remove branch/merge to enable execution"
      : props.running
        ? "Running…"
        : "Execute flow"
  }
>
  {props.running ? "Running…" : "▶ Play"}
</button>
```

Add the props to the component's prop type:

```ts
type TopBarProps = {
  // ... existing ...
  onPlay: () => void;
  canRun: boolean;
  running: boolean;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/TopBar.tsx
git commit -m "feat(renderer): Play button in TopBar"
```

---

## Task 25: UI — App.tsx wires real engine via `window.api.run.*`

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Replace simulated `handleRun` with real engine wiring**

In `App.tsx`, locate `handleRun` (~line 288). Replace it with:

```ts
const [activeRunId, setActiveRunId] = useState<string | null>(null);
const [runStatuses, setRunStatuses] = useState<Map<string, NodeRunStatus>>(new Map());
const [nodeStreams, setNodeStreams] = useState<Map<string, string>>(new Map());
const [nodeErrors, setNodeErrors] = useState<Map<string, string>>(new Map());

type NodeRunStatus = "pending" | "running" | "done" | "error" | "skipped";

const canRun = useMemo(() => {
  const types = new Set(flow.nodes.map((n) => n.type));
  if (types.has("branch") || types.has("merge")) return false;
  return types.has("input") && types.has("output");
}, [flow]);

async function handlePlay(): Promise<void> {
  if (!sessionId) return;
  setRunStatuses(new Map());
  setNodeStreams(new Map());
  setNodeErrors(new Map());

  const r = await window.api.run.execute({ sessionId });
  if (!r.ok) {
    showError(r.error);
    return;
  }
  setActiveRunId(r.runId);

  const watch = await window.api.run.watch({ sessionId, runId: r.runId });
  if (!watch.ok) return;

  const off = window.api.run.onEvent(({ runId, event }) => {
    if (runId !== r.runId) return;
    const ev = event as RunEventLike;
    if (ev.type === "node_start") {
      setRunStatuses((m) => new Map(m).set(ev.nodeId, "running"));
    } else if (ev.type === "node_text") {
      setNodeStreams((m) => {
        const next = new Map(m);
        next.set(ev.nodeId, (next.get(ev.nodeId) ?? "") + ev.chunk);
        return next;
      });
    } else if (ev.type === "node_end") {
      setRunStatuses((m) => new Map(m).set(ev.nodeId, ev.status as NodeRunStatus));
      if (ev.status === "error" && ev.error) {
        setNodeErrors((m) => new Map(m).set(ev.nodeId, ev.error!));
      }
    } else if (ev.type === "run_end") {
      off();
      void window.api.run.unwatch({ subscriptionId: watch.subscriptionId });
      setActiveRunId(null);
    }
  });
}

type RunEventLike =
  | { type: "node_start"; nodeId: string }
  | { type: "node_text"; nodeId: string; chunk: string }
  | { type: "node_end"; nodeId: string; status: string; error?: string }
  | { type: "run_end"; status: string }
  | { type: "run_start" };
```

- [ ] **Step 2: Wire props down to `TopBar` and `FlowCanvas` / `FlowNode`**

```tsx
<TopBar
  /* ...existing props... */
  onPlay={handlePlay}
  canRun={canRun}
  running={activeRunId !== null}
/>

<FlowCanvas
  /* ...existing props... */
  runState={runStatuses}
  nodeStreams={nodeStreams}
  nodeErrors={nodeErrors}
/>
```

In `FlowCanvas.tsx`, plumb `nodeStreams` and `nodeErrors` into the per-node `<FlowNode>` render call as `streamingText` / `errorMessage`.

- [ ] **Step 3: Manual smoke**

Run: `pnpm dev`
Expected: with a graph (input → llm → output), clicking Play kicks off a run, status badges progress, streaming text appears in the LLM node, run completes.

(Until end-to-end engine wiring is verified, the test may fail at the Cursor SDK boundary — that's fine, surface the error message and adjust `cursorSingleShot.ts` if needed.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer
git commit -m "feat(renderer): App wires Play button to real engine via window.api.run"
```

---

## Task 26: UI — RunSidebar (past runs)

**Files:**
- Create: `src/renderer/src/components/RunSidebar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create `src/renderer/src/components/RunSidebar.tsx`**

```tsx
import { useEffect, useState } from "react";

type RunRow = {
  runId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  error?: string;
};

type Props = {
  sessionId: string | null;
  refreshTick: number;
  onSelect: (runId: string) => void;
};

export function RunSidebar({ sessionId, refreshTick, onSelect }: Props) {
  const [runs, setRuns] = useState<RunRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setRuns([]);
      return;
    }
    void (async () => {
      const r = await window.api.run.list({ sessionId });
      if (cancelled) return;
      if (r.ok) setRuns(r.runs);
    })();
    return () => { cancelled = true; };
  }, [sessionId, refreshTick]);

  if (!sessionId) return null;
  if (runs.length === 0) return <div className="rs-empty">No runs yet</div>;

  return (
    <div className="rs-list">
      <div className="rs-head">Runs</div>
      {runs.map((r) => (
        <button key={r.runId} className={`rs-row rs-${r.status}`} onClick={() => onSelect(r.runId)}>
          <span className="rs-status">{r.status}</span>
          <span className="rs-time">{new Date(r.startedAt).toLocaleTimeString()}</span>
          <span className="rs-id">{r.runId.slice(0, 8)}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Mount `RunSidebar` in `App.tsx`**

Inside the existing left sidebar markup, add:

```tsx
<RunSidebar
  sessionId={sessionId}
  refreshTick={runListTick}
  onSelect={(runId) => setSelectedRunId(runId)}
/>
```

Add a `runListTick` state that increments on `run_end`:

```ts
const [runListTick, setRunListTick] = useState(0);

// inside the run_end handler in handlePlay:
if (ev.type === "run_end") {
  // ...existing...
  setRunListTick((t) => t + 1);
}
```

- [ ] **Step 3: Add minimal CSS**

```css
.rs-list { display: flex; flex-direction: column; gap: 4px; padding: 8px; }
.rs-head { font-weight: 600; opacity: 0.7; padding-bottom: 4px; }
.rs-row { display: flex; gap: 8px; padding: 4px 6px; border-radius: 4px; background: rgba(255,255,255,0.04); border: none; color: inherit; cursor: pointer; }
.rs-row:hover { background: rgba(255,255,255,0.08); }
.rs-status { font-size: 11px; opacity: 0.8; min-width: 64px; }
.rs-time { font-size: 11px; opacity: 0.6; }
.rs-id { font-size: 11px; opacity: 0.5; font-family: monospace; }
.rs-failed .rs-status { color: #fca5a5; }
.rs-succeeded .rs-status { color: #86efac; }
```

- [ ] **Step 4: Manual smoke**

Run: `pnpm dev`
Expected: after a run, sidebar shows the run row.

- [ ] **Step 5: Commit**

```bash
git add src/renderer
git commit -m "feat(renderer): RunSidebar — list past runs per session"
```

---

## Task 27: UI — Inspector "Output" tab + error toast

**Files:**
- Modify: `src/renderer/src/App.tsx` (or wherever the inspector lives — likely a `<NodeInspector>` already exists)

- [ ] **Step 1: Locate the inspector component**

Run: `grep -rn 'inspector\|Inspector' src/renderer/src --include="*.tsx" -l`

Whichever file holds the per-node inspector, add an "Output" tab that, when a node id is selected and a `runId` is set, reads `outputs.json` via `window.api.run.read` and displays the envelope JSON for the selected node.

- [ ] **Step 2: Implement the tab**

Inside the inspector component:

```tsx
const [outputForNode, setOutputForNode] = useState<unknown>(null);

useEffect(() => {
  if (!selectedNodeId || !activeRunId || !sessionId) {
    setOutputForNode(null);
    return;
  }
  let cancelled = false;
  void (async () => {
    const r = (await window.api.run.read({ sessionId, runId: activeRunId })) as
      | { ok: true; outputs: Record<string, unknown> }
      | { ok: false; error: string };
    if (cancelled) return;
    if (r.ok) setOutputForNode(r.outputs[selectedNodeId] ?? null);
  })();
  return () => { cancelled = true; };
}, [selectedNodeId, activeRunId, sessionId]);

return (
  <div className="ni-tabs">
    {/* existing tabs */}
    <pre className="ni-output">{JSON.stringify(outputForNode, null, 2)}</pre>
  </div>
);
```

- [ ] **Step 3: Surface errors**

Add a simple toast on `run_end{status:"failed"}` in `App.tsx`:

```ts
if (ev.type === "run_end" && ev.status === "failed") {
  showError(ev.error ?? "Run failed");
}
```

Where `showError` either uses an existing toast helper or alerts (search `App.tsx` for the existing pattern; mirror it).

- [ ] **Step 4: Commit**

```bash
git add src/renderer
git commit -m "feat(renderer): inspector Output tab + run error toast"
```

---

## Task 28: Manual smoke documentation

**Files:**
- Modify: `docs/smoke.md`

- [ ] **Step 1: Append to `docs/smoke.md`**

```markdown
## Graph execution smoke (LLM blocks)

Requires: `rote` on PATH (for the rote-flow step), Cursor API key in `.env`.

1. Open the app and create a new session.
2. In chat, ask: "Build a flow that translates 'hello' to French and outputs the result." The agent should produce: `input("hello") → llm("Translate {{input}} to French") → output`.
3. Click Play. Verify:
   - Each node's status badge progresses pending → running → done.
   - The LLM node displays streaming French text.
   - Final output is visible in the inspector → Output tab.
4. Substitute the LLM node with a rote-flow node that points at any installed rote flow. Click Play; verify the flow's stdout becomes the next node's `input`.
5. Inject a failure: edit the graph to reference a nonexistent rote flow (`x/y`). Click Play. Verify:
   - The flow node shows red error badge.
   - Downstream nodes are gray (skipped).
   - A toast surfaces the rote stderr message.
6. Open the Runs sidebar. Verify past runs are listed and clicking opens a read-only replay view.
7. Inject a branch node into a graph. Click Play. Verify the run rejects immediately with `UNSUPPORTED_NODE_TYPE` before any node executes.
```

- [ ] **Step 2: Commit**

```bash
git add docs/smoke.md
git commit -m "docs(smoke): graph execution + LLM blocks"
```

---

## Self-Review checklist (run after all tasks land)

- [ ] All spec success criteria (§2) covered by tasks above. Specifically:
  - SC #1 (UI Play end-to-end): Tasks 22-27.
  - SC #2 (MCP execute + get_run_result): Tasks 15-16.
  - SC #3 (rote subprocess flow node): Task 9.
  - SC #4 (templated FlowNode.params): Task 9 test asserts substitution.
  - SC #5 (fail-fast): Task 12 + Task 11 implementation.
  - SC #6 (branch/merge throws): Task 3.
  - SC #7 (past runs persisted + listed): Tasks 5, 26.
  - SC #8 (engine builds independently of Electron): Tasks 1-12.
- [ ] No placeholders ("TBD", "TODO", "etc."). Re-grep before committing.
- [ ] Type names consistent across tasks: `Run`, `RunEvent`, `RunStatus`, `NodeRunStatus`, `RunManifest`, `Envelope`, `CursorClient`, `CreateRunOptions`. ✓
- [ ] Method names consistent: `RunRegistry.start`, `cancel`, `subscribe`, `unsubscribe`, `waitForRunEnd`, `has`. ✓
- [ ] Engine package depends on `@flow-build/flowbuilder` (for `State` type) and `@cursor/sdk` only — no Electron deps. ✓
- [ ] All commits use plain messages, no Co-Authored-By lines.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-llm-blocks-and-graph-execution.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
