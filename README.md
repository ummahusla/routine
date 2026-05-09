# FlowBuild

FlowBuild is a desktop app that turns natural-language prompts into runnable, visual automation flows. Describe what you want ("daily digest of GitHub trending repos to my team's email"), and FlowBuild generates a node-based flow you can inspect, edit on a canvas, refine via chat, and execute step by step.

Built as an Electron + React app with [electron-vite](https://electron-vite.org/), packaged with [electron-builder](https://www.electron.build/).

## Project structure

- [src/main/](src/main/) — Electron main process
- [src/preload/](src/preload/) — preload bridge
- [src/renderer/](src/renderer/) — React UI (sidebar, chat thread, flow canvas, node inspector, tweaks panel)

## Requirements

- Node.js 18+
- npm

## Install

```bash
npm install
```

## Run

```bash
npm run dev       # start the app in development mode (HMR)
npm start         # preview a production build
```

## Build

```bash
npm run build         # compile main, preload, and renderer bundles
npm run build:unpack  # build an unpacked app directory (no installer)
npm run build:mac     # build a macOS distributable
npm run build:win     # build a Windows distributable
npm run build:linux   # build a Linux distributable
```

## Other scripts

```bash
npm run icons     # regenerate app icons from resources/icon.svg
```
