export const FLOWBUILDER_RULES_PATH = ".cursor/rules/.flow-build-flowbuilder.mdc";

const BODY = `---
alwaysApply: true
---

# Flowbuilder

This session edits a flow graph. The graph lives at \`<flowbuilder-base>/sessions/<sessionId>/state.json\`. The session is fixed for the lifetime of this run; you cannot switch sessions.

Use the MCP tools registered as \`flowbuilder_get_state\` and \`flowbuilder_set_state\`.

## Tools

- \`flowbuilder_get_state()\` — read the current full state.
- \`flowbuilder_set_state({ state })\` — write the FULL state. You must always pass the complete state; partial patches are not supported.

You must always pass the **complete** state to \`flowbuilder_set_state\`. Partial patches are not supported. To delete a node, omit it from the new \`nodes\` array; to remove an edge, omit it from \`edges\`.

## Schema

\`state.json\` shape (schemaVersion: 1):

\`\`\`json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "n1", "type": "input",  "value": <any> },
    { "id": "n2", "type": "flow",   "flow": "<category>/<name>", "params": { ... } },
    { "id": "n3", "type": "branch", "cond": "<expression>" },
    { "id": "n4", "type": "merge" },
    { "id": "n5", "type": "output", "value": <any> }
  ],
  "edges": [
    { "from": "n1", "to": "n2" }
  ]
}
\`\`\`

Constraints:

- Node ids are unique strings.
- Every \`edge.from\` and \`edge.to\` must reference an existing node id.
- A \`flow\` node's \`flow\` field must be a rote flow reference in \`<category>/<name>\` form (see the rote skill for details on listing and creating flows).
- \`params\` is free-form. The agent maps upstream output to downstream params at execution time; the file does not encode wiring beyond the edge graph.

## Workflow

1. Call \`flowbuilder_get_state\` to read the current graph.
2. Plan the change. Pick or create rote flows using the rote skill.
3. Build the next full state object.
4. Call \`flowbuilder_set_state({ state })\`.
5. If the tool returns \`{ ok: false, error }\`, fix and retry.

Do not run two agents against the same session. The harness assumes one writer per session.
`;

export function renderFlowbuilderRules(): string {
  return BODY;
}
