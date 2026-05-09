import type { RoteFacts } from "../types.js";

const INSTALL_LINE =
  "rote unavailable; install with: curl -fsSL https://raw.githubusercontent.com/modiqo/rote-releases/main/install.sh | bash";

export function renderPrefix(f: RoteFacts): string {
  const allNull =
    f.version === null &&
    f.adapters === null &&
    f.pendingStubs === null &&
    f.flowCount === null &&
    f.activeWorkspace === null;
  if (allNull) return INSTALL_LINE;

  const lines: string[] = ["[rote runtime — flow-build]"];
  if (f.version) lines.push(`version: ${f.version}`);
  if (f.adapters && f.adapters.length > 0) {
    const sample = f.adapters.slice(0, 5).map((a) => a.id).join(", ");
    lines.push(`adapters: ${f.adapters.length} (${sample})`);
  }
  if (typeof f.flowCount === "number") {
    const stubs = f.pendingStubs ?? [];
    if (stubs.length > 0) {
      const wsList = Array.from(new Set(stubs.map((s) => s.workspace))).join(", ");
      lines.push(
        `flows: ${f.flowCount} indexed; ${stubs.length} pending stubs in workspaces: ${wsList}`,
      );
    } else {
      lines.push(`flows: ${f.flowCount} indexed`);
    }
  } else if (f.pendingStubs && f.pendingStubs.length > 0) {
    const wsList = Array.from(new Set(f.pendingStubs.map((s) => s.workspace))).join(", ");
    lines.push(`pending stubs in workspaces: ${wsList}`);
  }
  if (f.activeWorkspace) {
    lines.push(`active workspace: ${f.activeWorkspace.name}`);
  }
  lines.push('remember: rote flow search "<intent>" before building anything new.');
  return lines.join("\n");
}
