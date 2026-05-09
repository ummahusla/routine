type ErrorContext = {
  sessionId: string;
  path: string;
  cause?: unknown;
};

export class FlowbuilderError extends Error {
  readonly sessionId: string;
  readonly path: string;
  override readonly cause?: unknown;

  constructor(message: string, ctx: ErrorContext) {
    super(message);
    this.name = "FlowbuilderError";
    this.sessionId = ctx.sessionId;
    this.path = ctx.path;
    if (ctx.cause !== undefined) this.cause = ctx.cause;
  }
}

export class FlowbuilderSessionMissingError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderSessionMissingError";
  }
}

export class FlowbuilderSchemaError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderSchemaError";
  }
}

export class FlowbuilderRefIntegrityError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderRefIntegrityError";
  }
}

export class FlowbuilderIOError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderIOError";
  }
}

export class FlowbuilderUnsupportedVersion extends FlowbuilderError {
  readonly version: number;
  constructor(message: string, ctx: ErrorContext & { version: number }) {
    super(message, ctx);
    this.name = "FlowbuilderUnsupportedVersion";
    this.version = ctx.version;
  }
}

export class FlowbuilderMcpStartError extends FlowbuilderError {
  constructor(message: string, ctx: ErrorContext) {
    super(message, ctx);
    this.name = "FlowbuilderMcpStartError";
  }
}
