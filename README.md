# Routine

Routine is a desktop app that turns natural-language prompts into runnable, visual automation flows. Describe what you want ("daily digest of GitHub trending repos to my team's email"), and Routine generates a node-based flow you can inspect, edit on a canvas, refine via chat, and execute step by step.

Built as an Electron + React app with [electron-vite](https://electron-vite.org/), packaged with [electron-builder](https://www.electron.build/).

## Project structure

- [src/main/](src/main/) — Electron main process
- [src/preload/](src/preload/) — preload bridge
- [src/renderer/](src/renderer/) — React UI (sidebar, chat thread, flow canvas, node inspector, tweaks panel)
- [packages/core/](packages/core/) — `@flow-build/core`, Cursor SDK wrapper (foundation for in-app agent integration)
- [packages/cli/](packages/cli/) — `@flow-build/cli`, standalone CLI exercising the core wrapper

The packages currently power a standalone CLI. Integrating them into the Electron app is a future iteration.

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) (managed via Corepack — `corepack enable pnpm`)

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev        # start the app in development mode (HMR)
pnpm start      # preview a production build
```

## Build

```bash
pnpm run build           # compile main, preload, and renderer bundles
pnpm run build:packages  # build the @flow-build/* workspace packages
pnpm run build:unpack    # build an unpacked app directory (no installer)
pnpm run build:mac       # build a macOS distributable
pnpm run build:win       # build a Windows distributable
pnpm run build:linux     # build a Linux distributable
```

## Other scripts

```bash
pnpm test         # run all package test suites
pnpm typecheck    # typecheck app + packages
pnpm icons        # regenerate app icons from resources/icon.svg
```

## Cursor SDK harness (CLI)

The `@flow-build/cli` package wraps the Cursor SDK and streams agent output with tool-call indicators. Spec and implementation plan live under [docs/superpowers/](docs/superpowers/); manual smoke checks live in [docs/smoke.md](docs/smoke.md).
