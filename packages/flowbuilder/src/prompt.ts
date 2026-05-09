import type { Manifest, State } from "./schema.js";

export function renderFlowbuilderPrefix(args: {
  manifest: Manifest;
  state: State;
}): string {
  const { manifest, state } = args;
  const updatedShort = manifest.updatedAt.slice(0, 16) + "Z";
  return [
    `[flowbuilder] active session: ${manifest.id}`,
    `manifest: name="${manifest.name}" updated=${updatedShort}`,
    `current state: ${state.nodes.length} nodes, ${state.edges.length} edges`,
    "call flowbuilder_get_state to read full state; call flowbuilder_set_state to write a new full state.",
  ].join("\n");
}
