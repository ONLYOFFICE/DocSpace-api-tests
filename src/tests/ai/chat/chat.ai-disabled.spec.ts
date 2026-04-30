import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { ToolExecutionDecision } from "@onlyoffice/docspace-api-sdk";

const fakeRoomId = 999999999;
const fakeChatId = "00000000-0000-0000-0000-000000000000";

test.describe("AI Chat - AI Disabled", () => {
  test("POST /api/2.0/ai/rooms/:roomId/chats - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.startNewChat({
      roomId: fakeRoomId,
      startNewChatBody: { message: "test" },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/chats/:chatId/messages - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.continueChat({
      chatId: fakeChatId,
      continueChatBody: { message: "test" },
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/rooms/:roomId/chats - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.getChats({ roomId: fakeRoomId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/chats/:chatId - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.getChat({ chatId: fakeChatId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/chats/:chatId/messages - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.getMessages({ chatId: fakeChatId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/chats/models - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.getChatModels();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/rooms/:roomId/chats/settings - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.getUserChatsSettings({
      roomId: fakeRoomId,
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/rooms/:roomId/chats/settings - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.setUserChatsSettings({
      roomId: fakeRoomId,
      setUserChatSettingsRequestBody: { webSearchEnabled: false },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/chats/:chatId - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.renameChat({
      chatId: fakeChatId,
      renameChatBody: { name: "Renamed Chat" },
    });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/chats/:chatId - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.deleteChat({ chatId: fakeChatId });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/chats/:chatId/export - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.exportChat({
      chatId: fakeChatId,
      exportChatRequestBody: { folderId: fakeRoomId, title: null },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/chats/:chatId/permission - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.chat.providePermission({
      callId: fakeChatId,
      toolDecisionRequestBody: {
        decision: ToolExecutionDecision.Allow,
      },
    });

    expect(status).toBe(403);
  });
});
