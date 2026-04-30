import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders } from "@/src/helpers/ai-providers";

const fakeAgentId = 999999999;

test.describe("AI Agents - AI Disabled", () => {
  test("POST /ai/agents - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest AI Disabled Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: 1,
          modelId: aiProviders.openAi.modelId,
          prompt: "You are a test assistant",
        },
      },
    });

    expect(status).toBe(403);
  });

  test("GET /ai/agents - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.getAgents();

    expect(status).toBe(403);
  });

  test("GET /ai/agents/news - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.getAgentsNewItems();

    expect(status).toBe(403);
  });

  test("GET /ai/agents/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.getAgentInfo({ id: fakeAgentId });

    expect(status).toBe(403);
  });

  test("PUT /ai/agents/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.updateAgent({
      id: fakeAgentId,
      updateRoomRequest: {
        title: "Updated Agent",
        tags: ["autotest"],
        chatSettings: {
          providerId: 1,
          modelId: aiProviders.openAi.modelId,
          prompt: "Updated prompt",
        },
      },
    });

    expect(status).toBe(403);
  });

  test("DELETE /ai/agents/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.deleteAgent({
      id: fakeAgentId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
  });

  test("PUT /ai/agents/agentquota - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [fakeAgentId] as any,
        quota: 104857600,
      },
    });

    expect(status).toBe(403);
  });

  test("PUT /ai/agents/resetagentquota - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.agents.resetAgentsQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [fakeAgentId] as any,
      },
    });

    expect(status).toBe(403);
  });
});
