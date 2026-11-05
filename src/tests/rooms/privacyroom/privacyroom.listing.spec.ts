import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileShare,
  FolderDto,
  RoomPrivacyFilter,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import {
  Api,
  addKeyedMembers,
  createOwnerPrivateRoom,
  inviteToRoom,
} from "@/src/helpers/private-rooms";

/**
 * GET /files/rooms with the privacyFilter parameter (RoomPrivacyFilter: None,
 * Private, NotPrivate), and the interplay of private and ordinary rooms in one
 * portal. Rooms are read back from the portal; the ids come from the create
 * responses. The portal is fresh per test, so the lists hold nothing else.
 */

async function listRooms(api: Api, privacyFilter?: RoomPrivacyFilter) {
  const { data, status } = await api.rooms.getRoomsFolder({ privacyFilter });
  expect(status).toBe(200);
  return (data.response!.folders ?? []) as FolderDto[];
}

async function createPlainRoom(api: Api, title: string) {
  const { data, status } = await api.rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

test.describe("GET /files/rooms - privacyFilter", () => {
  test("GET /files/rooms - privacyFilter=Private lists only private rooms", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const privateId = await createOwnerPrivateRoom(apiSdk);
    const plainId = await createPlainRoom(
      owner,
      "Autotest plain " + apiSdk.faker.generateString(6),
    );

    const rooms = await listRooms(owner, RoomPrivacyFilter.Private);

    expect(rooms.map((r) => r.id)).toEqual([privateId]);
    expect(rooms[0].private).toBe(true);
    expect(rooms.map((r) => r.id)).not.toContain(plainId);
  });

  test("GET /files/rooms - privacyFilter=NotPrivate lists only ordinary rooms", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const privateId = await createOwnerPrivateRoom(apiSdk);
    const plainId = await createPlainRoom(
      owner,
      "Autotest plain " + apiSdk.faker.generateString(6),
    );

    const rooms = await listRooms(owner, RoomPrivacyFilter.NotPrivate);

    expect(rooms.map((r) => r.id)).toEqual([plainId]);
    expect(rooms[0].private ?? false).toBe(false);
    expect(rooms.map((r) => r.id)).not.toContain(privateId);
  });

  test("GET /files/rooms - privacyFilter=None and no filter return both kinds", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const privateId = await createOwnerPrivateRoom(apiSdk);
    const plainId = await createPlainRoom(
      owner,
      "Autotest plain " + apiSdk.faker.generateString(6),
    );

    for (const filter of [RoomPrivacyFilter.None, undefined]) {
      const ids = (await listRooms(owner, filter)).map((r) => r.id).sort();
      expect(ids).toEqual([privateId, plainId].sort());
    }
  });

  test("GET /files/rooms - An archived private room leaves the Private list", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const kept = await createOwnerPrivateRoom(apiSdk);
    const archived = await createOwnerPrivateRoom(apiSdk);
    expect(
      (await listRooms(owner, RoomPrivacyFilter.Private))
        .map((r) => r.id)
        .sort(),
    ).toEqual([kept, archived].sort());

    await archiveRoomAndWait(apiSdk, archived);

    expect(
      (await listRooms(owner, RoomPrivacyFilter.Private)).map((r) => r.id),
    ).toEqual([kept]);
  });

  test("GET /files/rooms - A user sees a private room only after being invited to it", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);

    expect(await listRooms(m1.api, RoomPrivacyFilter.Private)).toEqual([]);
    expect(await listRooms(m1.api)).toEqual([]);

    expect(
      (await inviteToRoom(owner, roomId, m1.id, FileShare.Read)).status,
    ).toBe(200);

    const rooms = await listRooms(m1.api, RoomPrivacyFilter.Private);
    expect(rooms.map((r) => r.id)).toEqual([roomId]);
    expect(rooms[0].private).toBe(true);

    // And the invitation can be taken back.
    await inviteToRoom(owner, roomId, m1.id, FileShare.None);
    expect(await listRooms(m1.api, RoomPrivacyFilter.Private)).toEqual([]);
  });
});
