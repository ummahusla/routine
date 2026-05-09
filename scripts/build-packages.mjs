#!/usr/bin/env node
// Build workspace packages, tolerant of the circular dependency between core,
// engine, rote, and flowbuilder. Per-package `tsc -p tsconfig.json` resolves
// `@flow-build/*` imports through Node module resolution (package.json `main`
// → `dist/index.js`/`.d.ts`), so a clean state has a chicken-and-egg problem:
// each cycle member needs another's dist before it can typecheck.
//
// Strategy:
//   1. Cold pass: build every package with errors tolerated. tsc emits dist
//      files even when imports don't resolve (`noEmitOnError` defaults to
//      false), so each cycle member ends up with a partial dist.
//   2. Warm rotation: for each cycle member, nuke ONLY its own dist and
//      rebuild. The rebuilt package now sees the OTHER members' partial dist
//      via Node resolution, so types check. Emptying its own dist beforehand
//      avoids TS5055 ("would overwrite input file") that would otherwise fire
//      when its own dist .d.ts shows up as an input via the cycle.
//
// safe-shell-mcp has no @flow-build deps so it builds first and is excluded
// from the rotation.

import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LEAF = "@flow-build/safe-shell-mcp";
const CYCLE = [
  "@flow-build/core",
  "@flow-build/engine",
  "@flow-build/rote",
  "@flow-build/flowbuilder",
];

function distPath(pkg) {
  const folder = pkg.replace(/^@flow-build\//, "");
  return resolve(repoRoot, "packages", folder, "dist");
}

function build(pkg, { tolerate = false } = {}) {
  const result = spawnSync("pnpm", ["-F", pkg, "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0 && !tolerate) {
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

console.log(`\n→ building ${LEAF}`);
build(LEAF);

console.log(`\n→ cold pass (errors tolerated) for ${CYCLE.join(", ")}`);
for (const pkg of CYCLE) {
  console.log(`\n  cold: ${pkg}`);
  build(pkg, { tolerate: true });
}

console.log(`\n→ warm rotation: nuke + rebuild each cycle member`);
for (const pkg of CYCLE) {
  const dir = distPath(pkg);
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n  warm: ${pkg}`);
  build(pkg);
}

console.log("\n✓ all packages built");
