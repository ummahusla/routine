import { useEffect, useRef, type KeyboardEvent } from "react";

type PromptBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear?: () => void;
  canClear?: boolean;
  clearDisabled?: boolean;
  onStop?: () => void;
  isRunning?: boolean;
  large?: boolean;
  placeholder?: string;
};

export function PromptBox({
  value,
  onChange,
  onSubmit,
  onClear,
  canClear,
  clearDisabled,
  onStop,
  isRunning,
  large,
  placeholder,
}: PromptBoxProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !isRunning) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className={`pb ${large ? "pb-lg" : ""}`}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder || "Describe a flow… e.g. 'Triage Zendesk tickets and route urgent ones to Slack'"}
        disabled={isRunning}
      />
      <div className="pb-bar">
        <div className="pb-tools" />
        {isRunning ? (
          <button type="button" className="pb-stop" onClick={onStop}>
            <span>Stop</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        ) : (
          <div className="pb-actions">
            {canClear && onClear && (
              <button
                type="button"
                className="pb-clear"
                onClick={onClear}
                disabled={clearDisabled}
                title="Clear chat transcript only. The graph state stays unchanged."
              >
                Clear chat
              </button>
            )}
            <button
              className={`pb-send ${value.trim() ? "is-ready" : ""}`}
              onClick={onSubmit}
              disabled={!value.trim()}
            >
              <span>Send</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
