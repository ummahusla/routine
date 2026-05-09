import type { Node } from "@flow-build/flowbuilder";
import type { Envelope } from "../types.js";
import { EngineError } from "../errors.js";

export function executeInput(
  node: Extract<Node, { type: "input" }>,
  override?: { hasOverride: boolean; value: unknown },
): Envelope {
  const value = override?.hasOverride ? override.value : node.value;
  if (node.required && (value === undefined || value === null || value === "")) {
    const name = node.label || node.id;
    throw new EngineError("MISSING_REQUIRED_INPUT", `required input "${name}" not provided`);
  }
  return {
    text: value === undefined || value === null ? "" : typeof value === "string" ? value : String(value),
    data: value,
  };
}
