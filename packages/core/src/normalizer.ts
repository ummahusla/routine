import type { HarnessEvent, Logger } from "./types.js";

type Unknown = Record<string, unknown>;

function get<T = unknown>(obj: unknown, key: string): T | undefined {
  if (obj && typeof obj === "object") return (obj as Unknown)[key] as T | undefined;
  return undefined;
}

function mapPhase(status: unknown): HarnessEvent & { type: "status" } {
  const s = typeof status === "string" ? status.toLowerCase() : status;
  switch (s) {
    case "starting":
    case "queued":
    case "creating":
      return { type: "status", phase: "starting" };
    case "completed":
    case "succeeded":
    case "done":
    case "finished":
    case "expired":
    case "error":
      return { type: "status", phase: "done" };
    default:
      return { type: "status", phase: "running" };
  }
}

export function normalize(msg: unknown, logger?: Logger): HarnessEvent[] {
  const type = get<string>(msg, "type");
  switch (type) {
    case "assistant":
      return normalizeAssistant(msg, logger);
    case "thinking":
      return normalizeThinking(msg, logger);
    case "tool_call":
      return normalizeToolCall(msg, logger);
    case "status":
      return [mapPhase(get(msg, "status"))];
    case "system":
    case "task":
    case "request":
    case "user":
      return [];
    default:
      logger?.warn("unknown SDKMessage type", { type });
      return [];
  }
}

function normalizeAssistant(msg: unknown, logger?: Logger): HarnessEvent[] {
  const content = get<unknown[]>(get(msg, "message"), "content");
  if (!Array.isArray(content)) {
    logger?.warn("schema drift", { type: "assistant", field: "message.content" });
    return [];
  }
  const out: HarnessEvent[] = [];
  for (const block of content) {
    if (get<string>(block, "type") === "text") {
      const text = get<string>(block, "text");
      if (typeof text === "string") out.push({ type: "text", delta: text });
      else logger?.warn("schema drift", { type: "assistant", field: "block.text" });
    }
    // non-text blocks (tool_use, etc.) are silently skipped — surfaced via tool_call events instead.
  }
  return out;
}

function normalizeThinking(msg: unknown, logger?: Logger): HarnessEvent[] {
  const text = get<string>(msg, "text");
  if (typeof text !== "string") {
    logger?.warn("schema drift", { type: "thinking", field: "text" });
    return [];
  }
  return [{ type: "thinking", delta: text }];
}

function normalizeToolCall(msg: unknown, logger?: Logger): HarnessEvent[] {
  const name = get<string>(msg, "name");
  const callId = get<string>(msg, "call_id");
  const status = get<string>(msg, "status");
  const args = get<unknown>(msg, "args");
  const result = get<unknown>(msg, "result");
  if (typeof name !== "string" || typeof callId !== "string") {
    logger?.warn("schema drift", { type: "tool_call", field: "name|call_id" });
    return [];
  }
  const argsField = args !== undefined ? { args } : {};
  const resultField = result !== undefined ? { result } : {};
  if (status === "running") return [{ type: "tool_start", name, callId, ...argsField }];
  if (status === "completed") return [{ type: "tool_end", name, callId, ok: true, ...argsField, ...resultField }];
  if (status === "error") return [{ type: "tool_end", name, callId, ok: false, ...argsField, ...resultField }];
  logger?.warn("unknown tool_call status", { status });
  return [];
}
