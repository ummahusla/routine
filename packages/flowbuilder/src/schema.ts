import { z } from "zod";

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^s_[0-9a-z]{12}$/),
  name: z.string().min(1),
  description: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

const InputNode = z.object({
  id: z.string().min(1),
  type: z.literal("input"),
  value: z.unknown(),
});
const OutputNode = z.object({
  id: z.string().min(1),
  type: z.literal("output"),
  value: z.unknown(),
});
const FlowNode = z.object({
  id: z.string().min(1),
  type: z.literal("flow"),
  flow: z.string().regex(/^[^/\s]+\/[^/\s]+$/, {
    message: "flow ref must be '<category>/<name>'",
  }),
  params: z.record(z.unknown()),
});
const BranchNode = z.object({
  id: z.string().min(1),
  type: z.literal("branch"),
  cond: z.string().min(1),
});
const MergeNode = z.object({
  id: z.string().min(1),
  type: z.literal("merge"),
});

export const NodeSchema = z.discriminatedUnion("type", [
  InputNode,
  OutputNode,
  FlowNode,
  BranchNode,
  MergeNode,
]);
export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const StateSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});
export type State = z.infer<typeof StateSchema>;

export function validateRefIntegrity(state: State): void {
  const seen = new Set<string>();
  for (const n of state.nodes) {
    if (seen.has(n.id)) {
      throw new Error(`duplicate node id: ${n.id}`);
    }
    seen.add(n.id);
  }
  for (const e of state.edges) {
    if (!seen.has(e.from)) {
      throw new Error(`edge.from references unknown node: ${e.from}`);
    }
    if (!seen.has(e.to)) {
      throw new Error(`edge.to references unknown node: ${e.to}`);
    }
  }
}

export const EMPTY_STATE: State = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};
