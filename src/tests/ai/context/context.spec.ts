import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import type { ApiSDK } from "@/src/services/api-sdk";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  knowledgeClouds,
  knowledgeRoomIds,
  knowledgeRooms,
  roomTitle,
} from "@/src/helpers/ai-context";
import { createRoomOfType } from "@/src/helpers/rooms";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

// GET /ai/context/get-knowledge-folders lists the KnowledgeRooms (RoomType 11)
// the caller can see. The SDK types it as `AiSuccessResponse`, the portal
// answers `[{ cloud, rooms: [{ id, name }] }]` — see src/helpers/ai-context.ts.
//
// Agents are gone in DocSpace 4.1.0, so everything here is built from real
// rooms: KnowledgeRoom (11), InstructionsRoom (10), AiProjectRoom (12).
//
// Not asserted, because nothing in the SDK or on the portal promises it: the
// order of the rooms in the list. Every comparison is by id and as a set.

async function setup(
  apiSdk: ApiSDK,
  paymentsApi: Parameters<typeof enableAiGateway>[0],
) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);
  return { ownerApi };
}

async function ownerKnowledgeIds(ownerApi: ReturnType<ApiSDK["forRole"]>) {
  const { status, data } =
    await ownerApi.aiContext.aiContextGetKnowledgeFolders();
  expect(status, "GET get-knowledge-folders as owner").toBe(200);
  return knowledgeRoomIds(data);
}

test.describe("GET /ai/context/get-knowledge-folders - contents", () => {
  test("GET /ai/context/get-knowledge-folders - Owner on a portal without Knowledge rooms gets an empty list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);

    const { status, headers, data } =
      await ownerApi.aiContext.aiContextGetKnowledgeFolders();

    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("application/json");
    expect(knowledgeRoomIds(data)).toEqual([]);

    // Positive control: the empty list is the real answer for "none", not what
    // the route says for everything.
    const id = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    expect(await ownerKnowledgeIds(ownerApi)).toEqual([String(id)]);
  });

  test("GET /ai/context/get-knowledge-folders - Owner sees a created KnowledgeRoom with the documented shape", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const title = roomTitle(apiSdk);
    const id = await createRoomOfType(
      apiSdk,
      "owner",
      title,
      RoomType.KnowledgeRoom,
    );

    const { status, data } =
      await ownerApi.aiContext.aiContextGetKnowledgeFolders();

    expect(status).toBe(200);
    const clouds = knowledgeClouds(data);
    for (const cloud of clouds) {
      expect(typeof cloud.cloud, "cloud is a string").toBe("string");
      expect(Array.isArray(cloud.rooms), "rooms is an array").toBe(true);
      for (const room of cloud.rooms) {
        expect(
          Object.keys(room).sort(),
          "a room is exactly {id, name}",
        ).toEqual(["id", "name"]);
      }
    }

    const docspace = clouds.filter((entry) => entry.cloud === "docspace");
    expect(docspace, "one entry for the docspace cloud").toHaveLength(1);
    const [room] = docspace[0].rooms;
    expect(typeof room.id, "the id is a string, not a number").toBe("string");
    expect(room.id).toBe(String(id));
    expect(room.name).toBe(title);
  });

  test("GET /ai/context/get-knowledge-folders - several KnowledgeRooms are all listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const created = new Map<string, string>();
    for (let i = 0; i < 3; i++) {
      const title = roomTitle(apiSdk, `Context ${i}`);
      const id = await createRoomOfType(
        apiSdk,
        "owner",
        title,
        RoomType.KnowledgeRoom,
      );
      created.set(String(id), title);
    }

    const { status, data } =
      await ownerApi.aiContext.aiContextGetKnowledgeFolders();

    expect(status).toBe(200);
    const listed = knowledgeRooms(data);
    expect([...listed.map((room) => room.id)].sort()).toEqual(
      [...created.keys()].sort(),
    );
    for (const room of listed) {
      expect(room.name, `name of room ${room.id}`).toBe(created.get(room.id));
    }
  });

  test("GET /ai/context/get-knowledge-folders - rooms of other types are not listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const knowledge = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const others = {
      instructions: await createRoomOfType(
        apiSdk,
        "owner",
        roomTitle(apiSdk),
        RoomType.InstructionsRoom,
      ),
      project: await createRoomOfType(
        apiSdk,
        "owner",
        roomTitle(apiSdk),
        RoomType.AiProjectRoom,
      ),
      custom: await createRoomOfType(
        apiSdk,
        "owner",
        roomTitle(apiSdk),
        RoomType.CustomRoom,
      ),
    };

    // The KnowledgeRoom is the positive control: the others are absent while
    // the route still answers with a room.
    expect(await ownerKnowledgeIds(ownerApi)).toEqual([String(knowledge)]);
    for (const [kind, id] of Object.entries(others)) {
      expect(await ownerKnowledgeIds(ownerApi), kind).not.toContain(String(id));
    }
  });

  test("GET /ai/context/get-knowledge-folders - linking a KnowledgeRoom to an AI project does not change the list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const knowledge = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const project = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.AiProjectRoom,
    );
    const before = await ownerApi.aiContext.aiContextGetKnowledgeFolders();

    const linked = await ownerApi.roomsAI.linkProjectSources({
      id: project,
      linkAiProjectSourcesRequest: { roomIds: new Set([knowledge]) },
    });
    // The premise: without a real link there is nothing to be unaffected by.
    expect(linked.status, "the KnowledgeRoom is linked to the project").toBe(
      204,
    );
    const sources = await ownerApi.roomsAI.getProjectSources({ id: project });
    expect(
      sources.data.response?.knowledgeRooms?.map((room) => room.id),
    ).toEqual([knowledge]);

    const after = await ownerApi.aiContext.aiContextGetKnowledgeFolders();
    expect(after.status).toBe(200);
    expect(after.data).toEqual(before.data);
    expect(knowledgeRoomIds(after.data)).toEqual([String(knowledge)]);
  });

  test("GET /ai/context/get-knowledge-folders - repeated reads give the same answer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );

    const first = await ownerApi.aiContext.aiContextGetKnowledgeFolders();
    const second = await ownerApi.aiContext.aiContextGetKnowledgeFolders();
    const third = await ownerApi.aiContext.aiContextGetKnowledgeFolders();

    expect(first.status).toBe(200);
    expect(knowledgeRooms(first.data)).toHaveLength(2);
    expect(second.data).toEqual(first.data);
    expect(third.data).toEqual(first.data);
  });
});

test.describe("GET /ai/context/get-knowledge-folders - room lifecycle", () => {
  test("GET /ai/context/get-knowledge-folders - renaming a KnowledgeRoom shows the new name under the same id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const id = await createRoomOfType(
      apiSdk,
      "owner",
      "Autotest Knowledge Before",
      RoomType.KnowledgeRoom,
    );

    const { status } = await ownerApi.rooms.updateRoom({
      id,
      updateRoomRequest: { title: "Autotest Knowledge After" },
    });
    expect(status, "PUT /files/rooms/:id").toBe(200);

    const { data } = await ownerApi.aiContext.aiContextGetKnowledgeFolders();
    expect(knowledgeRooms(data)).toEqual([
      { id: String(id), name: "Autotest Knowledge After" },
    ]);
  });

  test("GET /ai/context/get-knowledge-folders - a deleted KnowledgeRoom leaves the list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const kept = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const removed = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    expect([...(await ownerKnowledgeIds(ownerApi))].sort()).toEqual(
      [String(kept), String(removed)].sort(),
    );

    const { status } = await ownerApi.rooms.deleteRoom({
      id: removed,
      deleteRoomRequest: { deleteAfter: false },
    });
    expect(status, "DELETE /files/rooms/:id").toBe(200);
    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);

    await expect
      .poll(() => ownerKnowledgeIds(ownerApi), { timeout: 30_000 })
      .toEqual([String(kept)]);
  });

  // Observed, not promised: archiving a KnowledgeRoom is refused with 403 even
  // for the portal owner, so there is no archive/restore transition to cover.
  // What is asserted is the state — the refused archive leaves the room listed.
  test("GET /ai/context/get-knowledge-folders - an archive of a KnowledgeRoom is refused and the room stays listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const id = await createRoomOfType(
      apiSdk,
      "owner",
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );

    const { status } = await ownerApi.rooms.archiveRoom({
      id,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status, "PUT /files/rooms/:id/archive").toBe(403);
    expect(await ownerKnowledgeIds(ownerApi)).toEqual([String(id)]);
  });
});

test.describe("GET /ai/context/get-context-folders - owner", () => {
  // The route answered `[]` in every state tried on 2026-11-05: empty portal,
  // Knowledge / Instructions / Project / AI / Custom rooms, files and subfolders
  // in them, linked sources, My documents, an invited user. What fills it is
  // unknown, so these tests pin the confirmed properties of the answer and not
  // its content; the functional coverage is blocked on the missing contract.
  test("GET /ai/context/get-context-folders - Owner gets a JSON array", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);

    const { status, headers, data } =
      await ownerApi.aiContext.aiContextGetContextFolders();

    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("application/json");
    // The SDK declares `AiSuccessResponse` ({ success }); the portal does not
    // send it.
    expect(Array.isArray(data), "the answer is an array").toBe(true);
    expect(data).not.toHaveProperty("success");
  });

  test("GET /ai/context/get-context-folders - the answer does not expose rooms the owner just created", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);
    const title = roomTitle(apiSdk);
    await createRoomOfType(apiSdk, "owner", title, RoomType.KnowledgeRoom);
    await createRoomOfType(
      apiSdk,
      "owner",
      title + " custom",
      RoomType.CustomRoom,
    );

    const { status, data } =
      await ownerApi.aiContext.aiContextGetContextFolders();

    expect(status).toBe(200);
    expect(
      JSON.stringify(data),
      "knowledge/custom room titles are not context folders",
    ).not.toContain(title);
  });

  test("GET /ai/context/get-context-folders - repeated reads give the same answer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi } = await setup(apiSdk, paymentsApi);

    const first = await ownerApi.aiContext.aiContextGetContextFolders();
    const second = await ownerApi.aiContext.aiContextGetContextFolders();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data).toEqual(first.data);
  });
});
