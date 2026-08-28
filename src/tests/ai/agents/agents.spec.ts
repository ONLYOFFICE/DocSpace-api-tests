import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FileShare,
  RoomType,
  RoomsApi,
  SearchArea,
} from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AiProfiles } from "@/src/helpers/ai-profiles";
import { ApiSDK } from "@/src/services/api-sdk";

// Driven through AiAgentChat rather than the SDK's AgentsApi: the SDK still
// points at `/internal/ai/integration/agents`, which nginx answers with 405.
// See the route map in src/helpers/ai-agent-chat.ts.
//
// Contract changes since these tests were first written:
//   * `providerId` + `modelId` are gone. An agent references a profile from
//     GET /ai/profiles/list via a `profileId` UUID.
//   * create takes a flat `prompt`; update takes a nested `chatSettings.prompt`.
//   * errors are `{"error":"..."}` — no `statusCode`, no `error.message`.

/**
 * A well-formed UUID that is not in the profile catalogue. `threads/create`
 * answers 404 for it (see chat.spec.ts); the agent routes do not.
 */
const UNKNOWN_PROFILE_ID = "019ed118-0000-0000-0000-0000000000ff";

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

    // The control comes first: it is what makes the empty reads below mean
    // "nothing was created" rather than "this portal shows nothing", and its
    // parentId is the only way to learn the id of the AI area an orphaned room
    // would sit in.
    const controlId = await aiChat.createAgentId("owner", {
      title: "Autotest Control Agent",
      profileId: await aiChat.defaultProfileId("owner"),
    });
    const aiRootId = await aiAreaId(ownerApi, controlId);

    // An empty string is a string, so it clears the "required" check above and
    // lands on the format one — same 400, different message than a missing key.
    for (const [label, badProfileId] of [
      ["an id that is not a UUID", "invalid-nonexistent-profile-123"],
      ["an empty id", ""],
    ]) {
      const { status, error } = await aiChat.createAgent("owner", {
        title: `Autotest Invalid Profile Agent - ${label}`,
        profileId: badProfileId,
        prompt: "You are a test assistant",
      });

      expect(error, label).toBe("profileId must be a UUID");
      expect(status, label).toBe(400);
    }

    // A refused create builds nothing: no agent record, and no room in the AI
    // area either — an agent is a room with Knowledge and Result Storage
    // folders in it, so a half-finished one would be visible as a room even if
    // the agents list never learned about it.
    expect(
      (await aiChat.getAgents("owner")).data?.response?.folders?.map(
        (agent) => agent.id,
      ),
      "only the control agent exists",
    ).toEqual([controlId]);
    expect(
      await roomsInAiArea(ownerApi, aiRootId),
      "no room was left in the AI area",
    ).toEqual([]);

    // Positive control for that second read: it does report a room when there
    // is one. (Agents made through /ai/agents are not children of this folder —
    // rooms made with roomType 9 through the rooms API are, and an orphan of a
    // half-done create is exactly the shape that would land here.)
    const { data: stray } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Control AI Room",
        roomType: RoomType.AiRoom,
      },
    });
    expect(await roomsInAiArea(ownerApi, aiRootId)).toEqual([
      stray.response!.id!,
    ]);
  });

  // The catalogue is the only place an agent's model may come from, and the
  // format check above is the only one there is: a well-formed UUID of no
  // profile is accepted. Measured 2026-08-06 — what it builds is not a stub but
  // a whole agent minus its model: roomType 9, both storage folders, listed in
  // /ai/agents, and an assignment scope of `{}` (not even the portal-wide
  // fallback an ordinary room gets), so a chat in it quietly runs on the portal
  // Default. The same half-built object POST /files/rooms with roomType 9
  // produces — see chat.spec.ts, "an AI room created through the rooms API" —
  // reached through the agent factory itself.
  //
  // A well-formed unknown id is a dangling reference, which is not the same
  // thing as a profile that was deleted after an agent was built on it: that
  // lifecycle cannot be staged here, because the gateway catalogue is read-only
  // (profiles/delete is 403 even for the Owner) and may well leave state of its
  // own behind. Only the dangling-reference half is covered.
  test("BUG 82922: POST /ai/agents - Owner cannot create an agent on a profile that is not in the catalogue", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Control: the same call with a profile the catalogue does have returns an
    // id and shows up in the list, so what is read below is about the unknown
    // profile and not about the shape of the response.
    const controlId = await aiChat.createAgentId("owner", {
      title: "Autotest Control Agent",
      profileId: await aiChat.defaultProfileId("owner"),
    });
    expect(
      await storageFolders(ownerApi, controlId),
      "a whole agent has both storage folders",
    ).toEqual(["Knowledge", "Result Storage"]);

    const created = await aiChat.createAgent("owner", {
      title: "Autotest Unknown Profile Agent",
      profileId: UNKNOWN_PROFILE_ID,
      prompt: "You are a test assistant",
    });

    // Everything the create may have left behind, gathered the same way whether
    // it was accepted or refused: an id it did not return cannot be read, and
    // that absence is the passing shape.
    const agentId = created.data?.response?.id;
    const listed =
      (await aiChat.getAgents("owner")).data?.response?.folders?.map(
        (agent) => agent.id,
      ) ?? [];
    const room = agentId
      ? (await ownerApi.rooms.getRoomInfo({ id: agentId })).status
      : "no room to read";
    const folders = agentId ? await storageFolders(ownerApi, agentId) : [];
    const scope = agentId
      ? (await profiles.getAllAssignments("owner", agentId)).data
      : undefined;

    expect(
      { id: agentId, listed, room, folders, scope },
      "a create on a profileId the catalogue does not have leaves nothing behind",
    ).toEqual({
      id: undefined,
      listed: [controlId],
      room: "no room to read",
      folders: [],
      scope: undefined,
    });
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
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: { enableQuota: true, defaultQuota: 1048576 },
    });

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
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: { enableQuota: true, defaultQuota: 1048576 },
    });

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
      await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: true, defaultQuota: 1048576 },
      });
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
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: { enableQuota: true, defaultQuota: 1048576 },
    });

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
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: { enableQuota: true, defaultQuota: 1048576 },
    });

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
      await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: true, defaultQuota: 1048576 },
      });
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

  test("PUT /ai/agents/:id - a flat prompt is refused, only chatSettings.prompt is a valid update", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Create takes a flat `prompt`; update does not. Used to accept the flat
    // field with 200 and silently drop it — now the whole update is refused
    // with 400 `{"error":"Bad Request"}` instead, and nothing about the
    // agent changes. Pin the asymmetry either way it lands.
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

    expect(stored, "the refused update left the agent untouched").toBe(
      "Original prompt",
    );
    expect(response.status()).toBe(400);
  });
});

// An agent's model is the one thing about it a client cannot pick per message —
// the composer hides the picker and draws the agent's own profile instead — so
// every update has to leave the binding either intact or pointed at another
// catalogue profile. There is no third valid outcome, and "no model at all" is
// the one this endpoint can reach.
test.describe("PUT /ai/agents/:id - the agent's profile binding", () => {
  test("PUT /ai/agents/:id - an update that leaves profileId out keeps the agent's model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // A client that only renames an agent sends no profileId, and the binding
    // has to survive that. Both places a composer reads the model from are
    // checked, because they are stored separately and only agree by contract.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Bound Agent",
      profileId,
      prompt: "Original prompt",
    });

    const { status } = await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Renamed Agent",
    });
    expect(status).toBe(200);

    const info = await aiChat.getAgentInfo("owner", agentId);
    // The update really ran — otherwise "the model is unchanged" would be true
    // of a request the API ignored.
    expect(info.data?.response?.title).toBe("Autotest Renamed Agent");
    expect(info.data?.response?.profileId).toBe(profileId);
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
    ).toBe(profileId);
  });

  test("PUT /ai/agents/:id - a malformed profileId is refused and the agent keeps its model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Bound Agent",
      tags: ["original-tag"],
      profileId,
      prompt: "Original prompt",
    });

    for (const [label, badProfileId] of [
      ["an id that is not a UUID", "autotest-not-a-profile"],
      ["an empty id", ""],
    ]) {
      // Everything else in the request is valid, so a partial write would show
      // as a renamed, re-tagged, re-prompted agent behind the 400.
      const { status, error } = await aiChat.updateAgent("owner", agentId, {
        title: "Autotest Renamed Agent",
        tags: ["updated-tag"],
        profileId: badProfileId,
        prompt: "Updated prompt",
      });

      expect(error, label).toBe("profileId must be a UUID");
      expect(status, label).toBe(400);

      const info = await aiChat.getAgentInfo("owner", agentId);
      expect(
        {
          title: info.data?.response?.title,
          tags: info.data?.response?.tags,
          prompt: info.data?.response?.chatSettings?.prompt,
          profileId: info.data?.response?.profileId,
          chat: (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
        },
        `${label}: a refused update writes none of the request`,
      ).toEqual({
        title: "Autotest Bound Agent",
        tags: ["original-tag"],
        prompt: "Original prompt",
        profileId,
        chat: profileId,
      });
    }
  });

  // Measured 2026-08-06: this answers 200 and writes the request in halves. The
  // title, the tags and the prompt all land, while the model is not replaced but
  // *erased* — the agent record loses its `profileId` and its assignment scope
  // goes back to `{}`. So a plain rename that happened to carry a stale id
  // leaves an agent with no model at all, and the composer has nothing to show
  // where the fixed model used to be. Either the whole request is refused or
  // none of it is written; a half-applied PUT is neither.
  //
  // Threads made before the update are the one thing that survives — each keeps
  // the profile it was stamped with — so the damage is to new conversations.
  test("BUG 82925: PUT /ai/agents/:id - an unknown profileId is written in halves: the rename lands and the model is erased", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Bound Agent",
      tags: ["original-tag"],
      profileId,
      prompt: "Original prompt",
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread from before the update",
      profileId,
      agentId,
    });

    // Setup premise: the agent really is bound before the update, so what is
    // read after it can only have come from the update.
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent is bound to a catalogue profile",
    ).toBe(profileId);

    await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Renamed Agent",
      tags: ["updated-tag"],
      profileId: UNKNOWN_PROFILE_ID,
      prompt: "Updated prompt",
    });

    const info = await aiChat.getAgentInfo("owner", agentId);
    const scope = await profiles.getAllAssignments("owner", agentId);
    const thread = await aiChat.getThread("owner", threadId);

    expect(
      {
        title: info.data?.response?.title,
        tags: info.data?.response?.tags,
        prompt: info.data?.response?.chatSettings?.prompt,
        profileId: info.data?.response?.profileId,
        chat: scope.data?.Chat,
        thread: thread.data?.profileId,
      },
      "an update that cannot take the new model writes none of itself",
    ).toEqual({
      title: "Autotest Bound Agent",
      tags: ["original-tag"],
      prompt: "Original prompt",
      profileId,
      chat: profileId,
      thread: profileId,
    });
  });
});

// Reported 2026-08-21: an admin disables a model via its provider toggle in AI
// settings (PUT /portal/payment/ai-model/restrictions — the toggle sends the
// full restricted-models array, `{models:[...]}`), then opens an agent that was
// running on that model and tries to move it to a different, still-available
// one. The save fails with 403. Isolated directly against a live portal:
//
//   * Restricting a model the agent is NOT on has no effect at all — GET and a
//     PUT both stay 200 for that agent.
//   * A rename that does not touch `profileId` still succeeds (200) even while
//     the agent's own model is restricted — so the refusal is not "this agent
//     is generally locked".
//   * The moment the request body carries a `profileId` and the agent's
//     CURRENT stored model is restricted, the whole PUT is refused with 403
//     "Forbidden" — including when the new `profileId` names a perfectly
//     valid, unrestricted model. The check reads the agent's *existing* model,
//     not the one being requested. So restricting a model does not just stop
//     new assignments to it (defensible); it also traps every agent already on
//     it, unable to ever move off — the one thing restricting a model should
//     make easier, not impossible. Filed as BUG 83355.
//   * Worse, measured 2026-08-21: the 403 is not a no-op. The agent's
//     `profileId` and its assignment scope (`get-all-assignments` -> `Chat`)
//     are BOTH erased by the same request the server told the caller failed —
//     same erased-in-halves shape as BUG 82925, but reached through a refusal
//     instead of a 200. A client that reads only the status code sees "nothing
//     happened, try again"; the agent has already lost its model. Part of the
//     same BUG 83355 report.
//   * The mirror case is just as broken the other way: if the agent's CURRENT
//     model is NOT restricted but the TARGET `profileId` IS, the PUT answers
//     200 and still erases the model — restricting a model makes it behave
//     like `threads/create`'s unknown-profileId case (BUG 82925's shape again)
//     for anyone who tries to move onto it, instead of a controlled refusal.
//     Filed separately as BUG 83359 — different trigger than BUG 83355 above,
//     same erase-on-write mechanism.
//   * `POST /ai/agents` with a restricted `profileId` is the create-time twin:
//     200, and the built agent has no model at all — the same shape as the
//     already-filed BUG 82922 (create on an unknown profileId), reached here
//     because restriction hides the profile from the catalogue entirely
//     (`GET /ai/profiles/list` — confirmed the entry disappears, count drops
//     by one, and reappears once the restriction is cleared).
//   * Inference is untouched: a thread already talking to a model that gets
//     restricted mid-conversation keeps answering normally (`send-with-stream`
//     stays 200, no `error` frame) — restriction only ever gates the catalogue
//     and (buggily) the agent-update path, never actual usage.
//   * `/ai/assignments/assign` is the one place this is handled correctly: a
//     restricted `profileId` is refused the same documented way an unknown one
//     is — HTTP 200, `{success:false, error:{field:"name",
//     message:"Profile not found"}}` — no trap, no erasure. That is what the
//     agent-update path should be doing instead.
test.describe("PUT /api/2.0/ai/agents/:id - restricting the agent's current model", () => {
  test("PUT /ai/agents/:id - restricting a model the agent is not on has no effect", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const usable = catalogue.filter(
      (p) => !!p.id && !!p.modelId && p.canUseTool !== false,
    );
    if (usable.length < 2) {
      throw new Error(
        `Need 2 distinct usable profiles, catalogue has ${usable.length}`,
      );
    }
    const [current, unrelated] = usable;

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Unrelated Restriction Agent",
      profileId: current.id,
      prompt: "Original prompt",
    });

    const { status: restrictStatus } =
      await ownerApi.payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: {
          models: new Set([unrelated.modelId!]),
        },
      });
    expect(restrictStatus, "restricting a model this agent does not use").toBe(
      200,
    );

    const get = await aiChat.getAgentInfo("owner", agentId);
    const put = await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Unrelated Restriction Agent Renamed",
    });

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    expect(get.status, "reading the agent").toBe(200);
    expect(put.status, "renaming the agent").toBe(200);
  });

  test("PUT /ai/agents/:id - a rename with no profileId succeeds even while the agent's own model is restricted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const current = AiAgentChat.pickTextProfile(
      await profiles.catalogue("owner"),
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Rename While Restricted",
      profileId: current.id,
      prompt: "Original prompt",
    });

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: {
        models: new Set([current.modelId!]),
      },
    });

    const rename = await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Renamed While Restricted",
    });

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    expect(rename.status, "a rename that does not touch profileId").toBe(200);
  });

  test("BUG 83355: PUT /ai/agents/:id - moving off a restricted model onto a different, valid one is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const usable = catalogue.filter(
      (p) => !!p.id && !!p.modelId && p.canUseTool !== false,
    );
    if (usable.length < 2) {
      throw new Error(
        `Need 2 distinct usable profiles, catalogue has ${usable.length}`,
      );
    }
    const [current, replacement] = usable;

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Trapped Agent",
      profileId: current.id,
      prompt: "Original prompt",
    });

    // Setup premise: the agent really is on `current` before it gets restricted.
    expect(
      (await aiChat.getAgentInfo("owner", agentId)).data?.response?.profileId,
      "the agent is bound to the model that is about to be restricted",
    ).toBe(current.id);

    const { status: restrictStatus } =
      await ownerApi.payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: {
          models: new Set([current.modelId!]),
        },
      });
    expect(restrictStatus, "restricting the agent's current model").toBe(200);

    const update = await aiChat.updateAgent("owner", agentId, {
      profileId: replacement.id,
    });
    const info = await aiChat.getAgentInfo("owner", agentId);
    const scope = await profiles.getAllAssignments("owner", agentId);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    expect(
      {
        status: update.status,
        profileId: info.data?.response?.profileId,
        chat: scope.data?.Chat,
      },
      "an agent should be free to move off a model that was just restricted, " +
        "not refused AND stripped of the model it already had",
    ).toEqual({ status: 200, profileId: replacement.id, chat: replacement.id });
  });

  test("BUG 83359: PUT /ai/agents/:id - moving onto a restricted model erases the binding instead of a controlled refusal", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const usable = catalogue.filter(
      (p) => !!p.id && !!p.modelId && p.canUseTool !== false,
    );
    if (usable.length < 2) {
      throw new Error(
        `Need 2 distinct usable profiles, catalogue has ${usable.length}`,
      );
    }
    const [current, target] = usable;

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Move Onto Restricted Agent",
      profileId: current.id,
      prompt: "Original prompt",
    });

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([target.modelId!]) },
    });

    const update = await aiChat.updateAgent("owner", agentId, {
      profileId: target.id,
    });
    const info = await aiChat.getAgentInfo("owner", agentId);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    test.fail();
    expect(
      { status: update.status, profileId: info.data?.response?.profileId },
      "moving onto a restricted model should be a controlled refusal (like " +
        "assignments' 'Profile not found'), not a 200 that erases the model",
    ).toEqual({ status: 200, profileId: target.id });
  });

  test("POST /ai/agents - a restricted model at create time is refused, not silently dropped", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const target = AiAgentChat.pickTextProfile(
      await profiles.catalogue("owner"),
    );

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([target.modelId!]) },
    });

    const created = await aiChat.createAgent("owner", {
      title: "Autotest Create On Restricted Model",
      profileId: target.id,
      prompt: "Original prompt",
    });

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    // Used to succeed with a 200 and silently build an agent with no model
    // bound at all — the same create-time shape as BUG 82922's update-time
    // case, reached here because restriction makes `target` unrecognised.
    // Create now refuses it outright, same as an unknown profileId does.
    expect(created.status, "a restricted model is refused at create time").toBe(
      400,
    );
    expect(created.error).toContain(`AI profile "${target.id}" does not exist`);
  });

  test("PUT /ai/model/restrictions - REPLACE takes effect immediately, both ways, in the same session", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const usable = catalogue.filter(
      (p) => !!p.id && !!p.modelId && p.canUseTool !== false,
    );
    if (usable.length < 3) {
      throw new Error(
        `Need 3 distinct usable profiles, catalogue has ${usable.length}`,
      );
    }
    // `free` stays unrestricted for the whole test — the clean move target,
    // so the final assertion isn't confounded by the *other* restriction bug
    // (moving ONTO a restricted model, tested separately above).
    const [a, b, free] = usable;
    const setRestrictions = (modelIds: string[]) =>
      ownerApi.payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: { models: new Set(modelIds) },
      });
    const catalogueHas = async (id: string) =>
      (await profiles.catalogue("owner")).some((p) => p.id === id);

    await setRestrictions([a.modelId!]);
    expect(await catalogueHas(a.id!), "A is hidden right after PUT [A]").toBe(
      false,
    );

    // REPLACE, not add: A is freed and B is newly hidden in the very same
    // call — no re-auth, no new token, no waiting for a cache to expire.
    await setRestrictions([b.modelId!]);
    expect(
      await catalogueHas(a.id!),
      "A reappears the instant the REPLACE drops it from the set",
    ).toBe(true);
    expect(
      await catalogueHas(b.id!),
      "B is hidden the instant the same REPLACE adds it",
    ).toBe(false);

    await setRestrictions([]);
    expect(await catalogueHas(b.id!), "clearing restores B too").toBe(true);

    // A is unrestricted again, so an agent bound to it moves freely — the
    // trap in the tests above only fires while the agent's OWN model is
    // still in the restricted set.
    const agentOnA = await aiChat.createAgentId("owner", {
      title: "Autotest Agent On A After Replace",
      profileId: a.id,
      prompt: "test",
    });
    await setRestrictions([b.modelId!]);
    const moveOffA = await aiChat.updateAgent("owner", agentOnA, {
      profileId: free.id,
    });
    await setRestrictions([]);

    expect(
      moveOffA.status,
      "A was never in this restriction set, so the agent on it is not trapped",
    ).toBe(200);
  });
});

// The third way a room-shaped object comes into being. If an agent could be
// templated, a room made from that template would be an agent-shaped room whose
// profile nothing guarantees — the rooms-API path all over again. It cannot:
// the call is accepted and the operation settles without producing anything.
test.describe("POST /files/roomtemplate - an agent as a template source", () => {
  test("POST /files/roomtemplate - an agent cannot be turned into a room template", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Template Source Agent",
      profileId: await aiChat.defaultProfileId("owner"),
      prompt: "Original prompt",
    });
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Template Source Room",
        roomType: RoomType.CustomRoom,
      },
    });

    // The call itself answers 200 — that it does so for a source it will not
    // template is the already-pinned BUG 81691 family in rooms.spec.ts, so what
    // is asserted here is only what did or did not get made.
    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: { roomId: agentId, title: "Autotest Agent Template" },
    });

    // Unlike the positive control below, an agent source never gets a creating
    // job registered at all — measured live 2026-08-24: `getRoomTemplateCreatingStatus`
    // reads back `{"count":0}` with no `response` from the very first poll, and
    // stays that way. So there is nothing here to wait on becoming `isCompleted`;
    // a brief settle is enough, and the absence of a job is itself the evidence
    // that the attempt was dropped rather than left running.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const { data: agentAttemptStatus } =
      await ownerApi.rooms.getRoomTemplateCreatingStatus();
    expect(
      agentAttemptStatus.response,
      "no creating job is ever registered for a source that will not template",
    ).toBeFalsy();

    // Positive control: the same call on an ordinary room does produce a
    // template, so the absence below is about the agent and not about templates
    // being off on this portal.
    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: {
        roomId: room.response!.id!,
        title: "Autotest Room Template",
      },
    });
    await expect(async () => {
      expect(await templateTitles(ownerApi.rooms)).toContain(
        "Autotest Room Template",
      );
    }).toPass({ intervals: [1000, 2000, 5000], timeout: 30000 });

    expect(await templateTitles(ownerApi.rooms)).not.toContain(
      "Autotest Agent Template",
    );
  });
});

type OwnerApi = ReturnType<ApiSDK["forRole"]>;

/**
 * The AI area an agent's room sits in, read off an existing agent — the API
 * publishes no route for the folder id itself.
 *
 * Measured 2026-08-06: agents made through POST /ai/agents are NOT children of
 * it (they answer only to /ai/agents), while a roomType 9 room made through the
 * rooms API is. The two listings are complements of each other, which is why an
 * atomicity check has to read both.
 */
async function aiAreaId(api: OwnerApi, agentId: number): Promise<number> {
  const { data, status } = await api.rooms.getRoomInfo({ id: agentId });
  const parentId = (data.response as { parentId?: number })?.parentId;

  if (status !== 200 || parentId === undefined) {
    throw new Error(
      `getRoomInfo(${agentId}) gave no parentId: ${status} ${JSON.stringify(data)}`,
    );
  }
  return parentId;
}

async function roomsInAiArea(
  api: OwnerApi,
  aiRootId: number,
): Promise<number[]> {
  const { data } = await api.folders.getFolders({ folderId: aiRootId });
  return ((data.response ?? []) as Array<{ id?: number }>).map(
    (folder) => folder.id!,
  );
}

/** The folders an agent is built with: Knowledge and Result Storage. */
async function storageFolders(
  api: OwnerApi,
  agentId: number,
): Promise<string[]> {
  const { data } = await api.folders.getFolders({ folderId: agentId });
  return ((data.response ?? []) as Array<{ title?: string }>)
    .map((folder) => folder.title ?? "")
    .sort();
}

async function templateTitles(rooms: RoomsApi): Promise<string[]> {
  const { data } = await rooms.getRoomsFolder({
    searchArea: SearchArea.Templates,
  });
  return (data.response?.folders ?? []).map(
    (folder) => (folder as { title?: string }).title ?? "",
  );
}
