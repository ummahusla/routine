import type { LineEnvelope, PersistedTurn } from "./types.js";

export function reduce(events: LineEnvelope[]): PersistedTurn[] {
  const byId = new Map<string, PersistedTurn>();
  const order: string[] = [];

  function ensure(turnId: string, ts: string): PersistedTurn {
    let t = byId.get(turnId);
    if (!t) {
      t = {
        turnId,
        user: { text: "", ts },
        assistant: { textBlocks: [], toolCalls: [] },
        status: "interrupted",
      };
      byId.set(turnId, t);
      order.push(turnId);
    }
    return t;
  }

  for (const e of events) {
    const t = ensure(e.turnId, e.ts);
    switch (e.kind) {
      case "user":
        t.user = { text: e.text, ts: e.ts };
        break;
      case "turn_open":
        // status stays interrupted until turn_end overwrites
        break;
      case "turn_start":
        // no-op for reduced view
        break;
      case "text":
        t.assistant.textBlocks.push(e.delta);
        break;
      case "thinking":
        (t.assistant.thinking ??= []).push(e.delta);
        break;
      case "tool_start": {
        t.assistant.toolCalls.push({
          callId: e.callId,
          name: e.name,
          ...(e.args !== undefined ? { args: e.args } : {}),
        });
        break;
      }
      case "tool_end": {
        // find matching by callId; if missing, push standalone
        const existing = t.assistant.toolCalls.find((c) => c.callId === e.callId);
        if (existing) {
          existing.ok = e.ok;
          if (e.args !== undefined) existing.args = e.args;
          if (e.result !== undefined) existing.result = e.result;
        } else {
          t.assistant.toolCalls.push({
            callId: e.callId,
            name: e.name,
            ok: e.ok,
            ...(e.args !== undefined ? { args: e.args } : {}),
            ...(e.result !== undefined ? { result: e.result } : {}),
          });
        }
        break;
      }
      case "status":
        // ignore for reducer
        break;
      case "turn_end":
        t.status = e.status;
        if (e.usage) t.usage = e.usage;
        break;
      case "error":
        // status stays — turn_end (failed/failed_to_start) carries the verdict
        t.error = { message: e.message, ...(e.code ? { code: e.code } : {}) };
        break;
    }
  }

  return order.map((id) => byId.get(id)!);
}
