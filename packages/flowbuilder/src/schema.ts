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

const BaseNodeSchema = z.object({
  id: z.string().min(1),
});

export const InputNodeSchema = BaseNodeSchema.extend({
  type: z.literal("input"),
  value: z.unknown(),
  required: z.boolean().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
});

export const OutputNodeSchema = BaseNodeSchema.extend({
  type: z.literal("output"),
  value: z.unknown(),
});

export const FlowNodeSchema = BaseNodeSchema.extend({
  type: z.literal("flow"),
  flow: z.string().regex(/^[^/\s]+\/[^/\s]+$/, {
    message: "flow ref must be '<category>/<name>'",
  }),
  params: z.record(z.unknown()),
});

export const BranchNodeSchema = BaseNodeSchema.extend({
  type: z.literal("branch"),
  cond: z.string().min(1),
});

export const MergeNodeSchema = BaseNodeSchema.extend({
  type: z.literal("merge"),
});

export const LlmNodeSchema = BaseNodeSchema.extend({
  type: z.literal("llm"),
  prompt: z.string().min(1),
  model: z.string().default("claude-sonnet-4-6"),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  systemPrompt: z.string().optional(),
});

export const NodeSchema = z.discriminatedUnion("type", [
  InputNodeSchema,
  OutputNodeSchema,
  FlowNodeSchema,
  BranchNodeSchema,
  MergeNodeSchema,
  LlmNodeSchema,
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
  const ids = new Set<string>();
  for (const node of state.nodes) {
    if (ids.has(node.id)) {
      throw new Error(`duplicate node id: ${node.id}`);
    }
    ids.add(node.id);
  }

  for (const edge of state.edges) {
    if (!ids.has(edge.from)) {
      throw new Error(`edge.from references unknown node: ${edge.from}`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`edge.to references unknown node: ${edge.to}`);
    }
  }
}

export const EMPTY_STATE: State = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};
