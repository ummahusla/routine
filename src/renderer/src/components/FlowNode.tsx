import type { CSSProperties, MouseEvent, MouseEventHandler } from "react";
import { ICONS } from "../data/icons";
import { TYPE_COLORS } from "../data/typeColors";
import { NODE_W, NODE_H } from "../data/constants";
import { nodePos } from "../utils/flow";
import type { FlowNode as FlowNodeModel, RunState } from "../types";

const PROMPT_NODE_H = 132;

type FlowNodeProps = {
  n: FlowNodeModel;
  idx: number;
  runState: RunState;
  dragging: boolean;
  connecting?: boolean;
  selected?: boolean;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onDelete?: () => void;
  onPromptChange?: (id: string, prompt: string) => void;
  onPortDown?: (event: MouseEvent<HTMLDivElement>, node: FlowNodeModel) => void;
  streamingText?: string;
  errorMessage?: string;
};

export function FlowNode({
  n,
  idx,
  runState,
  dragging,
  connecting,
  selected,
  onMouseDown,
  onDelete,
  onPromptChange,
  onPortDown,
  streamingText,
  errorMessage,
}: FlowNodeProps) {
  const color = TYPE_COLORS[n.type];
  const { x, y } = nodePos(n);
  const status = runState[n.id];
  const isPrompt = n.type === "prompt";
  const isLlm = n.type === "llm";
  const isPromptLike = isPrompt || isLlm;
  const h = isPromptLike ? PROMPT_NODE_H : NODE_H;
  const revealStyle: CSSProperties = !n._userPlaced
    ? { animationDelay: `${idx * 60}ms` }
    : { animation: "none", opacity: 1 };

  return (
    <div
      className={`fc-node fc-type-${n.type} ${status ? `fc-status-${status}` : ""} ${dragging ? "is-dragging" : ""} ${isPromptLike ? "fc-node-prompt" : ""} ${connecting ? "is-connect-target" : ""} ${selected ? "is-selected" : ""}`}
      data-node-id={n.id}
      style={{
        left: x,
        top: y,
        width: NODE_W,
        height: h,
        background: color.bg,
        borderColor: color.border,
        ...revealStyle,
      }}
      onMouseDown={onMouseDown}
    >
      <div className="fc-node-head">
        <div className="fc-icon" style={{ color: color.icon }}>
          {ICONS[n.icon] || ICONS.code}
        </div>
        <div className="fc-label">
          <div className="fc-name">{n.label}</div>
          <div className="fc-sub">{isPromptLike ? `${(n.prompt || "").length} chars · editable` : n.sub}</div>
        </div>
      </div>
      {isPrompt && (
        <textarea
          className="fc-prompt-ta"
          value={n.prompt || ""}
          placeholder="Write the LLM prompt…"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onPromptChange?.(n.id, event.target.value)}
        />
      )}
      {isLlm && (
        <>
          <textarea
            className="fc-llm-prompt"
            value={n.prompt || ""}
            placeholder="Prompt template — {{input}} for upstream text"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onPromptChange?.(n.id, event.target.value)}
            rows={3}
          />
          {streamingText && (
            <div className="fc-llm-stream">{streamingText}</div>
          )}
          {errorMessage && (
            <div className="fc-llm-error" title={errorMessage}>error</div>
          )}
        </>
      )}
      <div className="fc-port fc-port-l" />
      <div
        className="fc-port fc-port-r"
        style={isPromptLike ? { top: "auto", bottom: "26px", transform: "none" } : undefined}
        title={onPortDown ? "Drag to connect" : undefined}
        onMouseDown={(event) => {
          event.stopPropagation();
          onPortDown?.(event, n);
        }}
      />
      {onDelete && (
        <button
          className="fc-del"
          title="Delete step"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
      {status === "running" && <div className="fc-pulse" />}
      {status === "done" && (
        <div className="fc-badge">
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M3 8.5l3 3 7-8" />
          </svg>
        </div>
      )}
    </div>
  );
}
