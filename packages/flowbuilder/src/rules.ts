export const FLOWBUILDER_RULES_PATH = ".cursor/rules/.flow-build-flowbuilder.mdc";

const BODY = `---
alwaysApply: true
---

# Flowbuilder

This session edits a flow graph. The graph lives at \`<flowbuilder-base>/sessions/<sessionId>/state.json\`. The session is fixed for the lifetime of this run; you cannot switch sessions.

Use the MCP tools registered as \`flowbuilder_get_state\`, \`flowbuilder_set_state\`, \`flowbuilder_execute_flow\`, and \`flowbuilder_get_run_result\`.

## Tools

### Editing the graph
- \`flowbuilder_get_state()\` — read the current full state.
- \`flowbuilder_set_state({ state })\` — write the FULL state. You must always pass the complete state; partial patches are not supported.

### Executing the graph
- \`flowbuilder_execute_flow()\` — start a run of the saved graph. Returns \`{ runId, sessionId }\` immediately; the run executes asynchronously.
- \`flowbuilder_get_run_result({ runId, waitMs? })\` — fetch the result of a previously started run. If \`waitMs\` is provided (max 60000), the call blocks server-side up to that many ms waiting for the run to finish; otherwise it returns the current on-disk state. Returns \`{ status, finalOutput?, outputs, error? }\`.

**Recommended pattern:**
\`\`\`
const { runId } = flowbuilder_execute_flow();
const result = flowbuilder_get_run_result({ runId, waitMs: 30000 });
\`\`\`

You must always pass the **complete** state to \`flowbuilder_set_state\`. Partial patches are not supported. To delete a node, omit it from the new \`nodes\` array; to remove an edge, omit it from \`edges\`.

## Schema

\`state.json\` shape (schemaVersion: 1):

\`\`\`json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "n1", "type": "input",  "value": <any> },
    { "id": "n2", "type": "flow",   "flow": "<category>/<name>", "params": { ... } },
    { "id": "n3", "type": "llm",    "prompt": "<template>", "model": "claude-sonnet-4-6", "maxTokens": 4096, "temperature": 0.7 },
    { "id": "n4", "type": "branch", "cond": "<expression>" },
    { "id": "n5", "type": "merge" },
    { "id": "n6", "type": "output", "value": <any> }
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
- \`params\` is free-form. **String values support template substitution at run time:** \`{{input}}\` resolves to the upstream envelope's text, \`{{input.data.<path>}}\` resolves to a value at that path inside structured upstream data. Non-string values pass through unchanged.

## LLM node

An \`llm\` node runs a single-shot LLM completion. Its \`prompt\` is a template — use \`{{input}}\` to inject upstream text and \`{{input.data.<path>}}\` to inject structured fields. \`model\`, \`maxTokens\`, and \`temperature\` have sensible defaults; only set them when you have a reason. \`systemPrompt\` is optional.

LLM nodes have **no tool access** — they cannot call MCP tools or run shell commands. For multi-step work that needs tools, prefer a \`flow\` node (which invokes a rote flow) or chain multiple LLM nodes.

## Edge envelope

At run time, each node emits an \`{ text, data? }\` envelope. \`text\` is the canonical string an LLM node consumes via \`{{input}}\`. \`data\` is optional structured payload. \`flow\` nodes try to JSON-parse stdout into \`data\`; \`llm\` nodes parse fenced JSON in their completion.

## Execution constraints (v1)

- Branch and merge nodes are **not yet executable** — \`flowbuilder_execute_flow\` rejects graphs containing them. Build linear / fan-in graphs only when you intend to execute.
- A node failure halts the run; downstream nodes are marked \`skipped\`.
- Runs are sequential (no parallel branch traversal).

## Workflow

1. Call \`flowbuilder_get_state\` to read the current graph.
2. Plan the change. Pick or create rote flows using the rote skill.
3. Build the next full state object.
4. Call \`flowbuilder_set_state({ state })\`.
5. To run: \`flowbuilder_execute_flow()\` then \`flowbuilder_get_run_result({ runId, waitMs: 30000 })\`.
6. If a tool returns \`{ ok: false, error }\`, fix and retry.

Do not run two agents against the same session. The harness assumes one writer per session.
`;

export function renderFlowbuilderRules(): string {
  return BODY;
}
