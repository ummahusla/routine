import { useEffect, useState, type ReactNode } from "react";
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

function isEnvelopeLike(value: unknown): value is { text?: unknown; data?: unknown } {
  return typeof value === "object" && value !== null && ("text" in value || "data" in value);
}

const ETH_ADDR_RE = /(0x[a-fA-F0-9]{40})\b/g;

function truncateEthAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Inline wallet / contract hex tokens — truncated with full value in title (less horizontal rupture). */
function lineWithAddresses(line: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(ETH_ADDR_RE.source, "g");
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index));
    const full = m[1];
    nodes.push(
      <span key={`${m.index}-${k++}`} className="ins-output-addr" title={full}>
        {truncateEthAddr(full)}
      </span>,
    );
    last = m.index + full.length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes.length > 0 ? nodes : line;
}

function firstNonEmptyLineIndex(lines: string[]): number {
  const i = lines.findIndex((l) => l.trim() !== "");
  return i === -1 ? 0 : i;
}

/** Readable multi-line run text: title row, list-like rows, gaps; mono + tint for long hex ids. */
function RunOutputTextBody({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const leadIdx = firstNonEmptyLineIndex(lines);

  return (
    <div className="ins-output-prose">
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="ins-output-linegap" aria-hidden />;

        const isRank = /^\s*#\d+\b/.test(line);
        const isLead = i === leadIdx && !isRank;

        const cls = ["ins-output-line", isRank ? "ins-output-line-rank" : "", isLead ? "ins-output-line-lead" : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={i} className={cls}>
            {lineWithAddresses(line)}
          </div>
        );
      })}
    </div>
  );
}

function RunOutputDisplay({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <div className="ins-empty">No output recorded for this node.</div>;
  }
  if (typeof value === "string") {
    return <RunOutputTextBody text={value} />;
  }
  if (isEnvelopeLike(value)) {
    const textRaw = value.text;
    const dataRaw = value.data;
    const textStr = typeof textRaw === "string" ? textRaw : null;
    const hasData = dataRaw !== undefined;
    if (textStr !== null && textStr !== "") {
      if (!hasData) return <RunOutputTextBody text={textStr} />;
      return (
        <>
          <RunOutputTextBody text={textStr} />
          <div className="ins-output-extra">
            <div className="ins-output-extra-label">Structured data</div>
            <pre className="ins-code ins-output-json">{formatJson(dataRaw)}</pre>
          </div>
        </>
      );
    }
    if (hasData) return <pre className="ins-code ins-output-json">{formatJson(dataRaw)}</pre>;
  }
  return <pre className="ins-code ins-output-json">{formatJson(value)}</pre>;
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
      <div className="ins-body">
        <div className="ins-section">
          <div className="ins-h2">Status</div>
          <div className={`ins-status ins-status-${status || "idle"}`}>{statusText}</div>
        </div>

        <NodeBody source={source} flowInfo={flowInfo} />

        {outputForNode !== null && (
          <div className="ins-section">
            <div className="ins-h2">Run output</div>
            <RunOutputDisplay value={outputForNode} />
          </div>
        )}
      </div>
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
    const outputEmpty =
      source.value === undefined ||
      source.value === null ||
      (typeof source.value === "string" && source.value.trim() === "");
    if (outputEmpty) return null;
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

  if (source.type === "llm") {
    const promptEmpty = !source.prompt || source.prompt.trim() === "";
    return (
      <>
        <div className="ins-section">
          <div className="ins-h2">Prompt</div>
          {promptEmpty ? (
            <div className="ins-empty">No prompt set.</div>
          ) : (
            <pre className="ins-code">{source.prompt}</pre>
          )}
        </div>
        {source.systemPrompt ? (
          <div className="ins-section">
            <div className="ins-h2">System prompt</div>
            <pre className="ins-code">{source.systemPrompt}</pre>
          </div>
        ) : null}
        <div className="ins-section">
          <div className="ins-h2">Model</div>
          <ul className="ins-schema">
            <li>
              <span>model</span>
              <span>{source.model ?? "claude-sonnet-4-6"}</span>
            </li>
            <li>
              <span>maxTokens</span>
              <span>{source.maxTokens ?? 4096}</span>
            </li>
            <li>
              <span>temperature</span>
              <span>{source.temperature ?? 0.7}</span>
            </li>
          </ul>
        </div>
      </>
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
