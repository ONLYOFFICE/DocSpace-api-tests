import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { ProviderType } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

test.describe("POST /ai/agents - User cannot create AI agent", () => {
  test("POST /ai/agents - User cannot create an agent with OpenAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenAi,
      title: "OpenAI",
      key: config.OPENAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.createAgent({
      title: "Autotest OpenAI Agent",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest", "openai"],
      chatSettings: {
        providerId,
        modelId: "gpt-5.2-2025-12-11",
        prompt: "You are a test assistant powered by OpenAI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - User cannot create an agent with Anthropic provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.Anthropic,
      title: "Anthropic",
      key: config.ANTHROPIC_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.createAgent({
      title: "Autotest Anthropic Agent",
      color: "D4A574",
      cover: "layers",
      tags: ["autotest", "anthropic"],
      chatSettings: {
        providerId,
        modelId: "claude-opus-4-5-20251101",
        prompt: "You are a test assistant powered by Anthropic",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - User cannot create an agent with DeepSeek provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.DeepSeek,
      title: "DeepSeek",
      key: config.DEEPSEEK_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.createAgent({
      title: "Autotest DeepSeek Agent",
      color: "4A90D9",
      cover: "layers",
      tags: ["autotest", "deepseek"],
      chatSettings: {
        providerId,
        modelId: "deepseek-chat",
        prompt: "You are a test assistant powered by DeepSeek",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - User cannot create an agent with xAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.XAi,
      title: "xAI",
      key: config.XAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.createAgent({
      title: "Autotest xAI Agent",
      color: "1A1A2E",
      cover: "layers",
      tags: ["autotest", "xai"],
      chatSettings: {
        providerId,
        modelId: "grok-4-1-fast-reasoning",
        prompt: "You are a test assistant powered by xAI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - User cannot create an agent with Google AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.GoogleAi,
      title: "Google AI",
      key: config.GOOGLE_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.createAgent({
      title: "Autotest Google AI Agent",
      color: "34A853",
      cover: "layers",
      tags: ["autotest", "google"],
      chatSettings: {
        providerId,
        modelId: "models/gemini-3-pro-preview",
        prompt: "You are a test assistant powered by Google AI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - User cannot create an agent with OpenRouter provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenRouter,
      title: "OpenRouter",
      key: config.OPENROUTER_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.createAgent({
      title: "Autotest OpenRouter Agent",
      color: "6C5CE7",
      cover: "layers",
      tags: ["autotest", "openrouter"],
      chatSettings: {
        providerId,
        modelId: "openai/gpt-5.2",
        prompt: "You are a test assistant powered by OpenRouter",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - User cannot create an agent with Together AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.TogetherAi,
      title: "Together AI",
      key: config.TOGETHER_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.createAgent({
      title: "Autotest Together AI Agent",
      color: "E17055",
      cover: "layers",
      tags: ["autotest", "togetherai"],
      chatSettings: {
        providerId,
        modelId: "deepseek-ai/DeepSeek-V3.1",
        prompt: "You are a test assistant powered by Together AI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });
});

test.describe("POST /ai/agents - Guest cannot create AI agent", () => {
  test("POST /ai/agents - Guest cannot create an agent with OpenAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenAi,
      title: "OpenAI",
      key: config.OPENAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.createAgent({
      title: "Autotest OpenAI Agent",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest", "openai"],
      chatSettings: {
        providerId,
        modelId: "gpt-5.2-2025-12-11",
        prompt: "You are a test assistant powered by OpenAI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - Guest cannot create an agent with Anthropic provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.Anthropic,
      title: "Anthropic",
      key: config.ANTHROPIC_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.createAgent({
      title: "Autotest Anthropic Agent",
      color: "D4A574",
      cover: "layers",
      tags: ["autotest", "anthropic"],
      chatSettings: {
        providerId,
        modelId: "claude-opus-4-5-20251101",
        prompt: "You are a test assistant powered by Anthropic",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - Guest cannot create an agent with DeepSeek provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.DeepSeek,
      title: "DeepSeek",
      key: config.DEEPSEEK_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.createAgent({
      title: "Autotest DeepSeek Agent",
      color: "4A90D9",
      cover: "layers",
      tags: ["autotest", "deepseek"],
      chatSettings: {
        providerId,
        modelId: "deepseek-chat",
        prompt: "You are a test assistant powered by DeepSeek",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - Guest cannot create an agent with xAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.XAi,
      title: "xAI",
      key: config.XAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.createAgent({
      title: "Autotest xAI Agent",
      color: "1A1A2E",
      cover: "layers",
      tags: ["autotest", "xai"],
      chatSettings: {
        providerId,
        modelId: "grok-4-1-fast-reasoning",
        prompt: "You are a test assistant powered by xAI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - Guest cannot create an agent with Google AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.GoogleAi,
      title: "Google AI",
      key: config.GOOGLE_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.createAgent({
      title: "Autotest Google AI Agent",
      color: "34A853",
      cover: "layers",
      tags: ["autotest", "google"],
      chatSettings: {
        providerId,
        modelId: "models/gemini-3-pro-preview",
        prompt: "You are a test assistant powered by Google AI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - Guest cannot create an agent with OpenRouter provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenRouter,
      title: "OpenRouter",
      key: config.OPENROUTER_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.createAgent({
      title: "Autotest OpenRouter Agent",
      color: "6C5CE7",
      cover: "layers",
      tags: ["autotest", "openrouter"],
      chatSettings: {
        providerId,
        modelId: "openai/gpt-5.2",
        prompt: "You are a test assistant powered by OpenRouter",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });

  test("POST /ai/agents - Guest cannot create an agent with Together AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.TogetherAi,
      title: "Together AI",
      key: config.TOGETHER_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.createAgent({
      title: "Autotest Together AI Agent",
      color: "E17055",
      cover: "layers",
      tags: ["autotest", "togetherai"],
      chatSettings: {
        providerId,
        modelId: "deepseek-ai/DeepSeek-V3.1",
        prompt: "You are a test assistant powered by Together AI",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to create",
    );
  });
});

test.describe("POST /ai/agents - Anonymous cannot create AI agent", () => {
  test("POST /ai/agents - Anonymous cannot create an agent without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.agents.createAgent({
      title: "Autotest Unauthorized Agent",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId: 1,
        modelId: "gpt-5.2-2025-12-11",
        prompt: "You are a test assistant",
      },
    });

    expect(status).toBe(401);
  });
});
