import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EncryptionKeyType, RoomType } from "@onlyoffice/docspace-api-sdk";

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
 * Keys are scoped to the calling user, so the owner manages only their own keys.
 */
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
  });

  test.describe("POST /api/2.0/privacyroom/keys - setKeys", () => {
    test("POST /api/2.0/privacyroom/keys - Owner sets encryption keys", async ({
      apiSdk,
    }) => {
      const publicKey = "pk-" + apiSdk.faker.generateString(16);
      const privateKeyEnc = "prv-" + apiSdk.faker.generateString(16);

      const { data, status } = await apiSdk
        .forRole("owner")
        .privacyroom.setKeys({
          encryptionKeyRequestDto: { publicKey, privateKeyEnc },
        });

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response).toHaveLength(1);
      expect(data.response![0].publicKey).toBe(publicKey);
      expect(data.response![0].privateKeyEnc).toBe(privateKeyEnc);
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

      // the id assigned to a personal key is the zero GUID
      const zeroGuid = "00000000-0000-0000-0000-000000000000";
      const { data, status } = await owner.privacyroom.getUserKeysByFilter({
        id: zeroGuid,
      });

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.response?.id).toBe(zeroGuid);
      expect(data.response?.publicKey).toBe(publicKey);
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

      const { data, status } = await owner.privacyroom.getUserKeysByFilter();

      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    test("GET /api/2.0/privacyroom/keys/filter - Filter by type returns empty result", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      await owner.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "pk-" + apiSdk.faker.generateString(16),
          privateKeyEnc: "prv-enc",
        },
      });

      const { data, status } = await owner.privacyroom.getUserKeysByFilter({
        type: EncryptionKeyType.Crypt,
      });

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
        "BUG XXXXX: getUserKeysByFilter returns 400 (ArgumentNullException) when the user has no keys",
      );

      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.getUserKeysByFilter();

      expect(status).toBe(200);
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

      const { data, status } = await owner.privacyroom.deleteKeys({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(status).toBe(200);
      expect(data.count).toBe(0);
      expect(data.response ?? []).toHaveLength(0);

      const after = await owner.privacyroom.getUserKeys();
      expect(after.data.count).toBe(0);
      expect(after.data.response ?? []).toHaveLength(0);
    });

    test("DELETE /api/2.0/privacyroom/keys/{id} - Deleting a non-existent key returns 404", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.deleteKeys({ id: "nonexistent-key-id" });

      expect(status).toBe(404);
    });
  });

  test.describe("GET /api/2.0/privacyroom/{roomId}/access - getUserKeysForRoom", () => {
    test("GET /api/2.0/privacyroom/{roomId}/access - Existing room returns 415 (encryption not supported)", async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const { data: room } = await owner.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Privacy Room " + apiSdk.faker.generateString(6),
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = room.response!.id!;

      const { status } = await owner.privacyroom.getUserKeysForRoom({
        roomId: roomId as number,
      });

      // Privacy Room encryption is not available on the portal, so the crypto
      // engine helper raises NotSupportedException -> HTTP 415.
      expect(status).toBe(415);
    });

    test("GET /api/2.0/privacyroom/{roomId}/access - Non-existent room returns 404", async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .privacyroom.getUserKeysForRoom({ roomId: 999999999 });

      expect(status).toBe(404);
    });
  });
});
