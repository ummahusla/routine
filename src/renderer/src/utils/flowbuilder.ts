import type {
  Flow,
  FlowbuilderManifest,
  FlowbuilderNode,
  FlowbuilderState,
  FlowNode,
  IconName,
  NodeType,
} from "../types";

type NodeProjection = {
  type: NodeType;
  icon: IconName;
  label: string;
  sub: string;
};

function summarizeValue(value: unknown): string {
  if (value == null) return "value: null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (!keys.length) return "{}";
    return keys.slice(0, 3).join(", ");
  }
  return typeof value;
}

function summarizeParams(params: Record<string, unknown>): string {
  const keys = Object.keys(params);
  if (!keys.length) return "no params";
  return keys.slice(0, 3).join(", ");
}

function flowLabel(flowRef: string): string {
  const [, name = flowRef] = flowRef.split("/");
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function projectNode(node: FlowbuilderNode): NodeProjection {
  switch (node.type) {
    case "input":
      return {
        type: "trigger",
        icon: "webhook",
        label: "Input",
        sub: summarizeValue(node.value),
      };
    case "flow": {
      const [category] = node.flow.split("/");
      return {
        type: category === "github" || category === "http" ? "http" : category === "support" ? "human" : "transform",
        icon: category === "github" || category === "http" ? "http" : category === "support" ? "user" : "transform",
        label: flowLabel(node.flow),
        sub: `${node.flow} · ${summarizeParams(node.params)}`,
      };
    }
    case "branch":
      return {
        type: "branch",
        icon: "branch",
        label: "Branch",
        sub: node.cond,
      };
    case "merge":
      return {
        type: "transform",
        icon: "transform",
        label: "Merge",
        sub: "join branches",
      };
    case "output":
      return {
        type: "output",
        icon: "check",
        label: "Output",
        sub: summarizeValue(node.value),
      };
    case "llm":
      return {
        type: "llm",
        icon: "llm",
        label: "LLM",
        sub: node.model ?? "claude-sonnet",
      };
  }
}

function computeLayers(state: FlowbuilderState): string[][] {
  const indegree = Object.fromEntries(state.nodes.map((node) => [node.id, 0])) as Record<string, number>;
  const outgoing = Object.fromEntries(state.nodes.map((node) => [node.id, [] as string[]])) as Record<string, string[]>;

  for (const edge of state.edges) {
    if (edge.to in indegree) indegree[edge.to] += 1;
    if (edge.from in outgoing) outgoing[edge.from].push(edge.to);
  }

  const layers: string[][] = [];
  let frontier = state.nodes.filter((node) => indegree[node.id] === 0).map((node) => node.id);
  const seen = new Set<string>();

  while (frontier.length) {
    layers.push(frontier);
    frontier.forEach((id) => seen.add(id));

    const next = new Set<string>();
    for (const id of frontier) {
      for (const to of outgoing[id] ?? []) {
        indegree[to] -= 1;
        if (indegree[to] === 0 && !seen.has(to)) next.add(to);
      }
    }
    frontier = [...next];
  }

  const orphans = state.nodes.filter((node) => !seen.has(node.id)).map((node) => node.id);
  if (orphans.length) layers.push(orphans);
  return layers;
}

export function flowbuilderStateToFlow(manifest: FlowbuilderManifest, state: FlowbuilderState): Flow {
  const layers = computeLayers(state);
  const layerOf: Record<string, number> = {};
  const rowOf: Record<string, number> = {};

  layers.forEach((ids, col) => {
    ids.forEach((id, index) => {
      layerOf[id] = col;
      rowOf[id] = index;
    });
  });

  const nodes: FlowNode[] = state.nodes.map((node) => {
    const projection = projectNode(node);
    return {
      id: node.id,
      ...projection,
      col: layerOf[node.id] ?? 0,
      row: rowOf[node.id] ?? 0,
    };
  });

  return {
    title: manifest.name,
    summary: manifest.description || `${state.nodes.length} nodes · ${state.edges.length} edges`,
    nodes,
    edges: state.edges.map((edge) => [edge.from, edge.to]),
  };
}
