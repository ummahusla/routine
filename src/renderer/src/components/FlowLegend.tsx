import { useMemo } from "react";
import { TYPE_COLORS } from "../data/typeColors";
import type { FlowNode, NodeType } from "../types";

const LEGEND_ITEMS: Array<{ type: NodeType; label: string }> = [
  { type: "trigger", label: "Trigger" },
  { type: "llm", label: "AI" },
  { type: "transform", label: "Transform" },
  { type: "http", label: "HTTP" },
  { type: "storage", label: "Storage" },
  { type: "output", label: "Output" },
  { type: "human", label: "Human" },
];

export function FlowLegend({ nodes }: { nodes: FlowNode[] }) {
  const items = useMemo(() => {
    const used = new Set(nodes.map((n) => n.type));
    return LEGEND_ITEMS.filter((item) => used.has(item.type));
  }, [nodes]);

  if (items.length === 0) return null;

  return (
    <div className="lg">
      {items.map((item) => (
        <div key={item.type} className="lg-it">
          <span className="lg-sw" style={{ background: TYPE_COLORS[item.type].icon }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
