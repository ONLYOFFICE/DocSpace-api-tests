import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

/**
 * Access control for the PrivacyroomApi.
 *
 * Encryption keys are personal: every authenticated user (regardless of role)
 * manages their own keys, so all roles get 200. Anonymous requests get 401.
 */
test.describe("GET /api/2.0/privacyroom/keys - access control", () => {
  test("GET /api/2.0/privacyroom/keys - Owner can read their keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").privacyroom.getUserKeys();
    expect(status).toBe(200);
  });

  test("GET /api/2.0/privacyroom/keys - DocSpaceAdmin can read their keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .privacyroom.getUserKeys();
    expect(status).toBe(200);
  });

  test("GET /api/2.0/privacyroom/keys - RoomAdmin can read their keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { status } = await apiSdk
      .forRole("roomAdmin")
      .privacyroom.getUserKeys();
    expect(status).toBe(200);
  });

  test("GET /api/2.0/privacyroom/keys - User can read their keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const { status } = await apiSdk.forRole("user").privacyroom.getUserKeys();
    expect(status).toBe(200);
  });

  test("GET /api/2.0/privacyroom/keys - Guest can read their keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const { status } = await apiSdk.forRole("guest").privacyroom.getUserKeys();
    expect(status).toBe(200);
  });

  test("GET /api/2.0/privacyroom/keys - Anonymous cannot read keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().privacyroom.getUserKeys();
    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/privacyroom/keys - access control", () => {
  const dto = (apiSdk: {
    faker: { generateString: (n: number) => string };
  }) => ({
    encryptionKeyRequestDto: {
      publicKey: "pk-" + apiSdk.faker.generateString(12),
      privateKeyEnc: "prv-" + apiSdk.faker.generateString(12),
    },
  });

  test("POST /api/2.0/privacyroom/keys - Owner can set keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("POST /api/2.0/privacyroom/keys - DocSpaceAdmin can set keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("POST /api/2.0/privacyroom/keys - RoomAdmin can set keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { status } = await apiSdk
      .forRole("roomAdmin")
      .privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("POST /api/2.0/privacyroom/keys - User can set keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const { status } = await apiSdk
      .forRole("user")
      .privacyroom.setKeys(dto(apiSdk));
    expect(status).toBe(200);
  });

  test("POST /api/2.0/privacyroom/keys - Guest can set keys", async ({
    apiSdk,
  }) => {
    // Guests should not be allowed to create keys, but the API currently lets
    // them (returns 200 instead of 403).
    test.fail(
      true,
      "BUG 82524: Guest is allowed to set encryption keys",
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

test.describe("Anonymous access to remaining privacyroom endpoints", () => {
  test("PUT /api/2.0/privacyroom/keys - Anonymous cannot replace keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().privacyroom.replaceKey({
      encryptionKeyRequestDto: { publicKey: "pk", privateKeyEnc: "prv" },
    });
    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/privacyroom/keys/{id} - Anonymous cannot delete keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .privacyroom.deleteKeys({ id: "00000000-0000-0000-0000-000000000000" });
    expect(status).toBe(401);
  });

  test("GET /api/2.0/privacyroom/keys/filter - Anonymous cannot filter keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .privacyroom.getUserKeysByFilter();
    expect(status).toBe(401);
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
