import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";

// Driven through AiAgentChat rather than the SDK's AgentsApi: the SDK still
// points at `/internal/ai/integration/agents`, which nginx answers with 405.
// See the route map in src/helpers/ai-agent-chat.ts.
//
// Contract changes since these tests were first written:
//   * `providerId` + `modelId` are gone. An agent references a profile from
//     GET /ai/profiles/list via a `profileId` UUID.
//   * create takes a flat `prompt`; update takes a nested `chatSettings.prompt`.
//   * errors are `{"error":"..."}` — no `statusCode`, no `error.message`.

test.describe("POST /ai/agents - Create AI agent", () => {
  test("POST /ai/agents - Owner creates an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data, status } = await aiChat.createAgent("owner", {
      title: "Autotest Agent",
      tags: ["autotest"],
      profileId,
      prompt: "You are a test assistant",
    });

    expect(status).toBe(200);
    expect(data?.response?.title).toBe("Autotest Agent");
    expect(data?.response?.roomType).toBe(RoomType.AiRoom);
    expect(data?.response?.tags).toContain("autotest");
    expect(data?.response?.chatSettings?.prompt).toBe(
      "You are a test assistant",
    );
  });

  test("POST /ai/agents - DocSpace Admin creates an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await aiChat.createAgent("docSpaceAdmin", {
      title: "Autotest Agent",
      tags: ["autotest"],
      profileId,
      prompt: "You are a test assistant",
    });

    expect(status).toBe(200);
    expect(data?.response?.title).toBe("Autotest Agent");
    expect(data?.response?.roomType).toBe(RoomType.AiRoom);
    expect(data?.response?.chatSettings?.prompt).toBe(
      "You are a test assistant",
    );
  });

  test("POST /ai/agents - Room Admin creates an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await aiChat.createAgent("roomAdmin", {
      title: "Autotest Agent",
      tags: ["autotest"],
      profileId,
      prompt: "You are a test assistant",
    });

    expect(status).toBe(200);
    expect(data?.response?.title).toBe("Autotest Agent");
    expect(data?.response?.roomType).toBe(RoomType.AiRoom);
    expect(data?.response?.chatSettings?.prompt).toBe(
      "You are a test assistant",
    );
  });
});

test.describe("POST /ai/agents - Create AI agent validation", () => {
  // Replaces the old modelId-validation tests (BUG 80650): there is no modelId
  // any more, and the profileId that took its place IS validated.
  test("POST /ai/agents - Owner cannot create an agent with a malformed profileId", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiChat.createAgent("owner", {
      title: "Autotest Invalid Profile Agent",
      profileId: "invalid-nonexistent-profile-123",
      prompt: "You are a test assistant",
    });

    expect(error).toBe("profileId must be a UUID");
    expect(status).toBe(400);
  });

  test("POST /ai/agents - Owner cannot create an agent without a profileId", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiChat.createAgent("owner", {
      title: "Autotest No Profile Agent",
      prompt: "You are a test assistant",
    });

    expect(error).toBe("profileId is required and must be a string");
    expect(status).toBe(400);
  });

  test("POST /ai/agents - Owner cannot create an agent without a prompt", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { status, error } = await aiChat.createAgent("owner", {
      title: "Autotest No Prompt Agent",
      profileId,
    });

    expect(error).toBe("prompt is required and must be a string");
    expect(status).toBe(400);
  });

  test("POST /ai/agents - Room Admin creates an agent with an oversized prompt and the agent stays usable", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const oversizedPrompt = "A".repeat(100000);

    const { data, status } = await aiChat.createAgent("roomAdmin", {
      title: "Autotest Oversized Prompt Agent",
      profileId,
      prompt: oversizedPrompt,
    });

    expect(status).toBe(200);
    const agentId = data!.response!.id!;

    // The agent must still be readable, with the prompt stored in full.
    const { data: info, status: infoStatus } = await aiChat.getAgentInfo(
      "roomAdmin",
      agentId,
    );

    expect(infoStatus).toBe(200);
    expect(info?.response?.chatSettings?.prompt).toHaveLength(
      oversizedPrompt.length,
    );
  });
});

test.describe("GET /ai/agents - Get AI agents", () => {
  test("GET /ai/agents - Owner creates an agent and verifies it in agent list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Listed Agent",
      profileId,
    });

    const { data, status } = await aiChat.getAgents("owner");

    expect(status).toBe(200);
    expect(data?.response?.folders?.map((folder) => folder.id)).toContain(
      agentId,
    );
  });

  test("GET /ai/agents - DocSpace Admin sees an agent created by Owner", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Listed Agent",
      profileId,
    });

    const { data, status } = await aiChat.getAgents("docSpaceAdmin");

    expect(status).toBe(200);
    expect(data?.response?.folders?.map((folder) => folder.id)).toContain(
      agentId,
    );
  });

  // A Guest can only be invited with Read — ContentCreator/Editing/RoomManager
  // all come back 403 "The role is not available for this user type".
  for (const { label, type, role, access } of [
    {
      label: "Room Admin",
      type: "RoomAdmin",
      role: "roomAdmin",
      access: FileShare.ContentCreator,
    },
    {
      label: "User",
      type: "User",
      role: "user",
      access: FileShare.ContentCreator,
    },
    { label: "Guest", type: "Guest", role: "guest", access: FileShare.Read },
  ] as const) {
    test(`GET /ai/agents - ${label} added to agent room sees the agent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Shared Agent",
        profileId,
      });

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );

      const { status: shareStatus } = await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [{ id: memberData.response!.id!, access }],
          notify: false,
        },
      });
      expect(shareStatus).toBe(200);

      const { data, status } = await aiChat.getAgents(role);

      expect(status).toBe(200);
      expect(data?.response?.folders?.map((folder) => folder.id)).toContain(
        agentId,
      );
    });
  }
});

test.describe("GET /ai/agents/:id - Get AI agent info", () => {
  test("GET /ai/agents/:id - Owner creates an agent and gets its info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Info Agent",
      profileId,
      prompt: "You are a test assistant",
    });

    const { data, status } = await aiChat.getAgentInfo("owner", agentId);

    expect(status).toBe(200);
    expect(data?.response?.id).toBe(agentId);
    expect(data?.response?.title).toBe("Autotest Info Agent");
    expect(data?.response?.roomType).toBe(RoomType.AiRoom);
    expect(data?.response?.chatSettings?.prompt).toBe(
      "You are a test assistant",
    );
  });

  test("GET /ai/agents/:id - DocSpace Admin gets info about agent created by Owner", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Info Agent",
      profileId,
    });

    const { data, status } = await aiChat.getAgentInfo(
      "docSpaceAdmin",
      agentId,
    );

    expect(status).toBe(200);
    expect(data?.response?.id).toBe(agentId);
  });

  // A Guest can only be invited with Read — ContentCreator/Editing/RoomManager
  // all come back 403 "The role is not available for this user type".
  for (const { label, type, role, access } of [
    {
      label: "Room Admin",
      type: "RoomAdmin",
      role: "roomAdmin",
      access: FileShare.ContentCreator,
    },
    {
      label: "User",
      type: "User",
      role: "user",
      access: FileShare.ContentCreator,
    },
    { label: "Guest", type: "Guest", role: "guest", access: FileShare.Read },
  ] as const) {
    test(`GET /ai/agents/:id - ${label} added to agent room gets agent info`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Shared Agent",
        profileId,
      });

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );

      const { status: shareStatus } = await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [{ id: memberData.response!.id!, access }],
          notify: false,
        },
      });
      expect(shareStatus).toBe(200);

      const { data, status } = await aiChat.getAgentInfo(role, agentId);

      expect(status).toBe(200);
      expect(data?.response?.id).toBe(agentId);
    });
  }

  test("GET /ai/agents/:id - Owner gets 404 for a non-existent agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status } = await aiChat.getAgentInfo("owner", 999999999);

    expect(status).toBe(404);
  });

  for (const badId of ["-1", "abc"]) {
    test(`GET /ai/agents/:id - Owner gets 400 for a malformed id "${badId}"`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

      const { status, error } = await aiChat.getAgentInfo("owner", badId);

      expect(error).toBe("agent id must be a positive integer");
      expect(status).toBe(400);
    });
  }
});

test.describe("DELETE /ai/agents/:id - Delete AI agent", () => {
  for (const { label, type, role } of [
    { label: "Owner", type: undefined, role: "owner" },
    { label: "DocSpace Admin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "Room Admin", type: "RoomAdmin", role: "roomAdmin" },
  ] as const) {
    test(`DELETE /ai/agents/:id - ${label} deletes an agent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");

      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }
      const agentId = await aiChat.createAgentId(role, {
        title: "Autotest Agent to Delete",
        profileId,
      });

      const { status } = await aiChat.deleteAgent(role, agentId);

      // Deletion returns an async operation. It normally lands before the call
      // returns, but not always — polled, so a slow operation is a wait and a
      // delete that never happened is still a failure.
      const afterStatus = await aiChat.waitForAgentDeleted(role, agentId);

      expect(afterStatus).toBe(404);
      expect(status).toBe(200);
    });
  }
});

test.describe("GET /ai/agents/news - Get AI agents new items", () => {
  for (const { label, type, role } of [
    { label: "Owner", type: undefined, role: "owner" },
    { label: "DocSpace Admin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "Room Admin", type: "RoomAdmin", role: "roomAdmin" },
    { label: "User", type: "User", role: "user" },
    { label: "Guest", type: "Guest", role: "guest" },
  ] as const) {
    test(`GET /ai/agents/news - ${label} sees empty news when no new items`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

      const { data, status } = await aiChat.getAgentsNewItems(role);

      expect(status).toBe(200);
      expect(data?.response).toEqual([]);
    });
  }
});

test.describe("PUT /ai/agents/agentquota - Change AI agent quota", () => {
  test("PUT /ai/agents/agentquota - Owner changes agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Quota Agent",
      profileId,
    });

    const { data, status } = await aiChat.updateAgentsQuota("owner", {
      roomIds: [agentId],
      quota: 1048576,
    });

    expect(status).toBe(200);
    expect(data?.response?.map((agent) => agent.id)).toContain(agentId);
  });

  test("PUT /ai/agents/agentquota - Owner changes multiple agents quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstId = await aiChat.createAgentId("owner", {
      title: "Autotest Quota Agent 1",
      profileId,
    });
    const secondId = await aiChat.createAgentId("owner", {
      title: "Autotest Quota Agent 2",
      profileId,
    });

    const { data, status } = await aiChat.updateAgentsQuota("owner", {
      roomIds: [firstId, secondId],
      quota: 1048576,
    });

    expect(status).toBe(200);
    const returnedIds = data?.response?.map((agent) => agent.id);
    expect(returnedIds).toContain(firstId);
    expect(returnedIds).toContain(secondId);
  });

  for (const { label, type, role } of [
    { label: "DocSpace Admin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "Room Admin", type: "RoomAdmin", role: "roomAdmin" },
  ] as const) {
    // Quota is scoped to the agent's own author, not to the portal owner:
    // an admin may set it on an agent they created (this used to be BUG 80674
    // for Room Admin, which no longer reproduces).
    test(`PUT /ai/agents/agentquota - ${label} changes own agent quota limit`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");

      await apiSdk.addAuthenticatedMember("owner", type);
      const agentId = await aiChat.createAgentId(role, {
        title: "Autotest Own Quota Agent",
        profileId,
      });

      const { data, status } = await aiChat.updateAgentsQuota(role, {
        roomIds: [agentId],
        quota: 1048576,
      });

      expect(status).toBe(200);
      expect(data?.response?.map((agent) => agent.id)).toContain(agentId);
    });
  }
});

test.describe("PUT /ai/agents/resetquota - Reset AI agent quota", () => {
  test("PUT /ai/agents/resetquota - Owner resets agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Reset Quota Agent",
      profileId,
    });

    const { status: setStatus } = await aiChat.updateAgentsQuota("owner", {
      roomIds: [agentId],
      quota: 1048576,
    });
    expect(setStatus).toBe(200);

    const { data, status } = await aiChat.resetAgentsQuota("owner", {
      roomIds: [agentId],
    });

    expect(status).toBe(200);
    expect(data?.response?.map((agent) => agent.id)).toContain(agentId);
  });

  test("PUT /ai/agents/resetquota - Owner resets multiple agents quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstId = await aiChat.createAgentId("owner", {
      title: "Autotest Reset Quota Agent 1",
      profileId,
    });
    const secondId = await aiChat.createAgentId("owner", {
      title: "Autotest Reset Quota Agent 2",
      profileId,
    });

    const { status: setStatus } = await aiChat.updateAgentsQuota("owner", {
      roomIds: [firstId, secondId],
      quota: 1048576,
    });
    expect(setStatus).toBe(200);

    const { data, status } = await aiChat.resetAgentsQuota("owner", {
      roomIds: [firstId, secondId],
    });

    expect(status).toBe(200);
    const returnedIds = data?.response?.map((agent) => agent.id);
    expect(returnedIds).toContain(firstId);
    expect(returnedIds).toContain(secondId);
  });

  for (const { label, type, role } of [
    { label: "DocSpace Admin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "Room Admin", type: "RoomAdmin", role: "roomAdmin" },
  ] as const) {
    test(`PUT /ai/agents/resetquota - ${label} resets own agent quota limit`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");

      await apiSdk.addAuthenticatedMember("owner", type);
      const agentId = await aiChat.createAgentId(role, {
        title: "Autotest Own Reset Quota Agent",
        profileId,
      });

      const { status: setStatus } = await aiChat.updateAgentsQuota(role, {
        roomIds: [agentId],
        quota: 1048576,
      });
      expect(setStatus).toBe(200);

      const { data, status } = await aiChat.resetAgentsQuota(role, {
        roomIds: [agentId],
      });

      expect(status).toBe(200);
      expect(data?.response?.map((agent) => agent.id)).toContain(agentId);
    });
  }
});

test.describe("PUT /ai/agents/:id - Update AI agent", () => {
  for (const { label, type, role } of [
    { label: "Owner", type: undefined, role: "owner" },
    { label: "DocSpace Admin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "Room Admin", type: "RoomAdmin", role: "roomAdmin" },
  ] as const) {
    test(`PUT /ai/agents/:id - ${label} updates agent name, tag and prompt`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");

      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }
      const agentId = await aiChat.createAgentId(role, {
        title: "Original Agent",
        tags: ["original-tag"],
        profileId,
        prompt: "Original prompt",
      });

      const { data, status } = await aiChat.updateAgent(role, agentId, {
        title: "Updated Agent",
        tags: ["updated-tag"],
        profileId,
        prompt: "Updated prompt",
      });

      expect(status).toBe(200);
      expect(data?.response?.title).toBe("Updated Agent");
      expect(data?.response?.tags).toContain("updated-tag");
      expect(data?.response?.tags).not.toContain("original-tag");

      // Re-read: the response echoes the update, the stored record is what
      // actually matters.
      const { data: info } = await aiChat.getAgentInfo(role, agentId);

      expect(info?.response?.title).toBe("Updated Agent");
      expect(info?.response?.tags).toContain("updated-tag");
      expect(info?.response?.chatSettings?.prompt).toBe("Updated prompt");
    });
  }

  test("PUT /ai/agents/:id - a flat prompt is silently ignored, only chatSettings.prompt applies", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Create takes a flat `prompt`, update does not. The endpoint accepts the
    // flat field with 200 and drops it, so pin the asymmetry to catch it
    // changing in either direction.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const base = apiSdk.tokenStore.portalBaseUrl;
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Flat Prompt Agent",
      profileId,
      prompt: "Original prompt",
    });

    const response = await apiSdk.request.put(
      `${base}/api/2.0/ai/agents/${agentId}`,
      {
        headers: {
          Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
          Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
          "Content-Type": "application/json",
        },
        data: { title: "Renamed", profileId, prompt: "Ignored prompt" },
      },
    );

    const stored = await aiChat.getAgentInstructions("owner", agentId);

    expect(stored).toBe("Original prompt");
    expect(response.status()).toBe(200);
  });
});
