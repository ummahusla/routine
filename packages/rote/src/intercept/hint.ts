import type { HarnessEvent } from "@flow-build/core";
import type { BypassMatch } from "../types.js";

export function buildHintEvent(m: BypassMatch): HarnessEvent {
  const tries = m.suggestions.join(" ; ");
  return {
    type: "text",
    delta: `\n[rote hint] ${m.rationale} — try: ${tries}\n`,
  };
}
