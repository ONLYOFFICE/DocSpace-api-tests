import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { ProviderType, RoomType } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

test.describe("POST /ai/agents - Create AI agent", () => {
  test("POST /ai/agents - Owner creates an agent with OpenAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenAi,
      title: "OpenAI",
      key: config.OPENAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest OpenAI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("FF5733");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by OpenAI",
    );
    expect(data.response?.chatSettings?.modelId).toBe("gpt-5.2-2025-12-11");
  });

  test("POST /ai/agents - Owner creates an agent with Anthropic provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.Anthropic,
      title: "Anthropic",
      key: config.ANTHROPIC_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Anthropic Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("D4A574");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Anthropic",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "claude-opus-4-5-20251101",
    );
  });

  test("POST /ai/agents - Owner creates an agent with DeepSeek provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.DeepSeek,
      title: "DeepSeek",
      key: config.DEEPSEEK_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest DeepSeek Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("4A90D9");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by DeepSeek",
    );
    expect(data.response?.chatSettings?.modelId).toBe("deepseek-chat");
  });

  test("POST /ai/agents - Owner creates an agent with xAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.XAi,
      title: "xAI",
      key: config.XAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest xAI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("1A1A2E");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by xAI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "grok-4-1-fast-reasoning",
    );
  });

  test("POST /ai/agents - Owner creates an agent with Google AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.GoogleAi,
      title: "Google AI",
      key: config.GOOGLE_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Google AI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("34A853");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Google AI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "models/gemini-3-pro-preview",
    );
  });

  test("POST /ai/agents - Owner creates an agent with OpenRouter provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenRouter,
      title: "OpenRouter",
      key: config.OPENROUTER_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest OpenRouter Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("6C5CE7");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by OpenRouter",
    );
    expect(data.response?.chatSettings?.modelId).toBe("openai/gpt-5.2");
  });

  test("POST /ai/agents - Owner creates an agent with Together AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.TogetherAi,
      title: "Together AI",
      key: config.TOGETHER_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Together AI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("E17055");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Together AI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "deepseek-ai/DeepSeek-V3.1",
    );
  });
});

test.describe("POST /ai/agents - DocSpace Admin creates AI agent", () => {
  test("POST /ai/agents - DocSpace Admin creates an agent with OpenAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenAi,
      title: "OpenAI",
      key: config.OPENAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await adminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest OpenAI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("FF5733");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by OpenAI",
    );
    expect(data.response?.chatSettings?.modelId).toBe("gpt-5.2-2025-12-11");
  });

  test("POST /ai/agents - DocSpace Admin creates an agent with Anthropic provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.Anthropic,
      title: "Anthropic",
      key: config.ANTHROPIC_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await adminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Anthropic Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("D4A574");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Anthropic",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "claude-opus-4-5-20251101",
    );
  });

  test("POST /ai/agents - DocSpace Admin creates an agent with DeepSeek provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.DeepSeek,
      title: "DeepSeek",
      key: config.DEEPSEEK_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await adminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest DeepSeek Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("4A90D9");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by DeepSeek",
    );
    expect(data.response?.chatSettings?.modelId).toBe("deepseek-chat");
  });

  test("POST /ai/agents - DocSpace Admin creates an agent with xAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.XAi,
      title: "xAI",
      key: config.XAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await adminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest xAI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("1A1A2E");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by xAI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "grok-4-1-fast-reasoning",
    );
  });

  test("POST /ai/agents - DocSpace Admin creates an agent with Google AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.GoogleAi,
      title: "Google AI",
      key: config.GOOGLE_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await adminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Google AI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("34A853");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Google AI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "models/gemini-3-pro-preview",
    );
  });

  test("POST /ai/agents - DocSpace Admin creates an agent with OpenRouter provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenRouter,
      title: "OpenRouter",
      key: config.OPENROUTER_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await adminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest OpenRouter Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("6C5CE7");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by OpenRouter",
    );
    expect(data.response?.chatSettings?.modelId).toBe("openai/gpt-5.2");
  });

  test("POST /ai/agents - DocSpace Admin creates an agent with Together AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.TogetherAi,
      title: "Together AI",
      key: config.TOGETHER_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await adminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Together AI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("E17055");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Together AI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "deepseek-ai/DeepSeek-V3.1",
    );
  });
});

test.describe("POST /ai/agents - Room Admin creates AI agent", () => {
  test("POST /ai/agents - Room Admin creates an agent with OpenAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenAi,
      title: "OpenAI",
      key: config.OPENAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest OpenAI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("FF5733");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by OpenAI",
    );
    expect(data.response?.chatSettings?.modelId).toBe("gpt-5.2-2025-12-11");
  });

  test("POST /ai/agents - Room Admin creates an agent with Anthropic provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.Anthropic,
      title: "Anthropic",
      key: config.ANTHROPIC_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Anthropic Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("D4A574");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Anthropic",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "claude-opus-4-5-20251101",
    );
  });

  test("POST /ai/agents - Room Admin creates an agent with DeepSeek provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.DeepSeek,
      title: "DeepSeek",
      key: config.DEEPSEEK_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest DeepSeek Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("4A90D9");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by DeepSeek",
    );
    expect(data.response?.chatSettings?.modelId).toBe("deepseek-chat");
  });

  test("POST /ai/agents - Room Admin creates an agent with xAI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.XAi,
      title: "xAI",
      key: config.XAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest xAI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("1A1A2E");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by xAI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "grok-4-1-fast-reasoning",
    );
  });

  test("POST /ai/agents - Room Admin creates an agent with Google AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.GoogleAi,
      title: "Google AI",
      key: config.GOOGLE_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Google AI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("34A853");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Google AI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "models/gemini-3-pro-preview",
    );
  });

  test("POST /ai/agents - Room Admin creates an agent with OpenRouter provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenRouter,
      title: "OpenRouter",
      key: config.OPENROUTER_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest OpenRouter Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("6C5CE7");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by OpenRouter",
    );
    expect(data.response?.chatSettings?.modelId).toBe("openai/gpt-5.2");
  });

  test("POST /ai/agents - Room Admin creates an agent with Together AI provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.TogetherAi,
      title: "Together AI",
      key: config.TOGETHER_AI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
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

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Together AI Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(data.response?.logo?.color).toBe("E17055");
    expect(data.response?.logo?.cover?.id).toBe("layers");
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant powered by Together AI",
    );
    expect(data.response?.chatSettings?.modelId).toBe(
      "deepseek-ai/DeepSeek-V3.1",
    );
  });
});

test.describe("POST /ai/agents - Create AI agent with invalid modelId", () => {
  test.fail(
    "BUG : POST /ai/agents - Missing validation for modelId parameter",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: ProviderType.OpenAi,
        title: "OpenAI",
        key: config.OPENAI_API_KEY,
      });
      const providerId = providerData.response!.id!;

      const { status } = await ownerApi.agents.createAgent({
        title: "Autotest Invalid Model Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: "invalid-nonexistent-model-123",
          prompt: "You are a test assistant",
        },
      });

      expect(status).not.toBe(200);
    },
  );

  test("POST /ai/agents - Owner cannot create an agent with empty modelId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: ProviderType.OpenAi,
      title: "OpenAI",
      key: config.OPENAI_API_KEY,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
      title: "Autotest Empty Model Agent",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: "",
        prompt: "You are a test assistant",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
  });
});
