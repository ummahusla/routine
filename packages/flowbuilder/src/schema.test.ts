import { describe, it, expect } from "vitest";
import {
  ManifestSchema,
  StateSchema,
  validateRefIntegrity,
  type Manifest,
  type State,
} from "./schema.js";

const validManifest: Manifest = {
  schemaVersion: 1,
  id: "s_8x3k2pq7nw9r",
  name: "Demo",
  description: "",
  createdAt: "2026-05-09T10:00:00.000Z",
  updatedAt: "2026-05-09T10:00:00.000Z",
};

const validState: State = {
  schemaVersion: 1,
  nodes: [
    { id: "n1", type: "input", value: { x: 1 } },
    { id: "n2", type: "flow", flow: "github/fetch-issues", params: { owner: "x" } },
    { id: "n3", type: "branch", cond: "x > 0" },
    { id: "n4", type: "merge" },
    { id: "n5", type: "output", value: null },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n3", to: "n4" },
    { from: "n4", to: "n5" },
  ],
};

describe("ManifestSchema", () => {
  it("accepts a valid manifest", () => {
    expect(ManifestSchema.parse(validManifest)).toEqual(validManifest);
  });

  it("rejects bad id format", () => {
    const bad = { ...validManifest, id: "abc" };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it("rejects schemaVersion != 1", () => {
    const bad = { ...validManifest, schemaVersion: 2 };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });
});

describe("StateSchema", () => {
  it("accepts a valid state", () => {
    expect(StateSchema.parse(validState)).toEqual(validState);
  });

  it("rejects flow node with invalid flow ref (no slash)", () => {
    const bad: unknown = {
      ...validState,
      nodes: [{ id: "n1", type: "flow", flow: "noslash", params: {} }],
      edges: [],
    };
    expect(() => StateSchema.parse(bad)).toThrow();
  });

  it("rejects unknown node type", () => {
    const bad: unknown = {
      ...validState,
      nodes: [{ id: "n1", type: "alien" }],
      edges: [],
    };
    expect(() => StateSchema.parse(bad)).toThrow();
  });
});

describe("validateRefIntegrity", () => {
  it("passes for valid state", () => {
    expect(() => validateRefIntegrity(validState)).not.toThrow();
  });

  it("fails on duplicate node ids", () => {
    const bad: State = {
      schemaVersion: 1,
      nodes: [
        { id: "n1", type: "merge" },
        { id: "n1", type: "merge" },
      ],
      edges: [],
    };
    expect(() => validateRefIntegrity(bad)).toThrow(/duplicate node id: n1/);
  });

  it("fails on edge.from referencing unknown node", () => {
    const bad: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [{ from: "ghost", to: "n1" }],
    };
    expect(() => validateRefIntegrity(bad)).toThrow(/edge.from references unknown node: ghost/);
  });

  it("fails on edge.to referencing unknown node", () => {
    const bad: State = {
      schemaVersion: 1,
      nodes: [{ id: "n1", type: "merge" }],
      edges: [{ from: "n1", to: "ghost" }],
    };
    expect(() => validateRefIntegrity(bad)).toThrow(/edge.to references unknown node: ghost/);
  });
});
