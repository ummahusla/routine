import type { Flow } from "../types";

type TopBarProps = {
  flow: Flow | null;
  onHome: () => void;
};

// Flow controls live in chat commands and run state surfaces in the sidebar
// + per-node badges, so the top bar only carries breadcrumb navigation.
export function TopBar({ flow, onHome }: TopBarProps) {
  return (
    <div className="tb">
      <div className="tb-l">
        <div className="tb-crumbs">
          <button className="tb-crumb tb-crumb-link" onClick={onHome}>
            Workspace
          </button>
          <span className="tb-sep">/</span>
          <button className="tb-crumb tb-crumb-link" onClick={onHome}>
            Flows
          </button>
          <span className="tb-sep">/</span>
          <span className="tb-crumb tb-current">{flow?.title || "New flow"}</span>
        </div>
      </div>
      <div className="tb-r" />
    </div>
  );
}
