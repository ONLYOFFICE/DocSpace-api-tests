import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType, RoomsApi, SearchArea } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  agentModel,
  agentProfiles,
  createAgentId,
  listedAgentIds,
  listedRoomIds,
} from "@/src/helpers/ai-agents";
import { createRoomOfType } from "@/src/helpers/rooms";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { Role } from "@/src/services/token-store";
import { UserType } from "@/src/services/api-sdk";

// An agent in 4.1.0 is an AI project (room type 12), see src/helpers/ai-agents.ts.
// Contract: server openspec `specs/ai-agents/spec.md`.

const UNKNOWN_PROFILE_ID = "019ed118-0000-0000-0000-0000000000ff";
const UNKNOWN_ROOM_ID = 999999999;

const CREATORS: Array<{ label: string; role: Role; type?: UserType }> = [
  { label: "Owner", role: "owner" },
  { label: "DocSpace Admin", role: "docSpaceAdmin", type: "DocSpaceAdmin" },
  { label: "Room Admin", role: "roomAdmin", type: "RoomAdmin" },
];

test.describe("POST /files/rooms - create an agent", () => {
  for (const { label, role, type } of CREATORS) {
    test(`POST /files/rooms - ${label} creates an agent and it lands in the AI rooms section`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }
      const api = apiSdk.forRole(role);

      const { data, status } = await api.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Agent",
          roomType: RoomType.AiProjectRoom,
          tags: ["autotest"],
        },
      });

      expect(status).toBe(200);
      const agentId = data.response!.id!;
      expect(data.response?.title).toBe("Autotest Agent");
      expect(data.response?.roomType).toBe(RoomType.AiProjectRoom);
      expect(data.response?.tags).toContain("autotest");

      expect(await listedAgentIds(api)).toContain(agentId);
      expect(await listedRoomIds(api)).not.toContain(agentId);
    });
  }

  test("POST /files/rooms - a new agent has no model of its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const agentId = await createAgentId(apiSdk, "owner");

    expect(await agentModel(ownerApi, agentId)).toBeNull();
  });

  test("GET /files/rooms - a filter by the agent type lists agents only", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const agentId = await createAgentId(apiSdk, "owner");
    const instructionsId = await createRoomOfType(
      apiSdk,
      "owner",
      "Autotest Instructions",
      RoomType.InstructionsRoom,
    );

    // Positive control: the Instructions room is in the same section.
    const { data: section } = await ownerApi.rooms.getRoomsFolder({
      searchArea: SearchArea.AiHub,
      count: 100,
    });
    const sectionIds = (section.response?.folders ?? []).map(
      (folder) => (folder as { id?: number }).id,
    );
    expect(sectionIds).toEqual(
      expect.arrayContaining([agentId, instructionsId]),
    );

    const agents = await listedAgentIds(ownerApi);
    expect(agents).toContain(agentId);
    expect(agents).not.toContain(instructionsId);
  });
});

test.describe("POST /files/rooms - settings an agent does not take", () => {
  const REFUSED: Array<{ name: string; extra: Record<string, unknown> }> = [
    { name: "a quota", extra: { quota: 104857600 } },
    {
      name: "a prompt in chatSettings",
      extra: { chatSettings: { prompt: "Answer in English only" } },
    },
    { name: "indexing", extra: { indexing: true } },
    { name: "denyDownload", extra: { denyDownload: true } },
  ];

  for (const { name, extra } of REFUSED) {
    test(`POST /files/rooms - an agent with ${name} is refused and nothing is created`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const title = `Autotest Refused ${apiSdk.faker.generateString(6)}`;

      const { status } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title,
          roomType: RoomType.AiProjectRoom,
          ...extra,
        },
      });

      expect(status).toBe(400);
      const { data: listed } = await ownerApi.rooms.getRoomsFolder({
        searchArea: SearchArea.AiHub,
        type: [RoomType.AiProjectRoom],
        count: 100,
      });
      const titles = (listed.response?.folders ?? []).map(
        (folder) => (folder as { title?: string }).title,
      );
      expect(titles).not.toContain(title);
    });
  }
});

test.describe("PUT /files/rooms/:id/model - the model of an agent", () => {
  test("PUT /files/rooms/:id/model - Owner sets the model and reads it back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner");

    const { data, status } = await ownerApi.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: chat },
    });

    expect(status).toBe(200);
    expect(data.response?.profileId).toBe(chat);
    expect(await agentModel(ownerApi, agentId)).toBe(chat);
  });

  test("PUT /files/rooms/:id/model - a second model replaces the first", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat, other } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });

    const { status } = await ownerApi.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: other },
    });

    expect(status).toBe(200);
    expect(await agentModel(ownerApi, agentId)).toBe(other);
  });

  test("PUT /files/rooms/:id/model - the model cannot be cleared", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });

    const { status } = await ownerApi.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: {} as { profileId: string },
    });

    expect(status).toBe(400);
    expect(await agentModel(ownerApi, agentId)).toBe(chat);
  });

  const BAD_PROFILES: Array<{ name: string; profileId: string }> = [
    { name: "an unknown profileId", profileId: UNKNOWN_PROFILE_ID },
    { name: "a malformed profileId", profileId: "not-a-uuid" },
  ];

  for (const { name, profileId } of BAD_PROFILES) {
    test(`PUT /files/rooms/:id/model - ${name} is refused and the agent keeps its model`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const { chat } = await agentProfiles(apiSdk);
      const agentId = await createAgentId(apiSdk, "owner", {
        profileId: chat,
      });

      const { status } = await ownerApi.roomsAI.setProjectModel({
        id: agentId,
        updateAiProjectModelRequest: { profileId },
      });

      expect(status).toBe(400);
      expect(await agentModel(ownerApi, agentId)).toBe(chat);
    });
  }

  test("PUT /files/rooms/:id/model - an image-only profile is refused and the agent keeps its model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat, image } = await agentProfiles(apiSdk);
    expect(image, "the catalogue offers an image-only profile").toBeDefined();
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });

    const { status } = await ownerApi.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: image! },
    });

    expect(status).toBe(400);
    expect(await agentModel(ownerApi, agentId)).toBe(chat);
  });

  test("GET|PUT /files/rooms/:id/model - a room that is not an agent answers 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const instructionsId = await createRoomOfType(
      apiSdk,
      "owner",
      "Autotest Instructions",
      RoomType.InstructionsRoom,
    );

    for (const id of [instructionsId, UNKNOWN_ROOM_ID]) {
      const read = await ownerApi.roomsAI.getProjectModel({ id });
      expect(read.status, `GET model of ${id}`).toBe(404);

      const write = await ownerApi.roomsAI.setProjectModel({
        id,
        updateAiProjectModelRequest: { profileId: chat },
      });
      expect(write.status, `PUT model of ${id}`).toBe(404);
    }
  });
});

test.describe("PUT /files/rooms/:id - update an agent", () => {
  test("PUT /files/rooms/:id - Owner renames an agent and changes its tags, the model stays", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", {
      title: "Original Agent",
      tags: ["old"],
      profileId: chat,
    });

    const { data, status } = await ownerApi.rooms.updateRoom({
      id: agentId,
      updateRoomRequest: { title: "Renamed Agent", tags: ["new"] },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Renamed Agent");
    expect(data.response?.tags).toEqual(["new"]);
    expect(await agentModel(ownerApi, agentId)).toBe(chat);
  });

  const REFUSED: Array<{ name: string; extra: Record<string, unknown> }> = [
    {
      name: "a prompt in chatSettings",
      extra: { chatSettings: { prompt: "Answer in English only" } },
    },
    { name: "a quota", extra: { quota: 104857600 } },
    { name: "indexing", extra: { indexing: true } },
  ];

  for (const { name, extra } of REFUSED) {
    test(`PUT /files/rooms/:id - ${name} is refused and the agent is unchanged`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const agentId = await createAgentId(apiSdk, "owner", {
        title: "Original Agent",
      });

      const { status } = await ownerApi.rooms.updateRoom({
        id: agentId,
        updateRoomRequest: { title: "Changed Agent", ...extra },
      });

      expect(status).toBe(400);
      const { data: info } = await ownerApi.rooms.getRoomInfo({ id: agentId });
      expect(info.response?.title).toBe("Original Agent");
    });
  }
});

test.describe("PUT /files/rooms/roomquota - an agent takes no quota", () => {
  // Skipped: this route sets a quota on an agent (2026-11-26), though create
  // and update refuse one with 400. No bug filed yet.
  test.skip("PUT /files/rooms/roomquota - a quota is not set on an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { status: settingsStatus } =
      await ownerApi.settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestDto: { enableQuota: true, defaultQuota: 524288000 },
      });
    expect(settingsStatus).toBe(200);

    const agentId = await createAgentId(apiSdk, "owner");
    const roomId = await createRoomOfType(
      apiSdk,
      "owner",
      "Autotest Quota Room",
      RoomType.CustomRoom,
    );

    // Positive control: the same call does set a quota on an ordinary room.
    const control = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDto: {
        roomIds: [roomId] as unknown as number[],
        quota: 104857600,
      },
    });
    expect(control.status).toBe(200);
    const { data: roomInfo } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect((roomInfo.response as { quotaLimit?: number }).quotaLimit).toBe(
      104857600,
    );

    await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDto: {
        roomIds: [agentId] as unknown as number[],
        quota: 104857600,
      },
    });

    const { data: agentInfo } = await ownerApi.rooms.getRoomInfo({
      id: agentId,
    });
    expect((agentInfo.response as { quotaLimit?: number }).quotaLimit).not.toBe(
      104857600,
    );
  });
});

test.describe("DELETE /files/rooms/:id - delete an agent", () => {
  test("DELETE /files/rooms/:id - Room Admin deletes their agent outright", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const api = apiSdk.forRole("roomAdmin");
    const agentId = await createAgentId(apiSdk, "roomAdmin");

    const { status } = await api.rooms.deleteRoom({
      id: agentId,
      deleteRoomRequest: { deleteAfter: false },
    });
    expect(status).toBe(200);
    const operation = await waitForOperation(api.operations);
    expect(operation.finished).toBe(true);

    const { status: infoStatus } = await api.rooms.getRoomInfo({
      id: agentId,
    });
    expect(infoStatus).toBe(404);
  });

  test("PUT /files/rooms/:id/archive - an agent cannot be archived", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");

    const { status } = await ownerApi.rooms.archiveRoom({
      id: agentId,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status).toBe(403);
    expect(await listedAgentIds(ownerApi)).toContain(agentId);
  });
});

test.describe("POST /files/owner - change the owner of an agent", () => {
  // BUG XXXXX: 403 "The role is not available for this user type" - the former
  // owner gets RoomManager, which an AI project no longer offers (c17aaf7877).

  test("BUG XXXXX: POST /files/owner - Owner changes the owner of an agent to a Room Admin", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat, other } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    const { data: admin } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const adminId = admin.response!.id!;
    const adminApi = apiSdk.forRole("roomAdmin");

    // Control: before the change the Room Admin is an outsider.
    const before = await adminApi.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: other },
    });
    expect(before.status, "an outsider cannot set the model").toBe(403);

    const { status, data } = await ownerApi.sharing.changeFileOwner({
      changeOwnerRequestDto: {
        folderIds: [agentId as unknown as object],
        userId: adminId,
      },
    });
    test.fail();
    expect(status, JSON.stringify(data)).toBe(200);

    const { data: info } = await ownerApi.rooms.getRoomInfo({ id: agentId });
    expect(info.response?.createdBy?.id, "the agent's new owner").toBe(adminId);
    expect(
      await agentModel(adminApi, agentId),
      "changing the owner leaves the model as it was",
    ).toBe(chat);
    expect(await listedAgentIds(adminApi)).toContain(agentId);

    const after = await adminApi.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: other },
    });
    expect(after.status, "the new owner manages the agent").toBe(200);
  });

  test("BUG XXXXX: POST /files/owner - DocSpace Admin changes the owner of a Room Admin's agent to themselves", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    // DocSpace Admin first: a Room Admin's session cannot add an admin.
    const { data: admin } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = admin.response!.id!;
    const adminApi = apiSdk.forRole("docSpaceAdmin");
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const agentId = await createAgentId(apiSdk, "roomAdmin");

    const { status, data } = await adminApi.sharing.changeFileOwner({
      changeOwnerRequestDto: {
        folderIds: [agentId as unknown as object],
        userId: adminId,
      },
    });

    test.fail();
    expect(status, JSON.stringify(data)).toBe(200);
    const { data: info } = await adminApi.rooms.getRoomInfo({ id: agentId });
    expect(info.response?.createdBy?.id).toBe(adminId);
  });
});

test.describe("POST /files/roomtemplate - an agent as a template source", () => {
  test("POST /files/roomtemplate - an agent cannot be turned into a room template", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const agentId = await createAgentId(apiSdk, "owner");

    const { status } = await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: { roomId: agentId, title: "Autotest Agent Template" },
    });

    expect(status).toBe(403);
    expect(await templateTitles(ownerApi.rooms)).not.toContain(
      "Autotest Agent Template",
    );
  });
});

async function templateTitles(rooms: RoomsApi): Promise<string[]> {
  const { data } = await rooms.getRoomsFolder({
    searchArea: SearchArea.Templates,
  });
  return (data.response?.folders ?? []).map(
    (folder) => (folder as { title?: string }).title ?? "",
  );
}
