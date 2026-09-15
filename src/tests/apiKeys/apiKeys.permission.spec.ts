import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { faker } from "@faker-js/faker";

test.describe("POST /api/2.0/keys - permissions", () => {
  test("BUG 81236: POST /api/2.0/keys - Guest cannot create an API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "test key",
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe(
      "This operation unavailable for user with guest role",
    );
  });

  test("POST /api/2.0/keys - Anonymous cannot create an API key", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.createApiKey({
      createApiKeyRequestDto: {
        name: "test key",
      },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with empty name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "",
        },
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.Name?.[0]).toBe(
      "The Name field is required.",
    );
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with whitespace name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "   ",
        },
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.Name?.[0]).toBe(
      "The Name field is required.",
    );
  });

  test("POST /api/2.0/keys - Owner cannot create an API key without name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {} as any,
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.["$"]?.[0]).toContain(
      "missing required properties including: 'name'",
    );
  });

  test("BUG 81237: POST /api/2.0/keys - Owner cannot create an API key with empty permissions array", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: "test key",
          permissions: [],
        },
      });

    expect(status).toBe(400);
    expect((data as any)?.error?.message).toBe("Permissions are not valid.");
  });

  test("POST /api/2.0/keys - Owner cannot create an API key with name longer than 30 characters", async ({
    apiSdk,
  }) => {
    const longName = apiSdk.faker.generateString(31);

    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: {
          name: longName,
        },
      });

    expect(status).toBe(400);
    expect((data.response as any)?.errors?.Name?.[0]).toBe(
      "Incorrect name. Length must be less than 30",
    );
  });
});

test.describe("GET /api/2.0/keys/@self - permissions", () => {
  test("GET /api/2.0/keys/@self - Anonymous cannot get API key info", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.getApiKey();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/keys/permissions - permissions", () => {
  test("GET /api/2.0/keys/permissions - Anonymous cannot get all permissions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.getAllPermissions();

    expect(status).toBe(401);
  });

  test("BUG 81611: GET /api/2.0/keys/permissions - Guest cannot get all permissions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.getAllPermissions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/keys - permissions", () => {
  test("GET /api/2.0/keys - Anonymous cannot get API keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.getApiKeys();

    expect(status).toBe(401);
  });

  test("BUG 81615: GET /api/2.0/keys - Guest cannot get API keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    await apiSdk.forRole("owner").apiKeys.createApiKey({
      createApiKeyRequestDto: { name: faker.lorem.words(3) },
    });

    const { data, status } = await apiSdk.forRole("guest").apiKeys.getApiKeys();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/keys/{keyId} - permissions", () => {
  let keyId: string;

  test.beforeEach(async ({ apiSdk }) => {
    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    keyId = created.response!.id!;
  });

  test("PUT /api/2.0/keys/{keyId} - Anonymous cannot update an API key", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.updateApiKey({
      keyId,
      updateApiKeyRequest: { name: faker.lorem.words(3) },
    });

    expect(status).toBe(401);
  });

  test("BUG 81616: PUT /api/2.0/keys/{keyId} - RoomAdmin cannot update Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: { name: faker.lorem.words(3) },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81616: PUT /api/2.0/keys/{keyId} - User cannot update Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk.forRole("user").apiKeys.updateApiKey({
      keyId,
      updateApiKeyRequest: { name: faker.lorem.words(3) },
    });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81616: PUT /api/2.0/keys/{keyId} - Guest cannot update Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: { name: faker.lorem.words(3) },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/keys/{keyId} - permissions", () => {
  let keyId: string;

  test.beforeEach(async ({ apiSdk }) => {
    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    keyId = created.response!.id!;
  });

  test("DELETE /api/2.0/keys/{keyId} - Anonymous cannot delete an API key", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(401);
  });

  test("BUG 81609: DELETE /api/2.0/keys/{keyId} - RoomAdmin cannot delete Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81609: DELETE /api/2.0/keys/{keyId} - User cannot delete Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81609: DELETE /api/2.0/keys/{keyId} - Guest cannot delete Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

// HTML in API key name (BUG 82910). Per the developer's resolution the name is
// NOT sanitized or rejected by the API — it is stored and returned verbatim;
// the fix HTML-encodes it only when rendering the "Your API key is expired"
// email. The email half is not observable here (the suite has no mailbox) and
// stays a manual check. What the API contract guarantees is checked below:
// the raw name round-trips unchanged through POST and GET. All payloads fit
// within the 30-char name limit.
test.describe("POST /api/2.0/keys - HTML in name is stored verbatim (escaped only in email)", () => {
  test("POST /api/2.0/keys - Phishing link in name is stored verbatim", async ({
    apiSdk,
  }) => {
    const payload = "<a href=//evil.com>LINK</a>"; // 26 chars
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.apiKeys.createApiKey({
      createApiKeyRequestDto: { name: payload, expiresInDays: 1 },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(payload);

    const { data: keys, status: keysStatus } =
      await ownerApi.apiKeys.getApiKeys();
    expect(keysStatus).toBe(200);
    expect(keys.response!.find((k) => k.id === data.response!.id)?.name).toBe(
      payload,
    );
  });

  test("POST /api/2.0/keys - CSS injection in name is stored verbatim", async ({
    apiSdk,
  }) => {
    const payload = "<b style=color:red>TEST</b>"; // 27 chars
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.apiKeys.createApiKey({
      createApiKeyRequestDto: { name: payload, expiresInDays: 1 },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(payload);

    const { data: keys, status: keysStatus } =
      await ownerApi.apiKeys.getApiKeys();
    expect(keysStatus).toBe(200);
    expect(keys.response!.find((k) => k.id === data.response!.id)?.name).toBe(
      payload,
    );
  });

  test("POST /api/2.0/keys - Tracking pixel in name is stored verbatim", async ({
    apiSdk,
  }) => {
    const payload = "<img src=//1.2.3.4>"; // 19 chars
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.apiKeys.createApiKey({
      createApiKeyRequestDto: { name: payload, expiresInDays: 1 },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(payload);

    const { data: keys, status: keysStatus } =
      await ownerApi.apiKeys.getApiKeys();
    expect(keysStatus).toBe(200);
    expect(keys.response!.find((k) => k.id === data.response!.id)?.name).toBe(
      payload,
    );
  });
});
