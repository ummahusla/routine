import { useEffect, useState } from "react";
import { ICONS } from "../data/icons";
import { TYPE_COLORS } from "../data/typeColors";
import type { FlowNode, FlowbuilderNode, NodeStatus } from "../types";

type NodeInspectorProps = {
  node: FlowNode | undefined;
  status: NodeStatus | undefined;
  readOnly?: boolean;
  onClose: () => void;
  onReplay?: () => void;
  sessionId?: string | null;
  activeRunId?: string | null;
  selectedRunId?: string | null;
  fbNode?: FlowbuilderNode;
};

export function NodeInspector({
  node,
  status,
  readOnly,
  onClose,
  onReplay,
  sessionId,
  activeRunId,
  selectedRunId,
  fbNode,
}: NodeInspectorProps) {
  const [outputForNode, setOutputForNode] = useState<unknown>(null);

  useEffect(() => {
    const runId = selectedRunId ?? activeRunId;
    if (!node || !runId || !sessionId) {
      setOutputForNode(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const r = (await window.api.run.read({ sessionId, runId })) as
        | { ok: true; outputs: Record<string, unknown> }
        | { ok: false; error: string };
      if (cancelled) return;
      if (r.ok) setOutputForNode(r.outputs[node.id] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [node?.id, activeRunId, selectedRunId, sessionId]);

  if (!node) return null;
  const color = TYPE_COLORS[node.type] || TYPE_COLORS.transform;

  const statusText =
    readOnly
      ? "Idle · read-only"
      : status === "running"
      ? "Executing…"
      : status === "done"
        ? "Completed in 1.2s"
        : status === "pending"
          ? "Queued"
          : "Idle · last run 2h ago";

  return (
    <aside className="ins">
      <div className="ins-h">
        <div className="ins-icon" style={{ color: color.icon, background: color.bg, borderColor: color.border }}>
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
      {fbNode && fbNode.type === "input" ? (
        <div className="ins-section">
          <div className="ins-h2">Input</div>
          <ul className="ins-schema">
            <li>
              <span>required</span>
              <span>{fbNode.required ? "yes" : "no"}</span>
            </li>
            {fbNode.label && (
              <li>
                <span>label</span>
                <span>{fbNode.label}</span>
              </li>
            )}
            {fbNode.description && (
              <li>
                <span>description</span>
                <span>{fbNode.description}</span>
              </li>
            )}
            <li>
              <span>value</span>
              <span>
                {fbNode.value === undefined || fbNode.value === null || fbNode.value === ""
                  ? "(empty)"
                  : typeof fbNode.value === "string"
                    ? fbNode.value
                    : JSON.stringify(fbNode.value)}
              </span>
            </li>
          </ul>
          {fbNode.required && (fbNode.value === undefined || fbNode.value === null || fbNode.value === "") && (
            <div className="ins-note">
              Required input — Play will prompt for a value at run time. Ask the agent to set <code>required</code>, <code>label</code>, or <code>description</code> via <code>flowbuilder_set_state</code>.
            </div>
          )}
        </div>
      ) : (
        <div className="ins-section">
          <div className="ins-h2">Inputs</div>
          <pre className="ins-code">{`{
  "max_results": 5,
  "language": ["typescript", "python"],
  "timeout_ms": 30000
}`}</pre>
        </div>
      )}
      <div className="ins-section">
        <div className="ins-h2">Output schema</div>
        <ul className="ins-schema">
          <li><span>id</span><span>string</span></li>
          <li><span>title</span><span>string</span></li>
          <li><span>stars</span><span>number</span></li>
          <li><span>summary</span><span>string</span></li>
        </ul>
      </div>
      {outputForNode !== null && (
        <div className="ins-section">
          <div className="ins-h2">Run output</div>
          <pre className="ins-code ins-output">{JSON.stringify(outputForNode, null, 2)}</pre>
        </div>
      )}
      <div className="ins-foot">
        {readOnly ? (
          <div className="ins-note">This graph is read from disk. The agent owns state changes for this iteration.</div>
        ) : (
          <>
            <button className="ins-btn">Open node config</button>
            <button
              className="ins-btn ins-btn-ghost"
              onClick={onReplay}
              disabled={!onReplay}
            >
              Replay from here
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
