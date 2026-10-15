import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileEntryType,
  FileShare,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";

type MemberType = "User" | "Guest";

// Ordering only means something in rooms whose contents are indexed (documented
// for setFileOrder and setFilesOrder), so these tests use an indexed VDR.
async function indexedRoomWithFiles(apiSdk: ApiSDK, titles: string[]) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: {
      title: "Autotest File Order Room",
      roomType: RoomType.VirtualDataRoom,
      indexing: true,
    },
  });
  const roomId = roomData.response!.id!;
  const ids: number[] = [];
  for (const title of titles) {
    const { data } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title, content: "<p/>" },
    });
    ids.push((data.response as { id: number }).id);
  }
  return { ownerApi, roomId, ids };
}

// `order` is a string on the file entry ("1", "2", ...).
async function orders(apiSdk: ApiSDK, ids: number[]) {
  const ownerApi = apiSdk.forRole("owner");
  const result: string[] = [];
  for (const fileId of ids) {
    const { data } = await ownerApi.files.getFileInfo({ fileId });
    result.push(String((data.response as { order?: string }).order));
  }
  return result;
}

const item = (entryId: number, order: number) => ({
  entryId,
  entryType: FileEntryType.File,
  order,
});

test.describe("PUT /files/:fileId/order - position semantics", () => {
  test("PUT /files/:fileId/order - New files take positions 1..n in creation order", async ({
    apiSdk,
  }) => {
    const { ids } = await indexedRoomWithFiles(apiSdk, ["A", "B", "C"]);

    expect(await orders(apiSdk, ids)).toEqual(["1", "2", "3"]);
  });

  // Documented: the file that held the wanted position "together with everything
  // after it, is shifted to make room, so the numbering stays without gaps".
  test("PUT /files/:fileId/order - Moving a file up shifts the others and leaves no gaps", async ({
    apiSdk,
  }) => {
    const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
      "A",
      "B",
      "C",
    ]);

    const { data, status } = await ownerApi.files.setFileOrder({
      fileId: ids[2],
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(200);
    expect(String((data.response as { order?: string }).order)).toBe("1");
    expect(await orders(apiSdk, ids)).toEqual(["2", "3", "1"]);
  });

  test("PUT /files/:fileId/order - Moving a file down shifts the others and leaves no gaps", async ({
    apiSdk,
  }) => {
    const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
      "A",
      "B",
      "C",
    ]);

    const { status } = await ownerApi.files.setFileOrder({
      fileId: ids[0],
      orderRequestDto: { order: 2 },
    });

    expect(status).toBe(200);
    expect(await orders(apiSdk, ids)).toEqual(["2", "1", "3"]);
  });

  // Documented: "a position beyond the end of the folder places the file last".
  test.fail(
    "BUG XXXXX: PUT /files/:fileId/order - Position beyond the end places the file last",
    async ({ apiSdk }) => {
      const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
        "A",
        "B",
        "C",
      ]);

      const { data, status } = await ownerApi.files.setFileOrder({
        fileId: ids[0],
        orderRequestDto: { order: 99 },
      });

      expect(status).toBe(200);
      expect(String((data.response as { order?: string }).order)).toBe("3");
      expect(await orders(apiSdk, ids)).toEqual(["3", "1", "2"]);
    },
  );

  // Documented: a dotted path "as in 1.2.3, in which case only its last segment is read".
  test("PUT /files/:fileId/order - Dotted path uses its last segment", async ({
    apiSdk,
  }) => {
    const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
      "A",
      "B",
      "C",
    ]);

    const { data, status } = await ownerApi.files.setFileOrder({
      fileId: ids[0],
      orderRequestDto: { order: "1.2.3" as unknown as number },
    });

    expect(status).toBe(200);
    expect(String((data.response as { order?: string }).order)).toBe("3");
    expect(await orders(apiSdk, ids)).toEqual(["3", "1", "2"]);
  });

  // Documented: "The call is mutating and idempotent."
  test("PUT /files/:fileId/order - Repeating the same request changes nothing further", async ({
    apiSdk,
  }) => {
    const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
      "A",
      "B",
      "C",
    ]);
    const move = () =>
      ownerApi.files.setFileOrder({
        fileId: ids[2],
        orderRequestDto: { order: 1 },
      });

    await move();
    const afterFirst = await orders(apiSdk, ids);
    const { status } = await move();

    expect(status).toBe(200);
    expect(await orders(apiSdk, ids)).toEqual(afterFirst);
  });

  for (const order of [0, -1]) {
    test(`PUT /files/:fileId/order - Position ${order} returns 400 and changes nothing`, async ({
      apiSdk,
    }) => {
      const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
        "A",
        "B",
        "C",
      ]);

      const { status } = await ownerApi.files.setFileOrder({
        fileId: ids[1],
        orderRequestDto: { order },
      });

      expect(await orders(apiSdk, ids)).toEqual(["1", "2", "3"]);
      expect(status).toBe(400);
    });
  }

  test("PUT /files/:fileId/order - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const { ownerApi } = await indexedRoomWithFiles(apiSdk, ["A"]);

    const { status } = await ownerApi.files.setFileOrder({
      fileId: 999999999,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(404);
  });
});

test.describe("PUT /files/order - bulk positions", () => {
  // Documented: "applied one after another in the order they are sent, and each of
  // them shifts its neighbours, so the result depends on that order".
  test("PUT /files/order - Result depends on the order of the items", async ({
    apiSdk,
  }) => {
    const first = await indexedRoomWithFiles(apiSdk, ["A", "B", "C"]);
    const second = await indexedRoomWithFiles(apiSdk, ["A", "B", "C"]);

    const forward = await first.ownerApi.files.setFilesOrder({
      ordersRequestDto: {
        items: [item(first.ids[0], 3), item(first.ids[1], 2)],
      },
    });
    const reversed = await second.ownerApi.files.setFilesOrder({
      ordersRequestDto: {
        items: [item(second.ids[1], 2), item(second.ids[0], 3)],
      },
    });

    expect(forward.status).toBe(200);
    expect(reversed.status).toBe(200);
    expect(await orders(apiSdk, first.ids)).toEqual(["3", "2", "1"]);
    expect(await orders(apiSdk, second.ids)).toEqual(["3", "1", "2"]);
  });

  test("PUT /files/order - Answers with the entries that were moved", async ({
    apiSdk,
  }) => {
    const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, ["A", "B"]);

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDto: { items: [item(ids[1], 1)] },
    });

    expect(status).toBe(200);
    expect(data.response?.map((e) => (e as { id: number }).id)).toEqual([
      ids[1],
    ]);
    expect(await orders(apiSdk, ids)).toEqual(["2", "1"]);
  });

  // Documented: "not one transaction, and a failure in the middle leaves the items
  // before it moved".
  test("PUT /files/order - Unknown id in the middle returns 404 and keeps the earlier moves", async ({
    apiSdk,
  }) => {
    const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
      "A",
      "B",
      "C",
    ]);

    const { status } = await ownerApi.files.setFilesOrder({
      ordersRequestDto: {
        items: [item(ids[0], 3), item(999999999, 1)],
      },
    });

    expect(status).toBe(404);
    expect(await orders(apiSdk, ids)).toEqual(["3", "1", "2"]);
  });

  test("PUT /files/order - Position 0 returns 400 and changes nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, ids } = await indexedRoomWithFiles(apiSdk, [
      "A",
      "B",
      "C",
    ]);

    const { status } = await ownerApi.files.setFilesOrder({
      ordersRequestDto: { items: [item(ids[0], 0)] },
    });

    expect(await orders(apiSdk, ids)).toEqual(["1", "2", "3"]);
    expect(status).toBe(400);
  });
});

test.describe("Order endpoints - permissions in an indexed VDR", () => {
  // ContentCreator is left out on purpose: it can reorder the owner's files through
  // both endpoints (200), while the SDK says a member acting on somebody else's
  // file is refused and the bulk call needs a room the caller may administer.
  // Whether ContentCreator is meant to be let through is an open question.
  const members: Array<{
    label: string;
    type: MemberType;
    access: FileShare | null;
  }> = [
    { label: "User Editing", type: "User", access: FileShare.Editing },
    { label: "User Read", type: "User", access: FileShare.Read },
    { label: "User without room access", type: "User", access: null },
    { label: "Guest without room access", type: "Guest", access: null },
  ];

  for (const { label, type, access } of members) {
    test(`setFileOrder and setFilesOrder - ${label} cannot move the owner's files and nothing changes`, async ({
      apiSdk,
    }) => {
      const { ownerApi, roomId, ids } = await indexedRoomWithFiles(apiSdk, [
        "A",
        "B",
        "C",
      ]);
      const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      if (access !== null) {
        const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: memberData.response!.id!, access }],
            notify: false,
          },
        });
        expect(inviteStatus).toBe(200);
      }

      // Positive control: the owner can move the same file.
      const { status: ownerStatus } = await ownerApi.files.setFileOrder({
        fileId: ids[1],
        orderRequestDto: { order: 2 },
      });
      expect(ownerStatus).toBe(200);
      const before = await orders(apiSdk, ids);

      const single = await api.files.setFileOrder({
        fileId: ids[2],
        orderRequestDto: { order: 1 },
      });
      const bulk = await api.files.setFilesOrder({
        ordersRequestDto: { items: [item(ids[2], 1)] },
      });

      expect(single.status).toBe(403);
      expect(bulk.status).toBe(403);
      expect(await orders(apiSdk, ids)).toEqual(before);
    });
  }

  // Documented: a content creator has edit access, so may move their own file.
  test("setFileOrder - ContentCreator can move a file they created", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId } = await indexedRoomWithFiles(apiSdk, ["A"]);
    const { api, data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
    const { data: created } = await api.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFile: { title: "Mine", content: "<p/>" },
    });
    const mineId = (created.response as { id: number }).id;

    const { status } = await api.files.setFileOrder({
      fileId: mineId,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(200);
  });
});
