import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, ToolExecutionDecision } from "@onlyoffice/docspace-api-sdk";
import { aiProviders, toCreateDto } from "@/src/helpers/ai-providers";
import { parseSseEvents } from "@/src/helpers/parse-sse-events";
import { UserType } from "@/src/services/api-sdk";

const provider = aiProviders.openAi;

test.describe("POST /api/2.0/ai/rooms/:roomId/chats - Start new AI chat", () => {
  test("POST /api/2.0/ai/rooms/:roomId/chats - Owner starts a new chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const response = await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const { messageStart, messageStop, tokens } = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(messageStart).toBeDefined();
    expect(messageStart!.data.chatId).toBeTruthy();
    expect(messageStart!.data.error).toBe("");
    expect(tokens.length).toBeGreaterThan(0);
    expect(messageStop).toBeDefined();
    expect(messageStop!.data.messageId).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - DocSpaceAdmin starts a new chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: agentData } = await adminApi.agents.createAgent({
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

    const response = await adminApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const { messageStart, messageStop, tokens } = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(messageStart).toBeDefined();
    expect(messageStart!.data.chatId).toBeTruthy();
    expect(messageStart!.data.error).toBe("");
    expect(tokens.length).toBeGreaterThan(0);
    expect(messageStop).toBeDefined();
    expect(messageStop!.data.messageId).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - RoomAdmin starts a new chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: agentData } = await roomAdminApi.agents.createAgent({
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

    const response = await roomAdminApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const { messageStart, messageStop, tokens } = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(messageStart).toBeDefined();
    expect(messageStart!.data.chatId).toBeTruthy();
    expect(messageStart!.data.error).toBe("");
    expect(tokens.length).toBeGreaterThan(0);
    expect(messageStop).toBeDefined();
    expect(messageStop!.data.messageId).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/rooms/:roomId/chats - User starts a new chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const response = await userApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const { messageStart, messageStop, tokens } = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(messageStart).toBeDefined();
    expect(messageStart!.data.chatId).toBeTruthy();
    expect(messageStart!.data.error).toBe("");
    expect(tokens.length).toBeGreaterThan(0);
    expect(messageStop).toBeDefined();
    expect(messageStop!.data.messageId).toBeGreaterThan(0);
  });
});

test.describe("POST /api/2.0/ai/chats/:chatId/messages - Continue AI chat", () => {
  test("POST /api/2.0/ai/chats/:chatId/messages - Owner continues a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const response = await ownerApi.chat.continueChat(
      {
        chatId,
        continueChatBody: {
          message: "Now multiply that by 3. Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const continued = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(continued.messageStart).toBeDefined();
    expect(continued.messageStart!.data.chatId).toBe(chatId);
    expect(continued.messageStart!.data.error).toBe("");
    expect(continued.tokens.length).toBeGreaterThan(0);
    expect(continued.messageStop).toBeDefined();
    expect(continued.messageStop!.data.messageId).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/chats/:chatId/messages - DocSpaceAdmin continues a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: agentData } = await adminApi.agents.createAgent({
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

    const startResponse = await adminApi.chat.startNewChat(
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

    const response = await adminApi.chat.continueChat(
      {
        chatId,
        continueChatBody: {
          message: "Now multiply that by 3. Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const continued = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(continued.messageStart).toBeDefined();
    expect(continued.messageStart!.data.chatId).toBe(chatId);
    expect(continued.messageStart!.data.error).toBe("");
    expect(continued.tokens.length).toBeGreaterThan(0);
    expect(continued.messageStop).toBeDefined();
    expect(continued.messageStop!.data.messageId).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/chats/:chatId/messages - RoomAdmin continues a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: agentData } = await roomAdminApi.agents.createAgent({
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

    const startResponse = await roomAdminApi.chat.startNewChat(
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

    const response = await roomAdminApi.chat.continueChat(
      {
        chatId,
        continueChatBody: {
          message: "Now multiply that by 3. Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const continued = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(continued.messageStart).toBeDefined();
    expect(continued.messageStart!.data.chatId).toBe(chatId);
    expect(continued.messageStart!.data.error).toBe("");
    expect(continued.tokens.length).toBeGreaterThan(0);
    expect(continued.messageStop).toBeDefined();
    expect(continued.messageStop!.data.messageId).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/chats/:chatId/messages - User continues a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const startResponse = await userApi.chat.startNewChat(
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

    const response = await userApi.chat.continueChat(
      {
        chatId,
        continueChatBody: {
          message: "Now multiply that by 3. Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 5000 },
    );

    const continued = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(continued.messageStart).toBeDefined();
    expect(continued.messageStart!.data.chatId).toBe(chatId);
    expect(continued.messageStart!.data.error).toBe("");
    expect(continued.tokens.length).toBeGreaterThan(0);
    expect(continued.messageStop).toBeDefined();
    expect(continued.messageStop!.data.messageId).toBeGreaterThan(0);
  });
});

test.describe("PUT /api/2.0/ai/chats/:chatId - Rename AI chat", () => {
  test("PUT /api/2.0/ai/chats/:chatId - Owner renames a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data, status } = await ownerApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Renamed Chat",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBeTruthy();
    expect(data.response!.title).toBe("Renamed Chat");
    expect(data.response!.createdBy!.displayName).toBe(ownerDisplayName);
  });

  test("PUT /api/2.0/ai/chats/:chatId - DocSpaceAdmin renames a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: agentData } = await adminApi.agents.createAgent({
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

    const startResponse = await adminApi.chat.startNewChat(
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

    const { data: profileData } = await adminApi.profiles.getSelfProfile();
    const adminDisplayName = profileData.response!.displayName!;

    const { data, status } = await adminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Renamed Chat",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBeTruthy();
    expect(data.response!.title).toBe("Renamed Chat");
    expect(data.response!.createdBy!.displayName).toBe(adminDisplayName);
  });

  test("PUT /api/2.0/ai/chats/:chatId - RoomAdmin renames a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: agentData } = await roomAdminApi.agents.createAgent({
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

    const startResponse = await roomAdminApi.chat.startNewChat(
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

    const { data: profileData } = await roomAdminApi.profiles.getSelfProfile();
    const roomAdminDisplayName = profileData.response!.displayName!;

    const { data, status } = await roomAdminApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Renamed Chat",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBeTruthy();
    expect(data.response!.title).toBe("Renamed Chat");
    expect(data.response!.createdBy!.displayName).toBe(roomAdminDisplayName);
  });

  test("PUT /api/2.0/ai/chats/:chatId - User renames a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const startResponse = await userApi.chat.startNewChat(
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

    const { data: profileData } = await userApi.profiles.getSelfProfile();
    const userDisplayName = profileData.response!.displayName!;

    const { data, status } = await userApi.chat.renameChat({
      chatId,
      renameChatBody: {
        name: "Renamed Chat",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBeTruthy();
    expect(data.response!.title).toBe("Renamed Chat");
    expect(data.response!.createdBy!.displayName).toBe(userDisplayName);
  });
});

test.describe("DELETE /api/2.0/ai/chats/:chatId - Delete AI chat", () => {
  test("DELETE /api/2.0/ai/chats/:chatId - Owner deletes a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const { status } = await ownerApi.chat.deleteChat({ chatId });

    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/ai/chats/:chatId - DocSpaceAdmin deletes a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: agentData } = await adminApi.agents.createAgent({
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

    const startResponse = await adminApi.chat.startNewChat(
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

    const { status } = await adminApi.chat.deleteChat({ chatId });

    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/ai/chats/:chatId - RoomAdmin deletes a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: agentData } = await roomAdminApi.agents.createAgent({
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

    const startResponse = await roomAdminApi.chat.startNewChat(
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

    const { status } = await roomAdminApi.chat.deleteChat({ chatId });

    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/ai/chats/:chatId - User deletes a chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const startResponse = await userApi.chat.startNewChat(
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

    const { status } = await userApi.chat.deleteChat({ chatId });

    expect(status).toBe(204);
  });
});

test.describe("PUT /api/2.0/ai/rooms/:roomId/chats/config - Set user chats settings", () => {
  test("PUT /api/2.0/ai/rooms/:roomId/chats/config - Owner sets user chats settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const { data: data1, status: status1 } =
      await ownerApi.chat.setUserChatsSettings({
        roomId: agentRoomId,
        setUserChatSettingsRequestBody: {
          webSearchEnabled: true,
          reasoningEffort: 2,
        },
      });

    expect(status1).toBe(200);
    expect(data1.response?.webSearchEnabled).toBe(true);
    expect(data1.response?.reasoningEffort).toBe(2);

    const { data: data2, status: status2 } =
      await ownerApi.chat.setUserChatsSettings({
        roomId: agentRoomId,
        setUserChatSettingsRequestBody: {
          webSearchEnabled: false,
          reasoningEffort: 0,
        },
      });

    expect(status2).toBe(200);
    expect(data2.response?.webSearchEnabled).toBe(false);
    expect(data2.response?.reasoningEffort).toBe(0);
  });

  test("PUT /api/2.0/ai/rooms/:roomId/chats/config - DocSpaceAdmin sets user chats settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: agentData } = await adminApi.agents.createAgent({
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

    const { data: data1, status: status1 } =
      await adminApi.chat.setUserChatsSettings({
        roomId: agentRoomId,
        setUserChatSettingsRequestBody: {
          webSearchEnabled: true,
          reasoningEffort: 2,
        },
      });

    expect(status1).toBe(200);
    expect(data1.response?.webSearchEnabled).toBe(true);
    expect(data1.response?.reasoningEffort).toBe(2);

    const { data: data2, status: status2 } =
      await adminApi.chat.setUserChatsSettings({
        roomId: agentRoomId,
        setUserChatSettingsRequestBody: {
          webSearchEnabled: false,
          reasoningEffort: 0,
        },
      });

    expect(status2).toBe(200);
    expect(data2.response?.webSearchEnabled).toBe(false);
    expect(data2.response?.reasoningEffort).toBe(0);
  });

  test("PUT /api/2.0/ai/rooms/:roomId/chats/config - RoomAdmin sets user chats settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: agentData } = await roomAdminApi.agents.createAgent({
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

    const { data: data1, status: status1 } =
      await roomAdminApi.chat.setUserChatsSettings({
        roomId: agentRoomId,
        setUserChatSettingsRequestBody: {
          webSearchEnabled: true,
          reasoningEffort: 2,
        },
      });

    expect(status1).toBe(200);
    expect(data1.response?.webSearchEnabled).toBe(true);
    expect(data1.response?.reasoningEffort).toBe(2);

    const { data: data2, status: status2 } =
      await roomAdminApi.chat.setUserChatsSettings({
        roomId: agentRoomId,
        setUserChatSettingsRequestBody: {
          webSearchEnabled: false,
          reasoningEffort: 0,
        },
      });

    expect(status2).toBe(200);
    expect(data2.response?.webSearchEnabled).toBe(false);
    expect(data2.response?.reasoningEffort).toBe(0);
  });
});

for (const userType of ["DocSpaceAdmin", "RoomAdmin", "User"] as UserType[]) {
  test.describe(`PUT /api/2.0/ai/rooms/:roomId/chats/config - ${userType} member sets user chats settings`, () => {
    test(`PUT /api/2.0/ai/rooms/:roomId/chats/config - ${userType} member sets user chats settings`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
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
          invitations: [{ id: memberId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data: data1, status: status1 } =
        await memberApi.chat.setUserChatsSettings({
          roomId: agentRoomId,
          setUserChatSettingsRequestBody: {
            webSearchEnabled: true,
            reasoningEffort: 2,
          },
        });

      expect(status1).toBe(200);
      expect(data1.response?.webSearchEnabled).toBe(true);
      expect(data1.response?.reasoningEffort).toBe(2);

      const { data: data2, status: status2 } =
        await memberApi.chat.setUserChatsSettings({
          roomId: agentRoomId,
          setUserChatSettingsRequestBody: {
            webSearchEnabled: false,
            reasoningEffort: 0,
          },
        });

      expect(status2).toBe(200);
      expect(data2.response?.webSearchEnabled).toBe(false);
      expect(data2.response?.reasoningEffort).toBe(0);
    });
  });
}

for (const userType of ["DocSpaceAdmin", "RoomAdmin"] as UserType[]) {
  test.describe(`PUT /api/2.0/ai/rooms/:roomId/chats/config - ${userType} as Agent Manager sets user chats settings`, () => {
    test(`PUT /api/2.0/ai/rooms/:roomId/chats/config - ${userType} as Agent Manager sets user chats settings`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
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
          invitations: [{ id: memberId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data: data1, status: status1 } =
        await memberApi.chat.setUserChatsSettings({
          roomId: agentRoomId,
          setUserChatSettingsRequestBody: {
            webSearchEnabled: true,
            reasoningEffort: 2,
          },
        });

      expect(status1).toBe(200);
      expect(data1.response?.webSearchEnabled).toBe(true);
      expect(data1.response?.reasoningEffort).toBe(2);

      const { data: data2, status: status2 } =
        await memberApi.chat.setUserChatsSettings({
          roomId: agentRoomId,
          setUserChatSettingsRequestBody: {
            webSearchEnabled: false,
            reasoningEffort: 0,
          },
        });

      expect(status2).toBe(200);
      expect(data2.response?.webSearchEnabled).toBe(false);
      expect(data2.response?.reasoningEffort).toBe(0);
    });
  });
}

test.describe("GET /api/2.0/ai/rooms/:roomId/chats - Get AI chats in a room", () => {
  test("GET /api/2.0/ai/rooms/:roomId/chats - Owner gets own chats in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    await ownerApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: { message: "What is 2+2? Answer in one word." },
      },
      { responseType: "stream" },
    );

    const { data, status } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThanOrEqual(1);

    const chat = data.response![0];
    expect(chat.id).toBeTruthy();
    expect(chat.createdOn).toBeDefined();
    expect(chat.modifiedOn).toBeDefined();
    expect(chat.createdBy).toBeDefined();
  });

  for (const userType of ["DocSpaceAdmin", "RoomAdmin", "User"] as UserType[]) {
    test(`GET /api/2.0/ai/rooms/:roomId/chats - ${userType} with ContentCreator role gets own chats in a room`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
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
          invitations: [{ id: memberId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      await memberApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: { message: "What is 2+2? Answer in one word." },
        },
        { responseType: "stream" },
      );

      const { data, status } = await memberApi.chat.getChats({
        roomId: agentRoomId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.length).toBeGreaterThanOrEqual(1);

      const chat = data.response![0];
      expect(chat.id).toBeTruthy();
      expect(chat.createdOn).toBeDefined();
      expect(chat.modifiedOn).toBeDefined();
      expect(chat.createdBy).toBeDefined();
    });
  }
});

test.describe("GET /api/2.0/ai/chats/:chatId/messages - Get messages of an AI chat", () => {
  test("GET /api/2.0/ai/chats/:chatId/messages - Owner gets messages of own chat", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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
    const chatId = chatsData.response![0].id!;

    const { data, status } = await ownerApi.chat.getMessages({ chatId });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBe(2);

    const userMessage = data.response!.find((m) => m.role === 0);
    const assistantMessage = data.response!.find((m) => m.role === 1);

    expect(userMessage).toBeDefined();
    expect(userMessage!.id).toBeGreaterThan(0);
    expect(userMessage!.createdOn).toBeDefined();
    expect(userMessage!.contents).toBeDefined();
    expect(userMessage!.contents![0].type).toBe(0);

    expect(assistantMessage).toBeDefined();
    expect(assistantMessage!.id).toBeGreaterThan(0);
    expect(assistantMessage!.createdOn).toBeDefined();
    expect(assistantMessage!.contents).toBeDefined();
    expect(assistantMessage!.contents![0].type).toBe(0);
  });

  for (const userType of ["DocSpaceAdmin", "RoomAdmin", "User"] as UserType[]) {
    test(`GET /api/2.0/ai/chats/:chatId/messages - ${userType} with ContentCreator role gets messages of own chat`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
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
          invitations: [{ id: memberId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      await memberApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: { message: "What is 2+2? Answer in one word." },
        },
        { responseType: "stream" },
      );

      const { data: chatsData } = await memberApi.chat.getChats({
        roomId: agentRoomId,
      });
      const chatId = chatsData.response![0].id!;

      const { data, status } = await memberApi.chat.getMessages({ chatId });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.length).toBe(2);

      const userMessage = data.response!.find((m) => m.role === 0);
      const assistantMessage = data.response!.find((m) => m.role === 1);

      expect(userMessage).toBeDefined();
      expect(userMessage!.id).toBeGreaterThan(0);
      expect(userMessage!.createdOn).toBeDefined();
      expect(userMessage!.contents).toBeDefined();
      expect(userMessage!.contents![0].type).toBe(0);

      expect(assistantMessage).toBeDefined();
      expect(assistantMessage!.id).toBeGreaterThan(0);
      expect(assistantMessage!.createdOn).toBeDefined();
      expect(assistantMessage!.contents).toBeDefined();
      expect(assistantMessage!.contents![0].type).toBe(0);
    });
  }
});

test.describe("GET /api/2.0/ai/rooms/:roomId/chats/config - Get user chats settings", () => {
  test("GET /api/2.0/ai/rooms/:roomId/chats/config - Owner gets user chats settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const { data, status } = await ownerApi.chat.getUserChatsSettings({
      roomId: agentRoomId,
    });

    expect(status).toBe(200);
    expect(data.response?.webSearchEnabled).toBe(true);
    expect(data.response?.reasoningEffort).toBe(0);
  });

  for (const userType of ["DocSpaceAdmin", "RoomAdmin", "User"] as UserType[]) {
    test(`GET /api/2.0/ai/rooms/:roomId/chats/config - ${userType} with ContentCreator role gets user chats settings`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
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
          invitations: [{ id: memberId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { data, status } = await memberApi.chat.getUserChatsSettings({
        roomId: agentRoomId,
      });

      expect(status).toBe(200);
      expect(data.response?.webSearchEnabled).toBe(true);
      expect(data.response?.reasoningEffort).toBe(0);
    });
  }

  for (const userType of ["DocSpaceAdmin", "RoomAdmin"] as UserType[]) {
    test(`GET /api/2.0/ai/rooms/:roomId/chats/config - ${userType} as Agent Manager gets user chats settings`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
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
          invitations: [{ id: memberId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data, status } = await memberApi.chat.getUserChatsSettings({
        roomId: agentRoomId,
      });

      expect(status).toBe(200);
      expect(data.response?.webSearchEnabled).toBe(true);
      expect(data.response?.reasoningEffort).toBe(0);
    });
  }
});

test.describe("POST /api/2.0/ai/chats/tool-permissions/:callId/decision - providePermission", () => {
  test("POST /api/2.0/ai/chats/tool-permissions/:callId/decision - Owner provides permission for tool execution", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
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

    const { status } = await ownerApi.chat.providePermission({
      callId,
      toolDecisionRequestBody: {
        decision: ToolExecutionDecision.Allow,
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/chats/tool-permissions/:callId/decision - DocSpaceAdmin provides permission for tool execution", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: agentData } = await adminApi.agents.createAgent({
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

    const { data: myFolderData } = await adminApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const startResponse = await adminApi.chat.startNewChat(
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

    const { status } = await adminApi.chat.providePermission({
      callId,
      toolDecisionRequestBody: {
        decision: ToolExecutionDecision.Allow,
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/chats/tool-permissions/:callId/decision - RoomAdmin provides permission for tool execution", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: agentData } = await roomAdminApi.agents.createAgent({
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

    const { data: myFolderData } = await roomAdminApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const startResponse = await roomAdminApi.chat.startNewChat(
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

    const { status } = await roomAdminApi.chat.providePermission({
      callId,
      toolDecisionRequestBody: {
        decision: ToolExecutionDecision.Allow,
      },
    });

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/ai/chats/:chatId/messages/export - Export AI chat messages", () => {
  test("POST /api/2.0/ai/chats/:chatId/messages/export - Owner exports chat to My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Export Chat Agent",
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
        startNewChatBody: { message: "What is 2+2? Answer in one word." },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const myDocsFolderId = myFolderData.response!.current!.id!;
    const exportTitle = apiSdk.faker.generateString(10);

    const { status } = await ownerApi.chat.exportChat({
      chatId,
      exportChatRequestBody: {
        folderId: myDocsFolderId,
        title: exportTitle,
      },
    });

    expect(status).toBe(200);

    await expect(async () => {
      const { data: folderData } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      const exportedFile = folderData.response!.files?.find(
        (f) => f.title === `${exportTitle}.docx`,
      );
      expect(exportedFile).toBeDefined();
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
  });

  for (const userType of ["DocSpaceAdmin", "RoomAdmin", "User"] as UserType[]) {
    test(`POST /api/2.0/ai/chats/:chatId/messages/export - ${userType} exports chat to My Documents`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Export Chat Agent",
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
          invitations: [{ id: memberId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const startResponse = await memberApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: { message: "What is 2+2? Answer in one word." },
        },
        { responseType: "stream", timeout: 5000 },
      );
      const { messageStart } = parseSseEvents(startResponse.data);
      const chatId = messageStart!.data.chatId;

      const { data: myFolderData } = await memberApi.folders.getMyFolder({});
      const myDocsFolderId = myFolderData.response!.current!.id!;
      const exportTitle = apiSdk.faker.generateString(10);

      const { status } = await memberApi.chat.exportChat({
        chatId,
        exportChatRequestBody: {
          folderId: myDocsFolderId,
          title: exportTitle,
        },
      });

      expect(status).toBe(200);

      await expect(async () => {
        const { data: folderData } =
          await memberApi.folders.getFolderByFolderId({
            folderId: myDocsFolderId,
          });
        const exportedFile = folderData.response!.files?.find(
          (f) => f.title === `${exportTitle}.docx`,
        );
        expect(exportedFile).toBeDefined();
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  }
});

test.describe("GET /api/2.0/ai/chats/:chatId - Get AI chat by ID", () => {
  test("GET /api/2.0/ai/chats/:chatId - Owner gets chat metadata", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Chat Agent",
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
        startNewChatBody: { message: "What is 2+2? Answer in one word." },
      },
      { responseType: "stream", timeout: 5000 },
    );
    const { messageStart } = parseSseEvents(startResponse.data);
    const chatId = messageStart!.data.chatId;

    const { data, status } = await ownerApi.chat.getChat({ chatId });

    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    expect(status).toBe(200);
    expect(data.response?.id).toBe(chatId);
    expect(data.response?.title).toBeTruthy();
    expect(data.response?.createdOn).toBeDefined();
    expect(data.response?.modifiedOn).toBeDefined();
    expect(data.response?.createdBy?.id).toBeDefined();
    expect(data.response?.createdBy?.displayName).toBe(ownerDisplayName);
  });
});

for (const userType of ["DocSpaceAdmin", "RoomAdmin", "User"] as UserType[]) {
  test.describe(`GET /api/2.0/ai/chats/:chatId - ${userType} gets chat metadata`, () => {
    test(`GET /api/2.0/ai/chats/:chatId - ${userType} gets chat metadata`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
      });
      const providerId = providerData.response!.id!;

      const { data: agentData } = await ownerApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Get Chat Agent",
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
          invitations: [{ id: memberId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const startResponse = await memberApi.chat.startNewChat(
        {
          roomId: agentRoomId,
          startNewChatBody: { message: "What is 2+2? Answer in one word." },
        },
        { responseType: "stream", timeout: 5000 },
      );
      const { messageStart } = parseSseEvents(startResponse.data);
      const chatId = messageStart!.data.chatId;

      const { data: profileData } = await memberApi.profiles.getSelfProfile();
      const memberDisplayName = profileData.response!.displayName!;

      const { data, status } = await memberApi.chat.getChat({ chatId });

      expect(status).toBe(200);
      expect(data.response?.id).toBe(chatId);
      expect(data.response?.title).toBeTruthy();
      expect(data.response?.createdOn).toBeDefined();
      expect(data.response?.modifiedOn).toBeDefined();
      expect(data.response?.createdBy?.id).toBeDefined();
      expect(data.response?.createdBy?.displayName).toBe(memberDisplayName);
    });
  });
}

test.describe("GET /api/2.0/ai/chats/models - Get available AI chat models", () => {
  test("GET /api/2.0/ai/chats/models - Owner gets models filtered by provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.chat.getChatModels({
      provider: providerId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.length).toBeGreaterThan(0);

    const model = data.response![0] as any;
    expect(model.providerId).toBe(providerId);
    expect(model.providerTitle).toBe(provider.title);
    expect(model.modelId).toBe(provider.modelId);
  });
});

for (const userType of ["DocSpaceAdmin", "RoomAdmin"] as UserType[]) {
  test.describe(`GET /api/2.0/ai/chats/models - ${userType} gets models filtered by provider`, () => {
    test(`GET /api/2.0/ai/chats/models - ${userType} gets models filtered by provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        createProviderRequestDto: toCreateDto(provider),
      });
      const providerId = providerData.response!.id!;

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.chat.getChatModels({
        provider: providerId,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.length).toBeGreaterThan(0);

      const model = data.response![0] as any;
      expect(model.providerId).toBe(providerId);
      expect(model.providerTitle).toBe(provider.title);
      expect(model.modelId).toBe(provider.modelId);
    });
  });
}
