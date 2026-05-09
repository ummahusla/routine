import type { Flow } from "../types";

type TopBarProps = {
  flow: Flow | null;
  onHome: () => void;
  onTidy: () => void;
  onPlay: () => void;
  canRun: boolean;
  running: boolean;
};

// Flow controls live in chat commands and run state surfaces in the sidebar
// + per-node badges, so the top bar only carries breadcrumb navigation
// and a Tidy action that re-runs auto-layout.
export function TopBar({ flow, onHome, onTidy, onPlay, canRun, running }: TopBarProps) {
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
      <div className="tb-r">
        <button
          type="button"
          className={`tb-btn tb-btn-primary ${running ? "tb-btn-running" : ""}`}
          onClick={onPlay}
          disabled={running || !canRun}
          aria-busy={running}
          title={
            !canRun
              ? "Add an output node; remove branch/merge to enable execution"
              : running
                ? "Running…"
                : "Execute flow"
          }
        >
          {running ? (
            <>
              <svg className="tb-spin-icon" viewBox="0 0 24 24" width="13" height="13" aria-hidden>
                <circle
                  className="tb-spin-track"
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  strokeWidth="2"
                />
                <path
                  className="tb-spin-head"
                  d="M12 3a9 9 0 0 1 9 9"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="tb-btn-running-label">Running…</span>
            </>
          ) : (
            <>
              <span aria-hidden>▶</span>
              <span>Play</span>
            </>
          )}
        </button>
        {flow && (
          <button className="tb-btn tb-action" onClick={onTidy} title="Auto-arrange the canvas">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="6" height="6" rx="1.2" />
              <rect x="15" y="4" width="6" height="6" rx="1.2" />
              <rect x="3" y="14" width="6" height="6" rx="1.2" />
              <rect x="15" y="14" width="6" height="6" rx="1.2" />
              <path d="M9 7h6M9 17h6M6 10v4M18 10v4" />
            </svg>
            <span>Tidy</span>
          </button>
        )}
      </div>
    </div>
  );
}
