import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import {
  PublicKeyEntry,
  ZERO_GUID,
  addKeyedMembers,
  createOwnerPrivateRoom,
  createRoomFile,
  getFilePublicKeys,
  getOwnerId,
  inviteToRoom,
  uploadPrivateRoomFile,
} from "@/src/helpers/private-rooms";

/**
 * GET /api/2.0/files/file/{fileId}/publickeys (SDK: FilesSharingApi
 * getEncryptionAccess) — the keys a client needs in order to encrypt a file key
 * for every account that may open the file. The tests call it through
 * getFilePublicKeys, a raw request, because it must be sent with an explicit
 * bearer token and an empty Cookie header (several members share one request
 * context) and anonymously.
 *
 * Observed contract on 4.1.0: one entry per key of each member of the file's
 * private room; only the caller's own entries carry privateKeyEnc; a caller who
 * is not a member of the room gets 403, an anonymous caller 401, a missing file
 * 404. The set is a live view of the members' key rows, the same as
 * GET /privacyroom/{roomId}/access.
 */

const ownEntry = (entries: PublicKeyEntry[], userId: string) =>
  entries.filter((e) => e.userId === userId);

test.describe("GET /files/file/{fileId}/publickeys", () => {
  test("GET /files/file/{fileId}/publickeys - The owner reads every member's public key and only their own private half", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    const { status, entries } = await getFilePublicKeys(
      apiSdk,
      apiSdk.tokenStore.getToken("owner"),
      fileId,
    );

    expect(status).toBe(200);
    expect(entries.map((e) => e.userId).sort()).toEqual(
      [ownerId, m1.id].sort(),
    );
    expect(ownEntry(entries, m1.id)[0].publicKey).toBe(m1.publicKey);
    // Positive control first: the owner's own entry carries the private half.
    expect(ownEntry(entries, ownerId)[0].privateKeyEnc).toBeTruthy();
    expect(ownEntry(entries, m1.id)[0].privateKeyEnc ?? null).toBeNull();

    // The same set the room-level endpoint reports.
    const room = await owner.privacyroom.getUserKeysForRoom({ roomId });
    expect(
      room.data.response!.map((k) => `${k.userId}:${k.publicKey}`).sort(),
    ).toEqual(entries.map((e) => `${e.userId}:${e.publicKey}`).sort());
  });

  test("GET /files/file/{fileId}/publickeys - A Read member gets their own private half and not the owner's", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    const { status, entries } = await getFilePublicKeys(
      apiSdk,
      m1.token,
      fileId,
    );

    expect(status).toBe(200);
    expect(ownEntry(entries, m1.id)[0].privateKeyEnc).toBe(m1.privateKeyEnc);
    expect(ownEntry(entries, ownerId)).toHaveLength(1);
    expect(ownEntry(entries, ownerId)[0].publicKey).toBeTruthy();
    expect(ownEntry(entries, ownerId)[0].privateKeyEnc ?? null).toBeNull();
  });

  test("GET /files/file/{fileId}/publickeys - A user who is not a member of the room gets 403", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1, outsider] = await addKeyedMembers(apiSdk, 2);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    // Positive control: a member reads the same file.
    expect((await getFilePublicKeys(apiSdk, m1.token, fileId)).status).toBe(
      200,
    );

    const denied = await getFilePublicKeys(apiSdk, outsider.token, fileId);
    expect(denied.status).toBe(403);
    expect(denied.entries).toEqual([]);
    expect(denied.text).not.toContain(m1.publicKey);
  });

  test("GET /files/file/{fileId}/publickeys - A member of another private room gets 403", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1, m3] = await addKeyedMembers(apiSdk, 2);
    const roomA = await createOwnerPrivateRoom(apiSdk);
    const roomB = await createOwnerPrivateRoom(apiSdk);
    const fileA = await uploadPrivateRoomFile(owner, roomA);
    await inviteToRoom(owner, roomA, m1.id, FileShare.Read);
    await inviteToRoom(owner, roomB, m3.id, FileShare.Read);

    expect((await getFilePublicKeys(apiSdk, m1.token, fileA)).status).toBe(200);

    const denied = await getFilePublicKeys(apiSdk, m3.token, fileA);
    expect(denied.status).toBe(403);
    expect(denied.text).not.toContain(m1.publicKey);
  });

  for (const { type, role } of [
    { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { type: "RoomAdmin", role: "roomAdmin" },
    { type: "Guest", role: "guest" },
  ] as const) {
    test(`GET /files/file/{fileId}/publickeys - A ${type} who is not a member of the room gets 403`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const roomId = await createOwnerPrivateRoom(apiSdk);
      const fileId = await uploadPrivateRoomFile(owner, roomId);
      const ownerToken = apiSdk.tokenStore.getToken("owner");
      const { userData } = await apiSdk.addMember("owner", type);
      await apiSdk.authenticateMember(userData, type);
      const token = apiSdk.tokenStore.getToken(role);

      const denied = await getFilePublicKeys(apiSdk, token, fileId);
      expect(denied.status).toBe(403);
      expect(denied.entries).toEqual([]);
      // Positive control: the room owner reads the same file.
      expect((await getFilePublicKeys(apiSdk, ownerToken, fileId)).status).toBe(
        200,
      );
    });
  }

  test("GET /files/file/{fileId}/publickeys - Anonymous gets 401", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    expect(
      (
        await getFilePublicKeys(
          apiSdk,
          apiSdk.tokenStore.getToken("owner"),
          fileId,
        )
      ).status,
    ).toBe(200);

    const { status, entries } = await getFilePublicKeys(apiSdk, null, fileId);

    expect(status).toBe(401);
    expect(entries).toEqual([]);
  });

  test("GET /files/file/{fileId}/publickeys - A non-existent file is 404", async ({
    apiSdk,
  }) => {
    const { status } = await getFilePublicKeys(
      apiSdk,
      apiSdk.tokenStore.getToken("owner"),
      999999999,
    );
    expect(status).toBe(404);
  });

  test("GET /files/file/{fileId}/publickeys - A file of an archived private room still answers", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    const ownerId = await getOwnerId(owner);
    await archiveRoomAndWait(apiSdk, roomId);

    const { status, entries } = await getFilePublicKeys(
      apiSdk,
      apiSdk.tokenStore.getToken("owner"),
      fileId,
    );

    expect(status).toBe(200);
    expect(entries.map((e) => e.userId)).toEqual([ownerId]);
  });

  test("GET /files/file/{fileId}/publickeys - Follows membership: a removed member drops out and returns when invited again", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    const ownerToken = apiSdk.tokenStore.getToken("owner");
    const holders = async () =>
      (await getFilePublicKeys(apiSdk, ownerToken, fileId)).entries.map(
        (e) => e.userId,
      );

    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
    expect(await holders()).toContain(m1.id);

    await inviteToRoom(owner, roomId, m1.id, FileShare.None);
    expect(await holders()).not.toContain(m1.id);
    // The removed member is refused outright.
    expect((await getFilePublicKeys(apiSdk, m1.token, fileId)).status).toBe(
      403,
    );

    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
    expect((await holders()).filter((id) => id === m1.id)).toHaveLength(1);
  });

  test("GET /files/file/{fileId}/publickeys - Follows the member's own keys: deleted keys drop out, replaced keys are updated", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await uploadPrivateRoomFile(owner, roomId);
    const ownerToken = apiSdk.tokenStore.getToken("owner");
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    const rotated = "member-pk-rot-" + apiSdk.faker.generateString(10);
    expect(
      (
        await m1.api.privacyroom.replaceKey({
          encryptionKeyRequestDto: {
            publicKey: rotated,
            privateKeyEnc: "prv-rot",
          },
        })
      ).status,
    ).toBe(200);
    let entries = (await getFilePublicKeys(apiSdk, ownerToken, fileId)).entries;
    expect(ownEntry(entries, m1.id).map((e) => e.publicKey)).toEqual([rotated]);

    expect(
      (await m1.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);
    entries = (await getFilePublicKeys(apiSdk, ownerToken, fileId)).entries;
    expect(ownEntry(entries, m1.id)).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  // The SDK documents it: "a file kept anywhere else carries no keys and is
  // rejected as an unsupported request". The portal answers 415; the SDK does
  // not name the status code, so 415 is the observed value, not a stated one.
  test("GET /files/file/{fileId}/publickeys - A file outside a private room is rejected as an unsupported request", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data } = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest plain " + apiSdk.faker.generateString(6),
        roomType: RoomType.CustomRoom,
      },
    });
    const fileId = await createRoomFile(
      owner,
      data.response!.id!,
      "plain.docx",
    );

    const { status } = await getFilePublicKeys(
      apiSdk,
      apiSdk.tokenStore.getToken("owner"),
      fileId,
    );

    expect(status).toBe(415);
  });
});
