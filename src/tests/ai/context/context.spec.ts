import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  AiContext,
  createTypedRoom,
  knowledgeRoomIds,
  knowledgeRooms,
  roomTitle,
} from "@/src/helpers/ai-context";
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

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(
  apiSdk: Parameters<typeof createTypedRoom>[0],
  paymentsApi: Parameters<typeof enableAiGateway>[0],
) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);
  return {
    ownerApi,
    context: new AiContext(apiSdk.request, apiSdk.tokenStore),
  };
}

async function ownerKnowledgeIds(context: Setup["context"]) {
  const { status, data } = await context.getKnowledgeFolders("owner");
  expect(status, "GET get-knowledge-folders as owner").toBe(200);
  return knowledgeRoomIds(data);
}

test.describe("GET /ai/context/get-knowledge-folders - contents", () => {
  test("GET /ai/context/get-knowledge-folders - Owner on a portal without Knowledge rooms gets an empty list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context } = await setup(apiSdk, paymentsApi);

    const { status, headers, data } =
      await context.getKnowledgeFolders("owner");

    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("application/json");
    expect(knowledgeRoomIds(data)).toEqual([]);

    // Positive control: the empty list is the real answer for "none", not what
    // the route says for everything.
    const id = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    expect(await ownerKnowledgeIds(context)).toEqual([String(id)]);
  });

  test("GET /ai/context/get-knowledge-folders - Owner sees a created KnowledgeRoom with the documented shape", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context } = await setup(apiSdk, paymentsApi);
    const title = roomTitle(apiSdk);
    const id = await createTypedRoom(apiSdk, title, RoomType.KnowledgeRoom);

    const { status, data } = await context.getKnowledgeFolders("owner");

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    for (const cloud of data!) {
      expect(typeof cloud.cloud, "cloud is a string").toBe("string");
      expect(Array.isArray(cloud.rooms), "rooms is an array").toBe(true);
      for (const room of cloud.rooms) {
        expect(
          Object.keys(room).sort(),
          "a room is exactly {id, name}",
        ).toEqual(["id", "name"]);
      }
    }

    const docspace = data!.filter((entry) => entry.cloud === "docspace");
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
    const { context } = await setup(apiSdk, paymentsApi);
    const created = new Map<string, string>();
    for (let i = 0; i < 3; i++) {
      const title = roomTitle(apiSdk, `Context ${i}`);
      const id = await createTypedRoom(apiSdk, title, RoomType.KnowledgeRoom);
      created.set(String(id), title);
    }

    const { status, data } = await context.getKnowledgeFolders("owner");

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
    const { context } = await setup(apiSdk, paymentsApi);
    const knowledge = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const others = {
      instructions: await createTypedRoom(
        apiSdk,
        roomTitle(apiSdk),
        RoomType.InstructionsRoom,
      ),
      project: await createTypedRoom(
        apiSdk,
        roomTitle(apiSdk),
        RoomType.AiProjectRoom,
      ),
      custom: await createTypedRoom(
        apiSdk,
        roomTitle(apiSdk),
        RoomType.CustomRoom,
      ),
    };

    // The KnowledgeRoom is the positive control: the others are absent while
    // the route still answers with a room.
    expect(await ownerKnowledgeIds(context)).toEqual([String(knowledge)]);
    for (const [kind, id] of Object.entries(others)) {
      expect(await ownerKnowledgeIds(context), kind).not.toContain(String(id));
    }
  });

  test("GET /ai/context/get-knowledge-folders - linking a KnowledgeRoom to an AI project does not change the list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context } = await setup(apiSdk, paymentsApi);
    const knowledge = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const project = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.AiProjectRoom,
    );
    const before = await context.getKnowledgeFolders("owner");

    const linked = await context.linkProjectSources("owner", project, [
      knowledge,
    ]);
    // The premise: without a real link there is nothing to be unaffected by.
    expect(linked.status, "the KnowledgeRoom is linked to the project").toBe(
      204,
    );
    const sources = await context.getProjectSources("owner", project);
    expect(
      sources.data?.response?.knowledgeRooms?.map((room) => room.id),
    ).toEqual([knowledge]);

    const after = await context.getKnowledgeFolders("owner");
    expect(after.status).toBe(200);
    expect(after.data).toEqual(before.data);
    expect(knowledgeRoomIds(after.data)).toEqual([String(knowledge)]);
  });

  test("GET /ai/context/get-knowledge-folders - repeated reads give the same answer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context } = await setup(apiSdk, paymentsApi);
    await createTypedRoom(apiSdk, roomTitle(apiSdk), RoomType.KnowledgeRoom);
    await createTypedRoom(apiSdk, roomTitle(apiSdk), RoomType.KnowledgeRoom);

    const first = await context.getKnowledgeFolders("owner");
    const second = await context.getKnowledgeFolders("owner");
    const third = await context.getKnowledgeFolders("owner");

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
    const { context, ownerApi } = await setup(apiSdk, paymentsApi);
    const id = await createTypedRoom(
      apiSdk,
      "Autotest Knowledge Before",
      RoomType.KnowledgeRoom,
    );

    const { status } = await ownerApi.rooms.updateRoom({
      id,
      updateRoomRequest: { title: "Autotest Knowledge After" },
    });
    expect(status, "PUT /files/rooms/:id").toBe(200);

    const { data } = await context.getKnowledgeFolders("owner");
    expect(knowledgeRooms(data)).toEqual([
      { id: String(id), name: "Autotest Knowledge After" },
    ]);
  });

  test("GET /ai/context/get-knowledge-folders - a deleted KnowledgeRoom leaves the list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context, ownerApi } = await setup(apiSdk, paymentsApi);
    const kept = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const removed = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    expect([...(await ownerKnowledgeIds(context))].sort()).toEqual(
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
      .poll(() => ownerKnowledgeIds(context), { timeout: 30_000 })
      .toEqual([String(kept)]);
  });

  // Observed, not promised: archiving a KnowledgeRoom is refused with 403 even
  // for the portal owner, so there is no archive/restore transition to cover.
  // What is asserted is the state — the refused archive leaves the room listed.
  test("GET /ai/context/get-knowledge-folders - an archive of a KnowledgeRoom is refused and the room stays listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context, ownerApi } = await setup(apiSdk, paymentsApi);
    const id = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );

    const { status } = await ownerApi.rooms.archiveRoom({
      id,
      archiveRoomRequest: { deleteAfter: false },
    });

    expect(status, "PUT /files/rooms/:id/archive").toBe(403);
    expect(await ownerKnowledgeIds(context)).toEqual([String(id)]);
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
    const { context } = await setup(apiSdk, paymentsApi);

    const { status, headers, data, text } =
      await context.getContextFolders("owner");

    expect(status).toBe(200);
    expect(headers["content-type"]).toContain("application/json");
    expect(() => JSON.parse(text), "the body parses as JSON").not.toThrow();
    // The SDK declares `AiSuccessResponse` ({ success }); the portal does not
    // send it.
    expect(Array.isArray(data), "the answer is an array").toBe(true);
    expect(data).not.toHaveProperty("success");
  });

  test("GET /ai/context/get-context-folders - the answer does not expose rooms the owner just created", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context } = await setup(apiSdk, paymentsApi);
    const title = roomTitle(apiSdk);
    await createTypedRoom(apiSdk, title, RoomType.KnowledgeRoom);
    await createTypedRoom(apiSdk, title + " custom", RoomType.CustomRoom);

    const { status, text } = await context.getContextFolders("owner");

    expect(status).toBe(200);
    expect(
      text,
      "knowledge/custom room titles are not context folders",
    ).not.toContain(title);
  });

  test("GET /ai/context/get-context-folders - repeated reads give the same answer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { context } = await setup(apiSdk, paymentsApi);

    const first = await context.getContextFolders("owner");
    const second = await context.getContextFolders("owner");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data).toEqual(first.data);
  });
});
