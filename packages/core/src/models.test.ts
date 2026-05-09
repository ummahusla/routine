import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MODULE = "./models.js";

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.doUnmock("@cursor/sdk");
});

describe("FALLBACK_MODELS", () => {
  it("contains composer-2 with full pricing fields", async () => {
    const { FALLBACK_MODELS } = await import(MODULE);
    const composer = FALLBACK_MODELS.find((m: { id: string }) => m.id === "composer-2");
    expect(composer).toBeDefined();
    expect(composer.displayName).toBe("Composer 2");
    expect(composer.provider).toBe("Cursor");
    expect(composer.pricing).toEqual({ inputPerM: 0.5, outputPerM: 2.5 });
  });

  it("includes the seven curated models", async () => {
    const { FALLBACK_MODELS } = await import(MODULE);
    const ids = FALLBACK_MODELS.map((m: { id: string }) => m.id).sort();
    expect(ids).toEqual([
      "claude-4.6-sonnet",
      "claude-4.7-opus",
      "composer-2",
      "composer-2-fast",
      "gemini-3.1-pro",
      "gpt-5.4",
      "gpt-5.5",
    ]);
  });
});
