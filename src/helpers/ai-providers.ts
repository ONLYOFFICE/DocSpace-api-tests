import { ProviderType } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

export interface AiProviderConfig {
  type: ProviderType;
  title: string;
  key: string;
  modelId: string;
}

export const aiProviders: Record<string, AiProviderConfig> = {
  openAi: {
    type: ProviderType.OpenAi,
    title: "OpenAI",
    key: config.OPENAI_API_KEY,
    modelId: "gpt-5.2-2025-12-11",
  },
  anthropic: {
    type: ProviderType.Anthropic,
    title: "Anthropic",
    key: config.ANTHROPIC_API_KEY,
    modelId: "claude-opus-4-5-20251101",
  },
  deepSeek: {
    type: ProviderType.DeepSeek,
    title: "DeepSeek",
    key: config.DEEPSEEK_API_KEY,
    modelId: "deepseek-chat",
  },
  xAi: {
    type: ProviderType.XAi,
    title: "xAI",
    key: config.XAI_API_KEY,
    modelId: "grok-4-1-fast-reasoning",
  },
  googleAi: {
    type: ProviderType.GoogleAi,
    title: "Google AI",
    key: config.GOOGLE_AI_API_KEY,
    modelId: "models/gemini-3-pro-preview",
  },
  openRouter: {
    type: ProviderType.OpenRouter,
    title: "OpenRouter",
    key: config.OPENROUTER_API_KEY,
    modelId: "openai/gpt-5.2",
  },
  togetherAi: {
    type: ProviderType.TogetherAi,
    title: "Together AI",
    key: config.TOGETHER_AI_API_KEY,
    modelId: "deepseek-ai/DeepSeek-V3.1",
  },
};

export const onlyofficeAiProvider = {
  providerId: -1,
  defaultModel: "gpt-5.2",
  providerTitle: "ONLYOFFICE AI",
} as const;

export const expectedAvailableProviders = [
  { type: 1, url: "https://api.openai.com/v1" },
  { type: 2, url: "https://api.together.xyz/v1" },
  { type: 4, url: "https://api.anthropic.com/v1" },
  { type: 5, url: "https://openrouter.ai/api/v1" },
  { type: 6, url: "https://api.deepseek.com" },
  { type: 7, url: "https://api.x.ai/v1" },
  { type: 8, url: "https://generativelanguage.googleapis.com/v1beta" },
];
