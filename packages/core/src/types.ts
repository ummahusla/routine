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
  plugins?: Plugin[];
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

export type RuntimeContext = {
  cwd: string;
  model: string;
  runId: string;
  signal: AbortSignal;
  logger: Logger;
  state: Map<string, unknown>;
};

export type PreRunOutput = {
  facts?: Record<string, unknown>;
};

export type SystemPromptContribution = {
  rulesFile: {
    relativePath: string;
    contents: string;
  };
};

export type ToolCallSnapshot = {
  callId: string;
  name: string;
  status: "running" | "completed" | "error";
  args?: unknown;
  result?: unknown;
};

export type Plugin = {
  name: string;
  preRun?: (ctx: RuntimeContext) => Promise<PreRunOutput | void>;
  systemPrompt?: (ctx: RuntimeContext) => Promise<SystemPromptContribution | void>;
  promptPrefix?: (ctx: RuntimeContext) => Promise<string | void>;
  interceptEvent?: (e: HarnessEvent, ctx: RuntimeContext) => HarnessEvent[] | void;
  onToolCall?: (call: ToolCallSnapshot, ctx: RuntimeContext) => Promise<void>;
  cleanup?: (ctx: RuntimeContext) => Promise<void>;
};
