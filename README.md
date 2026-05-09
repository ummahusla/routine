# flow-build

Minimal CLI wrapper around the [Cursor SDK](https://cursor.com/docs/sdk/typescript)
that streams agent output with tool-call indicators. Designed as the foundation
for a future UI: a stable `@flow-build/core` API powers both the CLI and any
later presenter.

## Status

Pre-alpha. Spec: `docs/superpowers/specs/2026-05-09-cursor-sdk-harness-design.md`.
Plan: `docs/superpowers/plans/2026-05-09-cursor-sdk-harness.md`.

## Quick start

    pnpm install
    pnpm -r build
    export CURSOR_API_KEY="crsr_..."
    node packages/cli/dist/main.js run "summarize this repo" --cwd .

## Layout

- `packages/core` — `runPrompt`, narrowed `HarnessEvent` union, error mapping, retry
- `packages/cli` — `flow-build` binary; renderer; commander wiring
- `docs/smoke.md` — manual release checks
