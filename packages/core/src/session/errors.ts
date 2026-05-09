import { HarnessError } from "../errors.js";

export class SessionBusyError extends HarnessError {
  readonly code = "BUSY" as const;
  constructor(sessionId: string) {
    super(`session ${sessionId} already has an in-flight turn`);
    this.name = "SessionBusyError";
  }
}

export class SessionMissingError extends HarnessError {
  readonly code = "MISSING" as const;
  constructor(sessionId: string) {
    super(`session ${sessionId} not found`);
    this.name = "SessionMissingError";
  }
}

export class SessionCorruptError extends HarnessError {
  readonly code = "CORRUPT" as const;
  constructor(sessionId: string, detail: string) {
    super(`session ${sessionId} corrupt: ${detail}`);
    this.name = "SessionCorruptError";
  }
}

export class SessionLockedError extends HarnessError {
  readonly code = "LOCKED" as const;
  constructor(sessionId: string, holderPid: number) {
    super(`session ${sessionId} is locked by pid ${holderPid}`);
    this.name = "SessionLockedError";
  }
}
