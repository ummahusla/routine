import { describe, it, expect } from "vitest";
import type { State } from "@flow-build/flowbuilder";
import { topoOrder } from "../src/topo.js";
import { EngineError } from "../src/errors.js";

function st(nodes: State["nodes"], edges: State["edges"]): State {
  return { schemaVersion: 1, nodes, edges };
}

describe("topoOrder", () => {
  it("orders linear input → flow → output", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "flow", flow: "x/y", params: {} },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    );
    expect(topoOrder(s)).toEqual(["a", "b", "c"]);
  });

  it("orders fan-in correctly (both upstreams precede downstream)", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "input", value: "y" },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "c" },
        { from: "b", to: "c" },
      ],
    );
    const order = topoOrder(s);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  it("throws UNSUPPORTED_NODE_TYPE on branch", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "branch", cond: "true" },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    );
    let caught: unknown;
    try { topoOrder(s); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(EngineError);
    expect((caught as EngineError).code).toBe("UNSUPPORTED_NODE_TYPE");
  });

  it("throws UNSUPPORTED_NODE_TYPE on merge", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "merge" },
        { id: "c", type: "output", value: null },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    );
    expect(() => topoOrder(s)).toThrowError(EngineError);
  });

  it("throws GRAPH_HAS_CYCLE on cycle", () => {
    const s = st(
      [
        { id: "a", type: "input", value: "x" },
        { id: "b", type: "flow", flow: "x/y", params: {} },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    );
    let caught: unknown;
    try { topoOrder(s); } catch (e) { caught = e; }
    expect((caught as EngineError).code).toBe("GRAPH_HAS_CYCLE");
  });
});
