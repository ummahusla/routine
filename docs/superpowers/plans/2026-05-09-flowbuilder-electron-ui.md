# Flowbuilder Electron UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Specs:**
- `docs/superpowers/specs/2026-05-09-flowbuilder-harness-design.md`
- `docs/superpowers/specs/2026-05-09-multi-turn-session-and-electron-integration-design.md`

**Goal:** Wire disk-backed flowbuilder sessions into the Electron app read-only. The main process reads `<baseDir>/sessions/<id>/manifest.json` and `state.json`, validates them with `@flow-build/flowbuilder` schemas, exposes a small `flowbuilder:*` IPC surface, and the renderer lists sessions and renders the selected graph.

**Brainstorming outcome:** Keep the session list in the existing left sidebar instead of adding a second panel. Map flowbuilder nodes (`input | output | flow | branch | merge`) to the existing renderer `Flow` model and `FlowCanvas`, because the current canvas already has icons, colors, minimap, inspector, and edge rendering. Keep this pass read-only and avoid a filesystem watcher unless it stays simple; a manual re-read on selection/load satisfies the current handoff.

**Tech Stack:** Electron main/preload IPC, React renderer, TypeScript, Zod schemas from `@flow-build/flowbuilder`, pnpm workspace, vitest where tests already exist.

**Conventions:**
- Never include `Co-Authored-By` lines in commit messages.
- Use `pnpm`, never `npm`.
- Each task is a focused TDD-style cycle: add data/testable surface, run the narrowest useful check, implement, rerun, commit.
- Read-only UI only. No `flowbuilder_set_state`, no renderer writes, no session creation UI.
- Dev base directory can be overridden with `FLOW_BUILD_FLOWBUILDER_BASE`; production defaults to `app.getPath("userData") + "/flowbuilder"`.

---

## Task 1: Add mock flowbuilder sessions

**Files:**
- Add: `mock/flowbuilder/sessions/<sessionId>/manifest.json`
- Add: `mock/flowbuilder/sessions/<sessionId>/state.json`
- Add/update docs in this plan and optionally root docs/comments for the env var path

- [ ] **Step 1: Create valid fixtures**

Add three fixture sessions under `mock/flowbuilder/sessions/`:
- empty session
- small linear pipeline (`input -> flow -> output`)
- branching graph (`input -> branch -> two flows -> merge -> output`)

Use ids that satisfy `^s_[0-9a-z]{12}$`. Use `schemaVersion: 1` in both files and keep all edges referentially valid.

- [ ] **Step 2: Validate with the package schemas**

Run a small TypeScript or package test command that parses every fixture through `ManifestSchema` and `StateSchema` and calls `validateRefIntegrity` if exported or mirrors the same integrity check from `SessionManager`.

- [ ] **Step 3: Commit**

Commit message:

```bash
test(flowbuilder): add disk-backed mock sessions
```

---

## Task 2: Add flowbuilder IPC reader surface

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: root `package.json` if the Electron app needs an explicit workspace dependency on `@flow-build/flowbuilder`

- [ ] **Step 1: Add a main-process reader**

Implement `flowbuilder:list-sessions` and `flowbuilder:read-session`.

Behavior:
- Base dir = `process.env.FLOW_BUILD_FLOWBUILDER_BASE` if set, else `join(app.getPath("userData"), "flowbuilder")`.
- Scan `<baseDir>/sessions`.
- For each session directory, read and validate `manifest.json` and `state.json`.
- Reject unsupported `schemaVersion !== 1` visibly by returning `{ ok: false, error }`.
- Sort sessions by `manifest.updatedAt` descending.
- Return id, name, description, createdAt, updatedAt, node count, and base dir for list rows.

- [ ] **Step 2: Add preload namespace**

Expose `window.api.flowbuilder.listSessions()` and `window.api.flowbuilder.readSession(id)`. Keep `cursorChat` intact for now because replacing multi-turn chat is out of scope.

- [ ] **Step 3: Type the renderer API**

Update `src/renderer/src/env.d.ts` with the IPC result types, using local serializable types rather than importing Electron main modules.

- [ ] **Step 4: Run checks**

Run TypeScript checks for the Electron app and package tests as available.

- [ ] **Step 5: Commit**

Commit message:

```bash
feat(electron): expose read-only flowbuilder session IPC
```

---

## Task 3: Map flowbuilder state to renderer flows

**Files:**
- Add: `src/renderer/src/utils/flowbuilder.ts`
- Modify: `src/renderer/src/types.ts`
- Modify: `src/renderer/src/data/typeColors.ts` if adding a `merge` renderer type is cleaner than reusing `transform`

- [ ] **Step 1: Add the pure mapper**

Map flowbuilder session payloads to existing `Flow`:
- `input` -> renderer `trigger`, icon `webhook` or `schedule`, label `Input`
- `flow` -> renderer `llm`/`http`/`transform` based on flow ref category when obvious, label from flow ref, sub from params
- `branch` -> renderer `branch`, icon `branch`
- `merge` -> renderer `transform` or new `merge` type, icon `branch`/`transform`
- `output` -> renderer `output`, icon `check`/`doc`

Compute deterministic layout columns from graph topology and row positions within each layer.

- [ ] **Step 2: Add focused tests if test wiring is practical**

Use vitest for the pure mapper if the root config supports it; otherwise keep the mapper simple and rely on `tsc --noEmit`.

- [ ] **Step 3: Commit**

Commit message:

```bash
feat(renderer): map flowbuilder state to canvas flows
```

---

## Task 4: Render sessions in the Electron UI

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/index.css`
- Modify: `src/renderer/src/components/FlowCanvas.tsx` / `FlowNode.tsx` only if read-only affordances need hiding

- [ ] **Step 1: Load sessions on mount**

Call `window.api.flowbuilder.listSessions()` on mount. If sessions exist, select the newest and call `readSession`. If none exist, show an empty state that mentions the base dir and dev override env var.

- [ ] **Step 2: Replace mock list with sessions**

Update `Sidebar` to render session rows: id, name, relative updated time, node count. Keep search. Disable or relabel "New flow" because session creation is out of scope.

- [ ] **Step 3: Render selected graph read-only**

Render the mapped `Flow` in `FlowCanvas`. Keep node focus/inspector. Do not pass mutation callbacks from `App`, and hide/delete/connector controls when handlers are absent so the UI is visibly read-only.

- [ ] **Step 4: Surface hard errors**

If IPC returns unsupported schema or invalid files, show the error in the main panel instead of silently falling back to templates.

- [ ] **Step 5: Commit**

Commit message:

```bash
feat(renderer): render flowbuilder sessions from disk
```

---

## Task 5: Final verification

- [ ] Run `pnpm run typecheck`.
- [ ] Run `pnpm -r test`.
- [ ] Run `git status --short` and confirm only intentional changes plus pre-existing untracked files remain.
- [ ] If checks pass, make a final verification commit only if any fixups remain uncommitted.
