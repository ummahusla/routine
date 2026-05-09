import { useEffect, useRef } from "react";
import { ICONS } from "../data/icons";
import { TYPE_COLORS } from "../data/typeColors";
import { PALETTE_ITEMS } from "../data/flowTemplates";

const GROUPS = {
  Triggers: (p) => p.type === "trigger",
  Compute:  (p) => ["transform", "filter", "branch"].includes(p.type),
  Connect:  (p) => ["http", "llm"].includes(p.type),
  Storage:  (p) => p.type === "storage",
  Output:   (p) => ["output", "human"].includes(p.type),
};

export function NodePalette({ onPick, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    const t = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);

  return (
    <div className="fc-palette" ref={ref}>
      <div className="fc-palette-h">Add step</div>
      {Object.entries(GROUPS).map(([k, pred]) => {
        const items = PALETTE_ITEMS.filter(pred);
        if (items.length === 0) return null;
        return (
          <div key={k} className="fc-palette-grp">
            <div className="fc-palette-grp-h">{k}</div>
            {items.map((p, i) => {
              const c = TYPE_COLORS[p.type];
              return (
                <button key={i} className="fc-palette-item" onClick={() => onPick(p)}>
                  <span
                    className="fc-palette-ico"
                    style={{ color: c.icon, background: c.bg, borderColor: c.border }}
                  >
                    {ICONS[p.icon]}
                  </span>
                  <span className="fc-palette-meta">
                    <span className="fc-palette-label">{p.label}</span>
                    <span className="fc-palette-sub">{p.sub}</span>
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
