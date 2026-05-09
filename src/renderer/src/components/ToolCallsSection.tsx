import { useState, type JSX } from "react";
import type { PersistedTurn } from "@flow-build/core";
import { ToolCallChip } from "./ToolCallChip";

type ToolCall = PersistedTurn["assistant"]["toolCalls"][number];
type Props = { calls: ToolCall[] };

export function ToolCallsSection({ calls }: Props): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (calls.length === 0) return null;

  let running = 0;
  let ok = 0;
  let error = 0;
  for (const c of calls) {
    if (c.ok === undefined) running++;
    else if (c.ok) ok++;
    else error++;
  }

  return (
    <div className="tool-section">
      <button
        type="button"
        className="tool-section-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-section-toggle" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width={12}
            height={12}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" }}
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
        <span className="tool-section-label">
          {calls.length} tool {calls.length === 1 ? "call" : "calls"}
        </span>
        <span className="tool-section-stats">
          {running > 0 && <span className="tool-stat tool-stat-running">{running} running</span>}
          {ok > 0 && <span className="tool-stat tool-stat-ok">{ok} ok</span>}
          {error > 0 && <span className="tool-stat tool-stat-error">{error} error</span>}
        </span>
      </button>
      {open && (
        <div className="tool-section-body">
          {calls.map((c) => (
            <ToolCallChip key={c.callId} call={c} />
          ))}
        </div>
      )}
    </div>
  );
}
