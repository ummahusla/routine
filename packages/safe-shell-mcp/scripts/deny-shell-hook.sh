#!/bin/sh
# Drains stdin (Cursor SDK pipes the hook input as JSON) and emits a deny
# verdict so the model is steered to mcp__safe-shell__sh.
cat >/dev/null
printf '%s' '{"decision":"block","reason":"Built-in shell is disabled in this harness due to a Cursor SDK regression in @cursor/sdk@1.0.12 where the shell tool emits tool_start without ever emitting tool_end. Use the safe-shell MCP server instead: mcp__safe-shell__sh. Same semantics (command/cwd/timeoutMs/maxBytes), deterministic completion, bounded output."}'
exit 0
