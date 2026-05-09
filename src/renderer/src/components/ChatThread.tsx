import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { ChatMessage } from "../types";

const VISIBLE_RECENT = 6;

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="msg msg-user">
        <div className="msg-bub">{message.text}</div>
      </div>
    );
  }

  return (
    <div className="msg msg-ai">
      <div className="msg-avatar">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M5 6h6l3 3h6" />
          <path d="M5 12h14" />
          <path d="M5 18h6l3-3h6" />
        </svg>
      </div>
      <div className="msg-body">
        <div className="msg-h">FlowBuild</div>
        <div className="msg-text">{message.text || (message.streaming ? "Thinking…" : "")}</div>
        {message.steps && (
          <ul className="msg-steps">
            {message.steps.map((step) => (
              <li key={step}>
                <span className="msg-tick">✓</span>
                {step}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type ChatThreadProps = {
  messages: ChatMessage[];
  height: number;
  onResize: (height: number) => void;
};

export function ChatThread({ messages, height, onResize }: ChatThreadProps) {
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visible = showAll ? messages : messages.slice(-VISIBLE_RECENT);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, showAll]);

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
        {messages.length > visible.length && !showAll && (
          <button className="ct-more" onClick={() => setShowAll(true)}>
            ↑ Show {messages.length - visible.length} earlier messages
          </button>
        )}
        <div className="ct-list">
          {visible.map((message, i) => (
            <Message key={message.id ?? `${message.role}-${message.text}-${i}`} message={message} />
          ))}
        </div>
      </div>
    </>
  );
}
