import type { Flow, RunState } from "../types";

type TopBarProps = {
  flow: Flow | null;
  runState: RunState;
  building: boolean;
  running: boolean;
  onRun: () => void | Promise<void>;
  onStop: () => void;
  onReset: () => void;
};

export function TopBar({ flow, runState, building, running, onRun, onStop, onReset }: TopBarProps) {
  const allDone =
    flow &&
    Object.keys(runState).length === flow.nodes.length &&
    Object.values(runState).every((status) => status === "done");

  const pillClass = building
    ? "tb-pill-building"
    : running
      ? "tb-pill-running"
      : allDone
        ? "tb-pill-done"
        : "tb-pill-draft";
  const pillLabel = building ? "Generating" : running ? "Running" : allDone ? "Run complete" : "Draft";

  return (
    <div className="tb">
      <div className="tb-l">
        <div className="tb-crumbs">
          <span className="tb-crumb">Workspace</span>
          <span className="tb-sep">/</span>
          <span className="tb-crumb">Flows</span>
          <span className="tb-sep">/</span>
          <span className="tb-crumb tb-current">{flow?.title || "New flow"}</span>
        </div>
        {flow && (
          <span className={`tb-pill ${pillClass}`}>
            <span className="tb-pill-dot" />
            {pillLabel}
          </span>
        )}
      </div>
      <div className="tb-r">
        <button className="tb-btn tb-ghost" disabled={!flow}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </svg>
          Share
        </button>
        <button className="tb-btn tb-ghost" disabled={!flow}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </svg>
          Export YAML
        </button>
        {running ? (
          <button className="tb-btn tb-stop" onClick={onStop}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
            Stop
          </button>
        ) : (
          <button className="tb-btn tb-run" onClick={allDone ? onReset : onRun} disabled={!flow || building}>
            {allDone ? (
              <>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
                Run again
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                  <path d="M6 4v16l14-8z" />
                </svg>
                Execute
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
