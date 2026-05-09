import type { NodeType, TypeColor } from "../types";

export const TYPE_COLORS: Record<NodeType, TypeColor> = {
  trigger: { bg: "rgba(227, 168, 87, 0.12)", border: "rgba(227, 168, 87, 0.35)", icon: "#f0b46a" },
  llm: { bg: "rgba(125, 145, 255, 0.12)", border: "rgba(125, 145, 255, 0.38)", icon: "#9aa9ff" },
  transform: { bg: "rgba(180, 180, 200, 0.08)", border: "rgba(180, 180, 200, 0.30)", icon: "#c4c4cc" },
  filter: { bg: "rgba(180, 180, 200, 0.08)", border: "rgba(180, 180, 200, 0.30)", icon: "#c4c4cc" },
  http: { bg: "rgba(140, 200, 240, 0.10)", border: "rgba(140, 200, 240, 0.32)", icon: "#9fcde6" },
  storage: { bg: "rgba(120, 200, 160, 0.10)", border: "rgba(120, 200, 160, 0.32)", icon: "#7fc996" },
  output: { bg: "rgba(232, 120, 168, 0.10)", border: "rgba(232, 120, 168, 0.34)", icon: "#e090b8" },
  branch: { bg: "rgba(180, 180, 200, 0.08)", border: "rgba(180, 180, 200, 0.30)", icon: "#c4c4cc" },
  human: { bg: "rgba(195, 162, 247, 0.10)", border: "rgba(195, 162, 247, 0.34)", icon: "#c4a5f0" },
};
