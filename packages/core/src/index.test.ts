import { describe, it, expect } from "vitest";
import * as core from "./index.js";

describe("core public surface", () => {
  it("exports runPrompt", () => {
    expect(typeof core.runPrompt).toBe("function");
  });

  it("exports error classes", () => {
    expect(typeof core.HarnessError).toBe("function");
    expect(typeof core.AuthError).toBe("function");
    expect(typeof core.ConfigError).toBe("function");
    expect(typeof core.NetworkError).toBe("function");
  });
});
