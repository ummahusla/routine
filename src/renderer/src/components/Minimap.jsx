import { TYPE_COLORS } from "../data/typeColors";

export function Minimap({ flow }) {
  if (!flow) return null;
  const maxCol = Math.max(...flow.nodes.map((n) => n.col));
  const maxRow = Math.max(...flow.nodes.map((n) => n.row));
  const W = 144;
  const H = 80;
  const cw = W / (maxCol + 1);
  const ch = H / (maxRow + 1);

  return (
    <div className="mm">
      <div className="mm-h">Overview</div>
      <svg width={W} height={H}>
        {flow.edges.map(([a, b], i) => {
          const A = flow.nodes.find((n) => n.id === a);
          const B = flow.nodes.find((n) => n.id === b);
          if (!A || !B) return null;
          return (
            <line
              key={i}
              x1={A.col * cw + cw / 2}
              y1={A.row * ch + ch / 2}
              x2={B.col * cw + cw / 2}
              y2={B.row * ch + ch / 2}
              stroke="rgba(200,205,215,0.25)"
              strokeWidth="1"
            />
          );
        })}
        {flow.nodes.map((n) => (
          <rect
            key={n.id}
            x={n.col * cw + 2}
            y={n.row * ch + ch / 2 - 3}
            width={Math.max(8, cw - 4)}
            height={6}
            rx={1.5}
            fill={(TYPE_COLORS[n.type] || TYPE_COLORS.transform).icon}
            opacity="0.85"
          />
        ))}
      </svg>
    </div>
  );
}
