import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";

// The chat surface moved from `/ai/rooms/{roomId}/chats` (404) to
// `/ai/threads/*` + `/ai/ai/send-with-stream`. See the route map in
// src/helpers/ai-agent-chat.ts.

const fakeAgentId = 999999999;
const fakeThreadId = "019f0000-0000-7000-8000-000000000000";

test.describe("AI Chat - AI Disabled", () => {
  test("GET /api/2.0/ai/threads/list - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.listThreads("owner", fakeAgentId);

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/threads/create - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId: fakeAgentId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/threads/get-by-id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.getThread("owner", fakeThreadId);

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/threads/read-messages - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.readMessages("owner", fakeThreadId);

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/threads/rename - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.renameThread(
      "owner",
      fakeThreadId,
      "Renamed",
    );

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/threads/delete - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.deleteThread("owner", fakeThreadId);

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/threads/clear-messages - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.clearThreadMessages("owner", fakeThreadId);

    expect(status).toBe(403);
  });

  test("BUG XXXXX: POST /api/2.0/ai/ai/send-with-stream - still answers 200 when AI access is disabled", async ({
    apiSdk,
  }) => {
    // Every other thread route is gated by the portal AI switch; the send
    // endpoint is not, so inference stays reachable after AI is turned off.
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiChat.sendMessage("owner", {
      threadId: fakeThreadId,
      profileId,
      agentId: fakeAgentId,
      message: "Hello",
    });

    test.fail();
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/profiles/list - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    // Replaces the removed GET /ai/chats/models.
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const profiles = await aiChat.listProfiles("owner");

    expect(profiles).toEqual([]);
  });
});
