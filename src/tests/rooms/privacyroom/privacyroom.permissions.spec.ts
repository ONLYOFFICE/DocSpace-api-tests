import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { folderIds, roomAccesses } from "@/src/helpers/rooms";

/**
 * Access control for the PrivacyroomApi.
 *
 * Encryption keys are personal and per-caller: every authenticated user manages
 * ONLY their own keys, and there is no parameter to target another user's keys.
 * Anonymous requests get 401. Guests currently get 403 on set/replace, which is
 * a bug (BUG 82524) — they should be able to manage their own keys; as a knock-on
 * effect a Guest can never be a member of a private room, since membership
 * requires a key.
 *
 * Room key sets (GET /privacyroom/{roomId}/access) are MEMBERSHIP-scoped, not
 * role-scoped: a DocSpaceAdmin who is not a member is denied, while any member
 * from Viewer upwards reads the full set. Every entry in that set currently
 * carries the member's privateKeyEnc, which is a leak (BUG 82803).
 *
 * The per-role tests for GET /privacyroom/keys/filter were removed on
 * 2026-08-04: the route no longer exists (see the note in privacyroom.spec.ts),
 * and once the filter arguments were gone they only re-ran the GET
 * /privacyroom/keys cases below.
 */
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

const dto = (apiSdk: { faker: { generateString: (n: number) => string } }) => ({
  encryptionKeyRequestDto: {
    publicKey: "pk-" + apiSdk.faker.generateString(12),
    privateKeyEnc: "prv-" + apiSdk.faker.generateString(12),
  },
});

test.describe("GET /api/2.0/privacyroom/keys - access control", () => {
  test("GET /api/2.0/privacyroom/keys - Owner reads back their own key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const publicKey = "owner-" + apiSdk.faker.generateString(16);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "op" },
    });

    const { data, status } = await owner.privacyroom.getUserKeys();
    expect(status).toBe(200);
    expect(data.response?.map((k) => k.publicKey)).toEqual([publicKey]);
  });

  test("GET /api/2.0/privacyroom/keys - DocSpaceAdmin reads back their own key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    const publicKey = "admin-" + apiSdk.faker.generateString(16);
    await admin.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "ap" },
    });

    const { data, status } = await admin.privacyroom.getUserKeys();
    expect(status).toBe(200);
    // The admin gets their OWN key back, not someone else's or an empty set.
    expect(data.response?.map((k) => k.publicKey)).toEqual([publicKey]);
  });

  test("GET /api/2.0/privacyroom/keys - RoomAdmin reads back their own key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdmin = apiSdk.forRole("roomAdmin");
    const publicKey = "roomadmin-" + apiSdk.faker.generateString(16);
    await roomAdmin.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "rp" },
    });

    const { data, status } = await roomAdmin.privacyroom.getUserKeys();
    expect(status).toBe(200);
    expect(data.response?.map((k) => k.publicKey)).toEqual([publicKey]);
  });

  test("GET /api/2.0/privacyroom/keys - User reads back their own key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    const publicKey = "user-" + apiSdk.faker.generateString(16);
    await user.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "up" },
    });

    const { data, status } = await user.privacyroom.getUserKeys();
    expect(status).toBe(200);
    expect(data.response?.map((k) => k.publicKey)).toEqual([publicKey]);
  });

  test("GET /api/2.0/privacyroom/keys - Guest reads their own (empty) key set", async ({
    apiSdk,
  }) => {
    // Guest cannot create a key (BUG 82524), so reading returns their OWN empty
    // set (200, count 0) — never another user's keys.
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const { data, status } = await apiSdk
      .forRole("guest")
      .privacyroom.getUserKeys();
    expect(status).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response ?? []).toHaveLength(0);
  });

  test("GET /api/2.0/privacyroom/keys - Anonymous cannot read keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().privacyroom.getUserKeys();
    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/privacyroom/keys - access control", () => {
  // POST create should return 201 Created; the API returns 200. Each test first
  // verifies the role could actually create its key (authorization side-effect),
  // then the 201 status assertion drives the expected failure.
  test("POST /api/2.0/privacyroom/keys - Owner can set keys", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82546: setKeys returns 200 on create instead of 201 Created",
    );
    const owner = apiSdk.forRole("owner");
    const { status } = await owner.privacyroom.setKeys(dto(apiSdk));
    expect((await owner.privacyroom.getUserKeys()).data.count).toBe(1);
    expect(status).toBe(201);
  });

  test("POST /api/2.0/privacyroom/keys - DocSpaceAdmin can set keys", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82546: setKeys returns 200 on create instead of 201 Created",
    );
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    const { status } = await admin.privacyroom.setKeys(dto(apiSdk));
    expect((await admin.privacyroom.getUserKeys()).data.count).toBe(1);
    expect(status).toBe(201);
  });

  test("POST /api/2.0/privacyroom/keys - RoomAdmin can set keys", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82546: setKeys returns 200 on create instead of 201 Created",
    );
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdmin = apiSdk.forRole("roomAdmin");
    const { status } = await roomAdmin.privacyroom.setKeys(dto(apiSdk));
    expect((await roomAdmin.privacyroom.getUserKeys()).data.count).toBe(1);
    expect(status).toBe(201);
  });

  test("POST /api/2.0/privacyroom/keys - User can set keys", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82546: setKeys returns 200 on create instead of 201 Created",
    );
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    const { status } = await user.privacyroom.setKeys(dto(apiSdk));
    expect((await user.privacyroom.getUserKeys()).data.count).toBe(1);
    expect(status).toBe(201);
  });

  test("POST /api/2.0/privacyroom/keys - Guest can set keys", async ({
    apiSdk,
  }) => {
    // Guests should be able to manage their own encryption keys (expect 200),
    // but the API currently denies them with 403.
    test.fail(
      true,
      "BUG 82524: Guest cannot set encryption keys (403 instead of 200)",
    );
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const { status } = await apiSdk
      .forRole("guest")
      .privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("POST /api/2.0/privacyroom/keys - Anonymous cannot set keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/privacyroom/keys - access control", () => {
  test("PUT /api/2.0/privacyroom/keys - Owner can replace their key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    await owner.privacyroom.setKeys(dto(apiSdk));
    const { status } = await owner.privacyroom.replaceKey(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/privacyroom/keys - DocSpaceAdmin can replace their key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    await admin.privacyroom.setKeys(dto(apiSdk));
    const { status } = await admin.privacyroom.replaceKey(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/privacyroom/keys - RoomAdmin can replace their key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdmin = apiSdk.forRole("roomAdmin");
    await roomAdmin.privacyroom.setKeys(dto(apiSdk));
    const { status } = await roomAdmin.privacyroom.replaceKey(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/privacyroom/keys - User can replace their key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    await user.privacyroom.setKeys(dto(apiSdk));
    const { status } = await user.privacyroom.replaceKey(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/privacyroom/keys - Guest can replace their own key", async ({
    apiSdk,
  }) => {
    // Replacing requires an existing key, but a guest cannot create one because
    // setKeys is denied today (BUG 82524), so the replace-own-key flow cannot be
    // exercised. Marked test.fail on the setKeys prerequisite.
    // TODO(BUG 82524): once guests can set keys, finish this test — create a key,
    // replace it, and assert getUserKeys returns the new value.
    test.fail(
      true,
      "BUG 82524: Guest cannot set encryption keys, so the replace-own-key flow cannot be exercised",
    );
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guest = apiSdk.forRole("guest");
    const { status } = await guest.privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/privacyroom/keys - Anonymous cannot replace keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().privacyroom.replaceKey({
      encryptionKeyRequestDto: { publicKey: "pk", privateKeyEnc: "prv" },
    });
    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/privacyroom/keys/{id} - access control", () => {
  // DELETE of an existing key should return 204 No Content; the API returns 200.
  // Each test first verifies the key is actually gone (authorization side-effect
  // and guard against a no-op), then the 204 status assertion drives the failure.
  test("DELETE /api/2.0/privacyroom/keys/{id} - Owner can delete their key", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82551: deleteKeys returns 200 on a successful delete instead of 204 No Content",
    );
    const owner = apiSdk.forRole("owner");
    await owner.privacyroom.setKeys(dto(apiSdk));
    const { status } = await owner.privacyroom.deleteKeys({ id: ZERO_GUID });
    expect((await owner.privacyroom.getUserKeys()).data.count).toBe(0);
    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - DocSpaceAdmin can delete their key", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82551: deleteKeys returns 200 on a successful delete instead of 204 No Content",
    );
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    await admin.privacyroom.setKeys(dto(apiSdk));
    const { status } = await admin.privacyroom.deleteKeys({ id: ZERO_GUID });
    expect((await admin.privacyroom.getUserKeys()).data.count).toBe(0);
    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - RoomAdmin can delete their key", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82551: deleteKeys returns 200 on a successful delete instead of 204 No Content",
    );
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdmin = apiSdk.forRole("roomAdmin");
    await roomAdmin.privacyroom.setKeys(dto(apiSdk));
    const { status } = await roomAdmin.privacyroom.deleteKeys({
      id: ZERO_GUID,
    });
    expect((await roomAdmin.privacyroom.getUserKeys()).data.count).toBe(0);
    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - User can delete their key", async ({
    apiSdk,
  }) => {
    test.fail(
      true,
      "BUG 82551: deleteKeys returns 200 on a successful delete instead of 204 No Content",
    );
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    await user.privacyroom.setKeys(dto(apiSdk));
    const { status } = await user.privacyroom.deleteKeys({ id: ZERO_GUID });
    expect((await user.privacyroom.getUserKeys()).data.count).toBe(0);
    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - Guest can delete their own key", async ({
    apiSdk,
  }) => {
    // A guest cannot create a key because setKeys is denied today (BUG 82524),
    // so there is never a real key to delete — deleting the absent zero-GUID key
    // would only be an idempotent no-op that proves nothing. Marked test.fail on
    // the setKeys prerequisite.
    // TODO(BUG 82524): once guests can set keys, finish this test — create a key,
    // delete it, and assert getUserKeys no longer returns it.
    test.fail(
      true,
      "BUG 82524: Guest cannot set encryption keys, so the delete-own-key flow cannot be exercised",
    );
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guest = apiSdk.forRole("guest");
    const { status } = await guest.privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - Anonymous cannot delete keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .privacyroom.deleteKeys({ id: ZERO_GUID });
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/privacyroom/{roomId}/access - access control", () => {
  // Helper: owner (with keys) creates a private room, returns its id.
  const createPrivateRoomAsOwner = async (apiSdk: ApiSDK) => {
    const owner = apiSdk.forRole("owner");
    const ownerPk = "owner-" + apiSdk.faker.generateString(12);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: ownerPk, privateKeyEnc: "op" },
    });
    const { data: room } = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Privacy Room " + apiSdk.faker.generateString(6),
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    return { roomId: room.response!.id! as number, ownerPk };
  };

  test("GET /api/2.0/privacyroom/{roomId}/access - Non-member cannot read a private room's keys", async ({
    apiSdk,
  }) => {
    const { roomId } = await createPrivateRoomAsOwner(apiSdk);

    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    await user.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        publicKey: "user-" + apiSdk.faker.generateString(12),
        privateKeyEnc: "up",
      },
    });

    // The user was never invited to the room.
    const { status } = await user.privacyroom.getUserKeysForRoom({ roomId });
    expect(status).toBe(403);
  });

  test("GET /api/2.0/privacyroom/{roomId}/access - DocSpaceAdmin who is not a member must not read the room's E2E keys", async ({
    apiSdk,
  }) => {
    // End-to-end encryption means even an admin who is not a member of the room
    // is denied (403), exactly like a regular non-member. The admin used to get
    // 200 with the room creator's public key in the body; that is BUG 82540,
    // fixed — verified on a live portal on 2026-08-04.
    const { roomId, ownerPk } = await createPrivateRoomAsOwner(apiSdk);

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    await admin.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: "admin-pk", privateKeyEnc: "ap" },
    });

    const { data, status } = await admin.privacyroom.getUserKeysForRoom({
      roomId,
    });

    // Side-effect check first: the owner's key must NOT leak to a non-member.
    expect(data.response?.map((k) => k.publicKey) ?? []).not.toContain(ownerPk);
    expect(status).toBe(403);
  });

  test("GET /api/2.0/privacyroom/{roomId}/access - Anonymous cannot read room keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .privacyroom.getUserKeysForRoom({ roomId: 1 });
    expect(status).toBe(401);
  });

  // Every access level a User-type member can hold in a private room grants the
  // room's key set — a Viewer sees exactly what a ContentCreator sees. This is
  // by design (a member must be able to decrypt what they are allowed to open),
  // and pinning it is what makes a future narrowing visible.
  // RoomManager is excluded: it cannot be granted to a User-type member at all
  // (the invite is 403), so it is covered by the RoomAdmin test below instead.
  for (const { label, access } of roomAccesses.filter(
    (a) => a.access !== FileShare.RoomManager,
  )) {
    test(`GET /api/2.0/privacyroom/{roomId}/access - A member with ${label} access reads the room's key set`, async ({
      apiSdk,
    }) => {
      const { roomId, ownerPk } = await createPrivateRoomAsOwner(apiSdk);

      const { data: memberData, userData } = await apiSdk.addMember(
        "owner",
        "User",
      );
      const userId = memberData.response!.id as string;
      const memberApi = await apiSdk.authenticateMember(userData, "User");
      const memberPk = "member-" + apiSdk.faker.generateString(12);
      await memberApi.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: memberPk, privateKeyEnc: "mp" },
      });

      // Pin the premise the whole test rests on: the invite really happened.
      const invite = await apiSdk.forRole("owner").rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access }],
          notify: false,
        },
      });
      expect(invite.status).toBe(200);

      const { data, status } = await memberApi.privacyroom.getUserKeysForRoom({
        roomId,
      });
      expect(status).toBe(200);
      expect(data.response!.map((k) => k.publicKey).sort()).toEqual(
        [memberPk, ownerPk].sort(),
      );
    });
  }

  test("GET /api/2.0/privacyroom/{roomId}/access - A RoomAdmin invited as RoomManager reads the room's key set", async ({
    apiSdk,
  }) => {
    // RoomManager is the one level a User-type member cannot be given; a
    // RoomAdmin-type member can, and it grants the key set like any other level.
    const { roomId, ownerPk } = await createPrivateRoomAsOwner(apiSdk);

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = memberData.response!.id as string;
    const roomAdminApi = await apiSdk.authenticateMember(userData, "RoomAdmin");
    const roomAdminPk = "roomadmin-" + apiSdk.faker.generateString(12);
    await roomAdminApi.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: roomAdminPk, privateKeyEnc: "rp" },
    });

    const invite = await apiSdk.forRole("owner").rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });
    expect(invite.status).toBe(200);

    const { data, status } = await roomAdminApi.privacyroom.getUserKeysForRoom({
      roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.map((k) => k.publicKey).sort()).toEqual(
      [ownerPk, roomAdminPk].sort(),
    );
  });

  test("GET /api/2.0/privacyroom/{roomId}/access - A DocSpaceAdmin who IS a member reads the room's key set", async ({
    apiSdk,
  }) => {
    // Positive counterpart to the non-member DocSpaceAdmin test above: the admin
    // role grants nothing by itself, but a normal invitation does.
    const { roomId, ownerPk } = await createPrivateRoomAsOwner(apiSdk);

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = memberData.response!.id as string;
    const adminApi = await apiSdk.authenticateMember(userData, "DocSpaceAdmin");
    const adminPk = "admin-" + apiSdk.faker.generateString(12);
    await adminApi.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: adminPk, privateKeyEnc: "ap" },
    });

    const denied = await adminApi.privacyroom.getUserKeysForRoom({ roomId });
    expect(denied.status).toBe(403);

    const invite = await apiSdk.forRole("owner").rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });
    expect(invite.status).toBe(200);

    const { data, status } = await adminApi.privacyroom.getUserKeysForRoom({
      roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.map((k) => k.publicKey).sort()).toEqual(
      [adminPk, ownerPk].sort(),
    );
  });

  test("PUT /files/rooms/{id}/share - A Guest can never be a member of a private room", async ({
    apiSdk,
  }) => {
    // Membership requires an encryption key and a Guest cannot create one
    // (BUG 82524), so every invitation of a Guest to a private room is refused.
    // The plain room is the positive control: the same Guest, the same access
    // level and the same call succeed there, so the 403 is about the private
    // room's key requirement and not about guests being uninvitable in general.
    const owner = apiSdk.forRole("owner");
    const { roomId } = await createPrivateRoomAsOwner(apiSdk);
    const { data: plain } = await owner.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Plain Room " + apiSdk.faker.generateString(6),
        roomType: RoomType.CustomRoom,
      },
    });
    const plainRoomId = plain.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id as string;
    const invitation = {
      invitations: [{ id: guestId, access: FileShare.Read }],
      notify: false,
    };

    const toPrivate = await owner.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: invitation,
    });
    expect(toPrivate.status).toBe(403);
    expect(
      (toPrivate.data as unknown as { error?: { message?: string } }).error
        ?.message,
    ).toContain("does not have an encryption key");

    const toPlain = await owner.rooms.setRoomSecurity({
      id: plainRoomId,
      roomInvitationRequest: invitation,
    });
    expect(toPlain.status).toBe(200);
  });

  test("BUG 82803: GET /api/2.0/privacyroom/{roomId}/access - Every member receives the other members' privateKeyEnc", async ({
    apiSdk,
  }) => {
    // The response carries one entry per member, and each entry includes that
    // member's privateKeyEnc — so any member of a private room, at any access
    // level, is handed every other member's encrypted private key, the room
    // owner's included. In an end-to-end scheme the private half must never
    // leave its owner: only publicKey is needed to wrap the room key for a
    // member. The caller's OWN entry is asserted first as the positive control,
    // so an empty or broken read cannot pass this test.
    test.fail(
      true,
      "BUG 82803: getUserKeysForRoom returns other members' privateKeyEnc to every member of the room",
    );
    const { roomId } = await createPrivateRoomAsOwner(apiSdk);

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id as string;
    const memberApi = await apiSdk.authenticateMember(userData, "User");
    const memberPrv = "member-prv-" + apiSdk.faker.generateString(12);
    await memberApi.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        publicKey: "member-" + apiSdk.faker.generateString(12),
        privateKeyEnc: memberPrv,
      },
    });
    const invite = await apiSdk.forRole("owner").rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });
    expect(invite.status).toBe(200);

    const { data, status } = await memberApi.privacyroom.getUserKeysForRoom({
      roomId,
    });
    expect(status).toBe(200);

    // Positive control: the caller's own key material IS present, so the read
    // definitely returned the room's real key set.
    const own = data.response!.find((k) => k.userId === memberId);
    expect(own?.privateKeyEnc).toBe(memberPrv);

    // The other members' entries must expose the public half only.
    const others = data.response!.filter((k) => k.userId !== memberId);
    expect(others.length).toBeGreaterThan(0);
    for (const key of others) {
      expect(key.publicKey).toBeTruthy();
      expect(key.privateKeyEnc ?? null).toBeNull();
    }
  });
});

test.describe("Cross-user E2E key isolation", () => {
  test("A user cannot replace another user's key", async ({ apiSdk }) => {
    const owner = apiSdk.forRole("owner");
    const ownerPk = "owner-" + apiSdk.faker.generateString(12);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: ownerPk, privateKeyEnc: "op" },
    });

    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    await user.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        publicKey: "user-" + apiSdk.faker.generateString(12),
        privateKeyEnc: "up",
      },
    });

    // The user replaces THEIR OWN zero-GUID key; the owner's key (also zero-GUID
    // in its own namespace) must be untouched.
    await user.privacyroom.replaceKey({
      encryptionKeyRequestDto: {
        publicKey: "user-new-" + apiSdk.faker.generateString(12),
        privateKeyEnc: "up2",
      },
    });

    const ownerKeys = await owner.privacyroom.getUserKeys();
    expect(ownerKeys.data.response?.map((k) => k.publicKey)).toEqual([ownerPk]);
  });

  test("A user cannot delete another user's key", async ({ apiSdk }) => {
    const owner = apiSdk.forRole("owner");
    const ownerPk = "owner-" + apiSdk.faker.generateString(12);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: ownerPk, privateKeyEnc: "op" },
    });

    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    await user.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        publicKey: "user-" + apiSdk.faker.generateString(12),
        privateKeyEnc: "up",
      },
    });

    await user.privacyroom.deleteKeys({ id: ZERO_GUID });

    const ownerKeys = await owner.privacyroom.getUserKeys();
    expect(ownerKeys.data.response?.map((k) => k.publicKey)).toEqual([ownerPk]);
  });

  test("A DocSpaceAdmin cannot replace another user's E2E key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerPk = "owner-" + apiSdk.faker.generateString(12);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: ownerPk, privateKeyEnc: "op" },
    });

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    await admin.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: "admin-pk", privateKeyEnc: "ap" },
    });

    // Admin role grants no cross-user key access: this replaces the admin's own
    // key, not the owner's.
    await admin.privacyroom.replaceKey({
      encryptionKeyRequestDto: { publicKey: "admin-new", privateKeyEnc: "ap2" },
    });

    const ownerKeys = await owner.privacyroom.getUserKeys();
    expect(ownerKeys.data.response?.map((k) => k.publicKey)).toEqual([ownerPk]);
  });

  test("A DocSpaceAdmin cannot delete another user's E2E key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerPk = "owner-" + apiSdk.faker.generateString(12);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: ownerPk, privateKeyEnc: "op" },
    });

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    await admin.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey: "admin-pk", privateKeyEnc: "ap" },
    });

    await admin.privacyroom.deleteKeys({ id: ZERO_GUID });

    const ownerKeys = await owner.privacyroom.getUserKeys();
    expect(ownerKeys.data.response?.map((k) => k.publicKey)).toEqual([ownerPk]);
  });

  test("A user holding a key of their own never sees another user's key", async ({
    apiSdk,
  }) => {
    // Reading keys is scoped to the caller and takes no parameter for targeting
    // another user, so the guarantee to pin is that the read returns EXACTLY the
    // caller's own key set — with a key of the caller's own present, so an empty
    // or broken read cannot pass for isolation.
    const owner = apiSdk.forRole("owner");
    const ownerId = "0a0a0a0a-0000-0000-0000-00000000000a";
    const ownerPk = "owner-" + apiSdk.faker.generateString(12);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        id: ownerId,
        publicKey: ownerPk,
        privateKeyEnc: "op",
      },
    });

    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    const userId = "0b0b0b0b-0000-0000-0000-00000000000b";
    const userPk = "user-" + apiSdk.faker.generateString(12);
    await user.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        id: userId,
        publicKey: userPk,
        privateKeyEnc: "up",
      },
    });

    const userKeys = await user.privacyroom.getUserKeys();
    expect(userKeys.status).toBe(200);
    expect(userKeys.data.count).toBe(1);
    expect(userKeys.data.response!.map((k) => k.publicKey)).toEqual([userPk]);
    expect(userKeys.data.response!.map((k) => k.id)).toEqual([userId]);

    // The owner's key is untouched and stays out of the user's view.
    expect(userKeys.data.response!.map((k) => k.publicKey)).not.toContain(
      ownerPk,
    );
    const ownerKeys = await owner.privacyroom.getUserKeys();
    expect(ownerKeys.data.response!.map((k) => k.publicKey)).toEqual([ownerPk]);
  });
});

test.describe("GET /files/rooms - private room visibility", () => {
  test.fail(
    "BUG XXXXX: GET /files/rooms - DocSpaceAdmin must not see a private room they are not a member of",
    async ({ apiSdk }) => {
      // Owner creates a private room. DocSpaceAdmin is never invited.
      // The room must be invisible to the admin because E2E rooms are only
      // visible to their members — admin role must not bypass that.
      const owner = apiSdk.forRole("owner");
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "owner-" + apiSdk.faker.generateString(12),
          privateKeyEnc: "op",
        },
      });
      const { data: room } = await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Privacy Room " + apiSdk.faker.generateString(6),
          roomType: RoomType.CustomRoom,
          private: true,
        },
      });
      const roomId = room.response!.id! as number;

      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .rooms.getRoomsFolder({});

      expect(status).toBe(200);
      expect(folderIds(data)).not.toContain(roomId);
    },
  );

  test.fail(
    "BUG XXXXX: GET /files/rooms - Owner must not see a private room they are not a member of",
    async ({ apiSdk }) => {
      // RoomAdmin creates a private room. Owner is never invited.
      // Owner must not see the room in their room list — being the portal owner
      // must not grant visibility into E2E rooms one is not a member of.
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdmin = apiSdk.forRole("roomAdmin");
      await roomAdmin.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "ra-" + apiSdk.faker.generateString(12),
          privateKeyEnc: "rap",
        },
      });
      const { data: room } = await roomAdmin.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Privacy Room " + apiSdk.faker.generateString(6),
          roomType: RoomType.CustomRoom,
          private: true,
        },
      });
      const roomId = room.response!.id! as number;

      const { data, status } = await apiSdk.forRole("owner").rooms.getRoomsFolder({});

      expect(status).toBe(200);
      expect(folderIds(data)).not.toContain(roomId);
    },
  );
});
