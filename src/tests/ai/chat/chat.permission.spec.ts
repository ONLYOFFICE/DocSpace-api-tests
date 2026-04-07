import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, ToolExecutionDecision } from "@onlyoffice/docspace-api-sdk";
import { aiProviders } from "@/src/helpers/ai-providers";
import { parseSseEvents } from "@/src/helpers/parse-sse-events";
import { UserType } from "@/src/services/api-sdk";

const provider = aiProviders.openAi;

test.describe("POST /api/2.0/ai/rooms/:roomId/chats - Guest cannot start a new chat", () => {
  test("POST /api/2.0/ai/rooms/:roomId/chats - Guest with ContentCreator role gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { data: guestData, userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.chat.startNewChat({
      roomId: agentRoomId,
      startNewChatBody: {
        message: "What is 2+2? Answer in one word.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/ai/rooms/:roomId/chats - Non-member cannot start a new chat", () => {
  test("POST /api/2.0/ai/rooms/:roomId/chats - DocSpaceAdmin not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.chat.startNewChat({
      roomId: agentRoomId,
      startNewChatBody: {
        message: "What is 2+2? Answer in one word.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - RoomAdmin not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.chat.startNewChat({
      roomId: agentRoomId,
      startNewChatBody: {
        message: "What is 2+2? Answer in one word.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - User not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.chat.startNewChat({
      roomId: agentRoomId,
      startNewChatBody: {
        message: "What is 2+2? Answer in one word.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - Guest not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.chat.startNewChat({
      roomId: agentRoomId,
      startNewChatBody: {
        message: "What is 2+2? Answer in one word.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/ai/rooms/:roomId/chats - Validation", () => {
  test("POST /api/2.0/ai/rooms/:roomId/chats - Owner sends empty message gets 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { data, status } = await ownerApi.chat.startNewChat({
      roomId: agentRoomId,
      startNewChatBody: {
        message: "",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "The value cannot be an empty string. (Parameter 'message')",
    );
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - Owner sends message to non-existent room gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.startNewChat({
      roomId: 999999999,
      startNewChatBody: {
        message: "What is 2+2? Answer in one word.",
      },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe(
      "The required folder was not found",
    );
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.startNewChat({
      roomId: 1,
      startNewChatBody: {
        message: "What is 2+2? Answer in one word.",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/ai/chats/:chatId/messages - Validation", () => {
  test("POST /api/2.0/ai/chats/:chatId/messages - Owner sends empty message gets 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { data, status } = await ownerApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "The value cannot be an empty string. (Parameter 'message')",
    );
  });

  test("POST /api/2.0/ai/chats/:chatId/messages - Owner sends message to non-existent chat gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.continueChat({
      chatId: "00000000-0000-0000-0000-000000000000",
      continueChatBody: {
        message: "Hello",
      },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("Chat not found");
  });

  test("POST /api/2.0/ai/chats/:chatId/messages - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.continueChat({
      chatId: "00000000-0000-0000-0000-000000000000",
      continueChatBody: {
        message: "Hello",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/ai/chats/:chatId/messages - Non-member cannot continue a chat", () => {
  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - DocSpaceAdmin not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - RoomAdmin not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - User not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - Guest not in agent gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/ai/chats/:chatId/messages - Viewer cannot continue a chat", () => {
  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - DocSpaceAdmin with Viewer role gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await adminApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - RoomAdmin with Viewer role gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await roomAdminApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - User with Viewer role gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await userApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80791: POST /api/2.0/ai/chats/:chatId/messages - Guest with Viewer role gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await guestApi.chat.continueChat({
      chatId,
      continueChatBody: {
        message: "Now multiply that by 3.",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/ai/chats/:chatId - Non-member cannot rename a chat", () => {
  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - DocSpaceAdmin cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - RoomAdmin cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - User cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - Guest cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/ai/chats/:chatId - Viewer cannot rename a chat", () => {
  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - DocSpaceAdmin with Viewer role cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await adminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - RoomAdmin with Viewer role cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await roomAdminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - User with Viewer role cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await userApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - Guest with Viewer role cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await guestApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/ai/chats/:chatId - Validation", () => {
  test("PUT /api/2.0/ai/chats/:chatId - Owner renames non-existent chat gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.renameChat({
      chatId: "00000000-0000-0000-0000-000000000000",
      renameChatBody: {
        name: "Renamed Chat",
      },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("Chat not found");
  });

  test("PUT /api/2.0/ai/chats/:chatId - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.renameChat({
      chatId: "00000000-0000-0000-0000-000000000000",
      renameChatBody: {
        name: "Renamed Chat",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/ai/chats/:chatId - ContentCreator cannot rename another user's chat", () => {
  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - DocSpaceAdmin with ContentCreator role cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await adminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - RoomAdmin with ContentCreator role cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80797: PUT /api/2.0/ai/chats/:chatId - User with ContentCreator role cannot rename Owner's chat gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await userApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Hacked Chat",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/ai/chats/:chatId - Validation", () => {
  test("DELETE /api/2.0/ai/chats/:chatId - Owner deletes non-existent chat gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.deleteChat({
      chatId: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("Chat not found");
  });

  test("DELETE /api/2.0/ai/chats/:chatId - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.deleteChat({
      chatId: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/ai/chats/:chatId - Non-member cannot delete a chat", () => {
  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - DocSpaceAdmin not in agent cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - RoomAdmin not in agent cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - User not in agent cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - Guest not in agent cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/ai/chats/:chatId - Viewer cannot delete owner's chat", () => {
  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - DocSpaceAdmin with Viewer role cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await adminApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - RoomAdmin with Viewer role cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await roomAdminApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - User with Viewer role cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await userApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - Guest with Viewer role cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

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

    const { data, status } = await guestApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/ai/chats/:chatId - ContentCreator cannot delete owner's chat", () => {
  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - DocSpaceAdmin with ContentCreator role cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await adminApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - RoomAdmin with ContentCreator role cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80801: DELETE /api/2.0/ai/chats/:chatId - User with ContentCreator role cannot delete owner's chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const startResponse = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentRoomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await userApi.chat.deleteChat({ chatId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/ai/rooms/:roomId/chats/config - Set user chats settings permissions", () => {
  test("PUT /api/2.0/ai/rooms/:roomId/chats/config - User cannot set user chats settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.chat.setUserChatsSettings({
      roomId: agentRoomId,
      setUserChatSettingsRequestBody: {
        webSearchEnabled: true,
        reasoningEffort: 2,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/ai/rooms/:roomId/chats/config - Guest cannot set user chats settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Chat Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: "You are a helpful test assistant. Keep answers very short.",
        },
      },
    });
    const agentRoomId = agentData.response!.id!;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data, status } = await guestApi.chat.setUserChatsSettings({
      roomId: agentRoomId,
      setUserChatSettingsRequestBody: {
        webSearchEnabled: true,
        reasoningEffort: 2,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`PUT /api/2.0/ai/rooms/:roomId/chats/config - ${userType} with Viewer role cannot set user chats settings`, () => {
    test(`PUT /api/2.0/ai/rooms/:roomId/chats/config - ${userType} with Viewer role gets 403`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      const { api: memberApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", userType);
      const memberId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: agentRoomId,
        roomInvitationRequest: {
          invitations: [{ id: memberId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await memberApi.chat.setUserChatsSettings({
        roomId: agentRoomId,
        setUserChatSettingsRequestBody: {
          webSearchEnabled: true,
          reasoningEffort: 2,
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

test.describe("PUT /api/2.0/ai/rooms/:roomId/chats/config - Set user chats settings validation", () => {
  test("PUT /api/2.0/ai/rooms/:roomId/chats/config - Owner sets settings for non-existent room gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.setUserChatsSettings({
      roomId: 999999999,
      setUserChatSettingsRequestBody: {
        webSearchEnabled: true,
        reasoningEffort: 2,
      },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe(
      "The required folder was not found",
    );
  });

  test("PUT /api/2.0/ai/rooms/:roomId/chats/config - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.setUserChatsSettings({
      roomId: 1,
      setUserChatSettingsRequestBody: {
        webSearchEnabled: true,
        reasoningEffort: 2,
      },
    });

    expect(status).toBe(401);
  });
});

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`POST /api/2.0/ai/chats/tool-permissions/:callId/decision - ${userType} cannot approve tool execution in another user's chat`, () => {
    test(`BUG 80930: POST /api/2.0/ai/chats/tool-permissions/:callId/decision - ${userType} should get 403 when approving tool call in Owner's chat session but gets 200`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Tool Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          attachDefaultTools: true,
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt: "You are a helpful assistant.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
      const myFolderId = myFolderData.response!.current!.id!;

      const startResponse = await ownerApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: {
            message: `Create a .docx file named "autotest" in folder with id ${myFolderId}`,
          },
        },
        { responseType: "stream", timeout: 10000 },
      );

      const { parsed } = parseSseEvents(startResponse.data);
      const permissionEvent = parsed.find(
        (e) => e.event === "tool_call" && e.data?.managed === true,
      );
      const callId = permissionEvent!.data.callId as string;

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.chat.providePermission({
        callId,
        toolDecisionRequestBody: {
          decision: ToolExecutionDecision.Allow,
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`GET /api/2.0/ai/rooms/:roomId/chats/config - ${userType} with Viewer role cannot get user chats settings`, () => {
    test(`GET /api/2.0/ai/rooms/:roomId/chats/config - ${userType} with Viewer role gets 403`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      const { api: memberApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", userType);
      const memberId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: agentRoomId,
        roomInvitationRequest: {
          invitations: [{ id: memberId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await memberApi.chat.getUserChatsSettings({
        roomId: agentRoomId,
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`GET /api/2.0/ai/rooms/:roomId/chats/config - ${userType} not in agent cannot get user chats settings`, () => {
    test(`GET /api/2.0/ai/rooms/:roomId/chats/config - ${userType} not in agent gets 403`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.chat.getUserChatsSettings({
        roomId: agentRoomId,
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

test.describe("GET /api/2.0/ai/rooms/:roomId/chats/config - Get user chats settings validation", () => {
  test("GET /api/2.0/ai/rooms/:roomId/chats/config - Owner gets settings for non-existent room gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.getUserChatsSettings({
      roomId: 999999999,
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe(
      "The required folder was not found",
    );
  });

  test("GET /api/2.0/ai/rooms/:roomId/chats/config - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.getUserChatsSettings({
      roomId: 1,
    });

    expect(status).toBe(401);
  });
});

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`GET /api/2.0/ai/rooms/:roomId/chats - ${userType} not in agent cannot get chats`, () => {
    test(`GET /api/2.0/ai/rooms/:roomId/chats - ${userType} not in agent gets 403`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.chat.getChats({
        roomId: agentRoomId,
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`GET /api/2.0/ai/rooms/:roomId/chats - ${userType} with Viewer role cannot get chats`, () => {
    test(`GET /api/2.0/ai/rooms/:roomId/chats - ${userType} with Viewer role gets 403`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      const { api: memberApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", userType);
      const memberId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: agentRoomId,
        roomInvitationRequest: {
          invitations: [{ id: memberId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await memberApi.chat.getChats({
        roomId: agentRoomId,
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

test.describe("GET /api/2.0/ai/rooms/:roomId/chats - Get AI chats validation", () => {
  test("GET /api/2.0/ai/rooms/:roomId/chats - Owner gets chats for non-existent room gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.getChats({
      roomId: 999999999,
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe(
      "The required folder was not found",
    );
  });

  test("GET /api/2.0/ai/rooms/:roomId/chats - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.getChats({
      roomId: 1,
    });

    expect(status).toBe(401);
  });
});

for (const userType of ["DocSpaceAdmin", "RoomAdmin", "User"] as UserType[]) {
  test.describe(`GET /api/2.0/ai/chats/:chatId/messages - ${userType} with ContentCreator role cannot read Owner's chat`, () => {
    test(`GET /api/2.0/ai/chats/:chatId/messages - ${userType} with ContentCreator role gets 403 on Owner's chatId`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      await ownerApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: { message: "What is 2+2? Answer in one word." },
        },
        { responseType: "stream" },
      );

      const { data: chatsData } = await ownerApi.chat.getChats({
        roomId: agentRoomId,
      });
      const ownerChatId = chatsData.response![0].id!;

      const { api: memberApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", userType);
      const memberId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: agentRoomId,
        roomInvitationRequest: {
          invitations: [{ id: memberId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data, status } = await memberApi.chat.getMessages({
        chatId: ownerChatId,
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`GET /api/2.0/ai/chats/:chatId/messages - ${userType} not in agent cannot read Owner's chat`, () => {
    test(`GET /api/2.0/ai/chats/:chatId/messages - ${userType} not in agent gets 403 on Owner's chatId`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      await ownerApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: { message: "What is 2+2? Answer in one word." },
        },
        { responseType: "stream" },
      );

      const { data: chatsData } = await ownerApi.chat.getChats({
        roomId: agentRoomId,
      });
      const ownerChatId = chatsData.response![0].id!;

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.chat.getMessages({
        chatId: ownerChatId,
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

for (const userType of [
  "DocSpaceAdmin",
  "RoomAdmin",
  "User",
  "Guest",
] as UserType[]) {
  test.describe(`GET /api/2.0/ai/chats/:chatId/messages - ${userType} with Viewer role cannot read Owner's chat`, () => {
    test(`GET /api/2.0/ai/chats/:chatId/messages - ${userType} with Viewer role gets 403 on Owner's chatId`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Chat Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId,
            modelId: provider.modelId,
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
          },
        },
      });
      const agentRoomId = agentData.response!.id!;

      await ownerApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: { message: "What is 2+2? Answer in one word." },
        },
        { responseType: "stream" },
      );

      const { data: chatsData } = await ownerApi.chat.getChats({
        roomId: agentRoomId,
      });
      const ownerChatId = chatsData.response![0].id!;

      const { api: memberApi, data: memberData } =
        await apiSdk.addAuthenticatedMember("owner", userType);
      const memberId = memberData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: agentRoomId,
        roomInvitationRequest: {
          invitations: [{ id: memberId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await memberApi.chat.getMessages({
        chatId: ownerChatId,
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  });
}

test.describe("GET /api/2.0/ai/chats/:chatId/messages - Get messages validation", () => {
  test("GET /api/2.0/ai/chats/:chatId/messages - Owner gets messages for non-existent chatId gets 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.chat.getMessages({
      chatId: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("Chat not found");
  });

  test("GET /api/2.0/ai/chats/:chatId/messages - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.chat.getMessages({
      chatId: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(401);
  });
});
