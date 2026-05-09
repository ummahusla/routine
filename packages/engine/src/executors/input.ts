import type { Node } from "@flow-build/flowbuilder";
import type { Envelope } from "../types.js";

export function executeInput(node: Extract<Node, { type: "input" }>): Envelope {
  const value = node.value;
  return {
    text: value === undefined || value === null ? "" : typeof value === "string" ? value : String(value),
    data: value,
  };
}
