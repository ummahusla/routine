import type { Envelope } from "../types.js";

export function executeOutput(input: Envelope): Envelope {
  // pure passthrough — output is a sink; the engine treats it as the final node
  return { text: input.text, ...(input.data !== undefined ? { data: input.data } : {}) };
}
