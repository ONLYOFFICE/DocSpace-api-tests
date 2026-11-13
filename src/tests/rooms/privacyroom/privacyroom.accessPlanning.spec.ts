import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import {
  ZERO_GUID,
  addKeyedMembers,
  createOwnerPrivateRoom,
  inviteToRoom,
  uploadPrivateRoomFile,
} from "@/src/helpers/private-rooms";

/**
 * The two reads a client makes before it grants access to a private room: the
 * public keys to encrypt the file keys for, and the files each person still
 * cannot open. Both are read-only and grant nothing.
 */

test.describe("GET /privacyroom/:roomId/access/candidates - Public keys of room invitees", () => {
  test("GET /privacyroom/:roomId/access/candidates - Returns the public key of each listed user and never a private half", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1, m2] = await addKeyedMembers(apiSdk, 2);
    const roomId = await createOwnerPrivateRoom(apiSdk);

    const { data, status } = await owner.privacyroom.getRoomCandidateKeys({
      roomId,
      userIds: [m1.id, m2.id],
    });

    expect(status).toBe(200);
    const byUser = new Map(data.response!.map((k) => [k.userId, k]));
    expect([...byUser.keys()].sort()).toEqual([m1.id, m2.id].sort());
    expect(byUser.get(m1.id)!.publicKey).toBe(m1.publicKey);
    expect(byUser.get(m2.id)!.publicKey).toBe(m2.publicKey);
    // The encrypted private half is handed out for nobody, the caller included.
    expect(data.response!.every((k) => !k.privateKeyEnc)).toBe(true);
  });

  test("GET /privacyroom/:roomId/access/candidates - A user who holds no key is absent from the answer", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [keyed] = await addKeyedMembers(apiSdk, 1);
    const { data: plain } = await apiSdk.addMember("owner", "User");
    const keyless = plain.response!.id as string;
    const roomId = await createOwnerPrivateRoom(apiSdk);

    const { data, status } = await owner.privacyroom.getRoomCandidateKeys({
      roomId,
      userIds: [keyed.id, keyless],
    });

    expect(status).toBe(200);
    // Absence is the answer, not an error: this person cannot be invited yet.
    expect(data.response!.map((k) => k.userId)).toEqual([keyed.id]);
  });

  test("GET /privacyroom/:roomId/access/candidates - A duplicate id counts once and no ids answer an empty list", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);

    const { data: twice, status } =
      await owner.privacyroom.getRoomCandidateKeys({
        roomId,
        userIds: [m1.id, m1.id],
      });
    expect(status).toBe(200);
    expect(twice.response!.map((k) => k.userId)).toEqual([m1.id]);

    const { data: none, status: noneStatus } =
      await owner.privacyroom.getRoomCandidateKeys({ roomId });
    expect(noneStatus).toBe(200);
    expect(none.response ?? []).toEqual([]);
  });

  test("GET /privacyroom/:roomId/access/candidates - A member who cannot change the room's access is refused", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1, m2] = await addKeyedMembers(apiSdk, 2);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    expect(
      (await inviteToRoom(owner, roomId, m1.id, FileShare.Read)).status,
    ).toBe(200);

    const { status } = await m1.api.privacyroom.getRoomCandidateKeys({
      roomId,
      userIds: [m2.id],
    });

    expect(status).toBe(403);
  });

  test("GET /privacyroom/:roomId/access/candidates - A room that is not private is rejected, an unknown one is missing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const { data: plainRoom } = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest plain ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });

    const { status: notPrivate } = await owner.privacyroom.getRoomCandidateKeys(
      {
        roomId: plainRoom.response!.id!,
        userIds: [m1.id],
      },
    );
    expect(notPrivate).toBe(400);

    const { status: unknown } = await owner.privacyroom.getRoomCandidateKeys({
      roomId: 999999999,
      userIds: [m1.id],
    });
    expect(unknown).toBe(404);
  });
});

test.describe("GET /privacyroom/:roomId/access/missing - Missing file keys of a room", () => {
  test("GET /privacyroom/:roomId/access/missing - Names the files a member cannot open, and nothing once their keys are written", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    expect(
      (await inviteToRoom(owner, roomId, m1.id, FileShare.ContentCreator))
        .status,
    ).toBe(200);

    const { data: before, status } =
      await owner.privacyroom.getRoomMissingFileKeys({ roomId });
    expect(status).toBe(200);
    const missingForMember = before.response!.find((e) => e.userId === m1.id);
    expect(missingForMember, JSON.stringify(before.response)).toBeDefined();
    expect(missingForMember!.fileIds).toEqual([fileId]);

    // Writing a key for everybody it named leaves it nothing to report.
    for (const entry of before.response!) {
      const { status: issued } = await owner.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          {
            userId: entry.userId,
            publicKeyId: ZERO_GUID,
            privateKeyEnc: `fk-for-${entry.userId}`,
          },
        ],
      });
      expect(issued).toBe(200);
    }

    const { data: after } = await owner.privacyroom.getRoomMissingFileKeys({
      roomId,
    });
    expect(after.response ?? []).toEqual([]);
  });

  test("GET /privacyroom/:roomId/access/missing - userIds checks people who are not members of the room", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [outsider] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);

    const { data: members, status } =
      await owner.privacyroom.getRoomMissingFileKeys({ roomId });
    expect(status).toBe(200);
    expect(members.response!.map((e) => e.userId)).not.toContain(outsider.id);

    const { data, status: namedStatus } =
      await owner.privacyroom.getRoomMissingFileKeys({
        roomId,
        userIds: [outsider.id],
      });

    // Asked before handing the room to a new owner: the person is checked
    // although they are nobody in the room yet.
    expect(namedStatus).toBe(200);
    expect(data.response!.map((e) => e.userId)).toEqual([outsider.id]);
    expect(data.response![0].fileIds).toEqual([fileId]);
  });

  test("GET /privacyroom/:roomId/access/missing - An id that names nobody on the portal is ignored", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);

    // Named beside somebody who really is missing a key, so the answer shows
    // the unknown id being passed over rather than the call failing or
    // returning nothing.
    const { data, status } = await owner.privacyroom.getRoomMissingFileKeys({
      roomId,
      userIds: [ZERO_GUID, m1.id],
    });

    expect(status).toBe(200);
    expect(data.response!.map((e) => e.userId)).toEqual([m1.id]);
    expect(data.response![0].fileIds).toEqual([fileId]);
  });

  test("GET /privacyroom/:roomId/access/missing - A member who cannot change the room's access is refused", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    await uploadPrivateRoomFile(owner, roomId);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    const { status } = await m1.api.privacyroom.getRoomMissingFileKeys({
      roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /privacyroom/:roomId/access/missing - A room that is not private is rejected, an unknown one is missing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data: plainRoom } = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest plain ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });

    const { status: notPrivate } =
      await owner.privacyroom.getRoomMissingFileKeys({
        roomId: plainRoom.response!.id!,
      });
    expect(notPrivate).toBe(400);

    const { status: unknown } = await owner.privacyroom.getRoomMissingFileKeys({
      roomId: 999999999,
    });
    expect(unknown).toBe(404);
  });
});
