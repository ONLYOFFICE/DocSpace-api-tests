import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { aiProviders } from "@/src/helpers/ai-providers";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

test.describe("POST /ai/agents - Create AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - Owner creates an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      const { data, status } = await ownerApi.agents.createAgent({
        title: `Autotest ${provider.title} Agent`,
        color: "FF5733",
        cover: "layers",
        tags: ["autotest", key],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: `You are a test assistant powered by ${provider.title}`,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(`Autotest ${provider.title} Agent`);
      expect(data.response?.roomType).toBe(RoomType.AiRoom);
      expect(data.response?.chatSettings?.modelId).toBe(provider.modelId);
      expect(data.response?.chatSettings?.prompt).toBe(
        `You are a test assistant powered by ${provider.title}`,
      );
    });
  }
});

test.describe("POST /ai/agents - DocSpace Admin creates AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - DocSpace Admin creates an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminApi = apiSdk.forRole("docSpaceAdmin");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      const { data, status } = await adminApi.agents.createAgent({
        title: `Autotest ${provider.title} Agent`,
        color: "FF5733",
        cover: "layers",
        tags: ["autotest", key],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: `You are a test assistant powered by ${provider.title}`,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(`Autotest ${provider.title} Agent`);
      expect(data.response?.roomType).toBe(RoomType.AiRoom);
      expect(data.response?.chatSettings?.modelId).toBe(provider.modelId);
      expect(data.response?.chatSettings?.prompt).toBe(
        `You are a test assistant powered by ${provider.title}`,
      );
    });
  }
});

test.describe("POST /ai/agents - Room Admin creates AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - Room Admin creates an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminApi = apiSdk.forRole("roomAdmin");

      const { data, status } = await roomAdminApi.agents.createAgent({
        title: `Autotest ${provider.title} Agent`,
        color: "FF5733",
        cover: "layers",
        tags: ["autotest", key],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: `You are a test assistant powered by ${provider.title}`,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(`Autotest ${provider.title} Agent`);
      expect(data.response?.roomType).toBe(RoomType.AiRoom);
      expect(data.response?.chatSettings?.modelId).toBe(provider.modelId);
      expect(data.response?.chatSettings?.prompt).toBe(
        `You are a test assistant powered by ${provider.title}`,
      );
    });
  }
});

test.describe("POST /ai/agents - Create AI agent with invalid modelId", () => {
  test.skip("BUG 80650: POST /ai/agents - Missing validation for modelId parameter", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
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
    // Change expect after bug fix
    expect(status).not.toBe(200);
  });

  test("POST /ai/agents - Owner cannot create an agent with empty modelId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
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

test.describe("DELETE /ai/agents/:id - Delete AI agent", () => {
  test("DELETE /ai/agents/:id - Owner deletes an agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent to Delete",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await ownerApi.agents.deleteAgent(agentId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("DELETE /ai/agents/:id - DocSpace Admin deletes an agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await adminApi.agents.createAgent({
      title: "Autotest Agent to Delete",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await adminApi.agents.deleteAgent(agentId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(adminApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("DELETE /ai/agents/:id - Room Admin deletes an agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: agentData } = await roomAdminApi.agents.createAgent({
      title: "Autotest Agent to Delete",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await roomAdminApi.agents.deleteAgent(agentId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(roomAdminApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });
});
