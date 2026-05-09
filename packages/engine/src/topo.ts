import type { State } from "@flow-build/flowbuilder";
import { EngineError } from "./errors.js";

const UNSUPPORTED = new Set(["branch", "merge"]);

export function topoOrder(state: State): string[] {
  for (const node of state.nodes) {
    if (UNSUPPORTED.has(node.type)) {
      throw new EngineError(
        "UNSUPPORTED_NODE_TYPE",
        `node ${node.id} has unsupported type '${node.type}' (branch/merge are deferred to a future spec)`,
      );
    }
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of state.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const edge of state.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue: string[] = [];
  for (const [id, deg] of incoming) if (deg === 0) queue.push(id);
  queue.sort();

  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const deg = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== state.nodes.length) {
    throw new EngineError(
      "GRAPH_HAS_CYCLE",
      `graph has a cycle (resolved ${order.length} of ${state.nodes.length} nodes)`,
    );
  }
  return order;
}
