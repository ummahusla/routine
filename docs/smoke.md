# Manual Smoke Checklist

Run before tagging a release. Requires a valid `CURSOR_API_KEY` and a small repo
checked out at `$REPO`.

## 1. Help

    node packages/cli/dist/main.js --help

Expect: usage text mentioning `run <prompt>`. Exit 0.

## 2. Missing key

    unset CURSOR_API_KEY
    node packages/cli/dist/main.js run "hi" --cwd "$REPO"

Expect: stderr contains "Missing Cursor API key". Exit 2.

## 3. Happy path

    export CURSOR_API_KEY="crsr_..."
    node packages/cli/dist/main.js run "Summarize this repo in 2 sentences" --cwd "$REPO"

Expect: streamed text on stdout. `[starting]` and `[done]` markers on stderr.
Possible `[tool: ...]` lines while the agent reads the repo. Exit 0.

## 4. Cancellation

Start (3) again, hit Ctrl-C mid-stream.

Expect: stops promptly. Exit 130.

## 5. Verbose

    node packages/cli/dist/main.js run "hi" --cwd "$REPO" --verbose

Expect: `[debug] retrying ...` lines if any retry path triggers.

## Multi-turn session smoke

Goal: verify v1 multi-turn chat persists across restart and replays verbatim.

1. Launch the app: `pnpm dev`.
2. Sidebar shows one auto-created session. Note its title.
3. Submit prompt: `list files in this session's workspace dir`.
4. Confirm: assistant streams text + at least one `[shell]` tool chip with full args/result expandable.
5. Submit follow-up: `now write a file called ping.txt with content "pong"`.
6. Confirm: agent acts on the prior context (references the listing or writes via `edit`/`write` tool); the chip shows the write call.
7. Quit the app (Cmd-Q on macOS).
8. Relaunch: `pnpm dev`. Sidebar still lists the session; clicking it shows both prior turns rendered identically.
9. Submit: `summarise what we just did`. Confirm the assistant references the prior file write — proves replay is feeding history into the third turn.
10. Force-kill the app mid-turn (during a long shell command). Relaunch. Confirm the in-flight turn appears with `[turn interrupted]` marker; submitting a new prompt works.
11. From a second shell: `node -e 'require("@flow-build/core").loadSession({baseDir: "...", sessionId: "..."})'` — confirm `SessionLockedError` because the app holds the lockfile.

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
