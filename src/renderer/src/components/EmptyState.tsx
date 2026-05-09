import { useEffect, useState } from "react";
import type { ModelInfo } from "@flow-build/core";
import { PromptBox } from "./PromptBox";

type EmptyStateProps = {
  onSubmit: (text: string, model: string) => void;
  models: ModelInfo[];
  initialModel: string;
  onPickModel: (id: string) => void;
};

export function EmptyState({ onSubmit, models, initialModel, onPickModel }: EmptyStateProps) {
  const [val, setVal] = useState("");
  const [model, setModel] = useState(initialModel);

  // globalDefault arrives async on cold start; sync local model so user sees
  // their stored default instead of the synchronous "composer-2" placeholder.
  useEffect(() => {
    setModel(initialModel);
  }, [initialModel]);

  function handleModelChange(id: string): void {
    setModel(id);
    onPickModel(id);
  }

  function send(text?: string): void {
    const value = (text ?? val).trim();
    if (!value) return;
    onSubmit(value, model);
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
        Describe the automation in plain English. Routine lays out the nodes, wires them up, and runs them on your stack.
      </p>

      <PromptBox
        value={val}
        onChange={setVal}
        onSubmit={() => send()}
        large
        model={model}
        onModelChange={handleModelChange}
        models={models}
      />
    </div>
  );
}
