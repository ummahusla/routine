export type RulesBodyInput = {
  versionLabel: string;
};

export function renderRulesBody(input: RulesBodyInput): string {
  return `---
alwaysApply: true
description: "rote workflow guidance"
globs: "**/*"
---
<!-- flow-build:rote v=${input.versionLabel} -->

# rote workflow guidance (always-on)

You are running inside an environment that has the rote CLI available
(version: ${input.versionLabel}). rote is the workflow engine for adapter
calls, response caching, and crystallized reusable flows.

Lifecycle: search → execute → crystallize → reuse.
Always run \`rote flow search "<intent>"\` before building anything new.

## Primitives

- Adapter — installed local artifact for an API; exposes \`<id>_probe\`,
  \`<id>_call\`, \`<id>_batch_call\`.
- Workspace — sandboxed dir under \`~/.rote/workspaces/<name>/\`.
- Response cell — numbered cached response (\`@1\`, \`@2\`, …); jq-queryable.
- Variable — set with \`rote set k=v\`; substituted with \`-t\`.
- Session — MCP connection; reused across calls with \`-s\`.
- Flow — parameterized script under \`~/.rote/flows/\`.
- Pending stub — resumable scaffolding marker.

## Most-common workflow

\`\`\`bash
rote flow search "<intent>"
rote explore "<intent>"
rote init <ws> --seq
rote init-session adapter/<id>
rote <id>_probe "<intent>" -s
rote <id>_call <tool> '{ ... }' -t -s
rote @N '<jq>' -r
rote export <name>.sh --params a,b --tag t --atomic --release
rote flow run <name> <args...>
\`\`\`

## Bypass policy

When tempted to call any of these directly, prefer rote first:

- \`gh issue/pr/repo …\` → \`rote flow search\` then \`rote explore\`.
- \`curl … github.com\` → same.
- \`stripe …\`            → \`rote stripe_probe "<intent>"\`.
- \`linear …\`            → \`rote linear_probe "<intent>"\`.
- \`supabase …\`          → \`rote adapter catalog search "supabase"\`.

Local dev commands (\`git\`, \`npm\`, \`cargo\`, \`pnpm\`, \`make\`, \`just\`,
\`ls\`, \`find\`, \`rg\`) are unaffected.

## Reference pointers

- \`rote how\` — onboarding guide.
- \`rote guidance agent\` — embedded full reference.
- \`rote man <topic>\` — man-page style reference.
- \`rote --help\` — CLI command list.
`;
}
