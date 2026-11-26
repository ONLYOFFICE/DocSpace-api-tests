import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, LinkType, RoomType } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  agentMemberIds,
  agentModel,
  agentProfiles,
  createAgentId,
  inviteToAgent,
  listedAgentIds,
} from "@/src/helpers/ai-agents";
import { Role } from "@/src/services/token-store";
import { UserType } from "@/src/services/api-sdk";

// Access to an agent - an AI project, a room of type 12 (see
// src/helpers/ai-agents.ts).
//
// Contract: server openspec `specs/ai-agents/spec.md` (release/v4.1.0),
// requirements "The AI rooms section", "Members of the AI rooms", "Users only in
// an AI project", "The model of an AI project":
//   * owner, DocSpace admin and Room admin create agents; User and Guest 403;
//   * an agent offers one role, Content creator, to users only: no Guest, no
//     group, no invitation link;
//   * every member reads the agent and its model; only its owner edits it;
//   * a non-member other than a DocSpace admin does not read its model (403).

const NON_CREATORS: Array<{ label: string; type: UserType; role: Role }> = [
  { label: "User", type: "User", role: "user" },
  { label: "Guest", type: "Guest", role: "guest" },
];

const OUTSIDERS: Array<{ label: string; type: UserType; role: Role }> = [
  { label: "Room Admin", type: "RoomAdmin", role: "roomAdmin" },
  { label: "User", type: "User", role: "user" },
  { label: "Guest", type: "Guest", role: "guest" },
];

test.describe("POST /files/rooms - who creates an agent", () => {
  for (const { label, type, role } of NON_CREATORS) {
    test(`POST /files/rooms - ${label} cannot create an agent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
      await apiSdk.addAuthenticatedMember("owner", type);
      const title = `Autotest Agent ${apiSdk.faker.generateString(6)}`;

      const { status } = await apiSdk.forRole(role).rooms.createRoom({
        createRoomRequestDto: { title, roomType: RoomType.AiProjectRoom },
      });

      expect(status).toBe(403);
    });
  }

  test("POST /files/rooms - Anonymous cannot create an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

    const { status } = await apiSdk.forAnonymous().rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Agent",
        roomType: RoomType.AiProjectRoom,
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /files/rooms/:id/model - who reads an agent", () => {
  for (const { label, type, role } of OUTSIDERS) {
    test(`GET /files/rooms/:id/model - ${label} outside the agent neither reads its model nor sees it listed`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const { chat } = await agentProfiles(apiSdk);
      const agentId = await createAgentId(apiSdk, "owner", {
        profileId: chat,
      });
      await apiSdk.addAuthenticatedMember("owner", type);
      const api = apiSdk.forRole(role);

      const { status } = await api.roomsAI.getProjectModel({ id: agentId });

      expect(status).toBe(403);
      // Guests have no AI rooms section to list; the rest list it without the agent.
      if (role !== "guest") {
        expect(await listedAgentIds(api)).not.toContain(agentId);
      }
    });
  }

  test("GET /files/rooms/:id/model - DocSpace Admin outside the agent reads its model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    expect(await agentModel(apiSdk.forRole("docSpaceAdmin"), agentId)).toBe(
      chat,
    );
  });

  test("GET /files/rooms/:id/model - a member reads the agent's model and sees it listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await inviteToAgent(ownerApi, agentId, user.response!.id!);
    const userApi = apiSdk.forRole("user");

    expect(await agentModel(userApi, agentId)).toBe(chat);
    expect(await listedAgentIds(userApi)).toContain(agentId);
  });
});

test.describe("PUT /files/rooms/:id/model - who changes an agent's model", () => {
  test("PUT /files/rooms/:id/model - a member cannot change the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat, other } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await inviteToAgent(ownerApi, agentId, user.response!.id!);

    const { status } = await apiSdk.forRole("user").roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: other },
    });

    expect(status).toBe(403);
    expect(await agentModel(ownerApi, agentId)).toBe(chat);
  });

  for (const { label, type, role } of OUTSIDERS) {
    test(`PUT /files/rooms/:id/model - ${label} outside the agent cannot change the model`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const { chat, other } = await agentProfiles(apiSdk);
      const agentId = await createAgentId(apiSdk, "owner", {
        profileId: chat,
      });
      await apiSdk.addAuthenticatedMember("owner", type);

      const { status } = await apiSdk.forRole(role).roomsAI.setProjectModel({
        id: agentId,
        updateAiProjectModelRequest: { profileId: other },
      });

      expect(status).toBe(403);
      expect(await agentModel(ownerApi, agentId)).toBe(chat);
    });
  }
});

test.describe("PUT|DELETE /files/rooms/:id - who edits and deletes an agent", () => {
  test("PUT /files/rooms/:id - a member cannot rename the agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner", {
      title: "Original Agent",
    });
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await inviteToAgent(ownerApi, agentId, user.response!.id!);

    const { status } = await apiSdk.forRole("user").rooms.updateRoom({
      id: agentId,
      updateRoomRequest: { title: "Hacked Agent" },
    });

    expect(status).toBe(403);
    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: agentId });
    expect(info.response?.title).toBe("Original Agent");
  });

  test("PUT /files/rooms/:id - a Room Admin outside the agent cannot rename it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner", {
      title: "Original Agent",
    });
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk.forRole("roomAdmin").rooms.updateRoom({
      id: agentId,
      updateRoomRequest: { title: "Hacked Agent" },
    });

    expect(status).toBe(403);
    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: agentId });
    expect(info.response?.title).toBe("Original Agent");
  });

  for (const who of ["member", "Room Admin outside the agent"] as const) {
    test(`DELETE /files/rooms/:id - a ${who} cannot delete the agent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const agentId = await createAgentId(apiSdk, "owner");
      let role: Role = "roomAdmin";
      if (who === "member") {
        const { data: user } = await apiSdk.addAuthenticatedMember(
          "owner",
          "User",
        );
        await inviteToAgent(ownerApi, agentId, user.response!.id!);
        role = "user";
      } else {
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      }

      const { status } = await apiSdk.forRole(role).rooms.deleteRoom({
        id: agentId,
        deleteRoomRequest: { deleteAfter: false },
      });

      expect(status).toBe(403);
      expect(await listedAgentIds(ownerApi)).toContain(agentId);
    });
  }
});

test.describe("PUT /files/rooms/:id/share - who can be a member of an agent", () => {
  test("PUT /files/rooms/:id/share - a User is invited as Content creator", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    const { data: user } = await apiSdk.addMember("owner", "User");
    const userId = user.response!.id!;

    const { status } = await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    expect(status).toBe(200);
    expect(await agentMemberIds(ownerApi, agentId)).toContain(userId);
  });

  const OTHER_ROLES: Array<{ name: string; access: FileShare }> = [
    { name: "Room manager", access: FileShare.RoomManager },
    { name: "Editor", access: FileShare.Editing },
    { name: "Viewer", access: FileShare.Read },
  ];

  for (const { name, access } of OTHER_ROLES) {
    test(`PUT /files/rooms/:id/share - a User is not invited as ${name}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const agentId = await createAgentId(apiSdk, "owner");
      const { data: user } = await apiSdk.addMember("owner", "User");
      const userId = user.response!.id!;

      const { status } = await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access }],
          notify: false,
        },
      });

      expect(status).toBe(403);
      expect(await agentMemberIds(ownerApi, agentId)).not.toContain(userId);
    });
  }

  test("PUT /files/rooms/:id/share - a Guest is not invited", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    const { data: guest } = await apiSdk.addMember("owner", "Guest");
    const guestId = guest.response!.id!;

    const { status } = await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    expect(status).toBe(403);
    expect(await agentMemberIds(ownerApi, agentId)).not.toContain(guestId);
  });

  test("PUT /files/rooms/:id/share - a group is not invited", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    const { data: owner } = await ownerApi.profiles.getSelfProfile();
    const { data: user } = await apiSdk.addMember("owner", "User");
    const { data: group } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: owner.response!.id!,
        members: [user.response!.id!],
      },
    });
    const groupId = group.response!.id!;

    const { status } = await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    expect(status).toBe(403);
    expect(await agentMemberIds(ownerApi, agentId)).not.toContain(groupId);
  });

  test("PUT /files/rooms/:id/links - an agent takes no invitation link", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");

    const { status } = await ownerApi.rooms.setRoomLink({
      id: agentId,
      roomLinkRequest: {
        access: FileShare.ContentCreator,
        linkType: LinkType.Invitation,
        title: "Autotest Invitation",
      },
    });

    expect(status).toBe(403);
    const { data: links } = await ownerApi.rooms.getRoomLinks({ id: agentId });
    expect(links.response ?? []).toHaveLength(0);
  });
});
