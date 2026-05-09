# Model Selector Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small model-selector pill with a dropdown to the Electron app's `PromptBox`, switchable per turn, sourced from `Cursor.models.list()` with curated fallback.

**Architecture:** Three layers. (1) `packages/core/src/models.ts` exposes `FALLBACK_MODELS` + `listModels()`. (2) `Session.send()` accepts an optional per-turn `model` and forwards it into `Agent.create({ model: { id } })`; the IPC schema, preload, and renderer hook are extended to thread it through. (3) Renderer adds a `<ModelPill>` rendered inside the existing `.pb-tools` slot of `PromptBox`; selection persists per-session via `meta.model` and globally via `userData/config.json`.

**Tech Stack:** TypeScript, Electron, React, vitest, zod, `@cursor/sdk` (`Cursor.models.list`, `Agent.create`).

**Spec:** `docs/superpowers/specs/2026-05-09-model-selector-pill-design.md`

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `packages/core/src/models.ts` | `ModelInfo` type, `FALLBACK_MODELS` constant, `listModels({ apiKey })` |
| `packages/core/src/models.test.ts` | Tests for `FALLBACK_MODELS` shape and `listModels` behavior |
| `src/main/ipc/models.ts` | IPC handlers: `models:list`, `app:get-default-model`, `app:set-default-model` |
| `src/renderer/src/components/ModelPill.tsx` | Pill button + dropdown component |

**Modified files:**

| Path | Reason |
|---|---|
| `packages/core/src/session/types.ts` | `SendTurnOptions` gains `model?: string` |
| `packages/core/src/session/session.ts` | `send()` reads `opts.model`, passes to `Agent.create`, persists via `meta.model` |
| `packages/core/src/session/session.test.ts` | New per-turn-model test |
| `packages/core/src/index.ts` | Re-export `ModelInfo`, `FALLBACK_MODELS`, `listModels` |
| `src/main/ipc/schemas.ts` | `SendInputSchema` gains optional `model` |
| `src/main/ipc/schemas.test.ts` | New cases for the optional field |
| `src/main/ipc/session.ts` | Pass `model` into `session.send()` |
| `src/main/index.ts` | Register `models.ts` IPC handlers |
| `src/preload/index.ts` | Add `models.list`, `app.getDefaultModel`, `app.setDefaultModel`; extend `session.send` |
| `src/renderer/src/components/PromptBox.tsx` | Render `<ModelPill>` in `.pb-tools` |
| `src/renderer/src/components/EmptyState.tsx` | Own `selectedModel` state for new sessions |
| `src/renderer/src/App.tsx` | Own `selectedModel` state in `SessionPanel`; bootstrap models + default |
| `src/renderer/src/hooks/useSession.ts` | `send(prompt, model?)` |
| `src/renderer/src/index.css` | `.mp`, `.mp-menu`, `.mp-row` styles |

---

## Task 1: Add core `models.ts` with `FALLBACK_MODELS`

**Files:**
- Create: `packages/core/src/models.ts`
- Test: `packages/core/src/models.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/models.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MODULE = "./models.js";

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.doUnmock("@cursor/sdk");
});

describe("FALLBACK_MODELS", () => {
  it("contains composer-2 with full pricing fields", async () => {
    const { FALLBACK_MODELS } = await import(MODULE);
    const composer = FALLBACK_MODELS.find((m: { id: string }) => m.id === "composer-2");
    expect(composer).toBeDefined();
    expect(composer.displayName).toBe("Composer 2");
    expect(composer.provider).toBe("Cursor");
    expect(composer.pricing).toEqual({ inputPerM: 0.5, outputPerM: 2.5 });
  });

  it("includes the seven curated models", async () => {
    const { FALLBACK_MODELS } = await import(MODULE);
    const ids = FALLBACK_MODELS.map((m: { id: string }) => m.id).sort();
    expect(ids).toEqual([
      "claude-4.6-sonnet",
      "claude-4.7-opus",
      "composer-2",
      "composer-2-fast",
      "gemini-3.1-pro",
      "gpt-5.4",
      "gpt-5.5",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run src/models.test.ts`
Expected: FAIL — `Cannot find module './models.js'`.

- [ ] **Step 3: Create `packages/core/src/models.ts` with the constant**

```ts
export type ModelInfo = {
  id: string;
  displayName: string;
  provider: string;
  pricing?: { inputPerM: number; outputPerM: number };
};

export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "composer-2",        displayName: "Composer 2",        provider: "Cursor",    pricing: { inputPerM: 0.5,  outputPerM: 2.5  } },
  { id: "composer-2-fast",   displayName: "Composer 2 (Fast)", provider: "Cursor",    pricing: { inputPerM: 1.5,  outputPerM: 7.5  } },
  { id: "claude-4.7-opus",   displayName: "Claude 4.7 Opus",   provider: "Anthropic", pricing: { inputPerM: 5.0,  outputPerM: 25.0 } },
  { id: "claude-4.6-sonnet", displayName: "Claude 4.6 Sonnet", provider: "Anthropic", pricing: { inputPerM: 3.0,  outputPerM: 15.0 } },
  { id: "gpt-5.5",           displayName: "GPT-5.5",           provider: "OpenAI",    pricing: { inputPerM: 5.0,  outputPerM: 30.0 } },
  { id: "gpt-5.4",           displayName: "GPT-5.4",           provider: "OpenAI",    pricing: { inputPerM: 2.5,  outputPerM: 15.0 } },
  { id: "gemini-3.1-pro",    displayName: "Gemini 3.1 Pro",    provider: "Google",    pricing: { inputPerM: 2.0,  outputPerM: 12.0 } },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run src/models.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/models.ts packages/core/src/models.test.ts
git commit -m "feat(core): add FALLBACK_MODELS constant for model selector"
```

---

## Task 2: Implement `listModels()` with SDK call + fallback

**Files:**
- Modify: `packages/core/src/models.ts`
- Modify: `packages/core/src/models.test.ts`

- [ ] **Step 1: Add failing tests for `listModels`**

Append to `packages/core/src/models.test.ts`:

```ts
describe("listModels", () => {
  it("returns FALLBACK_MODELS when apiKey is missing", async () => {
    const { listModels, FALLBACK_MODELS } = await import(MODULE);
    const result = await listModels({});
    expect(result).toEqual(FALLBACK_MODELS);
  });

  it("returns FALLBACK_MODELS when SDK throws", async () => {
    vi.doMock("@cursor/sdk", () => ({
      Cursor: {
        models: { list: vi.fn(async () => { throw new Error("boom"); }) },
      },
      Agent: { create: vi.fn() },
    }));
    const { listModels, FALLBACK_MODELS } = await import(MODULE);
    const result = await listModels({ apiKey: "crsr_test" });
    expect(result).toEqual(FALLBACK_MODELS);
  });

  it("returns mapped SDK result on success", async () => {
    vi.doMock("@cursor/sdk", () => ({
      Cursor: {
        models: {
          list: vi.fn(async () => [
            { id: "composer-2", displayName: "Composer 2", provider: "Cursor" },
            { id: "claude-4.7-opus", displayName: "Claude 4.7 Opus", provider: "Anthropic" },
          ]),
        },
      },
      Agent: { create: vi.fn() },
    }));
    const { listModels } = await import(MODULE);
    const result = await listModels({ apiKey: "crsr_test" });
    expect(result.map((m: { id: string }) => m.id)).toEqual(["composer-2", "claude-4.7-opus"]);
    expect(result[0].displayName).toBe("Composer 2");
    expect(result[0].provider).toBe("Cursor");
  });

  it("preserves curated pricing when SDK item lacks it", async () => {
    vi.doMock("@cursor/sdk", () => ({
      Cursor: {
        models: {
          list: vi.fn(async () => [
            { id: "composer-2", displayName: "Composer 2", provider: "Cursor" },
          ]),
        },
      },
      Agent: { create: vi.fn() },
    }));
    const { listModels } = await import(MODULE);
    const result = await listModels({ apiKey: "crsr_test" });
    expect(result[0].pricing).toEqual({ inputPerM: 0.5, outputPerM: 2.5 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && pnpm vitest run src/models.test.ts`
Expected: FAIL — `listModels is not a function`.

- [ ] **Step 3: Implement `listModels` in `packages/core/src/models.ts`**

Append:

```ts
import { Cursor } from "@cursor/sdk";

export type ListModelsOptions = { apiKey?: string };

function fallbackPricing(id: string): ModelInfo["pricing"] | undefined {
  return FALLBACK_MODELS.find((m) => m.id === id)?.pricing;
}

export async function listModels(opts: ListModelsOptions): Promise<ModelInfo[]> {
  const apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY ?? "";
  if (!apiKey) return FALLBACK_MODELS;
  try {
    const raw = await Cursor.models.list({ apiKey });
    if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_MODELS;
    return raw.map((m) => {
      const id = String((m as { id?: unknown }).id ?? "");
      const displayName = String(
        (m as { displayName?: unknown }).displayName ?? id,
      );
      const provider = String(
        (m as { provider?: unknown }).provider ?? "Unknown",
      );
      const pricing =
        (m as { pricing?: ModelInfo["pricing"] }).pricing ?? fallbackPricing(id);
      const info: ModelInfo = { id, displayName, provider };
      if (pricing) info.pricing = pricing;
      return info;
    });
  } catch {
    return FALLBACK_MODELS;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && pnpm vitest run src/models.test.ts`
Expected: PASS — all six cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/models.ts packages/core/src/models.test.ts
git commit -m "feat(core): listModels via Cursor.models.list with fallback"
```

---

## Task 3: Re-export from `@flow-build/core`

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Read current barrel**

Run: `cat packages/core/src/index.ts`

- [ ] **Step 2: Add the re-export line**

Append a line so `models.ts` exports are available to consumers:

```ts
export { FALLBACK_MODELS, listModels } from "./models.js";
export type { ModelInfo, ListModelsOptions } from "./models.js";
```

- [ ] **Step 3: Verify package builds**

Run: `cd packages/core && pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export models module from package barrel"
```

---

## Task 4: Per-turn `model` on `SendTurnOptions`

**Files:**
- Modify: `packages/core/src/session/types.ts`

- [ ] **Step 1: Inspect existing `SendTurnOptions`**

Run: `grep -n "SendTurnOptions" packages/core/src/session/types.ts`
Read the surrounding type declaration.

- [ ] **Step 2: Add the optional `model` field**

In `packages/core/src/session/types.ts`, change `SendTurnOptions` to include the new field. The existing definition is around line 70–95; locate it and add `model?: string;` to the type. Preserve all existing fields and JSDoc.

Result (illustrative — match the existing field order/formatting):

```ts
export type SendTurnOptions = {
  onEvent?: (e: SessionEvent) => void;
  /**
   * Override the session's default model for this turn only.
   * Falls back to the session's stored model when absent.
   */
  model?: string;
};
```

- [ ] **Step 3: Verify type-check**

Run: `cd packages/core && pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/session/types.ts
git commit -m "feat(core): add per-turn model override to SendTurnOptions"
```

---

## Task 5: `Session.send()` honors per-turn model

**Files:**
- Modify: `packages/core/src/session/session.ts`
- Modify: `packages/core/src/session/session.test.ts`

- [ ] **Step 1: Add failing test**

Append to `packages/core/src/session/session.test.ts` inside `describe("Session.send", ...)`:

```ts
it("uses opts.model for Agent.create + turn_start, persists meta.model", async () => {
  initSession({ baseDir: dir, sessionId: "S1", title: "t", model: "composer-2" });
  const fa = makeFakeAgent({
    streamItems: [
      { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
    ],
    waitResult: { status: "completed", usage: { inputTokens: 1, outputTokens: 1 } },
  });
  const installed = installFakeSdk({ createBehavior: [{ agent: fa }] });

  const { Session: S } = await import(SESSION_PATH);
  const session = new S({ baseDir: dir, sessionId: "S1", apiKey: "crsr_test" });
  await session.send("hi", { model: "claude-4.7-opus" });

  const cfg = installed.lastCreateConfig() as { model: { id: string } };
  expect(cfg.model.id).toBe("claude-4.7-opus");

  const lines = readFileSync(eventsPath(dir, "S1"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const turnStart = lines.find((l: { kind: string }) => l.kind === "turn_start");
  expect(turnStart.model).toBe("claude-4.7-opus");

  const meta = JSON.parse(readFileSync(join(dir, "sessions", "S1", "chat.json"), "utf8"));
  expect(meta.model).toBe("claude-4.7-opus");
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `cd packages/core && pnpm vitest run src/session/session.test.ts -t "uses opts.model"`
Expected: FAIL — `cfg.model.id` still equals `"composer-2"` (or meta unchanged).

- [ ] **Step 3: Thread `opts.model` through `Session.send`**

In `packages/core/src/session/session.ts`, locate the `send(prompt, opts)` method. Make these changes:

1. Near the top of `send`, derive the effective model:

```ts
const effectiveModel = opts.model ?? this.model;
```

2. In the `Agent.create({ ... })` call (around line 240), replace `model: { id: this.model }` with:

```ts
model: { id: effectiveModel },
```

3. In the `turn_start` event emission (around line 309 and the persisted-line variant), replace both `model: this.model` with:

```ts
model: effectiveModel,
```

4. After the turn completes successfully — at the point where `updateMeta` is called with `turnStatus` — extend it to include the model:

```ts
if (opts.model && opts.model !== this.model) {
  this.model = opts.model;
}
await this.updateMeta({ turnStatus: status, model: this.model });
```

If `updateMeta` does not yet accept `model`, also extend its signature and have it persist `meta.model`. (Check `chat.json` write: `writeChatMeta`.)

5. Verify any other site in `session.ts` that reads `this.model` still does the right thing for in-flight tool/system events; if any reads happen after the model assignment, prefer `effectiveModel` for symmetry.

- [ ] **Step 4: Run the new test plus the full session suite**

Run: `cd packages/core && pnpm vitest run src/session/session.test.ts`
Expected: PASS — new case green and prior cases still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/session.ts packages/core/src/session/session.test.ts
git commit -m "feat(core): honor per-turn model override in Session.send"
```

---

## Task 6: Extend `SendInputSchema` with optional `model`

**Files:**
- Modify: `src/main/ipc/schemas.ts`
- Modify: `src/main/ipc/schemas.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/main/ipc/schemas.test.ts` inside the existing `describe("schemas", ...)`:

```ts
it("SendInputSchema accepts optional model and rejects empty/long", () => {
  const validId = "01HXYZABCDEFGHJKMNPQRSTVWX";
  expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi", model: "composer-2" }).success).toBe(true);
  expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi" }).success).toBe(true);
  expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi", model: "" }).success).toBe(false);
  const longModel = "x".repeat(81);
  expect(SendInputSchema.safeParse({ sessionId: validId, prompt: "hi", model: longModel }).success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/ipc/schemas.test.ts -t "SendInputSchema accepts optional model"`
Expected: FAIL — model field is rejected by `.strict()`.

- [ ] **Step 3: Add `model` to `SendInputSchema`**

In `src/main/ipc/schemas.ts`, change `SendInputSchema`:

```ts
export const SendInputSchema = z
  .object({
    sessionId: SessionIdSchema,
    prompt: z.string().min(1).max(200_000),
    model: z.string().min(1).max(80).optional(),
  })
  .strict();
```

- [ ] **Step 4: Run all schema tests**

Run: `pnpm vitest run src/main/ipc/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/schemas.ts src/main/ipc/schemas.test.ts
git commit -m "feat(ipc): allow optional model on session:send"
```

---

## Task 7: Pass `model` through `session:send` IPC handler

**Files:**
- Modify: `src/main/ipc/session.ts`

- [ ] **Step 1: Update the `session:send` handler**

In `src/main/ipc/session.ts`, locate the `ipc.handle("session:send", ...)` block. Replace its body so the optional `model` is passed into `session.send`:

```ts
ipc.handle("session:send", async (_e: IpcMainInvokeEvent, raw: unknown) => {
  const parsed = SendInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.message);
  try {
    const session = await deps.registry.open(parsed.data.sessionId);
    const sendOpts: { model?: string; onEvent: (ev: SessionEvent) => void } = {
      onEvent: (ev: SessionEvent) => deps.registry.fanout(parsed.data.sessionId, ev),
    };
    if (parsed.data.model) sendOpts.model = parsed.data.model;
    const result: TurnResult = await session.send(parsed.data.prompt, sendOpts);
    return { ok: true, ...result };
  } catch (err) {
    return harnessFail(err);
  }
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit -p src/main`  (or the project's main type-check script)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/session.ts
git commit -m "feat(ipc): forward optional model into Session.send"
```

---

## Task 8: New IPC module — models + default-model config

**Files:**
- Create: `src/main/ipc/models.ts`

- [ ] **Step 1: Create the file with handlers**

```ts
import { app, type IpcMain } from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { listModels, type ModelInfo } from "@flow-build/core";

const DEFAULT_FALLBACK_ID = "composer-2";

type AppConfig = { defaultModel?: string };

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

function readConfig(): AppConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as AppConfig;
    return {};
  } catch {
    return {};
  }
}

function writeConfig(cfg: AppConfig): void {
  try {
    writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
  } catch (err) {
    console.warn("[models-ipc] failed to write config:", (err as Error).message);
  }
}

export type ModelsIpcDeps = {
  apiKey: string;
};

export function registerModelsIpc(ipc: IpcMain, deps: ModelsIpcDeps): void {
  let cache: ModelInfo[] | undefined;

  ipc.handle("models:list", async (_e, raw: unknown) => {
    const refresh = !!(raw && typeof raw === "object" && (raw as { refresh?: boolean }).refresh);
    if (cache && !refresh) return { ok: true, models: cache };
    try {
      const models = await listModels({ apiKey: deps.apiKey });
      cache = models;
      return { ok: true, models };
    } catch (err) {
      return { ok: false, code: "UNKNOWN", error: (err as Error).message };
    }
  });

  ipc.handle("app:get-default-model", async () => {
    const cfg = readConfig();
    return { ok: true, model: cfg.defaultModel ?? DEFAULT_FALLBACK_ID };
  });

  ipc.handle("app:set-default-model", async (_e, raw: unknown) => {
    if (!raw || typeof raw !== "object") return { ok: false, code: "INVALID", error: "expected object" };
    const id = (raw as { model?: unknown }).model;
    if (typeof id !== "string" || id.length === 0 || id.length > 80) {
      return { ok: false, code: "INVALID", error: "invalid model id" };
    }
    const cfg = readConfig();
    cfg.defaultModel = id;
    writeConfig(cfg);
    return { ok: true };
  });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit -p src/main`
Expected: no errors. (If `app` import path differs, match what `src/main/index.ts` already does.)

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/models.ts
git commit -m "feat(ipc): models:list + default-model config handlers"
```

---

## Task 9: Wire models IPC into app bootstrap

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Find the existing `registerSessionIpc` call**

Run: `grep -n "registerSessionIpc\|ipcMain" src/main/index.ts`

- [ ] **Step 2: Register the new module next to it**

Add the import:

```ts
import { registerModelsIpc } from "./ipc/models.js";
```

In the same block where `registerSessionIpc` is called, add:

```ts
registerModelsIpc(ipcMain, { apiKey: process.env.CURSOR_API_KEY ?? "" });
```

- [ ] **Step 3: Run the app in dev mode briefly**

Run: `pnpm dev`
- App should boot.
- In DevTools console, run `await window.api.models.list()` — once the preload change in Task 10 is in place. (For now this task only adds main-side wiring; the test happens after Task 10.)

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): register models IPC at app bootstrap"
```

---

## Task 10: Extend preload API surface

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `models` and `app` namespaces; extend `session.send`**

In `src/preload/index.ts`, add inside the `api` object (next to `session`):

```ts
models: {
  async list(opts: { refresh?: boolean } = {}): Promise<import("@flow-build/core").ModelInfo[]> {
    const r = await ipcRenderer.invoke("models:list", opts);
    return unwrap<{ models: import("@flow-build/core").ModelInfo[] }>(r).models;
  },
},
app: {
  async getDefaultModel(): Promise<string> {
    const r = await ipcRenderer.invoke("app:get-default-model");
    return unwrap<{ model: string }>(r).model;
  },
  async setDefaultModel(model: string): Promise<void> {
    unwrap(await ipcRenderer.invoke("app:set-default-model", { model }));
  },
},
```

Then change `session.send` to take the optional model:

```ts
async send(sessionId: string, prompt: string, model?: string): Promise<TurnResult> {
  const r = await ipcRenderer.invoke("session:send", {
    sessionId,
    prompt,
    ...(model ? { model } : {}),
  });
  return unwrap<TurnResult>(r);
},
```

- [ ] **Step 2: Boot dev mode and smoke-test the new APIs**

Run: `pnpm dev`
In DevTools console:

```js
await window.api.models.list();
await window.api.app.getDefaultModel();
await window.api.app.setDefaultModel("claude-4.7-opus");
await window.api.app.getDefaultModel();
```

Expected: array of `ModelInfo`; `composer-2` then `claude-4.7-opus`. Reset by setting it back if you like.

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose models.list, app default-model, model on send"
```

---

## Task 11: `useSession` hook accepts model in `send`

**Files:**
- Modify: `src/renderer/src/hooks/useSession.ts`

- [ ] **Step 1: Update the hook signature**

In `src/renderer/src/hooks/useSession.ts`, change `send`:

```ts
const send = useCallback(
  async (prompt: string, model?: string) => {
    if (!sessionId) return;
    await window.api.session.send(sessionId, prompt, model);
  },
  [sessionId],
);
```

And update the return type at the top of `useSession`:

```ts
send: (prompt: string, model?: string) => Promise<void>;
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit -p src/renderer`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useSession.ts
git commit -m "feat(renderer): useSession.send accepts optional model"
```

---

## Task 12: New `ModelPill` component

**Files:**
- Create: `src/renderer/src/components/ModelPill.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from "react";
import type { ModelInfo } from "@flow-build/core";

type ModelPillProps = {
  value: string;
  onChange: (id: string) => void;
  models: ModelInfo[];
  disabled?: boolean;
};

function shortName(model: ModelInfo | undefined, fallbackId: string): string {
  if (!model) return fallbackId;
  return model.displayName || model.id;
}

function priceLabel(m: ModelInfo): string {
  if (!m.pricing) return "";
  const fmt = (n: number): string => `$${n.toFixed(2)}`;
  return `${fmt(m.pricing.inputPerM)} in / ${fmt(m.pricing.outputPerM)} out`;
}

export function ModelPill({ value, onChange, models, disabled }: ModelPillProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mp-wrap" ref={wrapRef}>
      <button
        type="button"
        className="mp"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={selected ? `${selected.provider} · ${selected.id}` : undefined}
      >
        <span className="mp-name">{shortName(selected, value)}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="mp-menu" role="listbox">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mp-row ${m.id === value ? "is-active" : ""}`}
              role="option"
              aria-selected={m.id === value}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <span className="mp-row-name">{m.displayName || m.id}</span>
              <span className="mp-row-price">{priceLabel(m)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit -p src/renderer`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ModelPill.tsx
git commit -m "feat(renderer): ModelPill component with dropdown"
```

---

## Task 13: Render `ModelPill` inside `PromptBox`

**Files:**
- Modify: `src/renderer/src/components/PromptBox.tsx`

- [ ] **Step 1: Extend props**

Change the props type:

```tsx
import type { ModelInfo } from "@flow-build/core";
import { ModelPill } from "./ModelPill";

type PromptBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isRunning?: boolean;
  large?: boolean;
  placeholder?: string;
  model: string;
  onModelChange: (id: string) => void;
  models: ModelInfo[];
};
```

- [ ] **Step 2: Render the pill in `.pb-tools`**

Replace the existing `<div className="pb-tools" />` with:

```tsx
<div className="pb-tools">
  <ModelPill
    value={model}
    onChange={onModelChange}
    models={models}
    disabled={isRunning}
  />
</div>
```

Add `model`, `onModelChange`, `models` to the destructured props at the top of the component.

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit -p src/renderer`
Expected: errors in callers (`EmptyState.tsx`, `App.tsx`) — these are addressed in Tasks 14 and 15.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/PromptBox.tsx
git commit -m "feat(renderer): PromptBox renders ModelPill in tools slot"
```

---

## Task 14: `EmptyState` owns model state for new sessions

**Files:**
- Modify: `src/renderer/src/components/EmptyState.tsx`

- [ ] **Step 1: Inspect current props + `send` callsite**

Run: `grep -n "PromptBox\|api.session.create" src/renderer/src/components/EmptyState.tsx`

- [ ] **Step 2: Take models + default + setter as props; thread through**

Edit `EmptyState.tsx`:

```tsx
import type { ModelInfo } from "@flow-build/core";

type EmptyStateProps = {
  // ...existing fields...
  models: ModelInfo[];
  initialModel: string;
  onPickModel: (id: string) => void;
};

export function EmptyState({ /* existing */ models, initialModel, onPickModel }: EmptyStateProps) {
  const [val, setVal] = useState("");
  const [model, setModel] = useState(initialModel);

  function handleModelChange(id: string): void {
    setModel(id);
    onPickModel(id);   // bubble to App for persistence
  }

  // existing send() — extend to pass model into create + send
  async function send(): Promise<void> {
    const text = val.trim();
    if (!text) return;
    const { sessionId } = await window.api.session.create({
      title: text.slice(0, 80),
      model,
    });
    await window.api.session.send(sessionId, text, model);
    // ...rest unchanged
  }

  return (
    <PromptBox
      value={val}
      onChange={setVal}
      onSubmit={() => send()}
      large
      model={model}
      onModelChange={handleModelChange}
      models={models}
    />
  );
}
```

(Match existing EmptyState structure — only add the new props/state, don't re-shape unrelated logic.)

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit -p src/renderer`
Expected: errors only in `App.tsx` (it passes the new props next).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/EmptyState.tsx
git commit -m "feat(renderer): EmptyState owns model state, passes to create+send"
```

---

## Task 15: `App.tsx` bootstraps models + default; threads into both PromptBoxes

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Add top-level state + bootstrap effect**

Near the other top-level state in the root component:

```tsx
import type { ModelInfo } from "@flow-build/core";

const [models, setModels] = useState<ModelInfo[]>([]);
const [globalDefault, setGlobalDefault] = useState<string>("composer-2");

useEffect(() => {
  let cancelled = false;
  void (async () => {
    const [list, def] = await Promise.all([
      window.api.models.list(),
      window.api.app.getDefaultModel(),
    ]);
    if (cancelled) return;
    setModels(list);
    setGlobalDefault(def);
  })();
  return () => {
    cancelled = true;
  };
}, []);

const persistDefault = useCallback((id: string) => {
  setGlobalDefault(id);
  void window.api.app.setDefaultModel(id);
}, []);
```

- [ ] **Step 2: Pass props into `EmptyState`**

```tsx
<EmptyState
  /* existing props */
  models={models}
  initialModel={globalDefault}
  onPickModel={persistDefault}
/>
```

- [ ] **Step 3: In `SessionPanel`, own `selectedModel` from session metadata**

Inside `SessionPanel` (where `useSession` is called), add:

```tsx
const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);

useEffect(() => {
  if (metadata?.model) setSelectedModel(metadata.model);
}, [metadata?.model]);

function handleModelChange(id: string): void {
  setSelectedModel(id);
  void window.api.app.setDefaultModel(id);
}

// Refine send: pass selectedModel as the per-turn override
async function handleRefine(): Promise<void> {
  // ...existing prelude...
  await send(refineVal.trim(), selectedModel);   // useSession.send signature from Task 11
}
```

- [ ] **Step 4: Pass props into the refine `<PromptBox>` (around line 693)**

```tsx
<PromptBox
  value={refineVal}
  onChange={setRefineVal}
  onSubmit={() => void handleRefine()}
  isRunning={isRunning}
  onStop={() => void cancel()}
  placeholder={...}
  model={selectedModel ?? metadata?.model ?? globalDefault}
  onModelChange={handleModelChange}
  models={models}
/>
```

- [ ] **Step 5: Type-check + run**

Run: `pnpm tsc --noEmit -p src/renderer`
Expected: no errors.

Run: `pnpm dev`
- Empty state shows pill; click → dropdown lists models; selecting one updates the pill.
- After sending, switch sessions and back: pill reflects the session's `meta.model`.
- Mid-session, pick a different model, send a refine prompt: in DevTools, observe a `turn_start` event whose `model` matches the new selection.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(renderer): bootstrap models + thread selection into prompts"
```

---

## Task 16: Pill + dropdown styles

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Inspect existing prompt pill styles for parity**

Run: `grep -n "pb-send\|pb-stop\|pb-tools" src/renderer/src/index.css`

Take note of border-radius, font sizing, color tokens — match them.

- [ ] **Step 2: Add pill + menu styles**

Append to `src/renderer/src/index.css`:

```css
.mp-wrap {
  position: relative;
  display: inline-flex;
}
.mp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-2, #1f2329);
  color: var(--text, #e6e8eb);
  font-size: 12px;
  border: 1px solid transparent;
  cursor: pointer;
}
.mp:hover { background: var(--surface-3, #2a2f37); }
.mp[disabled] { opacity: 0.5; cursor: not-allowed; }
.mp-name { font-weight: 500; }

.mp-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--surface-1, #15181d);
  border: 1px solid var(--border, #2a2f37);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  padding: 4px;
  z-index: 40;
  display: flex;
  flex-direction: column;
}
.mp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.mp-row:hover { background: var(--surface-2, #1f2329); }
.mp-row.is-active { background: var(--surface-3, #2a2f37); }
.mp-row-name { font-weight: 500; }
.mp-row-price { opacity: 0.7; font-variant-numeric: tabular-nums; }
```

If the file uses a different token system (CSS vars from a tokens file), replace the fallbacks above to match what `pb-send`/`pb-stop` already use.

- [ ] **Step 3: Visual sanity check**

Run: `pnpm dev`
Inspect the empty state and an existing session: pill looks visually consistent with the Send/Stop pills. Dropdown opens above the pill, scrolls when long.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style(renderer): ModelPill + dropdown styles"
```

---

## Task 17: End-to-end manual verification

**Files:** none (manual)

- [ ] **Step 1: Boot fresh, no API key**

Unset `CURSOR_API_KEY` in your env (or `.env.local`), start `pnpm dev`.
- Pill in empty state shows `Composer 2`.
- Dropdown lists the seven curated models with prices.

- [ ] **Step 2: Boot with API key**

Set `CURSOR_API_KEY=...`, restart.
- Pill dropdown shows whatever `Cursor.models.list({ apiKey })` returned (or curated list if SDK call fails).
- DevTools: `await window.api.models.list()` returns the same array.

- [ ] **Step 3: Per-session persistence**

Pick `Claude 4.7 Opus`, type a prompt, send.
- New session created with `meta.model === "claude-4.7-opus"`. Verify by inspecting `~/.flow-build/sessions/<id>/chat.json` (or whatever `baseDir` is).
- Switch to another session, then back: pill reflects this session's stored model.

- [ ] **Step 4: Per-turn switch mid-session**

In an existing session, change pill to `GPT-5.5`, send a refine prompt.
- DevTools network/event: `turn_start` event has `model: "gpt-5.5"`.
- After completion: `chat.json` has `model: "gpt-5.5"`.

- [ ] **Step 5: Restart inherits last-used as global default**

Pick a non-default model in empty state. Quit + restart app.
- Empty state pill shows the last-used model (loaded via `app:get-default-model`).

- [ ] **Step 6: Disabled while running**

Send a long prompt. Pill is disabled and unclickable until completion.

- [ ] **Step 7: Run all automated suites once more**

Run: `pnpm test`
Expected: all green.

- [ ] **Step 8: Commit a marker if tests previously failed**

If any earlier task left lint or type drift, fix and:

```bash
git add -A
git commit -m "chore: post-feature cleanup"
```

Otherwise nothing to commit.

---

## Self-review notes

- **Spec coverage:** All five spec decisions are realized — switchable per turn (Task 5), live + curated (Tasks 1–2), pill in `.pb-tools` (Task 13), per-session + global default (Tasks 8/14/15), pricing in dropdown (Task 12).
- **Type consistency:** `ModelInfo` defined once in `models.ts` (Task 1), re-exported (Task 3), consumed everywhere as the same import. `SendTurnOptions.model` (Task 4) matches `Session.send` and IPC schema (Tasks 5–7).
- **No placeholders.** Every step shows code or commands. No "TBD" / "etc."
- **Frequent commits.** Each task ends with a single focused commit; `Co-Authored-By` lines are never used.
- **Renderer tests omitted intentionally** — no test harness exists in `src/renderer` today; manual verification in Task 17 covers the UI.
