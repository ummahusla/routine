import type { PersistedTurn } from "./types.js";

const HEADER =
  "[Conversation so far — replayed because the local Cursor agent does not\n" +
  "retain context across send() calls. Verbatim transcript including all\n" +
  "tool args and results.]\n";

export function buildReplay(turns: PersistedTurn[]): string {
  const completed = turns.filter(
    (t) => t.status === "completed" || t.status === "cancelled" || t.status === "failed",
  );
  if (completed.length === 0) return "";

  const blocks: string[] = [HEADER];
  for (const t of completed) {
    blocks.push(`User: ${t.user.text}`);
    blocks.push(renderAssistant(t));
    if (t.status !== "completed") {
      blocks.push(`[turn ended: ${t.status}]`);
    }
  }
  return blocks.join("\n\n");
}

function renderAssistant(t: PersistedTurn): string {
  const parts: string[] = ["Assistant:"];
  // Interleave text blocks with tool calls in the order seen during streaming.
  // Reducer separates them; here we render text first, then tool block list.
  // This is acceptable because Cursor itself emits assistant text and tool_use
  // blocks with no strict interleave guarantee for reconstruction.
  for (const tc of t.assistant.toolCalls) {
    parts.push(renderToolCall(tc));
  }
  if (t.assistant.textBlocks.length > 0) {
    parts.push(t.assistant.textBlocks.join(""));
  }
  return parts.join("\n");
}

function renderToolCall(tc: PersistedTurn["assistant"]["toolCalls"][number]): string {
  const argsLine = tc.args !== undefined ? `  args: ${JSON.stringify(tc.args)}` : "  args: <none>";
  const okLine = tc.ok === undefined ? "  status: <pending>" : tc.ok ? "  status: ok" : "  status: error";
  const resultLine =
    tc.result !== undefined ? `  result: ${JSON.stringify(tc.result)}` : "  result: <none>";
  return `[tool_call: ${tc.name}\n${argsLine}\n${okLine}\n${resultLine}\n]`;
}
