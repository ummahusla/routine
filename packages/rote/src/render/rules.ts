import { SKILL_MD } from "../skill-content.gen.js";

export type RulesBodyInput = {
  versionLabel: string;
};

function stripFrontmatter(md: string): string {
  if (!md.startsWith("---\n")) return md;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return md;
  return md.slice(end + 5);
}

export function renderRulesBody(input: RulesBodyInput): string {
  const skillBody = stripFrontmatter(SKILL_MD).trimStart();
  return `---
alwaysApply: true
description: "rote workflow guidance"
globs: "**/*"
---
<!-- flow-build:rote v=${input.versionLabel} -->

${skillBody}`;
}
