# Model Selector Pill — Electron Agent Harness

**Status:** Design draft (2026-05-09)
**Scope:** Add a model selector pill + dropdown to the Electron app's prompt input. Switchable per turn, list sourced from the Cursor SDK with curated fallback.

## Motivation

The harness today locks each session to a single model (default `composer-2`, set at session creation in `packages/core/src/config.ts:15`). The Cursor SDK supports per-call model selection via `Agent.send({ model })` (`@cursor/sdk` `agent.d.ts:19`). Users need to choose a model at the moment they hit send — for cost trade-offs (Composer 2 at $0.50/M in vs Opus at $5/M) and for capability trade-offs.

## Cursor SDK research

- `@cursor/sdk` does **not** ship a static catalog. Only the default config in the bundled SDK references `gpt-5`.
- The catalog source of truth is `Cursor.models.list()` (per `options.d.ts:125` and `cloud-api-client.d.ts:184`). It returns `SDKModel[]` per account.
- Public pricing page (cursor.com/docs/models-and-pricing) lists model **families**: Cursor (Composer), Anthropic (Claude), OpenAI (GPT), Google (Gemini), xAI (Grok), Moonshot (Kimi). Exact IDs vary by account.
- Reference IDs from the in-repo research compendium (`cursor-agent-sdk-research.md`):
  | id | provider | input $/M | output $/M |
  |---|---|---|---|
  | composer-2 | Cursor | 0.50 | 2.50 |
  | composer-2-fast | Cursor | 1.50 | 7.50 |
  | claude-4.6-sonnet | Anthropic | 3.00 | 15.00 |
  | claude-4.7-opus | Anthropic | 5.00 | 25.00 |
  | gpt-5.4 | OpenAI | 2.50 | 15.00 |
  | gpt-5.5 | OpenAI | 5.00 | 30.00 |
  | gemini-3.1-pro | Google | 2.00 | 12.00 |

## Decisions

| # | Decision |
|---|---|
| 1 | Model is **switchable per turn**. Selection at send-time, plumbed through `Session.send()`. |
| 2 | Catalog: **live `Cursor.models.list()` cached in main, with curated fallback** when the call fails or no API key is present. |
| 3 | Pill placement: **left of the send button**, in the existing `.pb-tools` slot of `PromptBox`. |
| 4 | Persistence: **per-session last-used (`meta.model`) + global default** (`userData/config.json`). Global default updates whenever the user picks a model. |
| 5 | Display: pill shows short name; dropdown row shows name + per-1M-token pricing (input / output). |

## Architecture

Three layers, top-down:

### Layer 1 — Models catalog (core + main)

**New: `packages/core/src/models.ts`**

```ts
export type ModelInfo = {
  id: string;
  displayName: string;
  provider: string;            // "Cursor" | "Anthropic" | "OpenAI" | "Google" | …
  pricing?: { inputPerM: number; outputPerM: number };
};

export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "composer-2",       displayName: "Composer 2",        provider: "Cursor",    pricing: { inputPerM: 0.50, outputPerM: 2.50 } },
  { id: "composer-2-fast",  displayName: "Composer 2 (Fast)", provider: "Cursor",    pricing: { inputPerM: 1.50, outputPerM: 7.50 } },
  { id: "claude-4.7-opus",  displayName: "Claude 4.7 Opus",   provider: "Anthropic", pricing: { inputPerM: 5.00, outputPerM: 25.00 } },
  { id: "claude-4.6-sonnet",displayName: "Claude 4.6 Sonnet", provider: "Anthropic", pricing: { inputPerM: 3.00, outputPerM: 15.00 } },
  { id: "gpt-5.5",          displayName: "GPT-5.5",           provider: "OpenAI",    pricing: { inputPerM: 5.00, outputPerM: 30.00 } },
  { id: "gpt-5.4",          displayName: "GPT-5.4",           provider: "OpenAI",    pricing: { inputPerM: 2.50, outputPerM: 15.00 } },
  { id: "gemini-3.1-pro",   displayName: "Gemini 3.1 Pro",    provider: "Google",    pricing: { inputPerM: 2.00, outputPerM: 12.00 } },
];

export async function listModels(opts: { apiKey?: string }): Promise<ModelInfo[]>;
```

`listModels` calls the static `Cursor.models.list({ apiKey })` (per `@cursor/sdk` `stubs.d.ts:87`) when the key is present, normalizes each `SDKModel` into `ModelInfo` (best-effort `displayName`/`provider`/`pricing` extraction; missing fields tolerated), and returns it. On error or missing key it returns `FALLBACK_MODELS`. No throws.

**New: `src/main/ipc/models.ts`**

Registers two IPC channels and one model-config helper:

- `models:list` → returns cached `ModelInfo[]`. Cache populated on first call (or app boot); refreshable via optional `{ refresh: true }`.
- `app:get-default-model` → reads `userData/config.json` `defaultModel` field, falls back to `"composer-2"`.
- `app:set-default-model` → writes the field. Errors swallowed + logged.

`userData/config.json` shape:

```json
{ "defaultModel": "claude-4.7-opus" }
```

Wiring lives in `src/main/index.ts` next to the existing `registerSessionIpc`.

### Layer 2 — Per-turn model plumbing

**Modified: `packages/core/src/session/types.ts`**

```ts
export type SendTurnOptions = {
  onEvent?: (e: SessionEvent) => void;
  model?: string;               // NEW — overrides session.model for this turn
};
```

**Modified: `packages/core/src/session/session.ts`**

```ts
async send(prompt: string, opts: SendTurnOptions = {}): Promise<TurnResult> {
  const model = opts.model ?? this.model;
  // …
  agent = await Agent.create({
    apiKey: this.apiKey,
    model: { id: model },           // was this.model
    local: { cwd: this.workspaceDir, settingSources: ["project", "user"] },
    …
  });
  // turn_start event also uses `model`
  // on success: this.model = model; await this.updateMeta({ model });
}
```

The agent is already recreated each `send()` (`session.ts:240`), so the only change is which value is threaded into `Agent.create({ model })` and the `turn_start` event. `this.model` and `meta.model` are updated post-success so subsequent turns inherit.

**Modified: `src/main/ipc/schemas.ts`**

```ts
export const SendInputSchema = z.object({
  sessionId: SessionIdSchema,
  prompt: z.string().min(1).max(200_000),
  model: z.string().min(1).max(80).optional(),  // NEW
}).strict();
```

**Modified: `src/main/ipc/session.ts`** — pass `model` into `session.send(prompt, { model, onEvent })`.

**Modified: `src/preload/index.ts`**

```ts
session.send(sessionId: string, prompt: string, model?: string): Promise<TurnResult>;
models.list(opts?: { refresh?: boolean }): Promise<ModelInfo[]>;
app.getDefaultModel(): Promise<string>;
app.setDefaultModel(id: string): Promise<void>;
```

### Layer 3 — Renderer pill UI

**New: `src/renderer/src/components/ModelPill.tsx`**

```tsx
type ModelPillProps = {
  value: string;
  onChange: (id: string) => void;
  models: ModelInfo[];
  disabled?: boolean;
};
```

Renders a button (`<button class="mp">`) showing the selected model's short name. Click toggles a popover (`<div class="mp-menu">`) anchored above the pill with one row per model: name on the left, `$X / $Y per 1M` on the right. Uses native `onBlur` + Escape-key handling for dismissal — no portals.

**Modified: `src/renderer/src/components/PromptBox.tsx`**

New props: `model`, `onModelChange`, `models`. Renders `<ModelPill>` inside the existing `.pb-tools` div. Pill is `disabled` while `isRunning`.

**Modified: `src/renderer/src/components/EmptyState.tsx`** and **`App.tsx` `SessionPanel`** — own `selectedModel` state. EmptyState initializes from `globalDefault`; SessionPanel initializes from `session.metadata.model` (already loaded in `useSession`).

**Modified: `src/renderer/src/hooks/useSession.ts`**

```ts
send: (prompt: string, model?: string) => Promise<void>
```

Plumbs the model down to `window.api.session.send`.

**Modified: `src/renderer/src/index.css`** — adds `.mp`, `.mp-menu`, `.mp-row`, `.mp-row-price` styles, mirroring the existing `.pb-send` / `.pb-stop` rounded-pill aesthetic.

## Data flow

```
App boot
 └─ main: models cache populated lazily (FALLBACK_MODELS if no key)

Renderer mount
 ├─ models = await window.api.models.list()
 └─ globalDefault = await window.api.app.getDefaultModel()

EmptyState                            SessionPanel
  selectedModel = globalDefault         selectedModel = metadata.model
  pill onChange → setSelectedModel      pill onChange → setSelectedModel
  send →                                send →
    session.create({ model })             useSession.send(prompt, selectedModel)
    useSession.send(prompt, model)        → window.api.session.send(id, prompt, model)
    app.setDefaultModel(model)            → IPC → Session.send(prompt, { model })
                                          → Agent.create({ model: { id } })
                                          → turn_start emits new model
                                          → meta.model = model
                                          → app.setDefaultModel(model)
```

## Error handling

| Failure | Behavior |
|---|---|
| `Cursor.models.list()` throws | Log, return `FALLBACK_MODELS`. Pill works normally. |
| No `CURSOR_API_KEY` at boot | Skip live fetch, return `FALLBACK_MODELS`. |
| Unknown model id (catalog stale) | SDK rejects on `Agent.create`; existing `mapToHarnessError` path emits `error` + `failed_to_start`. Pill does not pre-validate. |
| Turn in flight | Pill is `disabled` while `isRunning`, mirroring send/stop button. |
| `userData/config.json` write fails | Swallow + log. Default falls back to `composer-2`. |

## Testing

| File | Cases |
|---|---|
| `packages/core/src/models.test.ts` (new) | (a) `FALLBACK_MODELS` shape & ids; (b) `listModels` returns mock SDK result on success; (c) returns fallback on thrown error; (d) returns fallback when `apiKey` missing. |
| `packages/core/src/session/session.test.ts` (extend) | `send(prompt, { model: "claude-4.7-opus" })` emits `turn_start` with that model and persists `meta.model = "claude-4.7-opus"`. |
| `src/main/ipc/schemas.test.ts` (extend) | `SendInputSchema` accepts optional `model`; rejects empty string and >80 chars. |

No renderer-side test harness exists in this repo today (no `src/renderer/**/*.test.*`). The pill is verified manually:

1. Boot app with no `CURSOR_API_KEY` → pill shows `Composer 2`, dropdown lists fallback set.
2. Boot with key → pill lists live catalog.
3. Pick `Claude 4.7 Opus` in EmptyState, send → new session's `meta.model` is `claude-4.7-opus`.
4. In an existing session, switch to `GPT-5.5`, send → `turn_start` event carries `gpt-5.5`; `meta.model` updates.
5. Restart app → pill defaults to last-picked model in EmptyState.

## Out of scope

- Per-model parameter editing (temperature, max tokens, etc.). The SDK supports it via `params`; not part of this pill.
- Showing real-time spend or rate-limit info next to each model.
- Team/role-based model gating.

## Files touched

**New:**
- `packages/core/src/models.ts`
- `packages/core/src/models.test.ts`
- `src/main/ipc/models.ts`
- `src/renderer/src/components/ModelPill.tsx`

**Modified:**
- `packages/core/src/session/types.ts`
- `packages/core/src/session/session.ts`
- `packages/core/src/session/session.test.ts`
- `packages/core/src/index.ts` (re-export `ModelInfo`, `FALLBACK_MODELS`, `listModels`)
- `src/main/index.ts`
- `src/main/ipc/session.ts`
- `src/main/ipc/schemas.ts`
- `src/main/ipc/schemas.test.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/PromptBox.tsx`
- `src/renderer/src/components/EmptyState.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/hooks/useSession.ts`
- `src/renderer/src/index.css`
