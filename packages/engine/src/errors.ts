export type EngineErrorCode =
  | "UNSUPPORTED_NODE_TYPE"
  | "GRAPH_HAS_CYCLE"
  | "GRAPH_INVALID"
  | "EXEC_FAILED"
  | "CANCELLED"
  | "MISSING_REQUIRED_INPUT";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
