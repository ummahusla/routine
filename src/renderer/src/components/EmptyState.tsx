import { useState } from "react";
import { ICONS } from "../data/icons";
import { PromptBox } from "./PromptBox";
import type { SuggestedPrompt } from "../types";

type EmptyStateProps = {
  onSubmit: (value: string) => void;
  suggestions: SuggestedPrompt[];
};

export function EmptyState({ onSubmit, suggestions }: EmptyStateProps) {
  const [val, setVal] = useState("");

  function send(text?: string): void {
    const value = (text ?? val).trim();
    if (!value) return;
    onSubmit(value);
    setVal("");
  }

  return (
    <div className="empty">
      <div className="empty-mark">
        <svg viewBox="0 0 40 40" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="14" width="10" height="12" rx="3" />
          <rect x="27" y="6" width="10" height="12" rx="3" />
          <rect x="27" y="22" width="10" height="12" rx="3" />
          <path d="M13 20h7M20 20v-8h7M20 20v8h7" />
        </svg>
      </div>
      <h1 className="empty-h">What flow would you like to build?</h1>
      <p className="empty-sub">
        Describe the automation in plain English. FlowBuild lays out the nodes, wires them up, and runs them on your stack.
      </p>

      <PromptBox value={val} onChange={setVal} onSubmit={() => send()} large />

      <div className="empty-suggest">
        <div className="empty-suggest-h">Or start from something like</div>
        <div className="empty-suggest-grid">
          {suggestions.map((suggestion) => (
            <button key={suggestion.label} className="sg-card" onClick={() => send(suggestion.label)}>
              <span className="sg-ico">{ICONS[suggestion.icon]}</span>
              <span className="sg-label">{suggestion.label}</span>
              <span className="sg-arrow">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
