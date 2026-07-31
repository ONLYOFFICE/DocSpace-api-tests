import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat, AgentRole } from "@/src/helpers/ai-agent-chat";
import { UserType } from "@/src/services/api-sdk";

// Chat moved off `/ai/rooms/{roomId}/chats` (404) onto threads:
//
//   POST   /ai/threads/create            { title, profileId, entityId }
//   GET    /ai/threads/list?entityId=    threads for one agent (empty without it)
//   GET    /ai/threads/get-by-id?threadId=
//   PUT    /ai/threads/rename            { threadId, title }
//   DELETE /ai/threads/delete            { threadId }
//   DELETE /ai/threads/clear-messages    { threadId }
//   POST   /ai/threads/touch             { threadId }
//   POST   /ai/threads/append-user-message
//   POST   /ai/ai/send-with-stream       -> assistant reply arrives async
//   GET    /ai/threads/read-messages?threadId=
//
// Gone with no replacement: per-room chat config (`/ai/rooms/{id}/chats/config`)
// and the model catalogue (`/ai/chats/models`, now `/ai/profiles/list`). Chat
// export is `/ai/text-to-docx`, covered in the messages suite. Tool-permission
// decisions moved to `/ai/ai/approve-tool-call` and belong with the tools suite.

const MEMBER_ROLES: Array<{ label: string; type: UserType; role: AgentRole }> =
  [
    { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
    { label: "User", type: "User", role: "user" },
  ];

test.describe("POST /api/2.0/ai/threads/create - Start a chat", () => {
  test("POST /api/2.0/ai/threads/create - Owner starts a new thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });

    const { status, threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    expect(status).toBe(200);
    expect(threadId).toBeTruthy();

    const { data } = await aiChat.getThread("owner", threadId);
    expect(data?.title).toBe("Autotest thread");
    expect(data?.profileId).toBe(profileId);
  });

  for (const { label, type, role } of MEMBER_ROLES) {
    test(`POST /api/2.0/ai/threads/create - ${label} invited to the agent starts a thread`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Chat Agent",
        profileId,
      });

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );

      const { status: shareStatus } = await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [
            {
              id: memberData.response!.id!,
              access: FileShare.ContentCreator,
            },
          ],
          notify: false,
        },
      });
      expect(shareStatus).toBe(200);

      const { status, threadId } = await aiChat.createThread(role, {
        title: "Member thread",
        profileId,
        agentId,
      });

      expect(status).toBe(200);
      expect(threadId).toBeTruthy();
    });
  }
});

test.describe("POST /api/2.0/ai/ai/send-with-stream - Talk to an agent", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - Owner gets an assistant reply", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
      prompt: "You are a helpful test assistant. Keep answers very short.",
    });
    const { threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const { status } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "What is 2+2? Answer in one word.",
    });
    expect(status).toBe(200);

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const reply = AiAgentChat.assistantText(messages);

    expect(messages.some((message) => message.role === "user")).toBe(true);
    expect(messages.some((message) => message.role === "assistant")).toBe(true);
    expect(reply.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - Owner continues an existing thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
      prompt: "You are a helpful test assistant. Keep answers very short.",
    });
    const { threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "What is 2+2? Answer in one word.",
    });
    await aiChat.waitForAssistantReply("owner", threadId);

    const { status } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "And what is 3+3? Answer in one word.",
    });
    expect(status).toBe(200);

    // Poll until the second exchange has landed too.
    let messages = await aiChat.readMessages("owner", threadId);
    for (let attempt = 0; attempt < 40; attempt++) {
      messages = await aiChat.readMessages("owner", threadId);
      if (messages.data.filter((m) => m.role === "assistant").length >= 2) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const userMessages = messages.data.filter((m) => m.role === "user");
    const assistantMessages = messages.data.filter(
      (m) => m.role === "assistant",
    );

    expect(userMessages).toHaveLength(2);
    expect(assistantMessages.length).toBeGreaterThanOrEqual(2);
  });

  for (const { label, type, role } of MEMBER_ROLES) {
    test(`POST /api/2.0/ai/ai/send-with-stream - ${label} invited to the agent gets a reply`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Chat Agent",
        profileId,
        prompt: "You are a helpful test assistant. Keep answers very short.",
      });

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [
            {
              id: memberData.response!.id!,
              access: FileShare.ContentCreator,
            },
          ],
          notify: false,
        },
      });

      const { threadId } = await aiChat.createThread(role, {
        title: "Member thread",
        profileId,
        agentId,
      });

      const { status } = await aiChat.sendMessage(role, {
        threadId,
        profileId,
        agentId,
        message: "What is 2+2? Answer in one word.",
      });
      expect(status).toBe(200);

      const messages = await aiChat.waitForAssistantReply(role, threadId);

      expect(messages.some((message) => message.role === "assistant")).toBe(
        true,
      );
    });
  }
});

test.describe("Thread management", () => {
  test("GET /api/2.0/ai/threads/list - lists threads of one agent only", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstAgent = await aiChat.createAgentId("owner", {
      title: "Agent One",
      profileId,
    });
    const secondAgent = await aiChat.createAgentId("owner", {
      title: "Agent Two",
      profileId,
    });

    const first = await aiChat.createThread("owner", {
      title: "Thread in agent one",
      profileId,
      agentId: firstAgent,
    });
    const second = await aiChat.createThread("owner", {
      title: "Thread in agent two",
      profileId,
      agentId: secondAgent,
    });

    const { data, status } = await aiChat.listThreads("owner", firstAgent);
    const ids = (data ?? []).map((thread) => thread.threadId);

    expect(status).toBe(200);
    expect(ids).toContain(first.threadId);
    expect(ids).not.toContain(second.threadId);
  });

  test("GET /api/2.0/ai/threads/list - returns nothing without an entityId", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The list is entity-scoped: an unfiltered call is not "all my threads".
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const { data, status } = await aiChat.listThreads("owner");

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  test("PUT /api/2.0/ai/threads/rename - Owner renames a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const { threadId } = await aiChat.createThread("owner", {
      title: "Original title",
      profileId,
      agentId,
    });

    const { data, status } = await aiChat.renameThread(
      "owner",
      threadId,
      "Renamed thread",
    );

    const { data: after } = await aiChat.getThread("owner", threadId);

    expect(after?.title).toBe("Renamed thread");
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/ai/threads/delete - Owner deletes a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const { threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const { data, status } = await aiChat.deleteThread("owner", threadId);

    const { data: list } = await aiChat.listThreads("owner", agentId);

    expect((list ?? []).map((thread) => thread.threadId)).not.toContain(
      threadId,
    );
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/ai/threads/clear-messages - Owner clears a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const { threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "Something to clear",
    });
    const before = await aiChat.readMessages("owner", threadId);
    expect(before.data.length).toBeGreaterThan(0);

    const { data, status } = await aiChat.clearThreadMessages(
      "owner",
      threadId,
    );

    const after = await aiChat.readMessages("owner", threadId);

    expect(after.data).toEqual([]);
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/threads/append-user-message - stores a message without an answer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const { threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const { status } = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "Just recording this",
    });

    const { data } = await aiChat.readMessages("owner", threadId);

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].role).toBe("user");
    expect(AiAgentChat.messageText(data[0])).toBe("Just recording this");
  });

  test("POST /api/2.0/ai/threads/touch - Owner touches a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const { threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const { data, status } = await aiChat.touchThread("owner", threadId);

    expect(status).toBe(200);
    expect(data?.success).toBe(true);
  });
});

test.describe("GET /api/2.0/ai/profiles/list - Model catalogue", () => {
  // Replaces the removed GET /ai/chats/models.
  test("GET /api/2.0/ai/profiles/list - Owner gets the profile catalogue", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profiles = await aiChat.listProfiles("owner");

    expect(profiles.length).toBeGreaterThan(0);
    for (const profile of profiles) {
      expect(profile.id).toBeTruthy();
      expect(profile.modelId).toBeTruthy();
    }
  });
});
