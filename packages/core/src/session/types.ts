import type { HarnessError } from "../errors.js";
import type { HarnessEvent, Logger, Plugin, RetryOptions } from "../types.js";

export type Usage = { inputTokens: number; outputTokens: number };

export type TurnStatus =
  | "completed"
  | "cancelled"
  | "failed"
  | "failed_to_start"
  | "interrupted";

export type SessionEvent =
  | (HarnessEvent & { turnId: string })
  | { type: "user"; turnId: string; text: string }
  | { type: "turn_open"; turnId: string }
  | { type: "turn_start"; turnId: string; model: string; agentId: string }
  | { type: "turn_end"; turnId: string; status: TurnStatus; usage?: Usage; durationMs: number }
  | { type: "error"; turnId: string; message: string; code?: string };

export type TurnResult = {
  turnId: string;
  status: TurnStatus;
  finalText: string;
  usage?: Usage;
  error?: HarnessError;
};

export type SessionMetadata = {
  v: 1;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  turnCount: number;
  lastStatus: TurnStatus | "running";
  totalUsage: Usage;
};

export type PersistedTurn = {
  turnId: string;
  user: { text: string; ts: string };
  assistant: {
    textBlocks: string[];
    toolCalls: Array<{
      callId: string;
      name: string;
      args?: unknown;
      ok?: boolean;
      result?: unknown;
    }>;
    thinking?: string[];
  };
  status: TurnStatus | "running";
  usage?: Usage;
  error?: { message: string; code?: string };
};

export type SendTurnOptions = {
  signal?: AbortSignal;
  onEvent?: (e: SessionEvent) => void;
};

export type CreateSessionOptions = {
  baseDir: string;
  title?: string;
  /**
   * Optional override for the per-turn working directory. When unset,
   * the workspace lives at `baseDir/sessions/<id>/workspace`. The legacy
   * `runPrompt` wrapper sets this to honor a caller-supplied `cwd`.
   */
  cwd?: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};

export type LoadSessionOptions = {
  baseDir: string;
  sessionId: string;
  /** See {@link CreateSessionOptions.cwd}. */
  cwd?: string;
  model?: string;
  apiKey?: string;
  logger?: Logger;
  retry?: RetryOptions;
  plugins?: Plugin[];
};

export type LineEnvelope =
  | { kind: "user"; v: 1; ts: string; turnId: string; text: string }
  | { kind: "turn_open"; v: 1; ts: string; turnId: string }
  | { kind: "turn_start"; v: 1; ts: string; turnId: string; model: string; runId: string; agentId: string }
  | { kind: "text"; v: 1; ts: string; turnId: string; delta: string }
  | { kind: "thinking"; v: 1; ts: string; turnId: string; delta: string }
  | { kind: "tool_start"; v: 1; ts: string; turnId: string; callId: string; name: string; args?: unknown }
  | { kind: "tool_end"; v: 1; ts: string; turnId: string; callId: string; name: string; ok: boolean; args?: unknown; result?: unknown }
  | { kind: "status"; v: 1; ts: string; turnId: string; phase: "starting" | "running" | "done" }
  | { kind: "turn_end"; v: 1; ts: string; turnId: string; status: TurnStatus; usage?: Usage; durationMs: number }
  | { kind: "error"; v: 1; ts: string; turnId: string; message: string; code?: string };
