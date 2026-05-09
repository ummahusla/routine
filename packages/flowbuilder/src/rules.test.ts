import { describe, it, expect } from "vitest";
import { FLOWBUILDER_RULES_PATH, renderFlowbuilderRules } from "./rules.js";

describe("rules", () => {
  it("rules path lives under .cursor/rules/", () => {
    expect(FLOWBUILDER_RULES_PATH).toBe(".cursor/rules/.flow-build-flowbuilder.mdc");
  });

  it("rules body documents the two MCP tools and the full-state contract", () => {
    const body = renderFlowbuilderRules();
    expect(body).toContain("flowbuilder_get_state");
    expect(body).toContain("flowbuilder_set_state");
    expect(body).toContain("FULL state");
    expect(body).toContain("schemaVersion");
    expect(body).toContain("rote flow");
  });

  it("rules body has alwaysApply frontmatter for cursor", () => {
    const body = renderFlowbuilderRules();
    expect(body.startsWith("---")).toBe(true);
    expect(body).toMatch(/alwaysApply:\s*true/);
  });
});
