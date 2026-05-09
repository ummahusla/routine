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

describe("listModels", () => {
  it("returns FALLBACK_MODELS when apiKey is missing", async () => {
    const { listModels, FALLBACK_MODELS } = await import(MODULE);
    const result = await listModels({});
    expect(result).toEqual(FALLBACK_MODELS);
  });

  it("returns FALLBACK_MODELS when SDK throws", async () => {
    vi.doMock("@cursor/sdk", () => ({
      Cursor: {
        models: { list: vi.fn(async () => { throw new Error("boom"); }) },
      },
      Agent: { create: vi.fn() },
    }));
    const { listModels, FALLBACK_MODELS } = await import(MODULE);
    const result = await listModels({ apiKey: "crsr_test" });
    expect(result).toEqual(FALLBACK_MODELS);
  });

  it("returns mapped SDK result on success", async () => {
    vi.doMock("@cursor/sdk", () => ({
      Cursor: {
        models: {
          list: vi.fn(async () => [
            { id: "composer-2", displayName: "Composer 2" },
            { id: "claude-4.7-opus", displayName: "Claude 4.7 Opus" },
          ]),
        },
      },
      Agent: { create: vi.fn() },
    }));
    const { listModels } = await import(MODULE);
    const result = await listModels({ apiKey: "crsr_test" });
    expect(result[0].id).toBe("composer-2");
    expect(result[0].displayName).toBe("Composer 2");
    expect(result[0].provider).toBe("Cursor");
    expect(result[0].pricing).toEqual({ inputPerM: 0.5, outputPerM: 2.5 });
    expect(result[1].id).toBe("claude-4.7-opus");
    expect(result[1].provider).toBe("Anthropic");
  });

  it("preserves curated pricing AND provider when SDK item lacks them", async () => {
    vi.doMock("@cursor/sdk", () => ({
      Cursor: {
        models: {
          list: vi.fn(async () => [
            { id: "composer-2", displayName: "Composer 2" },
          ]),
        },
      },
      Agent: { create: vi.fn() },
    }));
    const { listModels } = await import(MODULE);
    const result = await listModels({ apiKey: "crsr_test" });
    expect(result[0].pricing).toEqual({ inputPerM: 0.5, outputPerM: 2.5 });
    expect(result[0].provider).toBe("Cursor");
  });
});
