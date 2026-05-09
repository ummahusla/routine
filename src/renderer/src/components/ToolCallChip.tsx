import { useState, type JSX } from "react";
import type { PersistedTurn } from "@flow-build/core";
import { ToolIcon } from "./ToolIcon";

type Props = { call: PersistedTurn["assistant"]["toolCalls"][number] };

export function ToolCallChip({ call }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const status = call.ok === undefined ? "running" : call.ok ? "ok" : "error";
  return (
    <div className={`tool-chip tool-chip-${status}`}>
      <button
        type="button"
        className="tool-chip-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-chip-icon" aria-hidden="true">
          <ToolIcon name={call.name} />
        </span>
        <span className="tool-chip-name">{call.name}</span>
        <span className="tool-chip-status">{status}</span>
      </button>
      {open && (
        <div className="tool-chip-body">
          <div className="tool-chip-section">
            <div className="tool-chip-label">args</div>
            <pre>{call.args !== undefined ? JSON.stringify(call.args, null, 2) : "<none>"}</pre>
          </div>
          <div className="tool-chip-section">
            <div className="tool-chip-label">result</div>
            <pre>{call.result !== undefined ? JSON.stringify(call.result, null, 2) : "<none>"}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
