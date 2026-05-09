import { Cursor } from "@cursor/sdk";

export type ModelInfo = {
  id: string;
  displayName: string;
  provider: string;
  pricing?: { inputPerM: number; outputPerM: number };
};

export type ListModelsOptions = { apiKey?: string };

export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "composer-2",        displayName: "Composer 2",        provider: "Cursor",    pricing: { inputPerM: 0.5,  outputPerM: 2.5  } },
  { id: "composer-2-fast",   displayName: "Composer 2 (Fast)", provider: "Cursor",    pricing: { inputPerM: 1.5,  outputPerM: 7.5  } },
  { id: "claude-4.7-opus",   displayName: "Claude 4.7 Opus",   provider: "Anthropic", pricing: { inputPerM: 5.0,  outputPerM: 25.0 } },
  { id: "claude-4.6-sonnet", displayName: "Claude 4.6 Sonnet", provider: "Anthropic", pricing: { inputPerM: 3.0,  outputPerM: 15.0 } },
  { id: "gpt-5.5",           displayName: "GPT-5.5",           provider: "OpenAI",    pricing: { inputPerM: 5.0,  outputPerM: 30.0 } },
  { id: "gpt-5.4",           displayName: "GPT-5.4",           provider: "OpenAI",    pricing: { inputPerM: 2.5,  outputPerM: 15.0 } },
  { id: "gemini-3.1-pro",    displayName: "Gemini 3.1 Pro",    provider: "Google",    pricing: { inputPerM: 2.0,  outputPerM: 12.0 } },
];

function fallbackPricing(id: string): ModelInfo["pricing"] | undefined {
  return FALLBACK_MODELS.find((m) => m.id === id)?.pricing;
}

export async function listModels(opts: ListModelsOptions): Promise<ModelInfo[]> {
  const apiKey = opts.apiKey ?? process.env.CURSOR_API_KEY ?? "";
  if (!apiKey) return FALLBACK_MODELS;
  try {
    const raw = await Cursor.models.list({ apiKey });
    if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_MODELS;
    return raw.map((m) => {
      const id = String((m as { id?: unknown }).id ?? "");
      const displayName = String(
        (m as { displayName?: unknown }).displayName ?? id,
      );
      const provider = String(
        (m as { provider?: unknown }).provider ?? "Unknown",
      );
      const pricing =
        (m as { pricing?: ModelInfo["pricing"] }).pricing ?? fallbackPricing(id);
      const info: ModelInfo = { id, displayName, provider };
      if (pricing) info.pricing = pricing;
      return info;
    });
  } catch {
    return FALLBACK_MODELS;
  }
}
