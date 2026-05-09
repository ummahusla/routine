import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "./session.js";
import {
  FlowbuilderSessionMissingError,
  FlowbuilderSchemaError,
  FlowbuilderUnsupportedVersion,
  FlowbuilderRefIntegrityError,
} from "./errors.js";
import type { Manifest, State } from "./schema.js";

let baseDir: string;
const sessionId = "s_abc123def456";

const validManifest: Manifest = {
  schemaVersion: 1,
  id: sessionId,
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const emptyState: State = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
};

function setup(): SessionManager {
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
  writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
  return new SessionManager({ baseDir, sessionId, runId: "run-1" });
}

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "flowbuilder-session-"));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("SessionManager.load", () => {
  it("loads valid manifest + state", () => {
    const mgr = setup();
    const out = mgr.load();
    expect(out.manifest.id).toBe(sessionId);
    expect(out.state.nodes).toEqual([]);
  });

  it("throws FlowbuilderSessionMissingError when dir is absent", () => {
    const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
    expect(() => mgr.load()).toThrow(FlowbuilderSessionMissingError);
  });

  it("throws FlowbuilderSchemaError on malformed manifest json", () => {
    const sdir = join(baseDir, "sessions", sessionId);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "manifest.json"), "{not json");
    writeFileSync(join(sdir, "state.json"), JSON.stringify(emptyState));
    const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
    expect(() => mgr.load()).toThrow(FlowbuilderSchemaError);
  });

  it("throws FlowbuilderUnsupportedVersion on schemaVersion mismatch", () => {
    const sdir = join(baseDir, "sessions", sessionId);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "manifest.json"), JSON.stringify(validManifest));
    writeFileSync(
      join(sdir, "state.json"),
      JSON.stringify({ ...emptyState, schemaVersion: 99 }),
    );
    const mgr = new SessionManager({ baseDir, sessionId, runId: "run-1" });
    expect(() => mgr.load()).toThrow(FlowbuilderUnsupportedVersion);
  });
});

describe("SessionManager.saveState", () => {
  it("writes state atomically and bumps manifest.updatedAt", async () => {
    const mgr = setup();
    mgr.load();
    const before = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "manifest.json"), "utf8"),
    ).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const next: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [],
    };
    const result = mgr.saveState(next);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.updatedAt).not.toBe(before);
    const written = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "state.json"), "utf8"),
    );
    expect(written.nodes).toEqual([{ id: "n1", type: "merge" }]);
    const newManifest = JSON.parse(
      readFileSync(join(baseDir, "sessions", sessionId, "manifest.json"), "utf8"),
    );
    expect(newManifest.updatedAt).toBe(result.updatedAt);
    expect(existsSync(join(baseDir, "sessions", sessionId, "state.json.tmp.run-1"))).toBe(false);
  });

  it("rejects state with bad ref integrity", () => {
    const mgr = setup();
    mgr.load();
    const bad: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [{ from: "n1", to: "ghost" }],
    };
    expect(() => mgr.saveState(bad)).toThrow(FlowbuilderRefIntegrityError);
  });

  it("rejects state failing zod schema", () => {
    const mgr = setup();
    mgr.load();
    const bad = { schemaVersion: 1, nodes: [{ id: "n1", type: "alien" }], edges: [] };
    expect(() => mgr.saveState(bad as unknown as State)).toThrow(FlowbuilderSchemaError);
  });
});
