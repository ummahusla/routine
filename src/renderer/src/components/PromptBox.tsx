import { useEffect, useRef, type KeyboardEvent } from "react";

type PromptBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isRunning?: boolean;
  large?: boolean;
  placeholder?: string;
};

export function PromptBox({
  value,
  onChange,
  onSubmit,
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
          </button>
        ) : (
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
        )}
      </div>
    </div>
  );
}
