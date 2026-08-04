import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

/**
 * Functional tests for the PrivacyroomApi — per-user encryption key management
 * used by DocSpace Privacy Rooms.
 *
 *   GET    /api/2.0/privacyroom/keys           - getUserKeys
 *   GET    /api/2.0/privacyroom/{roomId}/access- getUserKeysForRoom
 *   POST   /api/2.0/privacyroom/keys           - setKeys
 *   PUT    /api/2.0/privacyroom/keys           - replaceKey
 *   DELETE /api/2.0/privacyroom/keys/{id}      - deleteKeys
 *
 * There is no filter endpoint any more. SDK 3.7.0 dropped getUserKeysByFilter
 * along with the EncryptionKeyType / EncryptionKeyWrapper models, and the route
 * is gone from the portal too: GET /privacyroom/keys/filter answers 405 (the
 * path only matches DELETE /keys/{id}) and GET /privacyroom/keys ignores every
 * query parameter, so filtering cannot be exercised at all. The tests that
 * covered it — and BUGS 82523 / 82549 / 82550, which described only its defects
 * — were removed on 2026-08-04.
 *
 * Observed contract (verified against a live portal):
 *  - A user may hold MULTIPLE keys, each identified by its `id`. The request DTO
 *    accepts an optional `id`; when omitted it defaults to the zero GUID.
 *  - setKeys creates the key for the supplied id. A new id adds another key; an
 *    id that already exists is a 200 no-op (it does NOT update the stored key).
 *    Use replaceKey to change an existing key.
 *  - Expected REST contract (currently violated -> the affected tests are
 *    test.fail): POST create should be 201 (BUG 82546), a POST with a duplicate
 *    id should be 409 (BUG 82544), a successful DELETE should be 204 (BUG 82551),
 *    and a DELETE of a missing key should be 404 (BUG 82552). The API returns 200
 *    (or a silent no-op) for all of these today.
 *  - replaceKey updates the key whose id matches (in place, leaving the others
 *    untouched); with no matching id it is a 200 no-op that creates nothing.
 *  - replaceKey is an unvalidated FULL overwrite: any field missing from the
 *    request is erased from the stored key, so an empty/absent body destroys the
 *    caller's key material (BUG XXXXX). Only the client holds the plaintext
 *    private key, so a wiped privateKeyEnc cannot be restored and every private
 *    room it protects becomes undecryptable.
 *  - Neither setKeys nor replaceKey bounds the key length. A publicKey of 8192
 *    chars is stored; at 65536 the call still answers 200 but nothing is saved —
 *    and on replaceKey the caller's ENTIRE key set disappears (BUG XXXXX).
 *  - deleteKeys removes only the key with the given id.
 *  - There is no "active" key on the backend: which key is active is tracked
 *    only on the client, so it is not (and cannot be) covered here.
 *  - Encrypted rooms ARE supported: createRoom({ private: true }) after setKeys
 *    creates a private room, and getUserKeysForRoom returns the caller's access
 *    keys for it. A NON-private room has no encryption, so getUserKeysForRoom
 *    returns 400 for it.
 *  - getUserKeysForRoom is a LIVE view of the key rows of every room member, not
 *    a snapshot: it lists all of the caller's own keys plus one entry per other
 *    member, and it follows later replace/delete calls. Holding no key at all is
 *    403 — including for the room creator after deleting their own keys.
 *  - Membership in a private room requires the invitee to already hold a key:
 *    setRoomSecurity answers 403 "The user does not have an encryption key"
 *    otherwise. Guests can never join, since setKeys is denied for them
 *    (BUG 82524). Room-type coverage for createRoom({ private: true }) lives in
 *    rooms.spec.ts; this file always uses CustomRoom.
 */
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

test.describe("API privacyroom methods", () => {
  test.describe("GET /api/2.0/privacyroom/keys - getUserKeys", () => {
    test("GET /api/2.0/privacyroom/keys - Owner has no keys initially", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(0);
      expect(data.response ?? []).toHaveLength(0);
    });

    test("GET /api/2.0/privacyroom/keys - Owner sees the key after setKeys", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);
      const privateKeyEnc = "prv-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response).toHaveLength(1);
      const key = data.response![0];
      expect(key.publicKey).toBe(publicKey);
      expect(key.privateKeyEnc).toBe(privateKeyEnc);
      expect(key.userId).toBeDefined();
      expect(key.date).toBeDefined();
    });

    test("GET /api/2.0/privacyroom/keys - Every field of the key DTO is filled in correctly", async ({
      apiSdk,
    }) => {
      // The metadata fields are only ever checked with toBeDefined() elsewhere.
      // Pin them: the wrapper's count must match the array, userId must be the
      // CALLER (not some other user), date must be a real timestamp, and every
      // key must report the same crypto engine.
      const owner = apiSdk.forRole("owner");
      const self = await owner.profiles.getSelfProfile();
      const selfId = self.data.response!.id;
      const before = Date.now();

      const idA = "b0b0b0b0-0000-0000-0000-00000000000a";
      const idB = "b0b0b0b0-0000-0000-0000-00000000000b";
      for (const id of [idA, idB]) {
        await owner.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            id,
            publicKey: "pk-" + id,
            privateKeyEnc: "prv-" + id,
          },
        });
      }

      const { data, status } = await owner.privacyroom.getUserKeys();
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(2);
      expect(data.count).toBe(data.response!.length);

      for (const key of data.response!) {
        expect(key.userId).toBe(selfId);
        const date = Date.parse(key.date!);
        expect(Number.isNaN(date)).toBe(false);
        // Created during this test, so within its own time window (1 min of
        // slack for portal/client clock drift).
        expect(date).toBeGreaterThan(before - 60_000);
        // A braced GUID identifying the crypto engine, e.g.
        // "{DC522726-5E0E-43E5-AA02-8EA156BECBC5}".
        expect(key.cryptoEngineId).toMatch(
          /^\{[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}\}$/,
        );
      }
      // The engine is portal-wide, so it is identical for all of a user's keys.
      const engines = new Set(data.response!.map((k) => k.cryptoEngineId));
      expect(engines.size).toBe(1);
    });

    test("GET /api/2.0/privacyroom/keys - Keys are isolated per user", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      await apiSdk.addAuthenticatedMember("owner", "User");
      const user = apiSdk.forRole("user");

      const ownerPk = "owner-" + apiSdk.faker.generateString(12);
      const userPk = "user-" + apiSdk.faker.generateString(12);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: ownerPk, privateKeyEnc: "op" },
      });
      await user.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: userPk, privateKeyEnc: "up" },
      });

      const ownerKeys = await owner.privacyroom.getUserKeys();
      const userKeys = await user.privacyroom.getUserKeys();
      expect(ownerKeys.data.response?.map((k) => k.publicKey)).toEqual([
        ownerPk,
      ]);
      expect(userKeys.data.response?.map((k) => k.publicKey)).toEqual([userPk]);

      // The user deleting their own key must not touch the owner's key.
      const del = await user.privacyroom.deleteKeys({ id: ZERO_GUID });
      expect(del.status).toBe(200);

      const ownerAfter = await owner.privacyroom.getUserKeys();
      expect(ownerAfter.data.response?.map((k) => k.publicKey)).toEqual([
        ownerPk,
      ]);
      const userAfter = await user.privacyroom.getUserKeys();
      expect(userAfter.data.count).toBe(0);
    });
  });

  test.describe("POST /api/2.0/privacyroom/keys - setKeys", () => {
    test("POST /api/2.0/privacyroom/keys - Owner sets encryption keys", async ({
      apiSdk,
    }) => {
      const publicKey = "pk-" + apiSdk.faker.generateString(16);
      const privateKeyEnc = "prv-" + apiSdk.faker.generateString(16);

      // Creating a resource should return 201 Created; the API currently returns
      // 200. Data assertions run first (they pass) so only the status drives the
      // expected failure.
      test.fail(
        true,
        "BUG 82546: setKeys returns 200 on create instead of 201 Created",
      );
      const { data, status } = await apiSdk
        .forRole("owner")
        .privacyroom.setKeys({
          encryptionKeyRequestDto: { publicKey, privateKeyEnc },
        });

      expect(data.count).toBe(1);
      expect(data.response).toHaveLength(1);
      expect(data.response![0].publicKey).toBe(publicKey);
      expect(data.response![0].privateKeyEnc).toBe(privateKeyEnc);
      // When no id is supplied it defaults to the zero GUID.
      expect(data.response![0].id).toBe(ZERO_GUID);
      expect(status).toBe(201);
    });

    test("POST /api/2.0/privacyroom/keys - setKeys with a new id creates an additional key", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const idA = "11111111-1111-1111-1111-111111111111";
      const idB = "22222222-2222-2222-2222-222222222222";
      const pkA = "pkA-" + apiSdk.faker.generateString(12);
      const pkB = "pkB-" + apiSdk.faker.generateString(12);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: idA,
          publicKey: pkA,
          privateKeyEnc: "a",
        },
      });
      // Creating the additional key should return 201 Created; the API returns
      // 200. Data assertions run first, only the status drives the failure.
      test.fail(
        true,
        "BUG 82546: setKeys returns 200 on create instead of 201 Created",
      );
      const { data, status } = await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: idB,
          publicKey: pkB,
          privateKeyEnc: "b",
        },
      });

      // The second key is added; the first is not overwritten.
      expect(data.count).toBe(2);
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(2);
      const byId = new Map(
        after.data.response!.map((k) => [k.id, k.publicKey]),
      );
      expect(byId.get(idA)).toBe(pkA);
      expect(byId.get(idB)).toBe(pkB);
      expect(status).toBe(201);
    });

    test("POST /api/2.0/privacyroom/keys - getUserKeys returns every key the user holds", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const ids = [
        "aaaaaaaa-0000-0000-0000-000000000001",
        "aaaaaaaa-0000-0000-0000-000000000002",
        "aaaaaaaa-0000-0000-0000-000000000003",
      ];
      for (const id of ids) {
        await owner.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            id,
            publicKey: "pk-" + id,
            privateKeyEnc: "prv",
          },
        });
      }

      const { data, status } = await owner.privacyroom.getUserKeys();
      expect(status).toBe(200);
      expect(data.count).toBe(3);
      expect(data.response!.map((k) => k.id).sort()).toEqual([...ids].sort());
    });

    test("POST /api/2.0/privacyroom/keys - Creating a key with a duplicate id is rejected with 409", async ({
      apiSdk,
    }) => {
      // Re-POSTing an id that already exists is a conflict and should return 409
      // Conflict. Actual: the API returns 200 and silently ignores the new value
      // (no update, no error). The stored key stays as the original either way,
      // so that side-effect check passes; only the status drives the failure.
      test.fail(
        true,
        "BUG 82544: setKeys with an already-existing id returns a silent 200 no-op instead of 409 Conflict",
      );
      const owner = apiSdk.forRole("owner");
      const id = "33333333-3333-3333-3333-333333333333";
      const original = "pk-orig-" + apiSdk.faker.generateString(12);
      const attempted = "pk-new-" + apiSdk.faker.generateString(12);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id,
          publicKey: original,
          privateKeyEnc: "prv1",
        },
      });

      const { status } = await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id,
          publicKey: attempted,
          privateKeyEnc: "prv2",
        },
      });

      // The stored key must not have been changed by the duplicate request.
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(1);
      expect(after.data.response![0].publicKey).toBe(original);
      expect(status).toBe(409);
    });

    test("POST /api/2.0/privacyroom/keys - Empty publicKey should be rejected", async ({
      apiSdk,
    }) => {
      // Expected: an empty public key is invalid and must not create a key.
      // Actual: the endpoint returns 200 and stores a key with an empty publicKey.
      test.fail(
        true,
        "BUG 82554: setKeys accepts an empty publicKey (200) and stores an invalid key",
      );
      const owner = apiSdk.forRole("owner");

      const { status } = await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: "", privateKeyEnc: "prv-enc" },
      });

      // Side-effect check first: nothing should have been stored.
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
      expect(status).toBe(400);
    });

    test("POST /api/2.0/privacyroom/keys - Whitespace-only publicKey should be rejected", async ({
      apiSdk,
    }) => {
      test.fail(
        true,
        "BUG 82554: setKeys accepts a whitespace-only publicKey (200) and stores an invalid key",
      );
      const owner = apiSdk.forRole("owner");

      const { status } = await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: "   ", privateKeyEnc: "prv-enc" },
      });

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
      expect(status).toBe(400);
    });

    // setKeys performs no input validation: invalid or absent key data is
    // accepted (200) and stored instead of being rejected with 400. Each case is
    // test.fail on the status; the side-effect check (no key stored) runs first.
    const invalidSetKeysInputs: {
      label: string;
      params: {
        encryptionKeyRequestDto?: {
          id?: string;
          publicKey?: string | null;
          privateKeyEnc?: string | null;
        };
      };
    }[] = [
      {
        label: "Empty privateKeyEnc",
        params: {
          encryptionKeyRequestDto: { publicKey: "pk", privateKeyEnc: "" },
        },
      },
      {
        label: "Whitespace-only privateKeyEnc",
        params: {
          encryptionKeyRequestDto: { publicKey: "pk", privateKeyEnc: "   " },
        },
      },
      {
        label: "Missing publicKey",
        params: { encryptionKeyRequestDto: { privateKeyEnc: "prv-enc" } },
      },
      {
        label: "Missing privateKeyEnc",
        params: { encryptionKeyRequestDto: { publicKey: "pk" } },
      },
      { label: "Empty DTO", params: { encryptionKeyRequestDto: {} } },
      { label: "No DTO", params: {} },
      {
        label: "null key values",
        params: {
          encryptionKeyRequestDto: { publicKey: null, privateKeyEnc: null },
        },
      },
    ];
    for (const { label, params } of invalidSetKeysInputs) {
      test(`POST /api/2.0/privacyroom/keys - ${label} should be rejected`, async ({
        apiSdk,
      }) => {
        test.fail(
          true,
          "BUG 82554: setKeys performs no input validation — invalid/absent key data returns 200 and stores a key instead of 400",
        );
        const owner = apiSdk.forRole("owner");
        const { status } = await owner.privacyroom.setKeys(params);
        // Side-effect check first: no invalid key should have been stored.
        const after = await owner.privacyroom.getUserKeys();
        expect(after.data.count).toBe(0);
        expect(status).toBe(400);
      });
    }

    test("POST /api/2.0/privacyroom/keys - A long publicKey is stored intact", async ({
      apiSdk,
    }) => {
      // Positive control for the oversized case below: 8192 chars round-trips
      // byte-for-byte, so a rejection at a larger size is a length limit and not
      // a general failure to handle long values.
      const owner = apiSdk.forRole("owner");
      const publicKey = "x".repeat(8192);

      const { status } = await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv" },
      });
      expect(status).toBe(200);

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(1);
      expect(after.data.response![0].publicKey).toBe(publicKey);
    });

    test("POST /api/2.0/privacyroom/keys - An oversized publicKey is silently dropped instead of rejected", async ({
      apiSdk,
    }) => {
      // A publicKey too large to persist must be refused with 400. Actual: the
      // call answers 200 with a success-shaped body (a non-zero `count`), yet
      // nothing is stored — the client is told its key was created when it never
      // was, so it will encrypt against a key the portal does not have.
      test.fail(
        true,
        "BUG 82800: setKeys with an oversized publicKey returns a success-shaped 200 and stores nothing instead of 400",
      );
      const owner = apiSdk.forRole("owner");

      const { status } = await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "x".repeat(65536),
          privateKeyEnc: "prv",
        },
      });

      // Side-effect check first: nothing was persisted (the 8192 test above is
      // the positive control proving long values CAN be stored).
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
      expect(status).toBe(400);
    });

    test("POST /api/2.0/privacyroom/keys - Malformed id is rejected with 400", async ({
      apiSdk,
    }) => {
      // Unlike the missing/empty value cases above, a malformed id IS validated.
      const owner = apiSdk.forRole("owner");
      const { status } = await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: "not-a-guid",
          publicKey: "pk",
          privateKeyEnc: "prv",
        },
      });
      expect(status).toBe(400);
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
    });
  });

  test.describe("PUT /api/2.0/privacyroom/keys - replaceKey", () => {
    test("PUT /api/2.0/privacyroom/keys - Owner replaces existing keys", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-" + apiSdk.faker.generateString(16),
        },
      });

      const newPublicKey = "pk-new-" + apiSdk.faker.generateString(16);
      const newPrivateKeyEnc = "prv-new-" + apiSdk.faker.generateString(16);

      const { data, status } = await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: {
          publicKey: newPublicKey,
          privateKeyEnc: newPrivateKeyEnc,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toHaveLength(1);
      expect(data.response![0].publicKey).toBe(newPublicKey);
      expect(data.response![0].privateKeyEnc).toBe(newPrivateKeyEnc);

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.response![0].publicKey).toBe(newPublicKey);
    });

    test("PUT /api/2.0/privacyroom/keys - After replace the old key value is gone", async ({
      apiSdk,
    }) => {
      // Replace overwrites in place: the old public key must not survive
      // anywhere in the caller's key set, and no second key is left behind.
      const owner = apiSdk.forRole("owner");
      const oldPk = "old-" + apiSdk.faker.generateString(12);
      const newPk = "new-" + apiSdk.faker.generateString(12);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: oldPk, privateKeyEnc: "oldprv" },
      });
      await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: { publicKey: newPk, privateKeyEnc: "newprv" },
      });

      const all = await owner.privacyroom.getUserKeys();
      expect(all.status).toBe(200);
      expect(all.data.count).toBe(1);
      const pks = all.data.response!.map((k) => k.publicKey);
      expect(pks).toEqual([newPk]);
      expect(pks).not.toContain(oldPk);
      expect(all.data.response![0].privateKeyEnc).toBe("newprv");
    });

    test("PUT /api/2.0/privacyroom/keys - replaceKey without an existing key is rejected", async ({
      apiSdk,
    }) => {
      // Expected: replacing a key that does not exist must return a controlled
      // error (404) rather than silently succeeding — otherwise the client
      // believes a rotation happened when no key was created or replaced.
      // Actual: the endpoint returns 200 and does nothing (no key created).
      test.fail(
        true,
        "BUG 82545: replaceKey with no existing key returns a silent 200 no-op instead of 404/400",
      );
      const owner = apiSdk.forRole("owner");

      const { status } = await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: { publicKey: "pk", privateKeyEnc: "prv" },
      });

      // Side-effect check first: nothing should have been created either way.
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
      expect(after.data.response ?? []).toHaveLength(0);
      expect(status).toBe(404);
    });

    test("PUT /api/2.0/privacyroom/keys - replaceKey updates only the targeted key", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const idA = "44444444-4444-4444-4444-444444444444";
      const idB = "55555555-5555-5555-5555-555555555555";
      const pkA = "pkA-" + apiSdk.faker.generateString(10);
      const pkB = "pkB-" + apiSdk.faker.generateString(10);
      const pkBNew = "pkB-new-" + apiSdk.faker.generateString(10);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: idA,
          publicKey: pkA,
          privateKeyEnc: "a",
        },
      });
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: idB,
          publicKey: pkB,
          privateKeyEnc: "b",
        },
      });

      const { status } = await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: {
          id: idB,
          publicKey: pkBNew,
          privateKeyEnc: "b2",
        },
      });
      expect(status).toBe(200);

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(2);
      const byId = new Map(
        after.data.response!.map((k) => [k.id, k.publicKey]),
      );
      // Only key B changed; key A is untouched.
      expect(byId.get(idA)).toBe(pkA);
      expect(byId.get(idB)).toBe(pkBNew);
    });

    test("PUT /api/2.0/privacyroom/keys - Repeated replaceKey on the same id updates in place without accumulating keys", async ({
      apiSdk,
    }) => {
      // This does NOT claim the user can hold only one key (multiple keys via
      // distinct ids are covered elsewhere). It verifies the narrower fact that
      // replacing the SAME key (same id — here the default zero GUID) updates it
      // in place and does not create extra keys. There is no `active` flag on the
      // key DTO, so "which key is current/active" is not asserted here (see the
      // "Exactly one of a user's keys is marked active" fixme).
      const owner = apiSdk.forRole("owner");
      const v1 = "v1-" + apiSdk.faker.generateString(10);
      const v2 = "v2-" + apiSdk.faker.generateString(10);
      const v3 = "v3-" + apiSdk.faker.generateString(10);

      // No id supplied -> every call targets the same (zero-GUID) key.
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: v1, privateKeyEnc: "p1" },
      });
      await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: { publicKey: v2, privateKeyEnc: "p2" },
      });
      await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: { publicKey: v3, privateKeyEnc: "p3" },
      });

      const all = await owner.privacyroom.getUserKeys();
      // Only the single zero-GUID slot exists, holding the latest value.
      expect(all.data.count).toBe(1);
      expect(all.data.response![0].id).toBe(ZERO_GUID);
      expect(all.data.response![0].publicKey).toBe(v3);
    });

    test("PUT /api/2.0/privacyroom/keys - Malformed id is rejected with 400", async ({
      apiSdk,
    }) => {
      // A malformed id is validated on replaceKey (400), consistent with setKeys
      // (and unlike deleteKeys, which returns 404).
      const owner = apiSdk.forRole("owner");
      const { status } = await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: {
          id: "not-a-guid",
          publicKey: "pk",
          privateKeyEnc: "prv",
        },
      });
      expect(status).toBe(400);
    });

    // replaceKey validates nothing beyond the id format AND behaves as a full
    // overwrite: whatever the request omits or blanks out is written over the
    // stored key. Every case below answers 200 and destroys key material that
    // only the client can regenerate, so each must be a 400 that leaves the
    // stored key untouched. The DTO carries no id, so all of them target the
    // caller's existing zero-GUID key.
    const destructivePutInputs: {
      label: string;
      dto: {
        publicKey?: string | null;
        privateKeyEnc?: string | null;
      };
      // What the endpoint does today, for the bug report.
      damage: string;
    }[] = [
      {
        label: "Empty publicKey",
        dto: { publicKey: "", privateKeyEnc: "prv-new" },
        damage: "publicKey is overwritten with an empty string",
      },
      {
        label: "Empty privateKeyEnc",
        dto: { publicKey: "pk-new", privateKeyEnc: "" },
        damage: "privateKeyEnc is overwritten with an empty string",
      },
      {
        label: "Whitespace-only publicKey",
        dto: { publicKey: "   ", privateKeyEnc: "prv-new" },
        damage: "publicKey is overwritten with whitespace",
      },
      {
        label: "Whitespace-only privateKeyEnc",
        dto: { publicKey: "pk-new", privateKeyEnc: "   " },
        damage: "privateKeyEnc is overwritten with whitespace",
      },
      {
        label: "Missing publicKey",
        dto: { privateKeyEnc: "prv-new" },
        damage: "publicKey is erased",
      },
      {
        label: "Missing privateKeyEnc",
        dto: { publicKey: "pk-new" },
        damage: "privateKeyEnc is erased",
      },
      {
        label: "Empty DTO",
        dto: {},
        damage: "both key fields are erased",
      },
      {
        label: "null key values",
        dto: { publicKey: null, privateKeyEnc: null },
        damage: "both key fields are erased",
      },
    ];
    for (const { label, dto, damage } of destructivePutInputs) {
      test(`PUT /api/2.0/privacyroom/keys - ${label} must not overwrite the stored key`, async ({
        apiSdk,
      }) => {
        test.fail(
          true,
          `BUG XXXXX: replaceKey performs no input validation and overwrites in full — ${damage} and the call returns 200 instead of 400`,
        );
        const owner = apiSdk.forRole("owner");
        const publicKey = "orig-pk-" + apiSdk.faker.generateString(12);
        const privateKeyEnc = "orig-prv-" + apiSdk.faker.generateString(12);
        const created = await owner.privacyroom.setKeys({
          encryptionKeyRequestDto: { publicKey, privateKeyEnc },
        });
        // Pin the premise: the key the test is about really exists.
        expect(created.data.count).toBe(1);

        const { status } = await owner.privacyroom.replaceKey({
          encryptionKeyRequestDto: dto,
        });

        // Side-effect check first: the stored key must survive intact.
        const after = await owner.privacyroom.getUserKeys();
        expect(after.data.count).toBe(1);
        expect(after.data.response![0].publicKey).toBe(publicKey);
        expect(after.data.response![0].privateKeyEnc).toBe(privateKeyEnc);
        expect(status).toBe(400);
      });
    }

    test("PUT /api/2.0/privacyroom/keys - A body-less request must not wipe the stored key", async ({
      apiSdk,
    }) => {
      // Calling replaceKey with no DTO at all sends an empty body, which binds to
      // a default DTO: the zero-GUID key is found and both of its key fields are
      // erased. A request that supplies no data must not be able to destroy data.
      test.fail(
        true,
        "BUG XXXXX: replaceKey with no request body returns 200 and erases both key fields of the zero-GUID key instead of 400",
      );
      const owner = apiSdk.forRole("owner");
      const publicKey = "orig-pk-" + apiSdk.faker.generateString(12);
      const privateKeyEnc = "orig-prv-" + apiSdk.faker.generateString(12);
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc },
      });

      const { status } = await owner.privacyroom.replaceKey();

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(1);
      expect(after.data.response![0].publicKey).toBe(publicKey);
      expect(after.data.response![0].privateKeyEnc).toBe(privateKeyEnc);
      expect(status).toBe(400);
    });

    test("PUT /api/2.0/privacyroom/keys - Updating only publicKey must not erase privateKeyEnc", async ({
      apiSdk,
    }) => {
      // A caller rotating just the public half loses the private half: the field
      // it did not mention is dropped from the stored key. Either the endpoint
      // must merge (leaving privateKeyEnc intact) or it must reject a partial
      // body with 400 — silently discarding the private key is neither.
      test.fail(
        true,
        "BUG XXXXX: replaceKey with only publicKey supplied returns 200 and erases the stored privateKeyEnc",
      );
      const owner = apiSdk.forRole("owner");
      const privateKeyEnc = "orig-prv-" + apiSdk.faker.generateString(12);
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: "orig-pk", privateKeyEnc },
      });

      const newPublicKey = "pk-rotated-" + apiSdk.faker.generateString(12);
      const { status } = await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: { publicKey: newPublicKey },
      });
      expect(status).toBe(200);

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(1);
      // The half that was sent is applied...
      expect(after.data.response![0].publicKey).toBe(newPublicKey);
      // ...and the half that was not sent must still be there.
      expect(after.data.response![0].privateKeyEnc).toBe(privateKeyEnc);
    });

    test("PUT /api/2.0/privacyroom/keys - An oversized publicKey must not destroy the caller's key set", async ({
      apiSdk,
    }) => {
      // The worst of the replaceKey cases: a publicKey too large to persist takes
      // out EVERY key the caller holds, including keys the request never named.
      // Expected: 400 with both keys left alone.
      test.fail(
        true,
        "BUG XXXXX: replaceKey with an oversized publicKey returns 200 and deletes the caller's entire key set, including untargeted keys",
      );
      const owner = apiSdk.forRole("owner");
      const otherId = "aaaa0000-0000-0000-0000-000000000001";
      const otherPk = "other-pk-" + apiSdk.faker.generateString(10);
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: "zero-pk", privateKeyEnc: "zp" },
      });
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: otherId,
          publicKey: otherPk,
          privateKeyEnc: "op",
        },
      });
      const before = await owner.privacyroom.getUserKeys();
      expect(before.data.count).toBe(2);

      const { status } = await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: {
          id: ZERO_GUID,
          publicKey: "x".repeat(65536),
          privateKeyEnc: "bp",
        },
      });

      // Side-effect check first: both keys must still be there, and the key that
      // the request did not target must be byte-identical.
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(2);
      const byId = new Map(
        after.data.response!.map((k) => [k.id, k.publicKey]),
      );
      expect(byId.get(otherId)).toBe(otherPk);
      expect(byId.get(ZERO_GUID)).toBe("zero-pk");
      expect(status).toBe(400);
    });
  });

  test.describe("DELETE /api/2.0/privacyroom/keys/{id} - deleteKeys", () => {
    test("DELETE /api/2.0/privacyroom/keys/{id} - Owner deletes their key", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      // Deleting an existing resource should return 204 No Content; the API
      // returns 200. The key is verified gone first, only the status fails.
      test.fail(
        true,
        "BUG 82551: deleteKeys returns 200 on a successful delete instead of 204 No Content",
      );
      const { status } = await owner.privacyroom.deleteKeys({
        id: ZERO_GUID,
      });

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
      expect(after.data.response ?? []).toHaveLength(0);
      expect(status).toBe(204);
    });

    test("DELETE /api/2.0/privacyroom/keys/{id} - Deleting a valid but non-existent key returns 404", async ({
      apiSdk,
    }) => {
      // Deleting a key that does not exist should return 404 Not Found. Actual:
      // the API returns 200 for any syntactically valid GUID whether or not the
      // key exists (a silent idempotent no-op). Remove test.fail once a missing
      // key is reported as 404.
      test.fail(
        true,
        "BUG 82552: deleteKeys returns 200 for a valid but non-existent key id instead of 404 Not Found",
      );
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.deleteKeys({ id: "deadbeef-0000-0000-0000-000000000001" });

      expect(status).toBe(404);
    });

    test("DELETE /api/2.0/privacyroom/keys/{id} - Malformed key id is rejected with 400", async ({
      apiSdk,
    }) => {
      // A malformed (non-GUID) id is a bad request and should be rejected with
      // 400 — the same way setKeys and replaceKey already reject a malformed id.
      // Actual: delete returns 404 (looks like a {id:guid} route-constraint miss),
      // which is inconsistent with the other two. Remove test.fail once they all
      // agree on 400.
      test.fail(
        true,
        "BUG 82553: deleteKeys returns 404 for a malformed id instead of 400 (setKeys/replaceKey return 400 for the same input)",
      );
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.deleteKeys({ id: "not-a-guid" });

      expect(status).toBe(400);
    });

    test("DELETE /api/2.0/privacyroom/keys without id returns 405", async ({
      apiSdk,
    }) => {
      // Not an id-validation case: an empty id collapses the URL to the
      // collection route DELETE /api/2.0/privacyroom/keys, which exists for
      // POST/PUT but has no DELETE handler -> 405 from the router. The SDK only
      // guards id against null/undefined, so an empty string still reaches the
      // wire.
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.deleteKeys({ id: "" });

      expect(status).toBe(405);
    });

    test("DELETE /api/2.0/privacyroom/keys/{id} - Re-deleting an already-deleted key returns 404", async ({
      apiSdk,
    }) => {
      // The first delete removes the key (should be 204); a second delete targets
      // a now-missing key and should return 404 Not Found. Actual: both return
      // 200 (silent idempotent no-op). Remove test.fail once delete reports a
      // missing key as 404.
      test.fail(
        true,
        "BUG 82552: re-deleting an already-deleted key returns 200 instead of 404 Not Found",
      );
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      await owner.privacyroom.deleteKeys({ id: ZERO_GUID });
      const second = await owner.privacyroom.deleteKeys({ id: ZERO_GUID });

      // The key is gone regardless; only the status of the re-delete drives this.
      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
      expect(second.status).toBe(404);
    });

    test("DELETE /api/2.0/privacyroom/keys/{id} - Deletes only the targeted key, others remain", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const idA = "66666666-6666-6666-6666-666666666666";
      const idB = "77777777-7777-7777-7777-777777777777";
      const idC = "88888888-8888-8888-8888-888888888888";

      for (const id of [idA, idB, idC]) {
        await owner.privacyroom.setKeys({
          encryptionKeyRequestDto: {
            id,
            publicKey: "pk-" + id,
            privateKeyEnc: "prv",
          },
        });
      }

      // Deleting an existing key should return 204 No Content; the API returns
      // 200. The isolation side-effect is verified first, only the status fails.
      test.fail(
        true,
        "BUG 82551: deleteKeys returns 200 on a successful delete instead of 204 No Content",
      );
      const { status } = await owner.privacyroom.deleteKeys({ id: idB });

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(2);
      const remaining = after.data.response!.map((k) => k.id).sort();
      expect(remaining).toEqual([idA, idC].sort());
      expect(status).toBe(204);
    });
  });

  test.describe("GET /api/2.0/privacyroom/{roomId}/access - getUserKeysForRoom", () => {
    test("GET /api/2.0/privacyroom/{roomId}/access - Owner gets the access keys for a private room", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const ownerPk = "owner-" + apiSdk.faker.generateString(16);

      // Encryption keys must exist before a private room can be created.
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
      expect(room.response?.private).toBe(true);
      const roomId = room.response!.id! as number;

      const { data, status } = await owner.privacyroom.getUserKeysForRoom({
        roomId,
      });

      expect(status).toBe(200);
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.response?.map((k) => k.publicKey)).toContain(ownerPk);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Every key the caller holds is returned, not just one", async ({
      apiSdk,
    }) => {
      // A user may hold several keys and the room does not pin one of them: the
      // response is a live view of the caller's whole key set. Pinning this is
      // what makes the rotation and deletion tests below meaningful.
      const owner = apiSdk.forRole("owner");
      const keys = [
        { id: ZERO_GUID, pk: "pk-zero-" + apiSdk.faker.generateString(8) },
        {
          id: "c0c0c0c0-0000-0000-0000-00000000000a",
          pk: "pk-a-" + apiSdk.faker.generateString(8),
        },
        {
          id: "c0c0c0c0-0000-0000-0000-00000000000b",
          pk: "pk-b-" + apiSdk.faker.generateString(8),
        },
      ];
      for (const { id, pk } of keys) {
        await owner.privacyroom.setKeys({
          encryptionKeyRequestDto: { id, publicKey: pk, privateKeyEnc: "prv" },
        });
      }
      const { data: room } = await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Privacy Room " + apiSdk.faker.generateString(6),
          roomType: RoomType.CustomRoom,
          private: true,
        },
      });
      const roomId = room.response!.id! as number;

      const { data, status } = await owner.privacyroom.getUserKeysForRoom({
        roomId,
      });
      expect(status).toBe(200);
      expect(data.count).toBe(3);
      expect(data.response!.map((k) => k.publicKey).sort()).toEqual(
        keys.map((k) => k.pk).sort(),
      );
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Rotating one of several keys is reflected, the others are not touched", async ({
      apiSdk,
    }) => {
      // Complements the "Replacing the active key" test below, which only covers
      // the default zero-GUID key: here a NON-default key is rotated while other
      // keys are present.
      const owner = apiSdk.forRole("owner");
      const idA = "d0d0d0d0-0000-0000-0000-00000000000a";
      const pkA = "pk-a-" + apiSdk.faker.generateString(8);
      const pkARotated = "pk-a-rotated-" + apiSdk.faker.generateString(8);
      const pkZero = "pk-zero-" + apiSdk.faker.generateString(8);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: pkZero, privateKeyEnc: "zp" },
      });
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: idA,
          publicKey: pkA,
          privateKeyEnc: "ap",
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

      const rotate = await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: {
          id: idA,
          publicKey: pkARotated,
          privateKeyEnc: "ap2",
        },
      });
      expect(rotate.status).toBe(200);

      const { data, status } = await owner.privacyroom.getUserKeysForRoom({
        roomId,
      });
      expect(status).toBe(200);
      const pks = data.response!.map((k) => k.publicKey);
      expect(pks.sort()).toEqual([pkARotated, pkZero].sort());
      expect(pks).not.toContain(pkA);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Deleting one of several keys drops only that key", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const idA = "d1d1d1d1-0000-0000-0000-00000000000a";
      const pkA = "pk-a-" + apiSdk.faker.generateString(8);
      const pkZero = "pk-zero-" + apiSdk.faker.generateString(8);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: pkZero, privateKeyEnc: "zp" },
      });
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          id: idA,
          publicKey: pkA,
          privateKeyEnc: "ap",
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
      const before = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(before.data.count).toBe(2);

      await owner.privacyroom.deleteKeys({ id: idA });

      const { data, status } = await owner.privacyroom.getUserKeysForRoom({
        roomId,
      });
      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response!.map((k) => k.publicKey)).toEqual([pkZero]);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - The room's creator is denied after deleting all of their keys", async ({
      apiSdk,
    }) => {
      // Access is gated on the caller actually holding a key: once the creator
      // deletes their last key they are denied their OWN private room with 403,
      // even though the room itself is untouched and still listed as private.
      const owner = apiSdk.forRole("owner");
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(12),
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
      const before = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(before.status).toBe(200);

      const del = await owner.privacyroom.deleteKeys({ id: ZERO_GUID });
      expect(del.status).toBe(200);
      expect((await owner.privacyroom.getUserKeys()).data.count).toBe(0);

      const { status } = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(status).toBe(403);

      // The room survives the key loss — only the key material is gone.
      const info = await owner.rooms.getRoomInfo({ id: roomId });
      expect(info.status).toBe(200);
      expect(info.data.response!.private).toBe(true);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - A wiped key must not be reported as room access", async ({
      apiSdk,
    }) => {
      // Follow-through on the destructive replaceKey bug: after an empty-body PUT
      // erases the key material the row still exists, so the endpoint answers 200
      // with an entry that carries NO publicKey — the caller is told it has
      // access to a room it can no longer decrypt. Deleting the key outright is
      // reported honestly (403, see the test above); wiping it is not.
      test.fail(
        true,
        "BUG XXXXX: after replaceKey erases the key material, getUserKeysForRoom returns 200 with a key entry that has no publicKey/privateKeyEnc",
      );
      const owner = apiSdk.forRole("owner");
      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(12),
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

      await owner.privacyroom.replaceKey({ encryptionKeyRequestDto: {} });

      const { data } = await owner.privacyroom.getUserKeysForRoom({ roomId });
      // Whatever the endpoint reports, it must never present a key entry without
      // key material.
      for (const key of data.response ?? []) {
        expect(key.publicKey).toBeTruthy();
      }
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Archived private room still returns the access keys", async ({
      apiSdk,
    }) => {
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
      const roomId = room.response!.id! as number;

      const archive = await owner.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      expect(archive.status).toBe(200);
      const operation = await waitForOperation(owner.operations);
      expect(operation.finished).toBe(true);

      const { data, status } = await owner.privacyroom.getUserKeysForRoom({
        roomId,
      });
      expect(status).toBe(200);
      expect(data.response!.map((k) => k.publicKey)).toEqual([ownerPk]);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Deleted private room returns 404", async ({
      apiSdk,
    }) => {
      // Once the room is in Trash its keys are gone from the endpoint's point of
      // view, so it answers like a room that never existed.
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
      const before = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(before.status).toBe(200);

      await owner.rooms.deleteRoom({
        id: roomId,
        deleteRoomRequest: { deleteAfter: false },
      });
      const operation = await waitForOperation(owner.operations);
      expect(operation.finished).toBe(true);

      const { status } = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(status).toBe(404);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Non-private room is rejected with a clean client error", async ({
      apiSdk,
    }) => {
      // A non-encrypted room has no access keys, so the endpoint rejects the call
      // with 400. It used to leak a raw .NET NotSupportedException as HTTP 415
      // ("Specified method is not supported."); that is BUG 82543, fixed —
      // verified on a live portal on 2026-08-04.
      const owner = apiSdk.forRole("owner");
      const { data: room } = await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Plain Room " + apiSdk.faker.generateString(6),
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = room.response!.id!;

      const { status } = await owner.privacyroom.getUserKeysForRoom({
        roomId: roomId as number,
      });

      expect(status).toBe(400);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Non-existent room returns 404", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.getUserKeysForRoom({ roomId: 999999999 });

      expect(status).toBe(404);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - roomId 0 returns 404", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.getUserKeysForRoom({ roomId: 0 });

      expect(status).toBe(404);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Negative roomId returns 404", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.getUserKeysForRoom({ roomId: -1 });

      expect(status).toBe(404);
    });
  });

  test.describe("End-to-end key lifecycle", () => {
    test("Full lifecycle of a single key: set -> get -> replace -> delete", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const pk = "pk-" + apiSdk.faker.generateString(12);
      const newPk = "pk-new-" + apiSdk.faker.generateString(12);

      await test.step("no keys initially", async () => {
        const { data } = await owner.privacyroom.getUserKeys();
        expect(data.count).toBe(0);
      });

      await test.step("setKeys creates the key", async () => {
        const { status, data } = await owner.privacyroom.setKeys({
          encryptionKeyRequestDto: { publicKey: pk, privateKeyEnc: "prv" },
        });
        expect(status).toBe(200);
        expect(data.response![0].publicKey).toBe(pk);
      });

      await test.step("getUserKeys returns it", async () => {
        const list = await owner.privacyroom.getUserKeys();
        expect(list.data.count).toBe(1);
        expect(list.data.response?.[0]?.publicKey).toBe(pk);
      });

      await test.step("replaceKey swaps the value", async () => {
        const { status } = await owner.privacyroom.replaceKey({
          encryptionKeyRequestDto: { publicKey: newPk, privateKeyEnc: "prv2" },
        });
        expect(status).toBe(200);
        const list = await owner.privacyroom.getUserKeys();
        expect(list.data.count).toBe(1);
        expect(list.data.response![0].publicKey).toBe(newPk);
      });

      await test.step("deleteKeys removes it", async () => {
        const { status } = await owner.privacyroom.deleteKeys({
          id: ZERO_GUID,
        });
        expect(status).toBe(200);
        const list = await owner.privacyroom.getUserKeys();
        expect(list.data.count).toBe(0);
      });
    });
  });

  test.describe("Privacy Room integration", () => {
    test("Adding then removing a member updates the room's access-key set", async ({
      apiSdk,
    }) => {
      // NOTE: this verifies the room's access-key MEMBERSHIP LIST (who is allowed
      // and whose public key is part of the room's key set), NOT the cryptographic
      // re-encryption itself. The API does not expose the encrypted room key
      // material, so actual re-encryption correctness cannot be asserted here.
      const owner = apiSdk.forRole("owner");
      const ownerPk = "owner-" + apiSdk.faker.generateString(12);
      const userPk = "user-" + apiSdk.faker.generateString(12);

      // Owner has keys and creates a private room.
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
      const roomId = room.response!.id! as number;

      // A user with their own keys, not yet invited.
      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const userId = memberData.response!.id as string;
      const user = apiSdk.forRole("user");
      await user.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: userPk, privateKeyEnc: "up" },
      });

      await test.step("before invite the user is denied (403)", async () => {
        const { status } = await user.privacyroom.getUserKeysForRoom({
          roomId,
        });
        expect(status).toBe(403);
      });

      await test.step("after invite the user is granted and sees both keys", async () => {
        const invite = await owner.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.ContentCreator }],
            notify: false,
          },
        });
        expect(invite.status).toBe(200);

        const { data, status } = await user.privacyroom.getUserKeysForRoom({
          roomId,
        });
        expect(status).toBe(200);
        const pks = data.response?.map((k) => k.publicKey) ?? [];
        expect(pks).toContain(userPk);
        expect(pks).toContain(ownerPk);
      });

      await test.step("after removal the user is denied again and dropped from the key set", async () => {
        const remove = await owner.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: {
            invitations: [{ id: userId, access: FileShare.None }],
            notify: false,
          },
        });
        expect(remove.status).toBe(200);

        const { status } = await user.privacyroom.getUserKeysForRoom({
          roomId,
        });
        expect(status).toBe(403);

        // The owner's view of the room no longer includes the removed user's key.
        const ownerView = await owner.privacyroom.getUserKeysForRoom({
          roomId,
        });
        expect(ownerView.status).toBe(200);
        const ownerPks = ownerView.data.response?.map((k) => k.publicKey) ?? [];
        expect(ownerPks).toContain(ownerPk);
        expect(ownerPks).not.toContain(userPk);
      });
    });

    test("Replacing the active key re-encrypts the caller's private rooms", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const oldPk = "old-" + apiSdk.faker.generateString(12);
      const newPk = "new-" + apiSdk.faker.generateString(12);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: oldPk, privateKeyEnc: "op" },
      });
      const { data: room } = await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Privacy Room " + apiSdk.faker.generateString(6),
          roomType: RoomType.CustomRoom,
          private: true,
        },
      });
      const roomId = room.response!.id! as number;

      const before = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(before.data.response?.map((k) => k.publicKey)).toContain(oldPk);

      await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: { publicKey: newPk, privateKeyEnc: "np" },
      });

      // The room's access keys now reflect the rotated key; the old one is gone.
      const after = await owner.privacyroom.getUserKeysForRoom({ roomId });
      expect(after.status).toBe(200);
      const pks = after.data.response?.map((k) => k.publicKey) ?? [];
      expect(pks).toContain(newPk);
      expect(pks).not.toContain(oldPk);
    });

    test("PUT /files/rooms/{id}/share - A user without encryption keys cannot be invited to a private room", async ({
      apiSdk,
    }) => {
      // The room key is wrapped for each member's public key, so a keyless user
      // cannot be added at all: the invite itself is refused. The positive
      // control matters here — the SAME invite of the SAME user succeeds as soon
      // as they hold a key, which proves the 403 is about the missing key and not
      // about the user, the access level or the room.
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
      const roomId = room.response!.id! as number;

      const { data: memberData, userData } = await apiSdk.addMember(
        "owner",
        "User",
      );
      const userId = memberData.response!.id as string;
      const invitation = {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      };

      const memberApi = await apiSdk.authenticateMember(userData, "User");
      const userPk = "user-" + apiSdk.faker.generateString(12);

      await test.step("without a key the invite is refused", async () => {
        const denied = await owner.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: invitation,
        });
        expect(denied.status).toBe(403);
        expect(
          (denied.data as unknown as { error?: { message?: string } }).error
            ?.message,
        ).toContain("does not have an encryption key");

        // Nothing was granted: the user is not in the room's key set.
        const ownerView = await owner.privacyroom.getUserKeysForRoom({
          roomId,
        });
        expect(ownerView.data.response!.map((k) => k.publicKey)).toEqual([
          ownerPk,
        ]);
        const memberView = await memberApi.privacyroom.getUserKeysForRoom({
          roomId,
        });
        expect(memberView.status).toBe(403);
      });

      await test.step("with a key the same invite succeeds", async () => {
        const setKeys = await memberApi.privacyroom.setKeys({
          encryptionKeyRequestDto: { publicKey: userPk, privateKeyEnc: "up" },
        });
        expect(setKeys.data.count).toBe(1);

        const granted = await owner.rooms.setRoomSecurity({
          id: roomId,
          roomInvitationRequest: invitation,
        });
        expect(granted.status).toBe(200);

        const memberView = await memberApi.privacyroom.getUserKeysForRoom({
          roomId,
        });
        expect(memberView.status).toBe(200);
        expect(
          memberView.data.response!.map((k) => k.publicKey).sort(),
        ).toEqual([ownerPk, userPk].sort());
      });
    });

    // Two scenarios are intentionally NOT covered here, per the backend team:
    //  - TOFU (trust-on-first-use) confirmation on a member's public-key change
    //    is a client-side trust decision with no server-side API surface.
    //  - The "active" key is tracked ONLY on the client; the backend has no
    //    concept of it, so "which key is active" cannot be asserted server-side.
    // Both belong to the UI test suite.
  });
});
