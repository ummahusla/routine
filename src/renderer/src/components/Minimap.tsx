import { TYPE_COLORS } from "../data/typeColors";
import type { Flow } from "../types";

type MinimapProps = {
  flow: Flow;
};

export function Minimap({ flow }: MinimapProps) {
  const maxCol = Math.max(...flow.nodes.map((node) => node.col));
  const maxRow = Math.max(...flow.nodes.map((node) => node.row));
  const W = 144;
  const H = 80;
  const cw = W / (maxCol + 1);
  const ch = H / (maxRow + 1);

  return (
    <div className="mm">
      <div className="mm-h">Overview</div>
      <svg width={W} height={H}>
        {flow.edges.map(([from, to], i) => {
          const fromNode = flow.nodes.find((node) => node.id === from);
          const toNode = flow.nodes.find((node) => node.id === to);
          if (!fromNode || !toNode) return null;
          return (
            <line
              key={`${from}-${to}-${i}`}
              x1={fromNode.col * cw + cw / 2}
              y1={fromNode.row * ch + ch / 2}
              x2={toNode.col * cw + cw / 2}
              y2={toNode.row * ch + ch / 2}
              stroke="rgba(200,205,215,0.25)"
              strokeWidth="1"
            />
          );
        })}
        {flow.nodes.map((node) => (
          <rect
            key={node.id}
            x={node.col * cw + 2}
            y={node.row * ch + ch / 2 - 3}
            width={Math.max(8, cw - 4)}
            height={6}
            rx={1.5}
            fill={TYPE_COLORS[node.type].icon}
            opacity="0.85"
          />
        ))}
      </svg>
    </div>
  );
}
