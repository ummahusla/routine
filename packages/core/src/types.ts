export type Logger = {
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  debug?: (msg: string, ctx?: Record<string, unknown>) => void;
};

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
};

export type RunOptions = {
  prompt: string;
  cwd: string;
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
  onEvent: (e: HarnessEvent) => void;
  logger?: Logger;
  retry?: RetryOptions;
};

export type HarnessEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; name: string; callId: string }
  | { type: "tool_end"; name: string; callId: string; ok: boolean }
  | { type: "status"; phase: "starting" | "running" | "done"; message?: string };

export type RunStatus = "completed" | "cancelled" | "failed";

export type RunResult = {
  status: RunStatus;
  finalText: string;
  usage?: { inputTokens: number; outputTokens: number };
};
