import { useEffect, useRef } from "react";
import { ICONS } from "../data/icons";
import { TYPE_COLORS } from "../data/typeColors";
import { PALETTE_ITEMS } from "../data/flowTemplates";
import type { PaletteItem } from "../types";

const GROUPS: Record<string, (item: PaletteItem) => boolean> = {
  Triggers: (item) => item.type === "trigger",
  Compute: (item) => ["transform", "filter", "branch"].includes(item.type),
  Connect: (item) => ["http", "llm"].includes(item.type),
  Storage: (item) => item.type === "storage",
  Output: (item) => ["output", "human"].includes(item.type),
};

type NodePaletteProps = {
  onPick: (item: PaletteItem) => void;
  onClose?: () => void;
};

export function NodePalette({ onPick, onClose }: NodePaletteProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(event: MouseEvent): void {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) onClose?.();
    }

    const timeout = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);

  return (
    <div className="fc-palette" ref={ref}>
      <div className="fc-palette-h">Add step</div>
      {Object.entries(GROUPS).map(([group, pred]) => {
        const items = PALETTE_ITEMS.filter(pred);
        if (items.length === 0) return null;
        return (
          <div key={group} className="fc-palette-grp">
            <div className="fc-palette-grp-h">{group}</div>
            {items.map((item) => {
              const color = TYPE_COLORS[item.type];
              return (
                <button key={`${item.type}-${item.label}`} className="fc-palette-item" onClick={() => onPick(item)}>
                  <span
                    className="fc-palette-ico"
                    style={{ color: color.icon, background: color.bg, borderColor: color.border }}
                  >
                    {ICONS[item.icon]}
                  </span>
                  <span className="fc-palette-meta">
                    <span className="fc-palette-label">{item.label}</span>
                    <span className="fc-palette-sub">{item.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
