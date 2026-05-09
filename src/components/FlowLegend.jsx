import { TYPE_COLORS } from "../data/typeColors";

const LEGEND_ITEMS = [
  { type: "trigger",   label: "Trigger" },
  { type: "llm",       label: "AI" },
  { type: "transform", label: "Transform" },
  { type: "http",      label: "HTTP" },
  { type: "storage",   label: "Storage" },
  { type: "output",    label: "Output" },
  { type: "human",     label: "Human" },
];

export function FlowLegend() {
  return (
    <div className="lg">
      {LEGEND_ITEMS.map((it) => (
        <div key={it.type} className="lg-it">
          <span className="lg-sw" style={{ background: TYPE_COLORS[it.type].icon }} />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
