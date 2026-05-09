import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FlowbuilderFixture = {
  baseDir: string;
  sessionId: string;
  cleanup: () => void;
};

export function setupFlowbuilderFixture(prefix = "flow-build-cli-fb-"): FlowbuilderFixture {
  const baseDir = mkdtempSync(join(tmpdir(), prefix));
  const sessionId = "s_test_session1";
  const sdir = join(baseDir, "sessions", sessionId);
  mkdirSync(sdir, { recursive: true });
  const now = "2026-05-09T10:00:00.000Z";
  writeFileSync(
    join(sdir, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: sessionId,
      name: "Test",
      description: "",
      createdAt: now,
      updatedAt: now,
    }),
  );
  writeFileSync(
    join(sdir, "state.json"),
    JSON.stringify({ schemaVersion: 1, nodes: [], edges: [] }),
  );
  return {
    baseDir,
    sessionId,
    cleanup: () => {
      // caller is expected to rmSync as part of afterEach
    },
  };
}
