#!/usr/bin/env node
// Stand-in for `rote`: echoes argv as JSON to stdout, exits 0.
// Usage: echo-rote.mjs flow run <flowRef> [--key=val ...]
const args = process.argv.slice(2);
const out = { argv: args };
process.stdout.write(JSON.stringify(out));
process.exit(0);
