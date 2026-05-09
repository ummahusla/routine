import { NODE_W, NODE_H, GAP_X, GAP_Y } from "../data/constants";

const COL_PITCH = NODE_W + GAP_X;
const ROW_PITCH = NODE_H + GAP_Y;
const PAD_X = 48;
const PAD_Y = 56;

export function cloneFlow(tpl) {
  if (!tpl) return null;
  return {
    ...tpl,
    nodes: tpl.nodes.map((n) => ({ ...n })),
    edges: tpl.edges.map((e) => [...e]),
  };
}

export function topoLayers(flow) {
  const ind = Object.fromEntries(flow.nodes.map((n) => [n.id, 0]));
  const out = Object.fromEntries(flow.nodes.map((n) => [n.id, []]));
  flow.edges.forEach(([a, b]) => {
    ind[b]++;
    out[a].push(b);
  });
  const layers = [];
  let frontier = flow.nodes.filter((n) => ind[n.id] === 0).map((n) => n.id);
  const seen = new Set();
  while (frontier.length) {
    layers.push(frontier);
    frontier.forEach((id) => seen.add(id));
    const next = new Set();
    frontier.forEach((id) =>
      out[id].forEach((b) => {
        ind[b]--;
        if (ind[b] === 0 && !seen.has(b)) next.add(b);
      })
    );
    frontier = [...next];
  }
  return layers;
}

export function nodePos(n) {
  if (typeof n.x === "number" && typeof n.y === "number") return { x: n.x, y: n.y };
  return { x: PAD_X + n.col * COL_PITCH, y: PAD_Y + n.row * ROW_PITCH };
}

export function nodeBox(n) {
  const { x, y } = nodePos(n);
  return { x, y, w: NODE_W, h: NODE_H, cx: x + NODE_W / 2, cy: y + NODE_H / 2 };
}

export function edgePath(a, b) {
  const A = nodeBox(a);
  const B = nodeBox(b);
  const x1 = A.x + A.w;
  const y1 = A.y + A.h / 2;
  const x2 = B.x;
  const y2 = B.y + B.h / 2;
  const dx = Math.max(28, Math.abs(x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export const CANVAS_PAD_X = PAD_X;
export const CANVAS_PAD_Y = PAD_Y;
