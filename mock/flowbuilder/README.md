# Flowbuilder Mock Sessions

This directory is a development base directory for the Electron flowbuilder UI.

Run the Electron app with:

```bash
FLOW_BUILD_FLOWBUILDER_BASE=mock/flowbuilder pnpm dev
```

The app reads sessions from `mock/flowbuilder/sessions/<sessionId>/manifest.json`
and `state.json`, using the same schema as the harness-owned flowbuilder package.
