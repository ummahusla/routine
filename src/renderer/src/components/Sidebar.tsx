import { useMemo, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import type { FlowbuilderSessionSummary } from "../types";

type FlowItemProps = {
  session: FlowbuilderSessionSummary;
  active: boolean;
  onClick: () => void;
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function chipColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 38%)`;
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 2 * day) return "yesterday";
  return new Date(timestamp).toLocaleDateString();
}

function FlowItem({ session, active, onClick }: FlowItemProps) {
  return (
    <button
      className={`sb-item sb-session ${active ? "is-active" : ""}`}
      onClick={onClick}
      title={session.name}
    >
      <span className="sb-chip" style={{ background: chipColor(session.id) }}>
        {initials(session.name)}
        <span className="sb-chip-dot sb-chip-dot-deployed" />
      </span>
      <span className="sb-item-main">
        <span className="sb-item-label">{session.name}</span>
        <span className="sb-item-id">{session.id}</span>
      </span>
      <span className="sb-item-meta">
        <span>{session.nodeCount} nodes</span>
        <span>{relativeTime(session.updatedAt)}</span>
      </span>
    </button>
  );
}

type SidebarProps = {
  sessions: FlowbuilderSessionSummary[];
  selectedId: string | null;
  localActive: boolean;
  loading: boolean;
  error: string | null;
  baseDir: string;
  collapsed: boolean;
  canToggleCollapse: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRefresh: () => void;
  extras?: ReactNode;
};

export function Sidebar({
  sessions,
  selectedId,
  localActive,
  loading,
  error,
  baseDir,
  collapsed,
  canToggleCollapse,
  onToggleCollapse,
  onSelect,
  onNew,
  onRefresh,
  extras,
}: SidebarProps) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      sessions.filter((session) => {
        const query = q.toLowerCase();
        return session.name.toLowerCase().includes(query) || session.id.toLowerCase().includes(query);
      }),
    [sessions, q],
  );

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark">
          <Logo />
        </div>
        <div className="sb-brand-name">Routine</div>
        <div className="sb-brand-tag">beta</div>
        {canToggleCollapse && (
          <button
            className="sb-toggle"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
              {collapsed ? (
                <path d="M9 6l6 6-6 6" />
              ) : (
                <path d="M15 6l-6 6 6 6" />
              )}
            </svg>
          </button>
        )}
      </div>

      <button className={`sb-new ${localActive ? "is-active" : ""}`} onClick={onNew}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>New chat</span>
        <kbd>⌘ N</kbd>
      </button>

      <button className="sb-refresh" onClick={onRefresh}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
          <path d="M3 21v-5h5" />
          <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        <span>{loading ? "Loading sessions" : "Refresh sessions"}</span>
      </button>

      <div className="sb-search">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search sessions" />
      </div>

      <div className="sb-section">
        <div className="sb-heading">Routine sessions</div>
        {loading && <div className="sb-muted">Reading manifests from disk...</div>}
        {!loading && error && <div className="sb-error">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="sb-muted">{sessions.length === 0 ? "No sessions found." : "No sessions match your search."}</div>
        )}
        {!loading &&
          !error &&
          filtered.map((session) => (
            <FlowItem
              key={session.id}
              session={session}
              active={session.id === selectedId}
              onClick={() => onSelect(session.id)}
            />
          ))}
      </div>

      {extras && <div className="sb-extras">{extras}</div>}

      <div className="sb-foot">
        <div className="sb-user">
          <div className="sb-avatar">FB</div>
          <div className="sb-meta">
            <div className="sb-name">Local workspace</div>
            <div className="sb-org" title={baseDir || "Resolving..."}>
              Saved on this device
            </div>
          </div>
          <button className="sb-ico" title="Settings">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
