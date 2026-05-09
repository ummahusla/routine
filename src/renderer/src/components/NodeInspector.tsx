import { useEffect, useState } from "react";
import { ICONS } from "../data/icons";
import { TYPE_COLORS } from "../data/typeColors";
import type {
  FlowbuilderNode,
  FlowInfoResult,
  FlowNode,
  NodeStatus,
} from "../types";

type NodeInspectorProps = {
  node: FlowNode | undefined;
  status: NodeStatus | undefined;
  readOnly?: boolean;
  onClose: () => void;
  onReplay?: () => void;
  sessionId?: string | null;
  activeRunId?: string | null;
  selectedRunId?: string | null;
};

type FlowInfoState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; info: Extract<FlowInfoResult, { ok: true }> }
  | { kind: "missing"; error: string };

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatParamValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return formatJson(value);
}

export function NodeInspector({
  node,
  status,
  readOnly,
  onClose,
  onReplay,
  sessionId,
  activeRunId,
  selectedRunId,
}: NodeInspectorProps) {
  const [flowInfo, setFlowInfo] = useState<FlowInfoState>({ kind: "idle" });
  const [outputForNode, setOutputForNode] = useState<unknown>(null);
  const source = node?.source;
  const flowRef = source?.type === "flow" ? source.flow : null;

  useEffect(() => {
    if (!flowRef) {
      setFlowInfo({ kind: "idle" });
      return;
    }
    let cancelled = false;
    const getFlowInfo = window.api?.flowbuilder?.getFlowInfo;
    if (typeof getFlowInfo !== "function") {
      setFlowInfo({
        kind: "missing",
        error: "flowbuilder.getFlowInfo bridge unavailable (restart Electron after preload changes)",
      });
      return;
    }
    setFlowInfo({ kind: "loading" });
    Promise.resolve()
      .then(() => getFlowInfo(flowRef))
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setFlowInfo({ kind: "ready", info: result });
        else setFlowInfo({ kind: "missing", error: result.error });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFlowInfo({
          kind: "missing",
          error: err instanceof Error ? err.message : "lookup failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [flowRef]);

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

  const statusText = readOnly
    ? "Idle · read-only"
    : status === "running"
      ? "Executing…"
      : status === "done"
        ? "Completed"
        : status === "pending"
          ? "Queued"
          : "Idle";

  return (
    <aside className="ins">
      <div className="ins-h">
        <div
          className="ins-icon"
          style={{ color: color.icon, background: color.bg, borderColor: color.border }}
        >
          {ICONS[node.icon]}
        </div>
        <div className="ins-meta">
          <div className="ins-name">{node.label}</div>
          <div className="ins-type">
            {node.type} · {node.sub}
          </div>
        </div>
        <button className="ins-x" onClick={onClose}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="ins-section">
        <div className="ins-h2">Status</div>
        <div className={`ins-status ins-status-${status || "idle"}`}>{statusText}</div>
      </div>

      <NodeBody source={source} flowInfo={flowInfo} />

      {outputForNode !== null && (
        <div className="ins-section">
          <div className="ins-h2">Run output</div>
          <pre className="ins-code ins-output">{JSON.stringify(outputForNode, null, 2)}</pre>
        </div>
      )}
      <div className="ins-foot">
        {readOnly ? (
          <div className="ins-note">
            This graph is read from disk. The agent owns state changes for this iteration.
          </div>
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

function NodeBody({
  source,
  flowInfo,
}: {
  source: FlowbuilderNode | undefined;
  flowInfo: FlowInfoState;
}) {
  if (!source) return null;

  if (source.type === "input") {
    const empty = source.value === undefined || source.value === null || source.value === "";
    return (
      <div className="ins-section">
        <div className="ins-h2">Input</div>
        <ul className="ins-schema">
          <li>
            <span>required</span>
            <span>{source.required ? "yes" : "no"}</span>
          </li>
          {source.label && (
            <li>
              <span>label</span>
              <span>{source.label}</span>
            </li>
          )}
          {source.description && (
            <li>
              <span>description</span>
              <span>{source.description}</span>
            </li>
          )}
          <li>
            <span>value</span>
            <span>
              {empty
                ? "(empty)"
                : typeof source.value === "string"
                  ? source.value
                  : JSON.stringify(source.value)}
            </span>
          </li>
        </ul>
        {source.required && empty && (
          <div className="ins-note">
            Required input — Play will prompt for a value at run time. Ask the agent to set <code>required</code>, <code>label</code>, or <code>description</code> via <code>flowbuilder_set_state</code>.
          </div>
        )}
      </div>
    );
  }

  if (source.type === "output") {
    return (
      <div className="ins-section">
        <div className="ins-h2">Output value</div>
        <pre className="ins-code">{formatJson(source.value)}</pre>
      </div>
    );
  }

  if (source.type === "branch") {
    return (
      <div className="ins-section">
        <div className="ins-h2">Condition</div>
        <pre className="ins-code">{source.cond}</pre>
      </div>
    );
  }

  if (source.type === "merge") {
    return (
      <div className="ins-section">
        <div className="ins-h2">Merge</div>
        <div className="ins-empty">Joins all incoming branches into the next node.</div>
      </div>
    );
  }

  if (source.type !== "flow") return null;

  const params = source.params ?? {};
  return (
    <>
      <div className="ins-section">
        <div className="ins-h2">Flow</div>
        <pre className="ins-code">{source.flow}</pre>
        {flowInfo.kind === "ready" && flowInfo.info.description ? (
          <div className="ins-desc" style={{ marginTop: 8 }}>
            {flowInfo.info.description}
          </div>
        ) : null}
        {flowInfo.kind === "missing" ? (
          <div className="ins-empty" style={{ marginTop: 8 }}>
            No manifest in ~/.rote/flows for this ref ({flowInfo.error}).
          </div>
        ) : null}
        {flowInfo.kind === "loading" ? (
          <div className="ins-empty" style={{ marginTop: 8 }}>
            Loading flow manifest…
          </div>
        ) : null}
      </div>

      {flowInfo.kind === "ready" && flowInfo.info.requiresEndpoints.length > 0 ? (
        <div className="ins-section">
          <div className="ins-h2">Requires endpoints</div>
          <div className="ins-chips">
            {flowInfo.info.requiresEndpoints.map((ep) => (
              <span key={ep} className="ins-chip ins-chip-active">
                {ep}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ins-section">
        <div className="ins-h2">
          Parameters{flowInfo.kind === "ready" ? ` (${flowInfo.info.parameters.length})` : ""}
        </div>
        {flowInfo.kind === "ready" && flowInfo.info.parameters.length > 0 ? (
          <div className="ins-params">
            {flowInfo.info.parameters.map((p) => {
              const set = Object.prototype.hasOwnProperty.call(params, p.name);
              const value = set ? params[p.name] : undefined;
              return (
                <div key={p.name} className="ins-param">
                  <div className="ins-param-h">
                    <span className="ins-param-name">{p.name}</span>
                    {p.type ? <span className="ins-param-type">{p.type}</span> : null}
                    {p.required ? <span className="ins-param-req">required</span> : null}
                  </div>
                  {p.description ? <div className="ins-param-desc">{p.description}</div> : null}
                  <div className="ins-param-row">
                    <span className="ins-param-key">value</span>
                    <span
                      className={`ins-param-val${set ? "" : " ins-param-val-default"}`}
                    >
                      {set ? formatParamValue(value) : "(unset — uses default)"}
                    </span>
                  </div>
                  {p.default !== undefined && p.default !== null ? (
                    <div className="ins-param-row">
                      <span className="ins-param-key">default</span>
                      <span className="ins-param-val ins-param-val-default">
                        {formatParamValue(p.default)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : Object.keys(params).length > 0 ? (
          <pre className="ins-code">{formatJson(params)}</pre>
        ) : (
          <div className="ins-empty">No parameters set.</div>
        )}
      </div>

      {flowInfo.kind === "ready" && flowInfo.info.tags.length > 0 ? (
        <div className="ins-section">
          <div className="ins-h2">Tags</div>
          <div className="ins-chips">
            {flowInfo.info.tags.map((t) => (
              <span key={t} className="ins-chip">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
