import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, ToolExecutionDecision } from "@onlyoffice/docspace-api-sdk";
import { aiProviders } from "@/src/helpers/ai-providers";
import { parseSseEvents } from "@/src/helpers/parse-sse-events";
import { UserType } from "@/src/services/api-sdk";

const provider = aiProviders.openAi;

test.describe("POST /api/2.0/ai/rooms/:roomId/chats - Start new AI chat", () => {
  test("POST /api/2.0/ai/rooms/:roomId/chats - Owner starts a new chat", async ({
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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

    const { status } = await ownerApi.chat.deleteChat({ chatId });

    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/ai/chats/:chatId - DocSpaceAdmin deletes a chat", async ({
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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

test.describe("POST /api/2.0/ai/chats/tool-permissions/:callId/decision - providePermission", () => {
  test("POST /api/2.0/ai/chats/tool-permissions/:callId/decision - Owner provides permission for tool execution", async ({
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
