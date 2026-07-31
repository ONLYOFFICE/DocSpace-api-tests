import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { enableAiGateway } from "@/src/helpers/wallet-services";

// The chat surface moved from `/ai/rooms/{roomId}/chats` (404) to
// `/ai/threads/*` + `/ai/ai/send-with-stream`. See the route map in
// src/helpers/ai-agent-chat.ts.
//
// Two independent states turn AI off and both are covered here: the portal AI
// switch (first block) and the unpaid "AI Tools" wallet service (second block).

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

// The other way AI is off: the portal has not paid for the "AI Tools" wallet
// service — the state every fresh portal starts in. Nothing is blocked up front
// then: profiles, agents and threads all answer 200, and
// `POST /ai/ai/send-with-stream` answers 200 too. The refusal only shows up
// afterwards, inside the thread, as an assistant message with empty content and
//
//   status: { type: "incomplete", reason: "error",
//             error: { code: "auth", message: "403 AI Gateway is not enabled" } }
//
// So a test that only checks the send status cannot tell a working portal from a
// portal where AI is dead. These tests read the reply back.

test.describe("AI Chat - AI Tools wallet service not paid for", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the assistant reply fails until AI Tools is paid for", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profiles = await aiChat.listProfiles("owner");
    expect(profiles.length).toBeGreaterThan(0);
    const profileId = profiles[0].id;

    const created = await aiChat.createAgent("owner", {
      title: "Autotest Unpaid AI Agent",
      profileId,
      prompt: "You are a test assistant",
    });
    expect(created.status).toBe(200);
    const agentId = created.data!.response!.id!;

    const unpaidThread = await aiChat.createThread("owner", {
      title: "Autotest unpaid thread",
      profileId,
      agentId,
    });
    expect(unpaidThread.status).toBe(200);

    const unpaidSend = await aiChat.sendMessage("owner", {
      threadId: unpaidThread.threadId,
      profileId,
      agentId,
      message: "Say hi",
    });
    expect(unpaidSend.status).toBe(200);

    const unpaidMessages = await aiChat.waitForAssistantReply(
      "owner",
      unpaidThread.threadId,
      60000,
    );
    const unpaidStatus = AiAgentChat.assistantStatus(unpaidMessages);
    expect(unpaidStatus?.reason).toBe("error");
    expect(unpaidStatus?.type).toBe("incomplete");
    expect(unpaidStatus?.error?.code).toBe("auth");
    expect(unpaidStatus?.error?.message).toContain("AI Gateway is not enabled");
    expect(AiAgentChat.assistantText(unpaidMessages)).toBe("");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    // A fresh thread: the previous one already holds an assistant message, and
    // waitForAssistantReply returns on the first one it sees.
    const paidThread = await aiChat.createThread("owner", {
      title: "Autotest paid thread",
      profileId,
      agentId,
    });
    expect(paidThread.status).toBe(200);

    const paidSend = await aiChat.sendMessage("owner", {
      threadId: paidThread.threadId,
      profileId,
      agentId,
      message: "Say hi",
    });
    expect(paidSend.status).toBe(200);

    const paidMessages = await aiChat.waitForAssistantReply(
      "owner",
      paidThread.threadId,
    );

    expect(AiAgentChat.assistantStatus(paidMessages)?.error).toBeUndefined();
    expect(AiAgentChat.assistantText(paidMessages).length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/agents, POST /api/2.0/ai/tools/add-custom-server - the management surface is not wallet-gated", async ({
    apiSdk,
  }) => {
    // Pinned so that moving the gate earlier (or later) shows up here: on an
    // unpaid portal the profiles catalog, agent CRUD, agent quota and the MCP
    // tools surface all behave exactly as on a paid one. Only inference differs.
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const tools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const profiles = await aiChat.listProfiles("owner");
    expect(profiles.length).toBeGreaterThan(0);

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Unpaid AI Agent",
      profileId: profiles[0].id,
    });

    const agents = await aiChat.getAgents("owner");
    expect(agents.status).toBe(200);
    expect(
      (agents.data?.response?.folders ?? []).map((agent) => agent.id),
    ).toContain(agentId);

    const quota = await aiChat.updateAgentsQuota("owner", {
      roomIds: [agentId],
      quota: 1048576,
    });
    expect(quota.status).toBe(200);

    const systemTools = await tools.listSystemTools("owner");
    expect(systemTools.status).toBe(200);
    expect((systemTools.data?.docspace ?? []).length).toBeGreaterThan(0);

    const addedServer = await tools.addCustomServer("owner", {
      name: "autotest-unpaid-server",
      config: { url: "https://mcp.example.invalid/sse" },
      agentId,
    });
    expect(addedServer.status).toBe(200);
    expect(addedServer.data?.success).toBe(true);
  });

  test("GET /api/2.0/ai/threads/read-messages - the question is kept even though the answer failed", async ({
    apiSdk,
  }) => {
    // The user's message is stored before the gateway is called, so an unpaid
    // portal ends up with a thread holding a question and a failed answer.
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Unpaid AI Agent",
      profileId,
    });
    const thread = await aiChat.createThread("owner", {
      title: "Autotest unpaid thread",
      profileId,
      agentId,
    });
    await aiChat.sendMessage("owner", {
      threadId: thread.threadId,
      profileId,
      agentId,
      message: "Say hi",
    });

    const messages = await aiChat.waitForAssistantReply(
      "owner",
      thread.threadId,
      60000,
    );

    const questions = messages.filter((message) => message.role === "user");
    expect(questions.length).toBe(1);
    expect(AiAgentChat.assistantText(messages)).toBe("");
    expect(AiAgentChat.assistantStatus(messages)?.error?.code).toBe("auth");
  });
});
