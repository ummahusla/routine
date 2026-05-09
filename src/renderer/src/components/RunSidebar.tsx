import { useEffect, useState } from "react";

type RunRow = {
  runId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  error?: string;
};

type Props = {
  sessionId: string | null;
  refreshTick: number;
  onSelect: (runId: string) => void;
};

export function RunSidebar({ sessionId, refreshTick, onSelect }: Props) {
  const [runs, setRuns] = useState<RunRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setRuns([]);
      return;
    }
    void (async () => {
      const r = await window.api.run.list({ sessionId });
      if (cancelled) return;
      if (r.ok) setRuns(r.runs);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshTick]);

  if (!sessionId) return null;
  if (runs.length === 0) return <div className="rs-empty">No runs yet</div>;

  return (
    <div className="rs-list">
      <div className="rs-head">Runs</div>
      {runs.map((r) => (
        <button
          key={r.runId}
          className={`rs-row rs-${r.status}`}
          onClick={() => onSelect(r.runId)}
        >
          <span className="rs-status">{r.status}</span>
          <span className="rs-time">{new Date(r.startedAt).toLocaleTimeString()}</span>
          <span className="rs-id">{r.runId.slice(0, 8)}</span>
        </button>
      ))}
    </div>
  );
}
