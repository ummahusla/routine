import { describe, it, expect } from "vitest";
import { substitute } from "../src/template.js";

describe("substitute", () => {
  it("replaces {{input}} with envelope.text", () => {
    expect(substitute("hello {{input}}!", { text: "world" }))
      .toBe("hello world!");
  });

  it("tolerates whitespace inside braces", () => {
    expect(substitute("{{ input }}", { text: "x" })).toBe("x");
  });

  it("replaces {{input.data}} with JSON-stringified data", () => {
    expect(substitute("data={{input.data}}", { text: "", data: { a: 1 } }))
      .toBe('data={"a":1}');
  });

  it("returns empty string for {{input.data}} when data is undefined", () => {
    expect(substitute("[{{input.data}}]", { text: "" })).toBe("[]");
  });

  it("walks dotted paths into data", () => {
    const env = { text: "", data: { user: { name: "alice" } } };
    expect(substitute("hi {{input.data.user.name}}", env)).toBe("hi alice");
  });

  it("returns empty string for missing path", () => {
    expect(substitute("[{{input.data.missing}}]", { text: "", data: {} }))
      .toBe("[]");
  });

  it("string-coerces non-string values at path", () => {
    expect(substitute("n={{input.data.n}}", { text: "", data: { n: 42 } }))
      .toBe("n=42");
  });

  it("leaves unrelated {{xxx}} alone", () => {
    expect(substitute("{{other}} {{input}}", { text: "X" }))
      .toBe("{{other}} X");
  });

  it("handles multiple substitutions in one string", () => {
    expect(substitute("{{input}} and {{input.data.x}}", { text: "T", data: { x: 1 } }))
      .toBe("T and 1");
  });
});
