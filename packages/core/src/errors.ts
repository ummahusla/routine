type ErrorOpts = { retryable?: boolean; cause?: unknown };

export class HarnessError extends Error {
  readonly retryable: boolean;
  override readonly cause?: unknown;
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message);
    this.name = "HarnessError";
    this.retryable = opts.retryable ?? false;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export class AuthError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: false, ...opts });
    this.name = "AuthError";
  }
}

export class ConfigError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: false, ...opts });
    this.name = "ConfigError";
  }
}

export class NetworkError extends HarnessError {
  constructor(message: string, opts: ErrorOpts = {}) {
    super(message, { retryable: true, ...opts });
    this.name = "NetworkError";
  }
}

export function mapToHarnessError(e: unknown): HarnessError {
  if (e instanceof HarnessError) return e;
  const name = (e as { name?: string } | null | undefined)?.name ?? "";
  const message = (e as { message?: string } | null | undefined)?.message ?? String(e);
  const isRetryable = (e as { isRetryable?: boolean } | null | undefined)?.isRetryable;

  switch (name) {
    case "AuthenticationError":
      return new AuthError(message, { cause: e });
    case "ConfigurationError":
    case "IntegrationNotConnectedError":
      return new ConfigError(message, { cause: e });
    case "RateLimitError":
      return new NetworkError(message, { retryable: true, cause: e });
    case "NetworkError":
      return new NetworkError(message, { retryable: isRetryable ?? true, cause: e });
    case "UnknownAgentError":
    case "UnsupportedRunOperationError":
      return new HarnessError(message, { retryable: false, cause: e });
    default:
      return new HarnessError(message, { retryable: false, cause: e });
  }
}
