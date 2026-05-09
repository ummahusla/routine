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
