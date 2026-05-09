// Action buttons are intentionally absent: all flow control lives in the chat
// prompt (e.g. "run it", "stop", "reset"). The bar only carries breadcrumbs
// and a status pill for orientation.
export function TopBar({ flow, runState, building, running, onHome }) {
  const allDone =
    flow &&
    Object.keys(runState).length === flow.nodes.length &&
    Object.values(runState).every((s) => s === "done");

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
          <button className="tb-crumb tb-crumb-link" onClick={onHome}>Workspace</button>
          <span className="tb-sep">/</span>
          <button className="tb-crumb tb-crumb-link" onClick={onHome}>Flows</button>
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
        <span className="tb-hint">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 4v5h-5" />
          </svg>
          Drive everything from chat — try <kbd>run it</kbd> or <kbd>add a slack step</kbd>
        </span>
      </div>
    </div>
  );
}
