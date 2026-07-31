import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { onlyofficeAiProvider } from "@/src/helpers/ai-providers";
import { enableAiGateway } from "@/src/helpers/wallet-services";

// SKIPPED: these cover POST /api/2.0/ai/messages/{messageId}/export and
// POST /api/2.0/ai/chats/{chatId}/messages/export, both of which now answer 404.
// Message export was replaced by POST /api/2.0/ai/text-to-docx, which takes the
// text itself instead of a message id — see messages.spec.ts.
//
// Kept rather than deleted because the endpoint may come back. If it does, drop
// the .skip on the describes below and re-verify: the setup here drives the
// removed chat surface (/ai/rooms/{roomId}/chats, also 404, now /ai/threads/*),
// and the error envelope has changed to {"error":"..."} with no statusCode and
// no error.message.
//
// Bugs these tests tracked, still unverified against any replacement:
// BUG 80770 (export without agent membership), BUG 80772 (export with Viewer
// role), BUG 80779 (messageId 0 / -1 validation).

test.describe
  .skip("AI Messages - Export Permissions (not a member of agent)", () => {
  test("BUG 80770: POST /api/2.0/ai/messages/:messageId/export - DocSpaceAdmin cannot export message without being in agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80770: POST /api/2.0/ai/messages/:messageId/export - RoomAdmin cannot export message without being in agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80770: POST /api/2.0/ai/messages/:messageId/export - User cannot export message without being in agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80770: POST /api/2.0/ai/messages/:messageId/export - Guest cannot export message without being in agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe.skip("AI Messages - Export Permissions (Viewer in agent)", () => {
  test("BUG 80772: POST /api/2.0/ai/messages/:messageId/export - DocSpaceAdmin with Viewer role cannot export message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await adminApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80772: POST /api/2.0/ai/messages/:messageId/export - RoomAdmin with Viewer role cannot export message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80772: POST /api/2.0/ai/messages/:messageId/export - User with Viewer role cannot export message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80772: POST /api/2.0/ai/messages/:messageId/export - Guest with Viewer role cannot export message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { data: guestData, userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.messages.exportMessage({
      messageId,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe.skip("AI Messages - Export Validation", () => {
  test("BUG 80779: POST /api/2.0/ai/messages/:messageId/export - returns 400 for messageId = 0", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { data, status } = await ownerApi.messages.exportMessage({
      messageId: 0,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(400);
    expect((data as any).response.errors.messageId[0]).toBe(
      "The field MessageId must be between 1 and 2147483647.",
    );
  });

  test("BUG 80779: POST /api/2.0/ai/messages/:messageId/export - returns 400 for messageId = -1", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream" },
    );

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { data, status } = await ownerApi.messages.exportMessage({
      messageId: -1,
      exportMessageRequestBody: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(400);
    expect((data as any).response.errors.messageId[0]).toBe(
      "The field MessageId must be between 1 and 2147483647.",
    );
  });
});

test.describe.skip("AI Messages - Export Unauthorized", () => {
  test("POST /api/2.0/ai/messages/:messageId/export - Anonymous user gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonymousApi = apiSdk.forAnonymous();

    const { status } = await anonymousApi.messages.exportMessage({
      messageId: 1,
      exportMessageRequestBody: {
        folderId: 1,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(401);
  });
});
