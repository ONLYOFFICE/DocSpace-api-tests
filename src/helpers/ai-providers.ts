// The product runs AI through the built-in "ONLYOFFICE AI" gateway only.
// Manual providers (OpenRouter, OpenAI, etc.) were removed from the product, so
// there is no manual-provider config here — agents/chats reference the gateway
// provider via providerId -1 + defaultModel, and the portal is provisioned with
// enableAiGateway() from wallet-services.
export const onlyofficeAiProvider = {
  providerId: -1,
  defaultModel: "gpt-5.5",
  providerTitle: "ONLYOFFICE AI",
} as const;

// Model ids that can be restricted via the payments/wallet "restricted models"
// setting (used by portal payment tests, unrelated to provider management).
export const restrictableAiModelIds = [
  "claude-sonnet-4.6",
  "deepseek-v3.2",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gpt-5.2",
  "gpt-5.4",
] as const;
