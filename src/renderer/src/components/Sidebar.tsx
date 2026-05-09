import { useMemo, useState } from "react";
import { Logo } from "./Logo";
import type { FlowTemplateId, PreviousFlow } from "../types";

type FlowItemProps = {
  flow: PreviousFlow;
  active: boolean;
  onClick: () => void;
};

function FlowItem({ flow, active, onClick }: FlowItemProps) {
  return (
    <button className={`sb-item ${active ? "is-active" : ""}`} onClick={onClick}>
      <span className={`sb-dot sb-dot-${flow.status}`} />
      <span className="sb-item-label">{flow.label}</span>
      <span className="sb-item-when">{flow.when}</span>
    </button>
  );
}

type SidebarProps = {
  flows: PreviousFlow[];
  selectedId: FlowTemplateId | null;
  onSelect: (id: FlowTemplateId) => void;
  onNew: () => void;
};

export function Sidebar({ flows, selectedId, onSelect, onNew }: SidebarProps) {
  const [q, setQ] = useState("");
  const grouped = useMemo(() => {
    const today: PreviousFlow[] = [];
    const earlier: PreviousFlow[] = [];
    flows
      .filter((flow) => flow.label.toLowerCase().includes(q.toLowerCase()))
      .forEach((flow) => {
        if (/h ago|yesterday/i.test(flow.when)) today.push(flow);
        else earlier.push(flow);
      });
    return { today, earlier };
  }, [flows, q]);

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-mark">
          <Logo />
        </div>
        <div className="sb-brand-name">FlowBuild</div>
        <div className="sb-brand-tag">beta</div>
      </div>

      <button className="sb-new" onClick={onNew}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>New flow</span>
        <kbd>⌘ N</kbd>
      </button>

      <div className="sb-search">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search flows" />
      </div>

      <div className="sb-section">
        {grouped.today.length > 0 && <div className="sb-heading">Today</div>}
        {grouped.today.map((flow) => (
          <FlowItem key={flow.id} flow={flow} active={flow.id === selectedId} onClick={() => onSelect(flow.id)} />
        ))}

        {grouped.earlier.length > 0 && <div className="sb-heading">Earlier</div>}
        {grouped.earlier.map((flow) => (
          <FlowItem key={flow.id} flow={flow} active={flow.id === selectedId} onClick={() => onSelect(flow.id)} />
        ))}
      </div>

      <div className="sb-foot">
        <div className="sb-user">
          <div className="sb-avatar">JK</div>
          <div className="sb-meta">
            <div className="sb-name">Jamie Kim</div>
            <div className="sb-org">Pumpur Labs · Pro</div>
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
