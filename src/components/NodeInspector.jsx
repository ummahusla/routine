import { ICONS } from "../data/icons";
import { TYPE_COLORS } from "../data/typeColors";

export function NodeInspector({ node, status, onClose }) {
  if (!node) return null;
  const c = TYPE_COLORS[node.type] || TYPE_COLORS.transform;

  const statusText =
    status === "running"
      ? "Executing…"
      : status === "done"
        ? "Completed in 1.2s"
        : status === "pending"
          ? "Queued"
          : "Idle · last run 2h ago";

  return (
    <aside className="ins">
      <div className="ins-h">
        <div className="ins-icon" style={{ color: c.icon, background: c.bg, borderColor: c.border }}>
          {ICONS[node.icon]}
        </div>
        <div className="ins-meta">
          <div className="ins-name">{node.label}</div>
          <div className="ins-type">
            {node.type} · {node.sub}
          </div>
        </div>
        <button className="ins-x" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="ins-section">
        <div className="ins-h2">Status</div>
        <div className={`ins-status ins-status-${status || "idle"}`}>{statusText}</div>
      </div>
      <div className="ins-section">
        <div className="ins-h2">Inputs</div>
        <pre className="ins-code">{`{
  "max_results": 5,
  "language": ["typescript", "python"],
  "timeout_ms": 30000
}`}</pre>
      </div>
      <div className="ins-section">
        <div className="ins-h2">Output schema</div>
        <ul className="ins-schema">
          <li><span>id</span><span>string</span></li>
          <li><span>title</span><span>string</span></li>
          <li><span>stars</span><span>number</span></li>
          <li><span>summary</span><span>string</span></li>
        </ul>
      </div>
      <div className="ins-foot">
        <button className="ins-btn">Open node config</button>
        <button className="ins-btn ins-btn-ghost">Replay from here</button>
      </div>
    </aside>
  );
}
