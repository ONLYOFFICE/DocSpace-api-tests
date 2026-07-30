import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat, AgentRole } from "@/src/helpers/ai-agent-chat";
import { UserType } from "@/src/services/api-sdk";

// Threads are per-user, not per-room: even a ContentCreator in the agent room
// cannot see or touch another member's thread. That replaces the old
// BUG 80791 / 80797 / 80801 matrices, which were about chats owned by the room.
//
// Anonymous checks live in their own tests on purpose. `apiSdk.request` is a
// shared context whose session cookie outranks the bearer header, so once any
// member has authenticated in a test, dropping the header no longer produces an
// anonymous request.

const NON_OWNER_ROLES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
  { type: "Guest", role: "guest" },
];

test.describe("Threads - access control for non-members", () => {
  test("POST /api/2.0/ai/threads/create - DocSpaceAdmin not in the agent cannot start a thread", async ({
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

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status, error } = await aiChat.createThread("docSpaceAdmin", {
      title: "Uninvited thread",
      profileId,
      agentId,
    });

    // Nothing was created for that agent.
    const { data: list } = await aiChat.listThreads("docSpaceAdmin", agentId);
    expect(list).toEqual([]);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  // DocSpaceAdmin gets a clean 403 (above); every other role crashes the
  // handler instead of being refused.
  for (const { type, role } of NON_OWNER_ROLES.filter(
    (entry) => entry.role !== "docSpaceAdmin",
  )) {
    test(`BUG XXXXX: POST /api/2.0/ai/threads/create - ${role} not in the agent gets 500 instead of 403`, async ({
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

      await apiSdk.addAuthenticatedMember("owner", type);

      const { status } = await aiChat.createThread(role, {
        title: "Uninvited thread",
        profileId,
        agentId,
      });

      // Whatever the status, no thread may appear for an outsider.
      const { data: list } = await aiChat.listThreads(role, agentId);
      expect(list).toEqual([]);

      // Refusing an outsider is a 403, not an Internal Server Error.
      test.fail();
      expect(status).toBe(403);
    });
  }
});

test.describe("Threads - isolation between members of the same agent", () => {
  for (const { type, role } of NON_OWNER_ROLES.filter(
    (entry) => entry.role !== "guest",
  )) {
    test(`GET /api/2.0/ai/threads/get-by-id - ${role} invited to the agent cannot read Owner's thread`, async ({
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
      const owners = await aiChat.createThread("owner", {
        title: "Owner thread",
        profileId,
        agentId,
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

      const { status, error } = await aiChat.getThread(role, owners.threadId);

      // The member's own list stays empty — the owner's thread is not theirs.
      const { data: list } = await aiChat.listThreads(role, agentId);
      expect(list).toEqual([]);

      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });

    test(`GET /api/2.0/ai/threads/read-messages - ${role} invited to the agent cannot read Owner's messages`, async ({
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
      const owners = await aiChat.createThread("owner", {
        title: "Owner thread",
        profileId,
        agentId,
      });
      await aiChat.appendUserMessage("owner", {
        threadId: owners.threadId,
        profileId,
        text: "A private note",
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

      const { status, data, error } = await aiChat.readMessages(
        role,
        owners.threadId,
      );

      expect(data).toEqual([]);
      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });

    test(`PUT /api/2.0/ai/threads/rename - ${role} invited to the agent cannot rename Owner's thread`, async ({
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
      const owners = await aiChat.createThread("owner", {
        title: "Owner thread",
        profileId,
        agentId,
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

      const { status, error } = await aiChat.renameThread(
        role,
        owners.threadId,
        "Hacked title",
      );

      await apiSdk.authenticateOwner();
      const { data: after } = await aiChat.getThread("owner", owners.threadId);
      expect(after?.title).toBe("Owner thread");

      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });

    test(`DELETE /api/2.0/ai/threads/delete - ${role} invited to the agent cannot delete Owner's thread`, async ({
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
      const owners = await aiChat.createThread("owner", {
        title: "Owner thread",
        profileId,
        agentId,
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

      const { status, error } = await aiChat.deleteThread(
        role,
        owners.threadId,
      );

      await apiSdk.authenticateOwner();
      const { data: list } = await aiChat.listThreads("owner", agentId);
      expect((list ?? []).map((thread) => thread.threadId)).toContain(
        owners.threadId,
      );

      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });
  }
});

test.describe("Threads - anonymous access", () => {
  test("POST /api/2.0/ai/threads/create - Anonymous gets 401", async ({
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

    const { status, error } = await aiChat.createThread("anonymous", {
      title: "Anonymous thread",
      profileId,
      agentId,
    });

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("GET /api/2.0/ai/threads/get-by-id - Anonymous gets 401", async ({
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
      title: "Owner thread",
      profileId,
      agentId,
    });

    const { status, error } = await aiChat.getThread("anonymous", threadId);

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - Anonymous gets 401", async ({
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
      title: "Owner thread",
      profileId,
      agentId,
    });

    const { status } = await aiChat.sendMessage("anonymous", {
      threadId,
      profileId,
      agentId,
      message: "Hello",
    });

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/ai/threads/delete - Anonymous gets 401", async ({
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
      title: "Owner thread",
      profileId,
      agentId,
    });

    const { status, error } = await aiChat.deleteThread("anonymous", threadId);

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("GET /api/2.0/ai/profiles/list - Anonymous gets nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profiles = await aiChat.listProfiles("anonymous");

    expect(profiles).toEqual([]);
  });
});

test.describe("Threads - validation", () => {
  test("GET /api/2.0/ai/threads/get-by-id - a malformed threadId is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status } = await aiChat.getThread("owner", "abc");

    expect(status).toBe(400);
  });

  test("BUG XXXXX: GET /api/2.0/ai/threads/get-by-id - an unknown threadId returns 200 with an empty body instead of 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status } = await aiChat.getThread(
      "owner",
      "019f0000-0000-7000-8000-000000000000",
    );

    test.fail();
    expect(status).toBe(404);
  });

  test("BUG XXXXX: POST /api/2.0/ai/threads/create - a non-existent agent id is accepted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    // A thread is happily created against an agent that does not exist.
    const { status } = await aiChat.createThread("owner", {
      title: "Orphan thread",
      profileId,
      agentId: 999999999,
    });

    test.fail();
    expect(status).toBe(404);
  });

  test("BUG XXXXX: POST /api/2.0/ai/ai/send-with-stream - an empty message is accepted", async ({
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

    const { status } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "",
    });

    test.fail();
    expect(status).toBe(400);
  });

  test("BUG XXXXX: POST /api/2.0/ai/ai/send-with-stream - an unknown thread reports the failure inside a 200", async ({
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

    const { status } = await aiChat.sendMessage("owner", {
      threadId: "019f0000-0000-7000-8000-000000000000",
      profileId,
      agentId,
      message: "Hello",
    });

    // The body carries {"type":"error","message":"stream error"} under a 200.
    test.fail();
    expect(status).toBe(404);
  });
});
