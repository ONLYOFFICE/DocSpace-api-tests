import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";

// With portal AI access switched off every agent route answers 403, including
// the profiles catalog the other tests bootstrap from.
//
// One ordering detail: POST /ai/agents validates the body BEFORE checking AI
// access, so an incomplete body returns 400 rather than 403. The create test
// therefore sends a fully valid payload.

const fakeAgentId = 999999999;

test.describe("AI Agents - AI Disabled", () => {
  test("POST /ai/agents - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    // Read the catalog while AI is still on — the body must be valid, or the
    // request fails validation before it ever reaches the AI-access check.
    const profileId = await aiChat.defaultProfileId("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.createAgent("owner", {
      title: "Autotest AI Disabled Agent",
      tags: ["autotest"],
      profileId,
      prompt: "You are a test assistant",
    });

    expect(status).toBe(403);
  });

  test("GET /ai/agents - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.getAgents("owner");

    expect(status).toBe(403);
  });

  test("GET /ai/agents/news - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.getAgentsNewItems("owner");

    expect(status).toBe(403);
  });

  test("GET /ai/agents/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.getAgentInfo("owner", fakeAgentId);

    expect(status).toBe(403);
  });

  test("PUT /ai/agents/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.updateAgent("owner", fakeAgentId, {
      title: "Autotest AI Disabled Agent",
    });

    expect(status).toBe(403);
  });

  test("DELETE /ai/agents/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.deleteAgent("owner", fakeAgentId);

    expect(status).toBe(403);
  });

  test("PUT /ai/agents/agentquota - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.updateAgentsQuota("owner", {
      roomIds: [fakeAgentId],
      quota: 1048576,
    });

    expect(status).toBe(403);
  });

  test("PUT /ai/agents/resetquota - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.resetAgentsQuota("owner", {
      roomIds: [fakeAgentId],
    });

    expect(status).toBe(403);
  });

  test("GET /ai/profiles/list - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.getAgentInfo("owner", fakeAgentId);
    // An empty array would also be what a 403 body normalises to, so the
    // catalogue call is asserted on its status, not on its payload.
    const profiles = await aiChat.getProfiles("owner");

    expect(profiles.error).toBe("Forbidden");
    expect(profiles.status).toBe(403);
    expect(status).toBe(403);
  });
});
