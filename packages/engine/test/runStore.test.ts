import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initRunDir,
  appendEvent,
  writeOutputs,
  writeManifest,
  readRunResult,
  listRuns,
} from "../src/runStore.js";
import type { RunEvent, RunManifest } from "../src/types.js";

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "engine-runstore-"));
});

describe("runStore", () => {
  it("initRunDir creates directory + writes snapshot + initial manifest", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({
      baseDir,
      sessionId: "s1",
      runId: "r1",
      startedAt: "2026-01-01T00:00:00.000Z",
      state,
    });
    const dir = join(baseDir, "sessions", "s1", "runs", "r1");
    expect(existsSync(dir)).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf8"))).toEqual(state);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as RunManifest;
    expect(m.runId).toBe("r1");
    expect(m.status).toBe("running");
  });

  it("appendEvent writes one JSON line per call", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "t", state });
    const ev1: RunEvent = { type: "run_start", runId: "r1", sessionId: "s1", startedAt: "t" };
    const ev2: RunEvent = { type: "run_end", runId: "r1", status: "succeeded", at: "t2" };
    await appendEvent(baseDir, "s1", "r1", ev1);
    await appendEvent(baseDir, "s1", "r1", ev2);
    const path = join(baseDir, "sessions", "s1", "runs", "r1", "events.jsonl");
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(ev1);
    expect(JSON.parse(lines[1])).toEqual(ev2);
  });

  it("writeOutputs / writeManifest persist final state", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "t", state });
    await writeOutputs(baseDir, "s1", "r1", { n1: { text: "hi" } });
    await writeManifest(baseDir, "s1", "r1", {
      runId: "r1", sessionId: "s1", startedAt: "t", endedAt: "t2", status: "succeeded",
    });
    const result = await readRunResult(baseDir, "s1", "r1");
    expect(result.manifest.status).toBe("succeeded");
    expect(result.outputs).toEqual({ n1: { text: "hi" } });
  });

  it("listRuns returns manifests sorted newest-first", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "2026-01-01T00:00:00.000Z", state });
    await initRunDir({ baseDir, sessionId: "s1", runId: "r2", startedAt: "2026-01-02T00:00:00.000Z", state });
    const runs = await listRuns(baseDir, "s1");
    expect(runs.map((r) => r.runId)).toEqual(["r2", "r1"]);
  });

  it("readRunResult returns running status when manifest still in-flight", async () => {
    const state = { schemaVersion: 1 as const, nodes: [], edges: [] };
    await initRunDir({ baseDir, sessionId: "s1", runId: "r1", startedAt: "t", state });
    const r = await readRunResult(baseDir, "s1", "r1");
    expect(r.manifest.status).toBe("running");
  });
});
