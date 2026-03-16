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
