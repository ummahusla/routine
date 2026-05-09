import { useEffect, useRef, useState } from "react";
import type { ModelInfo } from "@flow-build/core";

type ModelPillProps = {
  value: string;
  onChange: (id: string) => void;
  models: ModelInfo[];
  disabled?: boolean;
};

function shortName(model: ModelInfo | undefined, fallbackId: string): string {
  if (!model) return fallbackId;
  return model.displayName || model.id;
}

function priceLabel(m: ModelInfo): string {
  if (!m.pricing) return "";
  const fmt = (n: number): string => `$${n.toFixed(2)}`;
  return `${fmt(m.pricing.inputPerM)} in / ${fmt(m.pricing.outputPerM)} out`;
}

export function ModelPill({ value, onChange, models, disabled }: ModelPillProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mp-wrap" ref={wrapRef}>
      <button
        type="button"
        className="mp"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={selected ? `${selected.provider} · ${selected.id}` : undefined}
      >
        <span className="mp-name">{shortName(selected, value)}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="mp-menu" role="listbox">
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mp-row ${m.id === value ? "is-active" : ""}`}
              role="option"
              aria-selected={m.id === value}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <span className="mp-row-name">{m.displayName || m.id}</span>
              <span className="mp-row-price">{priceLabel(m)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
