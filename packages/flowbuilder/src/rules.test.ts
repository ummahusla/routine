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

describe("rules.ts new sections", () => {
  it("documents llm node type + {{input}} template", () => {
    const rules = renderFlowbuilderRules();
    expect(rules).toContain('"type": "llm"');
    expect(rules).toContain("{{input}}");
    expect(rules).toContain("{{input.data");
  });

  it("documents the execute → get_run_result pattern", () => {
    const rules = renderFlowbuilderRules();
    expect(rules).toContain("flowbuilder_execute_flow");
    expect(rules).toContain("flowbuilder_get_run_result");
    expect(rules).toContain("waitMs");
  });
});
