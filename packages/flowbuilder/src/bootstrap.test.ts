import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapFlowbuilderSession } from "./bootstrap.js";

let baseDir: string;
beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "fb-bootstrap-"));
});
afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("bootstrapFlowbuilderSession", () => {
  it("creates manifest.json + state.json under sessions/<id>/", () => {
    bootstrapFlowbuilderSession({ baseDir, sessionId: "S1", name: "demo", description: "" });
    const dir = join(baseDir, "sessions", "S1");
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    expect(existsSync(join(dir, "state.json"))).toBe(true);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    expect(m.schemaVersion).toBe(1);
    expect(m.name).toBe("demo");
    const s = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    expect(s).toEqual({ schemaVersion: 1, nodes: [], edges: [] });
  });

  it("is idempotent — does not overwrite existing files", () => {
    bootstrapFlowbuilderSession({ baseDir, sessionId: "S1", name: "first" });
    bootstrapFlowbuilderSession({ baseDir, sessionId: "S1", name: "second" });
    const m = JSON.parse(
      readFileSync(join(baseDir, "sessions", "S1", "manifest.json"), "utf8"),
    );
    expect(m.name).toBe("first");
  });
});
