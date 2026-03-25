import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { aiProviders } from "@/src/helpers/ai-providers";

const provider = aiProviders.deepSeek;

test.describe("AI Messages - Export Permissions (not a member of agent)", () => {
  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - DocSpaceAdmin cannot export message without being in agent",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.messages.exportMessage({
        messageId,
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });
      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );

  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - RoomAdmin cannot export message without being in agent",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data, status } = await roomAdminApi.messages.exportMessage({
        messageId,
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );

  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - User cannot export message without being in agent",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { data, status } = await userApi.messages.exportMessage({
        messageId,
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );

  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - Guest cannot export message without being in agent",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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

      const { userData: guestUserData } = await apiSdk.addMember(
        "owner",
        "Guest",
      );
      const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

      const { data, status } = await guestApi.messages.exportMessage({
        messageId,
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );
});

test.describe("AI Messages - Export Permissions (Viewer in agent)", () => {
  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - DocSpaceAdmin with Viewer role cannot export message",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );

  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - RoomAdmin with Viewer role cannot export message",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );

  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - User with Viewer role cannot export message",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );

  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - Guest with Viewer role cannot export message",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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

      const { data: guestData, userData: guestUserData } =
        await apiSdk.addMember("owner", "Guest");
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
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe(
        "The specified message was not found or the current user does not have access to it",
      );
    },
  );
});

test.describe("AI Messages - Export Validation", () => {
  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - returns 400 for messageId = 0",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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

      await new Promise((r) => setTimeout(r, 5000));

      const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
      const myFolderId = myFolderData.response!.current!.id!;

      const { data, status } = await ownerApi.messages.exportMessage({
        messageId: 0,
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });
      expect(status).toBe(400);
      expect((data as any).error.message).toBe(
        "The message identifier is invalid (must be greater than 0)",
      );
    },
  );

  test.fail(
    "POST /api/2.0/ai/messages/:messageId/export - returns 400 for messageId = -1",
    async ({ apiSdk }) => {
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
            prompt:
              "You are a helpful test assistant. Keep answers very short.",
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

      await new Promise((r) => setTimeout(r, 5000));

      const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
      const myFolderId = myFolderData.response!.current!.id!;

      const { data, status } = await ownerApi.messages.exportMessage({
        messageId: -1,
        exportMessageRequestBodyInteger: {
          folderId: myFolderId,
          title: "Exported AI Message",
        },
      });

      expect(status).toBe(400);
      expect((data as any).error.message).toBe(
        "The message identifier is invalid (must be greater than 0)",
      );
    },
  );
});

test.describe("AI Messages - Export Unauthorized", () => {
  test("POST /api/2.0/ai/messages/:messageId/export - Anonymous user gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonymousApi = apiSdk.forAnonymous();

    const { status } = await anonymousApi.messages.exportMessage({
      messageId: 1,
      exportMessageRequestBodyInteger: {
        folderId: 1,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(401);
  });
});