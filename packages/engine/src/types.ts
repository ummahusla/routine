import type { State } from "@flow-build/flowbuilder";

export type Envelope = {
  text: string;
  data?: unknown;
};

export type RunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type NodeRunStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped";

export type RunEvent =
  | { type: "run_start"; runId: string; sessionId: string; startedAt: string }
  | { type: "node_start"; runId: string; nodeId: string; nodeType: string; at: string }
  | { type: "node_text"; runId: string; nodeId: string; chunk: string }
  | {
      type: "node_end";
      runId: string;
      nodeId: string;
      status: NodeRunStatus;
      output?: Envelope;
      error?: string;
      at: string;
    }
  | {
      type: "run_end";
      runId: string;
      status: RunStatus;
      finalOutput?: Envelope;
      error?: string;
      at: string;
    };

export type RunManifest = {
  runId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  status: RunStatus;
  error?: string;
};

export type Run = {
  runId: string;
  sessionId: string;
  status: RunStatus;
  events: AsyncIterable<RunEvent>;
  cancel(): Promise<void>;
  done: Promise<{ status: RunStatus; finalOutput?: Envelope; error?: string }>;
};

export type CursorClient = {
  singleShot(opts: {
    prompt: string;
    system?: string;
    model: string;
    maxTokens: number;
    temperature: number;
    signal?: AbortSignal;
    cwd?: string;
  }): {
    chunks: AsyncIterable<string>;
    done: Promise<{ text: string }>;
  };
};

export type CreateRunOptions = {
  sessionId: string;
  baseDir: string;
  state: State;
  cursorClient: CursorClient;
  roteCmd?: string;
  signal?: AbortSignal;
  inputs?: Record<string, unknown>;
  cwd?: string;
};
