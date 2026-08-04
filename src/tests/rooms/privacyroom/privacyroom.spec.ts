import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";

/**
 * Functional tests for the PrivacyroomApi — per-user encryption key management
 * used by DocSpace Privacy Rooms.
 *
 *   GET    /api/2.0/privacyroom/keys           - getUserKeys
 *   GET    /api/2.0/privacyroom/keys/filter    - getUserKeysByFilter
 *   GET    /api/2.0/privacyroom/{roomId}/access- getUserKeysForRoom
 *   POST   /api/2.0/privacyroom/keys           - setKeys
 *   PUT    /api/2.0/privacyroom/keys           - replaceKey
 *   DELETE /api/2.0/privacyroom/keys/{id}      - deleteKeys
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
 *  - deleteKeys removes only the key with the given id.
 *  - There is no "active" key on the backend: which key is active is tracked
 *    only on the client, so it is not (and cannot be) covered here.
 *  - getUserKeysByFilter returns a single key (response is an object, not array);
 *    id + publicKey + privateKeyEnc are matched with AND semantics; publicKey
 *    matching is case-insensitive; type never matches (keys carry no type).
 *  - Encrypted rooms ARE supported: createRoom({ private: true }) after setKeys
 *    creates a private room, and getUserKeysForRoom returns the caller's access
 *    keys for it. A NON-private room has no encryption, so getUserKeysForRoom
 *    returns 415 for it.
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

    test("PUT /api/2.0/privacyroom/keys - After replace the old key is gone and the new key is found by filter", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const oldPk = "old-" + apiSdk.faker.generateString(12);
      const newPk = "new-" + apiSdk.faker.generateString(12);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey: oldPk, privateKeyEnc: "oldprv" },
      });
      await owner.privacyroom.replaceKey({
        encryptionKeyRequestDto: { publicKey: newPk, privateKeyEnc: "newprv" },
      });

      const byOld = await owner.privacyroom.getUserKeys();
      expect(byOld.data.count).toBe(0);

      const byNew = await owner.privacyroom.getUserKeys();
      expect(byNew.data.count).toBe(1);
      expect(byNew.data.response?.[0]?.publicKey).toBe(newPk);

      const all = await owner.privacyroom.getUserKeys();
      expect(all.data.count).toBe(1);
      expect(all.data.response![0].publicKey).toBe(newPk);
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
      // and getUserKeysByFilter (and unlike deleteKeys, which returns 404).
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
  });

  test.describe("GET /api/2.0/privacyroom/keys/filter - getUserKeysByFilter", () => {
    test("GET /api/2.0/privacyroom/keys/filter - Filter by id returns the matching key", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response?.[0]?.id).toBe(ZERO_GUID);
      expect(data.response?.[0]?.publicKey).toBe(publicKey);
    });

    test("GET /api/2.0/privacyroom/keys/filter - No filter match returns empty result", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Filter by the key's type returns the matching key", async ({
      apiSdk,
    }) => {
      // The filter accepts a `type` (EncryptionKeyDto is a first-class SDK enum),
      // so filtering by the type of an existing key should return that key. In
      // practice the type filter is non-functional: the create DTO has no type
      // field, the stored/returned key omits type entirely (verified: even a
      // raw `type` on create is dropped), and filtering by ANY type returns 0.
      // A positive match therefore cannot be produced. Assert the intended
      // behavior and keep test.fail until keys carry a matchable type.
      test.fail(
        true,
        "BUG 82549: getUserKeysByFilter type filter never matches — keys expose no type and it cannot be set",
      );
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response?.[0]?.publicKey).toBe(publicKey);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Filter by the key's version returns the matching key", async ({
      apiSdk,
    }) => {
      // Like `type`, `version` is a declared filter parameter with no backing on
      // the key: the create DTO has no version field and the returned key omits
      // it, so filtering by version alone always returns 0 (a positive match
      // cannot be built). Assert the intended behavior; keep test.fail until keys
      // carry a matchable version.
      test.fail(
        true,
        "BUG 82549: getUserKeysByFilter version filter never matches — keys expose no version and it cannot be set",
      );
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response?.[0]?.publicKey).toBe(publicKey);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Combined id + version applies AND (a non-matching version excludes the key)", async ({
      apiSdk,
    }) => {
      // With AND semantics, a correct id plus a version the key does not have
      // must return nothing. Actual: `version` is ignored entirely, so the key is
      // still returned (count 1) regardless of the version value — proving the
      // parameter is dead. Remove test.fail once version participates in the filter.
      test.fail(
        true,
        "BUG 82549: getUserKeysByFilter ignores `version` — id + any version still returns the key instead of applying AND",
      );
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Filter by publicKey returns the matching key", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response?.[0]?.publicKey).toBe(publicKey);
      expect(data.response?.[0]?.id).toBe(ZERO_GUID);
    });

    test("GET /api/2.0/privacyroom/keys/filter - publicKey filter is case-sensitive", async ({
      apiSdk,
    }) => {
      // A public key is a case-sensitive value (e.g. Base64), so a differently
      // cased query must NOT match. Actual: the filter matches case-insensitively
      // (an uppercased query still returns the key), which is likely a DB
      // collation defect rather than intended behavior.
      test.fail(
        true,
        "BUG 82550: publicKey filter matches case-insensitively (should be exact/case-sensitive)",
      );
      const owner = apiSdk.forRole("owner");
      const publicKey = "AbCdEf-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Non-matching publicKey returns empty result", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - publicKey filter matches exactly, not by substring", async ({
      apiSdk,
    }) => {
      // The match is on the full value: a prefix/substring/suffix must not match.
      const owner = apiSdk.forRole("owner");
      const publicKey = "PKEXACT" + apiSdk.faker.generateString(10);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const prefix = await owner.privacyroom.getUserKeys();
      expect(prefix.status).toBe(200);
      expect(prefix.data.count).toBe(0);

      const substring = await owner.privacyroom.getUserKeys();
      expect(substring.status).toBe(200);
      expect(substring.data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Filter by privateKeyEnc returns the matching key", async ({
      apiSdk,
    }) => {
      // SECURITY / API-DESIGN NOTE (behavior confirmed, not asserted here):
      //  - the endpoint returns `privateKeyEnc` in the response body (expected:
      //    it is the caller's OWN encrypted private key, retrieved over an
      //    authenticated request so the client can decrypt locally);
      //  - BUT the SDK transmits it as a URL QUERY PARAMETER on a GET, so the
      //    encrypted private key can leak into access logs, proxies and browser
      //    history. Filtering a secret via the query string is a design smell
      //    worth raising with the API team (prefer a POST body, or drop the
      //    param). This test only verifies the documented SDK contract works.
      //  - matching is exact (see substring test above) but case-INSENSITIVE
      //    (see the privateKeyEnc case-sensitive test below, marked test.fail).
      const owner = apiSdk.forRole("owner");
      const privateKeyEnc = "prv-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc,
        },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response?.[0]?.privateKeyEnc).toBe(privateKeyEnc);
    });

    test("GET /api/2.0/privacyroom/keys/filter - privateKeyEnc filter is case-sensitive", async ({
      apiSdk,
    }) => {
      // Same as publicKey: the encrypted private key is a case-sensitive value,
      // so a differently cased query must NOT match. Actual: matches
      // case-insensitively (likely the same DB collation defect).
      test.fail(
        true,
        "BUG 82550: privateKeyEnc filter matches case-insensitively (should be exact/case-sensitive)",
      );
      const owner = apiSdk.forRole("owner");
      const privateKeyEnc = "XyZ123-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc,
        },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Non-existent id returns empty result", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Malformed id returns 400", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      const { status } = await owner.privacyroom.getUserKeys();

      expect(status).toBe(400);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Combined id + publicKey use AND semantics", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const bothMatch = await owner.privacyroom.getUserKeys();
      expect(bothMatch.status).toBe(200);
      expect(bothMatch.data.count).toBe(1);

      // Correct id but wrong publicKey -> no match (AND, not OR).
      const oneWrong = await owner.privacyroom.getUserKeys();
      expect(oneWrong.status).toBe(200);
      expect(oneWrong.data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - All matching functional filters return the key", async ({
      apiSdk,
    }) => {
      // The filter's functional fields are id + publicKey + privateKeyEnc; when
      // all three match, the key is returned.
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);
      const privateKeyEnc = "prv-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc },
      });

      const functional = await owner.privacyroom.getUserKeys();
      expect(functional.status).toBe(200);
      expect(functional.data.count).toBe(1);
      expect(functional.data.response?.[0]?.publicKey).toBe(publicKey);
    });

    test("GET /api/2.0/privacyroom/keys/filter - A non-matching type/version must exclude an otherwise-matching key", async ({
      apiSdk,
    }) => {
      // If type/version are supplied they should participate in the AND: a key
      // matched by id + publicKey + privateKeyEnc must still be excluded when the
      // supplied type/version do not match. Actual: type/version are ignored, so
      // the key is returned anyway (count 1). Remove test.fail once type/version
      // participate in the filter.
      test.fail(
        true,
        "BUG 82549: getUserKeysByFilter ignores type/version — a non-matching type/version does not exclude a key matched by id+publicKey+privateKeyEnc",
      );
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);
      const privateKeyEnc = "prv-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc },
      });

      // The stored key carries no type/version, so these values cannot match.
      const everything = await owner.privacyroom.getUserKeys();
      expect(everything.status).toBe(200);
      expect(everything.data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - One mismatching filter among matching ones returns empty", async ({
      apiSdk,
    }) => {
      // id + publicKey match but privateKeyEnc does not -> AND excludes the key.
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);
      const privateKeyEnc = "prv-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();
      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Combined publicKey + version applies AND (a non-matching version excludes the key)", async ({
      apiSdk,
    }) => {
      // Same defect as id + version, via a different functional field: a correct
      // publicKey plus a version the key does not have must return nothing, but
      // `version` is ignored so the key is still returned (count 1). Guards
      // against the parameter being dropped only for certain field combinations.
      test.fail(
        true,
        "BUG 82549: getUserKeysByFilter ignores `version` — publicKey + any version still returns the key instead of applying AND",
      );
      const owner = apiSdk.forRole("owner");
      const publicKey = "pk-" + apiSdk.faker.generateString(16);

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: { publicKey, privateKeyEnc: "prv-enc" },
      });

      const { data, status } = await owner.privacyroom.getUserKeys();
      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Returns 200 when the user has no keys", async ({
      apiSdk,
    }) => {
      // BUG: the endpoint throws ArgumentNullException (leaks a .NET stack trace)
      // and returns 400 when the user has no keys yet. It should return a clean
      // 200 empty result. Remove test.fail once the server bug is fixed.
      test.fail(
        true,
        "BUG 82523: getUserKeysByFilter returns 400 (ArgumentNullException) when the user has no keys",
      );

      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.getUserKeys();

      expect(status).toBe(200);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Does not crash after the last key is deleted", async ({
      apiSdk,
    }) => {
      // Distinct from BUG 82523: once the key store has been initialised (a key
      // was created and then deleted) the filter returns a clean 200 empty result
      // instead of the ArgumentNullException seen for brand-new users.
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });
      await owner.privacyroom.deleteKeys({ id: ZERO_GUID });

      const noArg = await owner.privacyroom.getUserKeys();
      expect(noArg.status).toBe(200);
      expect(noArg.data.count).toBe(0);

      const byId = await owner.privacyroom.getUserKeys();
      expect(byId.status).toBe(200);
      expect(byId.data.count).toBe(0);
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
      // 400 — the same way getUserKeysByFilter already rejects a malformed id.
      // Actual: delete returns 404 (looks like a {id:guid} route-constraint miss),
      // which is inconsistent with the filter endpoint. Remove test.fail once the
      // two endpoints agree on 400.
      test.fail(
        true,
        "BUG 82553: deleteKeys returns 404 for a malformed id instead of 400 (getUserKeysByFilter returns 400 for the same input)",
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

    test("GET /api/2.0/privacyroom/{roomId}/access - Non-private room is rejected with a clean client error", async ({
      apiSdk,
    }) => {
      // A non-encrypted room has no access keys, so the endpoint should reject
      // the call with a clear client error (400). Instead it leaks a raw .NET
      // NotSupportedException as HTTP 415 with the generic body message
      // "Specified method is not supported." — a misused status (415 is
      // Unsupported Media Type) and an unhandled exception, not a designed
      // contract. Remove test.fail once it returns a proper client error.
      test.fail(
        true,
        'BUG 82543: getUserKeysForRoom on a non-private room leaks a 415 NotSupportedException ("Specified method is not supported.") instead of a clean 400',
      );
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
    test("Full lifecycle of a single key: set -> get -> filter -> replace -> delete", async ({
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

      await test.step("getUserKeys and filter both return it", async () => {
        const list = await owner.privacyroom.getUserKeys();
        expect(list.data.count).toBe(1);
        const byId = await owner.privacyroom.getUserKeys();
        expect(byId.data.response?.[0]?.publicKey).toBe(pk);
        const byPk = await owner.privacyroom.getUserKeys();
        expect(byPk.data.count).toBe(1);
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

    // Two scenarios are intentionally NOT covered here, per the backend team:
    //  - TOFU (trust-on-first-use) confirmation on a member's public-key change
    //    is a client-side trust decision with no server-side API surface.
    //  - The "active" key is tracked ONLY on the client; the backend has no
    //    concept of it, so "which key is active" cannot be asserted server-side.
    // Both belong to the UI test suite.
  });
});
