#!/usr/bin/env node
// One-shot transform: rewrite SKILL.md bash blocks so the agent imitates
// MCP-tool invocations of rote_exec instead of shell calls.
//
// Rules:
//   - For ```bash blocks where every non-blank, non-comment, non-shell-utility
//     line begins with `rote `: change fence to ```rote-exec.
//   - For mixed blocks (rote + other shell): keep ```bash but transform each
//     rote line in-place to a leading-`#` annotated form so the agent sees
//     it must be routed through rote_exec.
//
// The prelude (already added at the top of SKILL.md) defines the
// `rote-exec` fence semantics for the agent.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const skillPath = join(here, "..", "SKILL.md");
const src = readFileSync(skillPath, "utf8");
const lines = src.split("\n");

const out = [];
let i = 0;
let purelyRoteBlocks = 0;
let mixedBlocks = 0;
let totalBashBlocks = 0;

const ROTE_LINE = /^(\s*)rote(\s|$)/;
// Lines that don't disqualify a block from being "purely rote":
// blank, comments, cd, export, source, simple shell glue.
const SHELL_GLUE = /^(\s*)($|#|cd\s|export\s|source\s|set\s+-|set\s+\+|:\s|\.\s)/;

while (i < lines.length) {
  const line = lines[i];
  const fenceMatch = line.match(/^(\s*)```bash\s*$/);
  if (!fenceMatch) {
    out.push(line);
    i += 1;
    continue;
  }
  totalBashBlocks += 1;
  const indent = fenceMatch[1];
  // Collect block body
  const bodyStart = i + 1;
  let j = bodyStart;
  while (j < lines.length && !/^(\s*)```\s*$/.test(lines[j])) j += 1;
  const body = lines.slice(bodyStart, j);
  const closing = lines[j] ?? "```";

  const allRote = body.every(
    (l) => ROTE_LINE.test(l) || SHELL_GLUE.test(l),
  );
  const anyRote = body.some((l) => ROTE_LINE.test(l));

  if (anyRote && allRote) {
    out.push(`${indent}\`\`\`rote-exec`);
    out.push(...body);
    out.push(closing);
    purelyRoteBlocks += 1;
  } else if (anyRote) {
    // Mixed block: keep ```bash but rewrite each `rote ` line so the agent
    // sees the call must go through the MCP tool. Prepend one annotation
    // line at the top of the block.
    out.push(line); // original ```bash fence
    out.push(`${indent}# Each \`rote ...\` line below: call via rote_exec MCP tool, not bash.`);
    for (const l of body) {
      out.push(l);
    }
    out.push(closing);
    mixedBlocks += 1;
  } else {
    out.push(line);
    out.push(...body);
    out.push(closing);
  }
  i = j + 1;
}

writeFileSync(skillPath, out.join("\n"));
console.error(
  `transform-skill: ${totalBashBlocks} bash blocks; ${purelyRoteBlocks} → rote-exec; ${mixedBlocks} mixed annotated.`,
);
