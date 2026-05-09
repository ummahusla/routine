import { describe, it, expect } from "vitest";
import { renderFlowbuilderPrefix } from "./prompt.js";
import type { Manifest, State } from "./schema.js";

const manifest: Manifest = {
  schemaVersion: 1,
  id: "s_abc123def456",
  name: "GitHub digest pipeline",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T11:42:13.421Z",
};

const state: State = {
  schemaVersion: 1,
  nodes: [
    { id: "n1", type: "input", value: null },
    { id: "n2", type: "flow", flow: "github/fetch-issues", params: {} },
    { id: "n3", type: "merge" },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
  ],
};

describe("renderFlowbuilderPrefix", () => {
  it("includes session id, name, updatedAt, node and edge counts", () => {
    const out = renderFlowbuilderPrefix({ manifest, state });
    expect(out).toContain("active session: s_abc123def456");
    expect(out).toContain('name="GitHub digest pipeline"');
    expect(out).toContain("2026-05-09T11:42");
    expect(out).toContain("3 nodes, 2 edges");
    expect(out).toContain("flowbuilder_get_state");
  });
});
