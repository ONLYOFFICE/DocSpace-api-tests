// The product runs AI through the built-in "ONLYOFFICE AI" gateway only.
// Manual providers (OpenRouter, OpenAI, etc.) were removed from the product, so
// there is no manual-provider config here — agents/chats reference the gateway
// provider via providerId -1 + defaultModel, and the portal is provisioned with
// enableAiGateway() from wallet-services.
export const onlyofficeAiProvider = {
  providerId: -1,
  // The gateway's model catalog (GET /api/2.0/ai/chats/models) changed: gpt-5.5
  // was dropped and inference now returns 400 "unknown model" for it. Use a
  // currently-offered model that supports tool calling (needed by the MCP /
  // agent tool tests). Available as of 2026-07-23: claude-opus-4.8,
  // gemini-3.5-flash, deepseek-v4-pro, deepseek-v4-flash, qwen3.5-122b-a10b.
  defaultModel: "claude-opus-4.8",
  providerTitle: "ONLYOFFICE AI",
} as const;

// Model ids that can be restricted via the payments/wallet "restricted models"
// setting (used by portal payment tests, unrelated to provider management).
export const restrictableAiModelIds = [
  "claude-opus-4.8",
  "claude-sonnet-4.6",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gpt-5.4",
  "gpt-5.5",
  "qwen3.5-122b-a10b",
] as const;
