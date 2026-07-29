import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";

/**
 * Access control for the PrivacyroomApi.
 *
 * Encryption keys are personal and per-caller: every authenticated user manages
 * ONLY their own keys, and there is no parameter to target another user's keys.
 * Anonymous requests get 401. Guests currently get 403 on set/replace, which is
 * a bug (BUG 82524) — they should be able to manage their own keys.
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

test.describe("GET /api/2.0/privacyroom/keys/filter - access control", () => {
  // Each authorized role filters ONLY its own keys. A key is created first so
  // the filter has something to match (a keyless user hits BUG 82523 -> 400).
  test("GET /api/2.0/privacyroom/keys/filter - Owner filters and gets back their own key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const publicKey = "owner-" + apiSdk.faker.generateString(16);
    await owner.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "op" },
    });
    const { data, status } = await owner.privacyroom.getUserKeysByFilter({
      id: ZERO_GUID,
    });
    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.publicKey).toBe(publicKey);
  });

  test("GET /api/2.0/privacyroom/keys/filter - DocSpaceAdmin filters and gets back their own key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const admin = apiSdk.forRole("docSpaceAdmin");
    const publicKey = "admin-" + apiSdk.faker.generateString(16);
    await admin.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "ap" },
    });
    const { data, status } = await admin.privacyroom.getUserKeysByFilter({
      id: ZERO_GUID,
    });
    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.publicKey).toBe(publicKey);
  });

  test("GET /api/2.0/privacyroom/keys/filter - RoomAdmin filters and gets back their own key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdmin = apiSdk.forRole("roomAdmin");
    const publicKey = "roomadmin-" + apiSdk.faker.generateString(16);
    await roomAdmin.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "rp" },
    });
    const { data, status } = await roomAdmin.privacyroom.getUserKeysByFilter({
      id: ZERO_GUID,
    });
    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.publicKey).toBe(publicKey);
  });

  test("GET /api/2.0/privacyroom/keys/filter - User filters and gets back their own key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const user = apiSdk.forRole("user");
    const publicKey = "user-" + apiSdk.faker.generateString(16);
    await user.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc: "up" },
    });
    const { data, status } = await user.privacyroom.getUserKeysByFilter({
      id: ZERO_GUID,
    });
    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.publicKey).toBe(publicKey);
  });

  test("GET /api/2.0/privacyroom/keys/filter - Guest filters and gets back their own key", async ({
    apiSdk,
  }) => {
    // A guest cannot create a key (setKeys denied, BUG 82524), so it has no key
    // to filter, and filtering a keyless account throws ArgumentNullException
    // (BUG 82523 -> 400). Marked test.fail on the setKeys prerequisite instead of
    // silently skipping the role, so the coverage gap is explicit.
    // TODO(BUG 82524 + 82523): once a guest can create a key, finish this —
    // filter by id and assert data.count === 1 and response.publicKey matches.
    test.fail(
      true,
      "BUG 82524: Guest cannot create a key, and filtering a keyless account fails with ArgumentNullException (BUG 82523)",
    );
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guest = apiSdk.forRole("guest");
    const { status } = await guest.privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("GET /api/2.0/privacyroom/keys/filter - Anonymous cannot filter keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .privacyroom.getUserKeysByFilter();
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
    // must be denied (403), exactly like a regular non-member. Actual: the admin
    // gets 200 and the response LEAKS the room creator's public key. Remove
    // test.fail once membership is enforced for admins too.
    test.fail(
      true,
      "BUG 82540: DocSpaceAdmin non-member gets 200 from getUserKeysForRoom and the room owner's E2E public key leaks (a regular non-member correctly gets 403)",
    );
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

  test("Filtering by another user's id or publicKey does not expose their key", async ({
    apiSdk,
  }) => {
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
    // The user has their OWN key (different id) so the filter is not the keyless
    // path; it must still not see the owner's key.
    await user.privacyroom.setKeys({
      encryptionKeyRequestDto: {
        id: "0b0b0b0b-0000-0000-0000-00000000000b",
        publicKey: "user-" + apiSdk.faker.generateString(12),
        privateKeyEnc: "up",
      },
    });

    const byOwnerId = await user.privacyroom.getUserKeysByFilter({
      id: ownerId,
    });
    expect(byOwnerId.status).toBe(200);
    expect(byOwnerId.data.count).toBe(0);

    const byOwnerPk = await user.privacyroom.getUserKeysByFilter({
      publicKey: ownerPk,
    });
    expect(byOwnerPk.status).toBe(200);
    expect(byOwnerPk.data.count).toBe(0);
  });
});
