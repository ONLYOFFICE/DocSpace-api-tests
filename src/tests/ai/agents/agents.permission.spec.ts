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

// Access to an agent (AI project, room type 12).
// Contract: server openspec `specs/ai-agents/spec.md`.

test.describe("POST /files/rooms - who creates an agent", () => {
  test("POST /files/rooms - User cannot create an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    await apiSdk.addAuthenticatedMember("owner", "User");
    const title = `Autotest Agent ${apiSdk.faker.generateString(6)}`;

    const { status } = await apiSdk.forRole("user").rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.AiProjectRoom },
    });

    expect(status).toBe(403);
  });

  test("POST /files/rooms - Guest cannot create an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const title = `Autotest Agent ${apiSdk.faker.generateString(6)}`;

    const { status } = await apiSdk.forRole("guest").rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.AiProjectRoom },
    });

    expect(status).toBe(403);
  });

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
  test("GET /files/rooms/:id/model - Room Admin outside the agent neither reads its model nor sees it listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");

    const { status } = await api.roomsAI.getProjectModel({ id: agentId });

    expect(status).toBe(403);
    expect(await listedAgentIds(api)).not.toContain(agentId);
  });

  test("GET /files/rooms/:id/model - User outside the agent neither reads its model nor sees it listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    await apiSdk.addAuthenticatedMember("owner", "User");
    const api = apiSdk.forRole("user");

    const { status } = await api.roomsAI.getProjectModel({ id: agentId });

    expect(status).toBe(403);
    expect(await listedAgentIds(api)).not.toContain(agentId);
  });

  // A Guest has no AI rooms section to list, so only the model is checked.
  test("GET /files/rooms/:id/model - Guest cannot read the model of an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .roomsAI.getProjectModel({ id: agentId });

    expect(status).toBe(403);
  });

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

  test("PUT /files/rooms/:id/model - Room Admin outside the agent cannot change the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat, other } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .roomsAI.setProjectModel({
        id: agentId,
        updateAiProjectModelRequest: { profileId: other },
      });

    expect(status).toBe(403);
    expect(await agentModel(ownerApi, agentId)).toBe(chat);
  });
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

  test("DELETE /files/rooms/:id - a member cannot delete the agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await inviteToAgent(ownerApi, agentId, user.response!.id!);

    const { status } = await apiSdk.forRole("user").rooms.deleteRoom({
      id: agentId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
    expect(await listedAgentIds(ownerApi)).toContain(agentId);
  });

  test("DELETE /files/rooms/:id - a Room Admin outside the agent cannot delete it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk.forRole("roomAdmin").rooms.deleteRoom({
      id: agentId,
      deleteRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
    expect(await listedAgentIds(ownerApi)).toContain(agentId);
  });
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

  test("PUT /files/rooms/:id/share - a User is not invited as Room manager", async ({
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
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    expect(status).toBe(403);
    expect(await agentMemberIds(ownerApi, agentId)).not.toContain(userId);
  });

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

test.describe("POST /files/owner - who can change the owner of an agent", () => {
  // Only an active DocSpace admin or Room admin can become the owner.
  test("POST /files/owner - a User cannot be made the owner of an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    const { data: owner } = await ownerApi.profiles.getSelfProfile();
    const { data: candidate } = await apiSdk.addMember("owner", "User");

    const { status, data } = await ownerApi.sharing.changeFileOwner({
      changeOwnerRequestDto: {
        folderIds: [agentId as unknown as object],
        userId: candidate.response!.id!,
      },
    });

    expect(status).toBe(403);
    expect(
      (data as unknown as { error?: { message?: string } }).error?.message,
    ).toBe("You cannot select this user");
    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: agentId });
    expect(info.response?.createdBy?.id).toBe(owner.response!.id!);
  });

  test("POST /files/owner - a Guest cannot be made the owner of an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    const { data: owner } = await ownerApi.profiles.getSelfProfile();
    const { data: candidate } = await apiSdk.addMember("owner", "Guest");

    const { status, data } = await ownerApi.sharing.changeFileOwner({
      changeOwnerRequestDto: {
        folderIds: [agentId as unknown as object],
        userId: candidate.response!.id!,
      },
    });

    expect(status).toBe(403);
    expect(
      (data as unknown as { error?: { message?: string } }).error?.message,
    ).toBe("You cannot select this user");
    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: agentId });
    expect(info.response?.createdBy?.id).toBe(owner.response!.id!);
  });

  test("POST /files/owner - a member cannot change the owner of the agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");
    const { data: owner } = await ownerApi.profiles.getSelfProfile();
    const { data: admin } = await apiSdk.addMember("owner", "RoomAdmin");
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await inviteToAgent(ownerApi, agentId, user.response!.id!);

    const { status } = await apiSdk.forRole("user").sharing.changeFileOwner({
      changeOwnerRequestDto: {
        folderIds: [agentId as unknown as object],
        userId: admin.response!.id!,
      },
    });

    expect(status).toBe(403);
    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: agentId });
    expect(info.response?.createdBy?.id).toBe(owner.response!.id!);
  });
});
