import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { faker } from "@faker-js/faker";

test.describe("POST /api/2.0/keys - permissions", () => {
  test.fail(
    "BUG 81235: POST /api/2.0/keys - User cannot create an API key with Contacts permissions",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "test key",
            permissions: ["accounts:read"],
          },
        });

      expect(status).toBe(403);
      expect((data.response as any)?.error?.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG 81236: POST /api/2.0/keys - Guest cannot create an API key",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { data, status } = await apiSdk
        .forRole("guest")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "test key",
          },
        });

      expect(status).toBe(403);
      expect((data.response as any)?.error?.message).toBe(
        "This operation unavailable for user with guest role",
      );
    },
  );

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

  test.fail(
    "BUG 81237: POST /api/2.0/keys - Owner cannot create an API key with empty permissions array",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "test key",
            permissions: [],
          },
        });

      expect(status).toBe(400);
      expect((data.response as any)?.error?.message).toBe(
        "Permissions are not valid.",
      );
    },
  );

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

  test.fail(
    "BUG 81611: GET /api/2.0/keys/permissions - Guest cannot get all permissions",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { data, status } = await apiSdk
        .forRole("guest")
        .apiKeys.getAllPermissions();

      expect(status).toBe(403);
      expect((data.response as any)?.error?.message).toBe("Access denied.");
    },
  );
});

test.describe("GET /api/2.0/keys - permissions", () => {
  test("GET /api/2.0/keys - Anonymous cannot get API keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().apiKeys.getApiKeys();

    expect(status).toBe(401);
  });

  test.fail(
    "BUG 81612: GET /api/2.0/keys - Guest cannot get API keys",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");

      await apiSdk.forRole("owner").apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

      const { data, status } = await apiSdk
        .forRole("guest")
        .apiKeys.getApiKeys();

      expect(status).toBe(403);
      expect((data.response as any)?.error?.message).toBe("Access denied.");
    },
  );
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

  test.fail(
    "BUG 81609: DELETE /api/2.0/keys/{keyId} - RoomAdmin cannot delete Owner's API key",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .apiKeys.deleteApiKey({ keyId });

      expect(status).toBe(403);
      expect((data.response as any)?.error?.message).toBe("Access denied.");
    },
  );

  test.fail(
    "BUG 81609: DELETE /api/2.0/keys/{keyId} - User cannot delete Owner's API key",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.deleteApiKey({ keyId });

      expect(status).toBe(403);
      expect((data.response as any)?.error?.message).toBe("Access denied.");
    },
  );

  test.fail(
    "BUG 81609: DELETE /api/2.0/keys/{keyId} - Guest cannot delete Owner's API key",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { data, status } = await apiSdk
        .forRole("guest")
        .apiKeys.deleteApiKey({ keyId });

      expect(status).toBe(403);
      expect((data.response as any)?.error?.message).toBe("Access denied.");
    },
  );
});
