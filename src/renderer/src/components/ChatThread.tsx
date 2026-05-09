import { useEffect, useRef, type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PersistedTurn } from "@flow-build/core";
import { ToolCallsSection } from "./ToolCallsSection";

type ChatThreadProps = {
  turns: PersistedTurn[];
  height: number;
  loading?: boolean;
  onResize: (height: number) => void;
};

export function ChatThread({ turns, height, loading = false, onResize }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastTurn = turns[turns.length - 1];
  const lastTextLen = lastTurn?.assistant.textBlocks.length ?? 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns.length, lastTextLen]);

  function onResizeDown(event: MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startH = height;
    const onMove = (moveEvent: globalThis.MouseEvent): void => {
      const dy = startY - moveEvent.clientY;
      onResize(Math.max(60, Math.min(560, startH + dy)));
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "ns-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <>
      <div className="ct-resizer" onMouseDown={onResizeDown} title="Drag to resize">
        <div className="ct-resizer-grip" />
      </div>
      <div className="ct" ref={scrollRef} style={{ height, maxHeight: "none", flex: "0 0 auto" }}>
        <div className="ct-list">
          {loading && turns.length === 0 && (
            <div className="ct-loading" role="status" aria-live="polite">
              <span className="ct-spinner" aria-hidden="true" />
              <span>Loading session details...</span>
            </div>
          )}
          {turns.map((turn) => (
            <div key={turn.turnId} className="msg-pair">
              <div className="msg msg-user">
                <div className="msg-bub">{turn.user.text}</div>
              </div>
              <div className="msg msg-ai">
                <div className="msg-body">
                  <div className="msg-h">FlowBuild</div>
                  <ToolCallsSection calls={turn.assistant.toolCalls} />
                  {turn.assistant.textBlocks.length > 0 && (
                    <div className="msg-text">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {turn.assistant.textBlocks.join("")}
                      </ReactMarkdown>
                    </div>
                  )}
                  {turn.status === "running" &&
                    turn.assistant.textBlocks.length === 0 &&
                    turn.assistant.toolCalls.length === 0 && (
                      <div className="msg-typing" aria-label="Waiting for response">
                        <span className="msg-typing-dot" />
                        <span className="msg-typing-dot" />
                        <span className="msg-typing-dot" />
                      </div>
                    )}
                  {turn.status !== "completed" && turn.status !== "running" && (
                    <div className="msg-end">
                      [turn {turn.status}]
                      {turn.error && (
                        <div className="msg-error">
                          {turn.error.code ? `${turn.error.code}: ` : ""}
                          {turn.error.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
