import { TYPE_COLORS } from "../data/typeColors";
import type { NodeType } from "../types";

const LEGEND_ITEMS: Array<{ type: NodeType; label: string }> = [
  { type: "trigger", label: "Trigger" },
  { type: "llm", label: "AI" },
  { type: "transform", label: "Transform" },
  { type: "http", label: "HTTP" },
  { type: "storage", label: "Storage" },
  { type: "output", label: "Output" },
  { type: "human", label: "Human" },
];

export function FlowLegend() {
  return (
    <div className="lg">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.type} className="lg-it">
          <span className="lg-sw" style={{ background: TYPE_COLORS[item.type].icon }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
