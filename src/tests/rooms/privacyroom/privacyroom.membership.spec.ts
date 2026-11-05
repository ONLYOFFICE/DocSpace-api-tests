import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import {
  ZERO_GUID,
  addKeyedMembers,
  createOwnerPrivateRoom,
  createRoomFile,
  getOwnerId,
  inviteToRoom,
  roomKeyHolders,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";

/**
 * How the key set of a private room (GET /api/2.0/privacyroom/{roomId}/access)
 * follows room membership and the members' own keys, read back from the portal
 * after every change. The set is a live view: one entry per key of each member,
 * and the caller's own entry is the only one that carries privateKeyEnc.
 *
 * Complements privacyroom.spec.ts (single add/remove, invite without a key) and
 * privacyroom.permissions.spec.ts (role matrix). Everything key-related is
 * opaque to the portal, so these tests prove who the portal hands keys to, not
 * that a client can decrypt anything.
 */

test.describe("GET /api/2.0/privacyroom/{roomId}/access - membership changes", () => {
  test("PUT /files/rooms/{id}/share - Inviting the same member twice leaves a single entry in the key set", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);

    expect(
      (await inviteToRoom(owner, roomId, m1.id, FileShare.Read)).status,
    ).toBe(200);
    expect(
      (await inviteToRoom(owner, roomId, m1.id, FileShare.Read)).status,
    ).toBe(200);

    expect((await roomKeyHolders(owner, roomId)).sort()).toEqual(
      [ownerId, m1.id].sort(),
    );
    expect((await roomMemberAccess(owner, roomId)).get(m1.id)).toBe(
      FileShare.Read,
    );
    // The member sees the same, not a doubled set.
    expect((await roomKeyHolders(m1.api, roomId)).sort()).toEqual(
      [ownerId, m1.id].sort(),
    );
  });

  test("PUT /files/rooms/{id}/share - Concurrent identical invitations do not duplicate the member's entry", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);

    const results = await Promise.all([
      inviteToRoom(owner, roomId, m1.id, FileShare.Read),
      inviteToRoom(owner, roomId, m1.id, FileShare.Read),
      inviteToRoom(owner, roomId, m1.id, FileShare.Read),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);

    expect((await roomKeyHolders(owner, roomId)).sort()).toEqual(
      [ownerId, m1.id].sort(),
    );
    expect((await roomMemberAccess(owner, roomId)).size).toBe(2);
  });

  test("PUT /files/rooms/{id}/share - Changing a member's role keeps their access and a single key entry", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    for (const access of [
      FileShare.ContentCreator,
      FileShare.Editing,
      FileShare.Read,
    ]) {
      const { status } = await inviteToRoom(owner, roomId, m1.id, access);
      expect(status).toBe(200);

      // The role really changed ...
      expect((await roomMemberAccess(owner, roomId)).get(m1.id)).toBe(access);
      // ... and neither the member's access nor the set of key holders did.
      expect(
        (await m1.api.privacyroom.getUserKeysForRoom({ roomId })).status,
      ).toBe(200);
      expect((await roomKeyHolders(owner, roomId)).sort()).toEqual(
        [ownerId, m1.id].sort(),
      );
    }
  });

  test("PUT /files/rooms/{id}/share - A removed member is denied and dropped from the set; inviting them again restores exactly one entry", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Editing);
    expect(
      (await m1.api.privacyroom.getUserKeysForRoom({ roomId })).status,
    ).toBe(200);

    await test.step("after removal", async () => {
      expect(
        (await inviteToRoom(owner, roomId, m1.id, FileShare.None)).status,
      ).toBe(200);
      expect((await roomMemberAccess(owner, roomId)).has(m1.id)).toBe(false);
      expect(
        (await m1.api.privacyroom.getUserKeysForRoom({ roomId })).status,
      ).toBe(403);
      expect(await roomKeyHolders(owner, roomId)).toEqual([ownerId]);
    });

    await test.step("after inviting them again", async () => {
      expect(
        (await inviteToRoom(owner, roomId, m1.id, FileShare.Read)).status,
      ).toBe(200);
      const { data, status } = await m1.api.privacyroom.getUserKeysForRoom({
        roomId,
      });
      expect(status).toBe(200);
      const own = data.response!.filter((k) => k.userId === m1.id);
      expect(own).toHaveLength(1);
      expect(own[0].publicKey).toBe(m1.publicKey);
      expect((await roomKeyHolders(owner, roomId)).sort()).toEqual(
        [ownerId, m1.id].sort(),
      );
    });
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - A member who deletes their key loses the room's key set until they create a new one", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);
    expect((await roomKeyHolders(m1.api, roomId)).sort()).toEqual(
      [ownerId, m1.id].sort(),
    );

    await test.step("after deleting the key", async () => {
      expect(
        (await m1.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
      ).toBe(204);
      expect(
        (await m1.api.privacyroom.getUserKeysForRoom({ roomId })).status,
      ).toBe(403);
      expect(await roomKeyHolders(owner, roomId)).toEqual([ownerId]);
      // Membership itself is untouched: only the key material is gone.
      expect((await roomMemberAccess(owner, roomId)).get(m1.id)).toBe(
        FileShare.Read,
      );
    });

    await test.step("after creating a new key", async () => {
      const publicKey = "member-pk-new-" + apiSdk.faker.generateString(10);
      const created = await m1.api.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-new" },
      });
      expect(created.status).toBe(201);

      const { data, status } = await m1.api.privacyroom.getUserKeysForRoom({
        roomId,
      });
      expect(status).toBe(200);
      const own = data.response!.filter((k) => k.userId === m1.id);
      expect(own.map((k) => k.publicKey)).toEqual([publicKey]);
      const ownerView = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(
        ownerView.data
          .response!.filter((k) => k.userId === m1.id)
          .map((k) => k.publicKey),
      ).toEqual([publicKey]);
    });
  });

  test("PUT /api/2.0/privacyroom/keys - A member's replaced key shows up for the owner without its private half", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    const newPublicKey = "member-pk-rot-" + apiSdk.faker.generateString(10);
    const newPrivate = "member-prv-rot-" + apiSdk.faker.generateString(10);
    const replaced = await m1.api.privacyroom.replaceKey({
      encryptionKeyRequestDto: {
        publicKey: newPublicKey,
        privateKeyEnc: newPrivate,
      },
    });
    expect(replaced.status).toBe(200);

    const ownerView = await owner.privacyroom.getUserKeysForRoom({ roomId });
    const seen = ownerView.data.response!.filter((k) => k.userId === m1.id);
    expect(seen).toHaveLength(1);
    expect(seen[0].publicKey).toBe(newPublicKey);
    expect(seen[0].privateKeyEnc ?? null).toBeNull();
    expect(ownerView.data.response!.map((k) => k.publicKey)).not.toContain(
      m1.publicKey,
    );

    // Positive control: the member's own entry does carry the private half, so
    // the absence above is a rule and not an empty read.
    const own = (
      await m1.api.privacyroom.getUserKeysForRoom({ roomId })
    ).data.response!.find((k) => k.userId === m1.id);
    expect(own?.privateKeyEnc).toBe(newPrivate);
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - Deleting a key drops the member from every private room they belong to", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomA = await createOwnerPrivateRoom(apiSdk);
    const roomB = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomA, m1.id, FileShare.Read);
    await inviteToRoom(owner, roomB, m1.id, FileShare.Read);
    for (const roomId of [roomA, roomB]) {
      expect((await roomKeyHolders(owner, roomId)).sort()).toEqual(
        [ownerId, m1.id].sort(),
      );
    }

    expect(
      (await m1.api.privacyroom.deleteKeys({ id: ZERO_GUID })).status,
    ).toBe(204);

    for (const roomId of [roomA, roomB]) {
      expect(await roomKeyHolders(owner, roomId)).toEqual([ownerId]);
      expect(
        (await m1.api.privacyroom.getUserKeysForRoom({ roomId })).status,
      ).toBe(403);
    }
  });
});

test.describe("GET /api/2.0/privacyroom/{roomId}/access - isolation between private rooms", () => {
  test("GET /api/2.0/privacyroom/{roomId}/access - Each room's key set lists only its own members", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1, m3] = await addKeyedMembers(apiSdk, 2);
    const ownerId = await getOwnerId(owner);
    const roomA = await createOwnerPrivateRoom(apiSdk);
    const roomB = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomA, m1.id, FileShare.Read);
    await inviteToRoom(owner, roomB, m3.id, FileShare.Read);

    const a = await owner.privacyroom.getUserKeysForRoom({ roomId: roomA });
    const b = await owner.privacyroom.getUserKeysForRoom({ roomId: roomB });
    expect(a.data.response!.map((k) => k.userId).sort()).toEqual(
      [ownerId, m1.id].sort(),
    );
    expect(b.data.response!.map((k) => k.userId).sort()).toEqual(
      [ownerId, m3.id].sort(),
    );
    expect(a.data.response!.map((k) => k.publicKey)).not.toContain(
      m3.publicKey,
    );
    expect(b.data.response!.map((k) => k.publicKey)).not.toContain(
      m1.publicKey,
    );
  });

  test("GET /api/2.0/privacyroom/{roomId}/access - A member of one private room cannot read another's key set", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1, m3] = await addKeyedMembers(apiSdk, 2);
    const roomA = await createOwnerPrivateRoom(apiSdk);
    const roomB = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomA, m1.id, FileShare.Read);
    await inviteToRoom(owner, roomB, m3.id, FileShare.Read);

    // Positive controls: each reads the room they belong to.
    expect(
      (await m1.api.privacyroom.getUserKeysForRoom({ roomId: roomA })).status,
    ).toBe(200);
    expect(
      (await m3.api.privacyroom.getUserKeysForRoom({ roomId: roomB })).status,
    ).toBe(200);

    expect(
      (await m1.api.privacyroom.getUserKeysForRoom({ roomId: roomB })).status,
    ).toBe(403);
    expect(
      (await m3.api.privacyroom.getUserKeysForRoom({ roomId: roomA })).status,
    ).toBe(403);
  });

  for (const { type, role } of [
    { type: "RoomAdmin", role: "roomAdmin" },
    { type: "Guest", role: "guest" },
  ] as const) {
    test(`GET /api/2.0/privacyroom/{roomId}/access - A ${type} who is not a member is denied and the key set stays unchanged`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const ownerId = await getOwnerId(owner);
      const roomId = await createOwnerPrivateRoom(apiSdk);
      const { userData } = await apiSdk.addMember("owner", type);
      await apiSdk.authenticateMember(userData, type);

      const { status } = await apiSdk
        .forRole(role)
        .privacyroom.getUserKeysForRoom({ roomId });

      expect(status).toBe(403);
      expect(await roomKeyHolders(owner, roomId)).toEqual([ownerId]);
    });
  }

  test("GET /api/2.0/privacyroom/{roomId}/access - A member of an archived private room still reads its key set", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const [m1] = await addKeyedMembers(apiSdk, 1);
    const ownerId = await getOwnerId(owner);
    const roomId = await createOwnerPrivateRoom(apiSdk);
    await inviteToRoom(owner, roomId, m1.id, FileShare.Read);

    await archiveRoomAndWait(apiSdk, roomId);

    expect((await roomKeyHolders(m1.api, roomId)).sort()).toEqual(
      [ownerId, m1.id].sort(),
    );
  });
});

test.describe("GET /api/2.0/privacyroom/{roomId}/access - ids that are not private rooms", () => {
  test("GET /api/2.0/privacyroom/{roomId}/access - A folder inside a private room is rejected with 400", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const { data } = await owner.folders.createFolder({
      folderId: roomId,
      createFolderRequest: {
        title: "Autotest sub " + apiSdk.faker.generateString(6),
      },
    });

    const { status } = await owner.privacyroom.getUserKeysForRoom({
      roomId: data.response!.id!,
    });
    expect(status).toBe(400);
  });

  test("GET /api/2.0/privacyroom/{roomId}/access - A file id is reported as missing (404)", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createOwnerPrivateRoom(apiSdk);
    const fileId = await createRoomFile(owner, roomId, "Autotest id.docx");

    const { status } = await owner.privacyroom.getUserKeysForRoom({
      roomId: fileId,
    });
    expect(status).toBe(404);
  });

  test("GET /api/2.0/privacyroom/{roomId}/access - The caller's My documents folder is rejected with 400", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data } = await owner.folders.getMyFolder();

    const { status } = await owner.privacyroom.getUserKeysForRoom({
      roomId: data.response!.current!.id!,
    });
    expect(status).toBe(400);
  });
});
