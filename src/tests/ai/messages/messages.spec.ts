import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, FolderType } from "@onlyoffice/docspace-api-sdk";
import { aiProviders } from "@/src/helpers/ai-providers";

const provider = aiProviders.deepSeek;

test.describe("AI Messages - Export", () => {
  test("POST /api/2.0/ai/messages/:messageId/export - Owner exports AI message to My Documents", async ({
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
        title: "Export Test Agent",
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

    ownerApi.chat
      .startNewChat({
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      })
      .catch(() => {});

    // Wait for the AI to generate a response
    await new Promise((r) => setTimeout(r, 5000));

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

    const { status: exportStatus } = await ownerApi.messages.exportMessage({
      messageId,
      exportMessageRequestBodyInteger: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(exportStatus).toBe(200);
  });

  test("POST /api/2.0/ai/messages/:messageId/export - DocSpaceAdmin exports AI message to My Documents", async ({
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

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: agentData } = await adminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Export Test Agent",
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

    adminApi.chat
      .startNewChat({
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      })
      .catch(() => {});

    // Wait for the AI to generate a response
    await new Promise((r) => setTimeout(r, 5000));

    const { data: chatsData } = await adminApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await adminApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await adminApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { status: exportStatus } = await adminApi.messages.exportMessage({
      messageId,
      exportMessageRequestBodyInteger: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(exportStatus).toBe(200);
  });

  test("POST /api/2.0/ai/messages/:messageId/export - RoomAdmin exports AI message to My Documents", async ({
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
        title: "Export Test Agent",
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

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    roomAdminApi.chat
      .startNewChat({
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      })
      .catch(() => {});

    // Wait for the AI to generate a response
    await new Promise((r) => setTimeout(r, 5000));

    const { data: chatsData } = await roomAdminApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await roomAdminApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await roomAdminApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { status: exportStatus } = await roomAdminApi.messages.exportMessage({
      messageId,
      exportMessageRequestBodyInteger: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(exportStatus).toBe(200);
  });

  test("POST /api/2.0/ai/messages/:messageId/export - User exports AI message to My Documents", async ({
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
        title: "Export Test Agent",
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

    userApi.chat
      .startNewChat({
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      })
      .catch(() => {});

    // Wait for the AI to generate a response
    await new Promise((r) => setTimeout(r, 5000));

    const { data: chatsData } = await userApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await userApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    const { data: myFolderData } = await userApi.folders.getMyFolder({});
    const myFolderId = myFolderData.response!.current!.id!;

    const { status: exportStatus } = await userApi.messages.exportMessage({
      messageId,
      exportMessageRequestBodyInteger: {
        folderId: myFolderId,
        title: "Exported AI Message",
      },
    });

    expect(exportStatus).toBe(200);
  });

  test("POST /api/2.0/ai/messages/:messageId/export - Guest exports AI message to Result Storage", async ({
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
        title: "Export Test Agent",
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

    // Owner starts chat and retrieves messageId
    ownerApi.chat
      .startNewChat({
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      })
      .catch(() => {});

    await new Promise((r) => setTimeout(r, 5000));

    const { data: chatsData } = await ownerApi.chat.getChats({
      roomId: agentRoomId,
    });
    const chatId = chatsData.response![0].id!;

    const { data: messagesData } = await ownerApi.chat.getMessages({
      chatId,
    });
    const aiMessage = messagesData.response!.find((m) => m.role === 1);
    const messageId = aiMessage!.id!;

    // Get Result Storage folder from agent room
    const { data: foldersData } = await ownerApi.folders.getFolders({
      folderId: agentRoomId,
    });
    const folders = foldersData.response as any[];
    const resultStorageFolder = folders.find(
      (f: any) => f.type === FolderType.ResultStorage,
    );
    const resultStorageFolderId = resultStorageFolder.id;

    // Create guest, add to agent room, then authenticate
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

    const { status: exportStatus } = await guestApi.messages.exportMessage({
      messageId,
      exportMessageRequestBodyInteger: {
        folderId: resultStorageFolderId,
        title: "Exported AI Message",
      },
    });

    expect(exportStatus).toBe(200);
  });
});
