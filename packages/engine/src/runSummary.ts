import type { NodeRunStatus, RunEvent } from "./types.js";

export type NodeSummary = {
  nodeId: string;
  nodeType: string;
  status: NodeRunStatus;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  textChunks?: number;
};

export function summarizeNodes(events: RunEvent[]): NodeSummary[] {
  const map = new Map<string, NodeSummary>();
  const order: string[] = [];
  for (const e of events) {
    if (e.type === "node_start") {
      if (!map.has(e.nodeId)) order.push(e.nodeId);
      map.set(e.nodeId, {
        nodeId: e.nodeId,
        nodeType: e.nodeType,
        status: "running",
        startedAt: e.at,
      });
    } else if (e.type === "node_text") {
      const cur = map.get(e.nodeId);
      if (cur) cur.textChunks = (cur.textChunks ?? 0) + 1;
    } else if (e.type === "node_end") {
      const cur = map.get(e.nodeId);
      if (cur) {
        cur.status = e.status;
        cur.endedAt = e.at;
        if (e.error) cur.error = e.error;
      } else {
        order.push(e.nodeId);
        map.set(e.nodeId, {
          nodeId: e.nodeId,
          nodeType: "unknown",
          status: e.status,
          endedAt: e.at,
          ...(e.error ? { error: e.error } : {}),
        });
      }
    }
  }
  return order.map((id) => map.get(id) as NodeSummary);
}
