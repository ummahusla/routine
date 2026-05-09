import { NODE_W, NODE_H, GAP_X, GAP_Y } from "../data/constants";
import type { Flow, FlowNode, NodeBox, Point } from "../types";

const COL_PITCH = NODE_W + GAP_X;
const ROW_PITCH = NODE_H + GAP_Y;
const PAD_X = 48;
const PAD_Y = 56;

export function cloneFlow(flow: Flow | null | undefined): Flow | null {
  if (!flow) return null;
  return {
    ...flow,
    nodes: flow.nodes.map((node) => ({ ...node })),
    edges: flow.edges.map(([from, to]) => [from, to]),
  };
}

export function topoLayers(flow: Flow): string[][] {
  const ind: Record<string, number> = Object.fromEntries(flow.nodes.map((node) => [node.id, 0]));
  const out: Record<string, string[]> = Object.fromEntries(flow.nodes.map((node) => [node.id, []]));

  flow.edges.forEach(([from, to]) => {
    ind[to] += 1;
    out[from].push(to);
  });

  const layers: string[][] = [];
  let frontier = flow.nodes.filter((node) => ind[node.id] === 0).map((node) => node.id);
  const seen = new Set<string>();

  while (frontier.length) {
    layers.push(frontier);
    frontier.forEach((id) => seen.add(id));

    const next = new Set<string>();
    frontier.forEach((id) =>
      out[id].forEach((to) => {
        ind[to] -= 1;
        if (ind[to] === 0 && !seen.has(to)) next.add(to);
      }),
    );
    frontier = [...next];
  }

  return layers;
}

export function nodePos(node: FlowNode): Point {
  if (typeof node.x === "number" && typeof node.y === "number") return { x: node.x, y: node.y };
  return { x: PAD_X + node.col * COL_PITCH, y: PAD_Y + node.row * ROW_PITCH };
}

export function nodeBox(node: FlowNode): NodeBox {
  const { x, y } = nodePos(node);
  return { x, y, w: NODE_W, h: NODE_H, cx: x + NODE_W / 2, cy: y + NODE_H / 2 };
}

export function edgePath(from: FlowNode, to: FlowNode): string {
  const fromBox = nodeBox(from);
  const toBox = nodeBox(to);
  const x1 = fromBox.x + fromBox.w;
  const y1 = fromBox.y + fromBox.h / 2;
  const x2 = toBox.x;
  const y2 = toBox.y + toBox.h / 2;
  const dx = Math.max(28, Math.abs(x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export const CANVAS_PAD_X = PAD_X;
export const CANVAS_PAD_Y = PAD_Y;
