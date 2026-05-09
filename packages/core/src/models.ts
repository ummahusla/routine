export type ModelInfo = {
  id: string;
  displayName: string;
  provider: string;
  pricing?: { inputPerM: number; outputPerM: number };
};

export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "composer-2",        displayName: "Composer 2",        provider: "Cursor",    pricing: { inputPerM: 0.5,  outputPerM: 2.5  } },
  { id: "composer-2-fast",   displayName: "Composer 2 (Fast)", provider: "Cursor",    pricing: { inputPerM: 1.5,  outputPerM: 7.5  } },
  { id: "claude-4.7-opus",   displayName: "Claude 4.7 Opus",   provider: "Anthropic", pricing: { inputPerM: 5.0,  outputPerM: 25.0 } },
  { id: "claude-4.6-sonnet", displayName: "Claude 4.6 Sonnet", provider: "Anthropic", pricing: { inputPerM: 3.0,  outputPerM: 15.0 } },
  { id: "gpt-5.5",           displayName: "GPT-5.5",           provider: "OpenAI",    pricing: { inputPerM: 5.0,  outputPerM: 30.0 } },
  { id: "gpt-5.4",           displayName: "GPT-5.4",           provider: "OpenAI",    pricing: { inputPerM: 2.5,  outputPerM: 15.0 } },
  { id: "gemini-3.1-pro",    displayName: "Gemini 3.1 Pro",    provider: "Google",    pricing: { inputPerM: 2.0,  outputPerM: 12.0 } },
];
