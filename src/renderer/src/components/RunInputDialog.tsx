import { useEffect, useState, type JSX } from "react";

export type RequiredInputSpec = {
  id: string;
  label: string;
  description?: string;
};

type Props = {
  inputs: RequiredInputSpec[];
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
};

export function RunInputDialog({ inputs, onCancel, onSubmit }: Props): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map((i) => [i.id, ""])),
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const allFilled = inputs.every((i) => values[i.id]?.trim().length > 0);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!allFilled) return;
    onSubmit(values);
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-input-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-title" id="run-input-title">
          Provide flow inputs
        </div>
        <div className="modal-body">
          <div className="run-input-fields">
            {inputs.map((spec, idx) => (
              <label key={spec.id} className="run-input-field">
                <span className="run-input-label">{spec.label}</span>
                {spec.description && (
                  <span className="run-input-desc">{spec.description}</span>
                )}
                <input
                  type="text"
                  className="run-input-control"
                  autoFocus={idx === 0}
                  value={values[spec.id] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [spec.id]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn modal-btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="modal-btn"
            disabled={!allFilled}
          >
            Run
          </button>
        </div>
      </form>
    </div>
  );
}
