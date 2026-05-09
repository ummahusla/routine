import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  ManifestSchema,
  StateSchema,
  validateRefIntegrity,
  type Manifest,
  type State,
} from "./schema.js";
import {
  FlowbuilderIOError,
  FlowbuilderRefIntegrityError,
  FlowbuilderSchemaError,
  FlowbuilderSessionMissingError,
  FlowbuilderUnsupportedVersion,
} from "./errors.js";

export type SessionManagerOptions = {
  baseDir: string;
  sessionId: string;
  runId: string;
};

export type LoadedSession = {
  manifest: Manifest;
  state: State;
  sessionDir: string;
  manifestPath: string;
  statePath: string;
};

export type SaveResult = {
  bytes: number;
  updatedAt: string;
};

export class SessionManager {
  private readonly baseDir: string;
  readonly sessionId: string;
  private readonly runId: string;
  readonly sessionDir: string;
  readonly manifestPath: string;
  readonly statePath: string;
  private cachedManifest?: Manifest;

  constructor(opts: SessionManagerOptions) {
    this.baseDir = opts.baseDir;
    this.sessionId = opts.sessionId;
    this.runId = opts.runId;
    this.sessionDir = join(opts.baseDir, "sessions", opts.sessionId);
    this.manifestPath = join(this.sessionDir, "manifest.json");
    this.statePath = join(this.sessionDir, "state.json");
  }

  load(): LoadedSession {
    if (!existsSync(this.sessionDir) || !statSync(this.sessionDir).isDirectory()) {
      throw new FlowbuilderSessionMissingError(
        `session directory missing: ${this.sessionDir}`,
        { sessionId: this.sessionId, path: this.sessionDir },
      );
    }
    if (!existsSync(this.manifestPath)) {
      throw new FlowbuilderSessionMissingError(
        `manifest.json missing: ${this.manifestPath}`,
        { sessionId: this.sessionId, path: this.manifestPath },
      );
    }
    if (!existsSync(this.statePath)) {
      throw new FlowbuilderSessionMissingError(
        `state.json missing: ${this.statePath}`,
        { sessionId: this.sessionId, path: this.statePath },
      );
    }

    const manifestRaw = this.readJson(this.manifestPath);
    const manifestParse = ManifestSchema.safeParse(manifestRaw);
    if (!manifestParse.success) {
      throw new FlowbuilderSchemaError(
        `invalid manifest.json: ${manifestParse.error.message}`,
        { sessionId: this.sessionId, path: this.manifestPath, cause: manifestParse.error },
      );
    }
    const manifest = manifestParse.data;

    const stateRawUnknown: unknown = this.readJson(this.statePath);
    const stateRaw = stateRawUnknown as { schemaVersion?: unknown };
    if (
      typeof stateRaw === "object" &&
      stateRaw !== null &&
      typeof stateRaw.schemaVersion === "number" &&
      stateRaw.schemaVersion !== 1
    ) {
      throw new FlowbuilderUnsupportedVersion(
        `unsupported_schema_version: ${stateRaw.schemaVersion}`,
        {
          sessionId: this.sessionId,
          path: this.statePath,
          version: stateRaw.schemaVersion,
        },
      );
    }
    const stateParse = StateSchema.safeParse(stateRawUnknown);
    if (!stateParse.success) {
      throw new FlowbuilderSchemaError(
        `invalid state.json: ${stateParse.error.message}`,
        { sessionId: this.sessionId, path: this.statePath, cause: stateParse.error },
      );
    }

    this.cachedManifest = manifest;
    return {
      manifest,
      state: stateParse.data,
      sessionDir: this.sessionDir,
      manifestPath: this.manifestPath,
      statePath: this.statePath,
    };
  }

  saveState(next: State): SaveResult {
    const stateParse = StateSchema.safeParse(next);
    if (!stateParse.success) {
      throw new FlowbuilderSchemaError(
        `invalid state: ${stateParse.error.message}`,
        { sessionId: this.sessionId, path: this.statePath, cause: stateParse.error },
      );
    }
    try {
      validateRefIntegrity(stateParse.data);
    } catch (cause) {
      throw new FlowbuilderRefIntegrityError(
        cause instanceof Error ? cause.message : String(cause),
        { sessionId: this.sessionId, path: this.statePath, cause },
      );
    }

    const body = `${JSON.stringify(stateParse.data, null, 2)}\n`;
    this.atomicWrite(this.statePath, body);

    const now = new Date().toISOString();
    const baseManifest =
      this.cachedManifest ??
      (() => {
        const m = ManifestSchema.parse(this.readJson(this.manifestPath));
        this.cachedManifest = m;
        return m;
      })();
    const nextManifest: Manifest = { ...baseManifest, updatedAt: now };
    this.atomicWrite(this.manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
    this.cachedManifest = nextManifest;

    return { bytes: Buffer.byteLength(body, "utf8"), updatedAt: now };
  }

  private readJson(path: string): unknown {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (cause) {
      throw new FlowbuilderIOError(`failed to read ${path}`, {
        sessionId: this.sessionId,
        path,
        cause,
      });
    }
    try {
      return JSON.parse(raw);
    } catch (cause) {
      throw new FlowbuilderSchemaError(`malformed JSON in ${path}`, {
        sessionId: this.sessionId,
        path,
        cause,
      });
    }
  }

  private atomicWrite(target: string, body: string): void {
    const tmp = `${target}.tmp.${this.runId}`;
    try {
      writeFileSync(tmp, body);
      renameSync(tmp, target);
    } catch (cause) {
      throw new FlowbuilderIOError(`atomic write failed for ${target}`, {
        sessionId: this.sessionId,
        path: target,
        cause,
      });
    }
  }
}
