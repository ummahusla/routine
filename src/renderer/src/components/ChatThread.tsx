import { useState } from "react";
import type { ChatMessage } from "../types";

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
        <div className="msg-text">{message.text}</div>
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

export function ChatThread({ messages }: { messages: ChatMessage[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? messages : messages.slice(-2);
  return (
    <div className="ct">
      {messages.length > 2 && !showAll && (
        <button className="ct-more" onClick={() => setShowAll(true)}>
          ↑ Show {messages.length - 2} earlier messages
        </button>
      )}
      <div className="ct-list">
        {visible.map((message, i) => (
          <Message key={`${message.role}-${message.text}-${i}`} message={message} />
        ))}
      </div>
    </div>
  );
}
