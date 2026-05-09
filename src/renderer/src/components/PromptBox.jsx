import { useEffect, useRef } from "react";

export function PromptBox({ value, onChange, onSubmit, large, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [value]);

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className={`pb ${large ? "pb-lg" : ""}`}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder || "Describe a flow… e.g. 'Triage Zendesk tickets and route urgent ones to Slack'"}
      />
      <div className="pb-bar">
        <div className="pb-tools">
          <button className="pb-tool" title="Attach context">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 12l-9 9a5 5 0 1 1-7-7l9-9a3 3 0 1 1 4 4l-9 9a1 1 0 1 1-2-2l8-8" />
            </svg>
          </button>
          <button className="pb-tool" title="Pick connectors">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="18" cy="6" r="2.5" />
              <circle cx="6" cy="18" r="2.5" />
              <circle cx="18" cy="18" r="2.5" />
              <path d="M8 6h8M6 8v8M18 8v8M8 18h8" />
            </svg>
            <span className="pb-tool-label">Connectors</span>
          </button>
          <span className="pb-divider" />
          <span className="pb-model">
            <span className="pb-model-dot" />
            claude-sonnet-flow
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>
        <button
          className={`pb-send ${value.trim() ? "is-ready" : ""}`}
          onClick={onSubmit}
          disabled={!value.trim()}
        >
          <span>Build flow</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
