import { ICONS } from "../data/icons";
import { TYPE_COLORS } from "../data/typeColors";
import { NODE_W, NODE_H } from "../data/constants";
import { nodePos } from "../utils/flow";

export function FlowNode({ n, idx, runState, dragging, onMouseDown, onDelete }) {
  const c = TYPE_COLORS[n.type] || TYPE_COLORS.transform;
  const { x, y } = nodePos(n);
  const status = runState?.[n.id];
  const revealStyle = !n._userPlaced
    ? { animationDelay: `${idx * 60}ms` }
    : { animation: "none", opacity: 1 };

  return (
    <div
      className={`fc-node fc-type-${n.type} ${status ? `fc-status-${status}` : ""} ${dragging ? "is-dragging" : ""}`}
      style={{
        left: x,
        top: y,
        width: NODE_W,
        height: NODE_H,
        background: c.bg,
        borderColor: c.border,
        ...revealStyle,
      }}
      onMouseDown={onMouseDown}
    >
      <div className="fc-icon" style={{ color: c.icon }}>
        {ICONS[n.icon] || ICONS.code}
      </div>
      <div className="fc-label">
        <div className="fc-name">{n.label}</div>
        <div className="fc-sub">{n.sub}</div>
      </div>
      <div className="fc-port fc-port-l" />
      <div className="fc-port fc-port-r" />
      <button
        className="fc-del"
        title="Delete step"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {status === "running" && <div className="fc-pulse" />}
      {status === "done" && (
        <div className="fc-badge">
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M3 8.5l3 3 7-8" />
          </svg>
        </div>
      )}
    </div>
  );
}
