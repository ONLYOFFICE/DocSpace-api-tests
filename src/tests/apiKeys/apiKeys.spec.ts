import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { faker } from "@faker-js/faker";
import { Role } from "@/src/services/token-store";
import {
  DAY_MS,
  createKey,
  expectNear,
  findKey,
  listKeys,
  toTime,
} from "@/src/helpers/api-keys";

type RoleConfig = {
  role: Role;
  label: string;
};

const ROLES: RoleConfig[] = [
  { role: "owner", label: "Owner" },
  { role: "docSpaceAdmin", label: "DocSpaceAdmin" },
  { role: "roomAdmin", label: "RoomAdmin" },
];

test.describe("POST /api/2.0/keys", () => {
  for (const { role, label } of ROLES) {
    test.describe(label, () => {
      test.beforeEach(async ({ apiSdk }) => {
        if (role === "docSpaceAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
        } else if (role === "roomAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
        }
      });

      test(`POST /api/2.0/keys - ${label} creates an API key without restrictions`, async ({
        apiSdk,
      }) => {
        const { data: profile } = await apiSdk
          .forRole(role)
          .profiles.getSelfProfile();
        const userId = profile.response!.id!;
        const userDisplayName = profile.response!.displayName!;

        const keyName = faker.lorem.words(3);

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: keyName },
          });

        expect(status).toBe(200);
        expect(data.response?.id).toBeTruthy();
        expect(data.response?.name).toBe(keyName);
        expect(data.response?.key).toBeTruthy();
        expect(data.response?.permissions).toEqual([]);
        expect(data.response?.expiresAt).toBeFalsy();
        expect(data.response?.createBy?.id).toBe(userId);
        expect(data.response?.createBy?.displayName).toBe(userDisplayName);
      });

      test(`POST /api/2.0/keys - ${label} creates an API key without restrictions with expiration`, async ({
        apiSdk,
      }) => {
        const { data: profile } = await apiSdk
          .forRole(role)
          .profiles.getSelfProfile();
        const userId = profile.response!.id!;
        const userDisplayName = profile.response!.displayName!;

        const keyName = faker.lorem.words(3);

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: keyName, expiresInDays: 7 },
          });

        expect(status).toBe(200);
        expect(data.response?.id).toBeTruthy();
        expect(data.response?.name).toBe(keyName);
        expect(data.response?.key).toBeTruthy();
        expect(data.response?.permissions).toEqual([]);
        expect(data.response?.expiresAt).toBeTruthy();
        expect(data.response?.createBy?.id).toBe(userId);
        expect(data.response?.createBy?.displayName).toBe(userDisplayName);
      });

      test(`POST /api/2.0/keys - ${label} creates an API key with read-only permissions`, async ({
        apiSdk,
      }) => {
        const { data: profile } = await apiSdk
          .forRole(role)
          .profiles.getSelfProfile();
        const userId = profile.response!.id!;
        const userDisplayName = profile.response!.displayName!;

        const keyName = faker.lorem.words(3);

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: keyName, permissions: ["*:read"] },
          });

        expect(status).toBe(200);
        expect(data.response?.id).toBeTruthy();
        expect(data.response?.name).toBe(keyName);
        expect(data.response?.key).toBeTruthy();
        expect(data.response?.permissions).toEqual(["*:read"]);
        expect(data.response?.expiresAt).toBeFalsy();
        expect(data.response?.createBy?.id).toBe(userId);
        expect(data.response?.createBy?.displayName).toBe(userDisplayName);
      });

      test(`POST /api/2.0/keys - ${label} creates an API key with read-only permissions with expiration`, async ({
        apiSdk,
      }) => {
        const { data: profile } = await apiSdk
          .forRole(role)
          .profiles.getSelfProfile();
        const userId = profile.response!.id!;
        const userDisplayName = profile.response!.displayName!;

        const keyName = faker.lorem.words(3);

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: {
              name: keyName,
              permissions: ["*:read"],
              expiresInDays: 7,
            },
          });

        expect(status).toBe(200);
        expect(data.response?.id).toBeTruthy();
        expect(data.response?.name).toBe(keyName);
        expect(data.response?.key).toBeTruthy();
        expect(data.response?.permissions).toEqual(["*:read"]);
        expect(data.response?.expiresAt).toBeTruthy();
        expect(data.response?.createBy?.id).toBe(userId);
        expect(data.response?.createBy?.displayName).toBe(userDisplayName);
      });

      test(`POST /api/2.0/keys - ${label} creates an API key with all scopes read`, async ({
        apiSdk,
      }) => {
        const { data: profile } = await apiSdk
          .forRole(role)
          .profiles.getSelfProfile();
        const userId = profile.response!.id!;
        const userDisplayName = profile.response!.displayName!;

        const keyName = faker.lorem.words(3);
        const permissions = [
          "files:read",
          "rooms:read",
          "accounts.self:read",
          "accounts:read",
        ];

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: keyName, permissions },
          });

        expect(status).toBe(200);
        expect(data.response?.id).toBeTruthy();
        expect(data.response?.name).toBe(keyName);
        expect(data.response?.key).toBeTruthy();
        expect(data.response?.permissions).toEqual(permissions);
        expect(data.response?.createBy?.id).toBe(userId);
        expect(data.response?.createBy?.displayName).toBe(userDisplayName);
      });

      test(`POST /api/2.0/keys - ${label} creates an API key with all scopes write`, async ({
        apiSdk,
      }) => {
        const { data: profile } = await apiSdk
          .forRole(role)
          .profiles.getSelfProfile();
        const userId = profile.response!.id!;
        const userDisplayName = profile.response!.displayName!;

        const keyName = faker.lorem.words(3);
        const permissions = [
          "files:write",
          "files:read",
          "rooms:write",
          "rooms:read",
          "accounts.self:write",
          "accounts.self:read",
          "accounts:write",
          "accounts:read",
        ];

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: keyName, permissions },
          });

        expect(status).toBe(200);
        expect(data.response?.id).toBeTruthy();
        expect(data.response?.name).toBe(keyName);
        expect(data.response?.key).toBeTruthy();
        expect(data.response?.permissions).toEqual(permissions);
        expect(data.response?.createBy?.id).toBe(userId);
        expect(data.response?.createBy?.displayName).toBe(userDisplayName);
      });

      test(`POST /api/2.0/keys - ${label} creates an API key with special characters in name`, async ({
        apiSdk,
      }) => {
        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: {
              name: "<script>alert('xss')</script>",
            },
          });

        expect(status).toBe(200);
        expect(data.response?.id).toBeTruthy();
        expect(data.response?.name).toBe("<script>alert('xss')</script>");
      });
    });
  }

  test.describe("User", () => {
    test.beforeEach(async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");
    });

    test("POST /api/2.0/keys - User creates an API key without restrictions", async ({
      apiSdk,
    }) => {
      const { data: profile } = await apiSdk
        .forRole("user")
        .profiles.getSelfProfile();
      const userId = profile.response!.id!;
      const userDisplayName = profile.response!.displayName!;

      const keyName = faker.lorem.words(3);

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: keyName },
        });

      expect(status).toBe(200);
      expect(data.response?.id).toBeTruthy();
      expect(data.response?.name).toBe(keyName);
      expect(data.response?.key).toBeTruthy();
      expect(data.response?.permissions).toEqual([]);
      expect(data.response?.expiresAt).toBeFalsy();
      expect(data.response?.createBy?.id).toBe(userId);
      expect(data.response?.createBy?.displayName).toBe(userDisplayName);
    });

    test("POST /api/2.0/keys - User creates an API key without restrictions with expiration", async ({
      apiSdk,
    }) => {
      const { data: profile } = await apiSdk
        .forRole("user")
        .profiles.getSelfProfile();
      const userId = profile.response!.id!;
      const userDisplayName = profile.response!.displayName!;

      const keyName = faker.lorem.words(3);

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: keyName, expiresInDays: 7 },
        });

      expect(status).toBe(200);
      expect(data.response?.id).toBeTruthy();
      expect(data.response?.name).toBe(keyName);
      expect(data.response?.key).toBeTruthy();
      expect(data.response?.permissions).toEqual([]);
      expect(data.response?.expiresAt).toBeTruthy();
      expect(data.response?.createBy?.id).toBe(userId);
      expect(data.response?.createBy?.displayName).toBe(userDisplayName);
    });

    test("POST /api/2.0/keys - User creates an API key with read-only permissions", async ({
      apiSdk,
    }) => {
      const { data: profile } = await apiSdk
        .forRole("user")
        .profiles.getSelfProfile();
      const userId = profile.response!.id!;
      const userDisplayName = profile.response!.displayName!;

      const keyName = faker.lorem.words(3);

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: keyName, permissions: ["*:read"] },
        });

      expect(status).toBe(200);
      expect(data.response?.id).toBeTruthy();
      expect(data.response?.name).toBe(keyName);
      expect(data.response?.key).toBeTruthy();
      expect(data.response?.permissions).toEqual(["*:read"]);
      expect(data.response?.expiresAt).toBeFalsy();
      expect(data.response?.createBy?.id).toBe(userId);
      expect(data.response?.createBy?.displayName).toBe(userDisplayName);
    });

    test("POST /api/2.0/keys - User creates an API key with read-only permissions with expiration", async ({
      apiSdk,
    }) => {
      const { data: profile } = await apiSdk
        .forRole("user")
        .profiles.getSelfProfile();
      const userId = profile.response!.id!;
      const userDisplayName = profile.response!.displayName!;

      const keyName = faker.lorem.words(3);

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: keyName,
            permissions: ["*:read"],
            expiresInDays: 7,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.id).toBeTruthy();
      expect(data.response?.name).toBe(keyName);
      expect(data.response?.key).toBeTruthy();
      expect(data.response?.permissions).toEqual(["*:read"]);
      expect(data.response?.expiresAt).toBeTruthy();
      expect(data.response?.createBy?.id).toBe(userId);
      expect(data.response?.createBy?.displayName).toBe(userDisplayName);
    });

    test("POST /api/2.0/keys - User creates an API key with all scopes read", async ({
      apiSdk,
    }) => {
      const { data: profile } = await apiSdk
        .forRole("user")
        .profiles.getSelfProfile();
      const userId = profile.response!.id!;
      const userDisplayName = profile.response!.displayName!;

      const keyName = faker.lorem.words(3);
      const permissions = ["files:read", "rooms:read", "accounts.self:read"];

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: keyName, permissions },
        });

      expect(status).toBe(200);
      expect(data.response?.id).toBeTruthy();
      expect(data.response?.name).toBe(keyName);
      expect(data.response?.key).toBeTruthy();
      expect(data.response?.permissions).toEqual(permissions);
      expect(data.response?.createBy?.id).toBe(userId);
      expect(data.response?.createBy?.displayName).toBe(userDisplayName);
    });

    test("POST /api/2.0/keys - User creates an API key with all scopes write", async ({
      apiSdk,
    }) => {
      const { data: profile } = await apiSdk
        .forRole("user")
        .profiles.getSelfProfile();
      const userId = profile.response!.id!;
      const userDisplayName = profile.response!.displayName!;

      const keyName = faker.lorem.words(3);
      const permissions = [
        "files:write",
        "files:read",
        "rooms:write",
        "rooms:read",
        "accounts.self:write",
        "accounts.self:read",
      ];

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: keyName, permissions },
        });

      expect(status).toBe(200);
      expect(data.response?.id).toBeTruthy();
      expect(data.response?.name).toBe(keyName);
      expect(data.response?.key).toBeTruthy();
      expect(data.response?.permissions).toEqual(permissions);
      expect(data.response?.createBy?.id).toBe(userId);
      expect(data.response?.createBy?.displayName).toBe(userDisplayName);
    });

    test("POST /api/2.0/keys - User creates an API key with special characters in name", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: {
            name: "<script>alert('xss')</script>",
          },
        });

      expect(status).toBe(200);
      expect(data.response?.id).toBeTruthy();
      expect(data.response?.name).toBe("<script>alert('xss')</script>");
    });
  });
});

test.describe("DELETE /api/2.0/keys/{keyId}", () => {
  for (const { role, label } of ROLES) {
    test.describe(label, () => {
      test.beforeEach(async ({ apiSdk }) => {
        if (role === "docSpaceAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
        } else if (role === "roomAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
        }
      });

      test(`DELETE /api/2.0/keys/{keyId} - ${label} deletes own API key`, async ({
        apiSdk,
      }) => {
        const keyName = faker.lorem.words(3);

        const { data: created } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: keyName },
          });

        const keyId = created.response!.id!;

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.deleteApiKey({ keyId });

        expect(status).toBe(200);
        expect(data.response).toBe(true);
        expect(data.count).toBe(1);
        expect(data.links?.[0].action).toBe("DELETE");
        expect(data.links?.[0].href).toContain(keyId);
      });
    });
  }

  test.describe("User", () => {
    test.beforeEach(async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");
    });

    test("DELETE /api/2.0/keys/{keyId} - User deletes own API key", async ({
      apiSdk,
    }) => {
      const keyName = faker.lorem.words(3);

      const { data: created } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: keyName },
        });

      const keyId = created.response!.id!;

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.deleteApiKey({ keyId });

      expect(status).toBe(200);
      expect(data.response).toBe(true);
      expect(data.count).toBe(1);
      expect(data.links?.[0].action).toBe("DELETE");
      expect(data.links?.[0].href).toContain(keyId);
    });
  });

  test("DELETE /api/2.0/keys/{keyId} - DocSpaceAdmin deletes Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const keyName = faker.lorem.words(3);

    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: keyName },
      });

    const keyId = created.response!.id!;

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .apiKeys.deleteApiKey({ keyId });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("DELETE");
    expect(data.links?.[0].href).toContain(keyId);
  });
});

test.describe("GET /api/2.0/keys/@self", () => {
  for (const { role, label } of ROLES) {
    test.describe(label, () => {
      test.beforeEach(async ({ apiSdk }) => {
        if (role === "docSpaceAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
        } else if (role === "roomAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
        }
      });

      test(`GET /api/2.0/keys/@self - ${label} gets own API key info`, async ({
        apiSdk,
      }) => {
        const keyName = faker.lorem.words(3);

        const { data: created } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: keyName },
          });

        const keyId = created.response!.id!;
        const apiKeyToken = created.response!.key!;

        const { data, status } = await apiSdk
          .forApiKey(apiKeyToken)
          .apiKeys.getApiKey();

        expect(status).toBe(200);
        expect(data.response?.id).toBe(keyId);
        expect(data.response?.name).toBe(keyName);
        expect(data.response?.key).toMatch(/^sk-\*{3}/);
        expect(data.response?.keyPostfix).toBe(apiKeyToken.slice(-4));
        expect(data.response?.permissions).toEqual([]);
        expect(data.response?.isActive).toBe(true);
        expect(data.count).toBe(1);
        expect(data.links?.[0].action).toBe("GET");
      });
    });
  }

  test.describe("User", () => {
    test.beforeEach(async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");
    });

    test("GET /api/2.0/keys/@self - User gets own API key info", async ({
      apiSdk,
    }) => {
      const keyName = faker.lorem.words(3);

      const { data: created } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: keyName },
        });

      const keyId = created.response!.id!;
      const apiKeyToken = created.response!.key!;

      const { data, status } = await apiSdk
        .forApiKey(apiKeyToken)
        .apiKeys.getApiKey();

      expect(status).toBe(200);
      expect(data.response?.id).toBe(keyId);
      expect(data.response?.name).toBe(keyName);
      expect(data.response?.key).toMatch(/^sk-\*{3}/);
      expect(data.response?.keyPostfix).toBe(apiKeyToken.slice(-4));
      expect(data.response?.permissions).toEqual([]);
      expect(data.response?.isActive).toBe(true);
      expect(data.count).toBe(1);
      expect(data.links?.[0].action).toBe("GET");
    });
  });
});

const EXPECTED_PERMISSIONS = [
  "*",
  "*:read",
  "*:write",
  "accounts:read",
  "accounts:write",
  "accounts.self:read",
  "accounts.self:write",
  "files:read",
  "files:write",
  "rooms:read",
  "rooms:write",
];

test.describe("GET /api/2.0/keys/permissions", () => {
  for (const { role, label } of ROLES) {
    test.describe(label, () => {
      test.beforeEach(async ({ apiSdk }) => {
        if (role === "docSpaceAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
        } else if (role === "roomAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
        }
      });

      test(`GET /api/2.0/keys/permissions - ${label} gets all permissions`, async ({
        apiSdk,
      }) => {
        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.getAllPermissions();

        expect(status).toBe(200);
        expect(data.response).toEqual(EXPECTED_PERMISSIONS);
        expect(data.count).toBe(EXPECTED_PERMISSIONS.length);
        expect(data.links?.[0].action).toBe("GET");
      });
    });
  }

  test.describe("User", () => {
    test.beforeEach(async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");
    });

    test("GET /api/2.0/keys/permissions - User gets all permissions", async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.getAllPermissions();

      expect(status).toBe(200);
      expect(data.response).toEqual(EXPECTED_PERMISSIONS);
      expect(data.count).toBe(EXPECTED_PERMISSIONS.length);
      expect(data.links?.[0].action).toBe("GET");
    });
  });
});

test.describe("GET /api/2.0/keys", () => {
  test("GET /api/2.0/keys - Owner sees keys of all users", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: ownerKey } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });
    const { data: adminKey } = await apiSdk
      .forRole("docSpaceAdmin")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });
    const { data: userKey } = await apiSdk
      .forRole("user")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    const ownerKeyId = ownerKey.response!.id!;
    const adminKeyId = adminKey.response!.id!;
    const userKeyId = userKey.response!.id!;

    const { data, status } = await apiSdk.forRole("owner").apiKeys.getApiKeys();

    expect(status).toBe(200);
    const ids = data.response!.map((k) => k.id);
    expect(ids).toContain(ownerKeyId);
    expect(ids).toContain(adminKeyId);
    expect(ids).toContain(userKeyId);
  });

  test("GET /api/2.0/keys - DocSpaceAdmin sees keys of all users", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: ownerKey } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });
    const { data: userKey } = await apiSdk
      .forRole("user")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    const ownerKeyId = ownerKey.response!.id!;
    const userKeyId = userKey.response!.id!;

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .apiKeys.getApiKeys();

    expect(status).toBe(200);
    const ids = data.response!.map((k) => k.id);
    expect(ids).toContain(ownerKeyId);
    expect(ids).toContain(userKeyId);
  });

  test("GET /api/2.0/keys - RoomAdmin sees only own keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data: ownerKey } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });
    const { data: roomAdminKey } = await apiSdk
      .forRole("roomAdmin")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    const ownerKeyId = ownerKey.response!.id!;
    const roomAdminKeyId = roomAdminKey.response!.id!;

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .apiKeys.getApiKeys();

    expect(status).toBe(200);
    const ids = data.response!.map((k) => k.id);
    expect(ids).toContain(roomAdminKeyId);
    expect(ids).not.toContain(ownerKeyId);
  });

  test("GET /api/2.0/keys - User sees only own keys", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: ownerKey } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });
    const { data: userKey } = await apiSdk
      .forRole("user")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    const ownerKeyId = ownerKey.response!.id!;
    const userKeyId = userKey.response!.id!;

    const { data, status } = await apiSdk.forRole("user").apiKeys.getApiKeys();

    expect(status).toBe(200);
    const ids = data.response!.map((k) => k.id);
    expect(ids).toContain(userKeyId);
    expect(ids).not.toContain(ownerKeyId);
  });
});

test.describe("PUT /api/2.0/keys/{keyId}", () => {
  for (const { role, label } of ROLES) {
    test.describe(label, () => {
      test.beforeEach(async ({ apiSdk }) => {
        if (role === "docSpaceAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
        } else if (role === "roomAdmin") {
          await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
        }
      });

      test(`PUT /api/2.0/keys/{keyId} - ${label} updates own API key`, async ({
        apiSdk,
      }) => {
        const { data: created } = await apiSdk
          .forRole(role)
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: faker.lorem.words(3) },
          });

        const keyId = created.response!.id!;

        const { data, status } = await apiSdk
          .forRole(role)
          .apiKeys.updateApiKey({
            keyId,
            updateApiKeyRequest: {
              name: faker.lorem.words(3),
              permissions: ["files:read", "rooms:read"],
            },
          });

        expect(status).toBe(200);
        expect(data.response).toBe(true);
        expect(data.count).toBe(1);
        expect(data.links?.[0].action).toBe("PUT");
        expect(data.links?.[0].href).toContain(keyId);
      });
    });
  }

  test.describe("User", () => {
    test.beforeEach(async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");
    });

    test("PUT /api/2.0/keys/{keyId} - User updates own API key", async ({
      apiSdk,
    }) => {
      const { data: created } = await apiSdk
        .forRole("user")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: faker.lorem.words(3) },
        });

      const keyId = created.response!.id!;

      const { data, status } = await apiSdk
        .forRole("user")
        .apiKeys.updateApiKey({
          keyId,
          updateApiKeyRequest: {
            name: faker.lorem.words(3),
            permissions: ["files:read", "rooms:read"],
          },
        });

      expect(status).toBe(200);
      expect(data.response).toBe(true);
      expect(data.count).toBe(1);
      expect(data.links?.[0].action).toBe("PUT");
      expect(data.links?.[0].href).toContain(keyId);
    });
  });

  test("PUT /api/2.0/keys/{keyId} - DocSpaceAdmin updates Owner's API key", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    const keyId = created.response!.id!;

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: {
          name: faker.lorem.words(3),
          permissions: ["files:read", "rooms:read"],
        },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
    expect(data.links?.[0].action).toBe("PUT");
    expect(data.links?.[0].href).toContain(keyId);
  });

  test("PUT /api/2.0/keys/{keyId} - Owner deactivates own API key", async ({
    apiSdk,
  }) => {
    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    const keyId = created.response!.id!;

    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: { isActive: false },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: keys } = await apiSdk.forRole("owner").apiKeys.getApiKeys();
    const updated = keys.response!.find((k) => k.id === keyId);
    expect(updated?.isActive).toBe(false);
  });

  test("PUT /api/2.0/keys/{keyId} - Owner activates own API key", async ({
    apiSdk,
  }) => {
    const { data: created } = await apiSdk
      .forRole("owner")
      .apiKeys.createApiKey({
        createApiKeyRequestDto: { name: faker.lorem.words(3) },
      });

    const keyId = created.response!.id!;

    await apiSdk.forRole("owner").apiKeys.updateApiKey({
      keyId,
      updateApiKeyRequest: { isActive: false },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .apiKeys.updateApiKey({
        keyId,
        updateApiKeyRequest: { isActive: true },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: keys } = await apiSdk.forRole("owner").apiKeys.getApiKeys();
    const updated = keys.response!.find((k) => k.id === keyId);
    expect(updated?.isActive).toBe(true);
  });
});

test.describe("PUT /api/2.0/keys/{keyId} - applied changes", () => {
  test("PUT /api/2.0/keys/{keyId} - Update is visible in the list and in GET /keys/@self, id and secret stay", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, {
      name: "Autotest before",
      permissions: ["accounts.self:read"],
    });
    const asKey = apiSdk.forApiKey(key.key!);
    const widened = ["accounts.self:read", "rooms:read", "files:read"];

    for (const step of [
      { name: "Autotest after", permissions: widened },
      { name: "Autotest narrowed", permissions: ["files:read"] },
      // Repeating the same update leaves the same state
      { name: "Autotest narrowed", permissions: ["files:read"] },
    ]) {
      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: step,
      });
      expect(status).toBe(200);

      const listed = await findKey(owner, key.id);
      expect(listed?.name).toBe(step.name);
      expect(listed?.permissions).toEqual(step.permissions);

      const { data, status: selfStatus } = await asKey.apiKeys.getApiKey();
      expect(selfStatus).toBe(200);
      expect(data.response?.id).toBe(key.id);
      expect(data.response?.name).toBe(step.name);
      expect(data.response?.permissions).toEqual(step.permissions);
    }

    // Updates never rotate the secret: the original secret worked in every
    // round above, and no second key appeared
    expect((await listKeys(owner)).map((k) => k.id)).toEqual([key.id]);
  });

  test("PUT /api/2.0/keys/{keyId} - Omitted fields keep their values", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, {
      name: "Autotest original",
      permissions: ["accounts.self:read"],
    });
    const state = async () => {
      const k = await findKey(owner, key.id);
      return {
        name: k?.name,
        permissions: k?.permissions,
        isActive: k?.isActive,
      };
    };
    const update = async (updateApiKeyRequest: object) => {
      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest,
      });
      expect(status).toBe(200);
    };

    await update({ name: "Autotest renamed" });
    expect(await state()).toEqual({
      name: "Autotest renamed",
      permissions: ["accounts.self:read"],
      isActive: true,
    });

    await update({ permissions: ["rooms:read"] });
    expect(await state()).toEqual({
      name: "Autotest renamed",
      permissions: ["rooms:read"],
      isActive: true,
    });

    await update({ isActive: false });
    expect(await state()).toEqual({
      name: "Autotest renamed",
      permissions: ["rooms:read"],
      isActive: false,
    });

    // "an empty object changes nothing"
    await update({});
    expect(await state()).toEqual({
      name: "Autotest renamed",
      permissions: ["rooms:read"],
      isActive: false,
    });
  });

  test("PUT /api/2.0/keys/{keyId} - Every scope returned by GET /keys/permissions can be assigned", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data: all } = await owner.apiKeys.getAllPermissions();
    const scopes = all.response!.filter((p) => p !== "*");

    const key = await createKey(owner, {
      name: "Autotest all scopes",
      permissions: scopes,
    });
    expect([...key.permissions!].sort()).toEqual([...scopes].sort());

    for (const scope of scopes) {
      const { status } = await owner.apiKeys.updateApiKey({
        keyId: key.id,
        updateApiKeyRequest: { permissions: [scope] },
      });
      expect(status, scope).toBe(200);
      expect((await findKey(owner, key.id))?.permissions, scope).toEqual([
        scope,
      ]);
    }
  });
});

test.describe("GET /api/2.0/keys - response contents", () => {
  test("GET /api/2.0/keys - Fresh users have no keys", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    for (const role of ["owner", "roomAdmin"] as const) {
      const { data, status } = await apiSdk.forRole(role).apiKeys.getApiKeys();

      expect(status, role).toBe(200);
      expect(data.response, role).toEqual([]);
    }
  });

  test("GET /api/2.0/keys - Secrets are never returned after creation", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, { name: "Autotest secret" });
    const secret = key.key!;
    expect(secret).toMatch(/^sk-/);
    expect(key.keyPostfix).toBe(secret.slice(-4));

    const assertHidden = async (when: string) => {
      const { data, status } = await owner.apiKeys.getApiKeys();
      expect(status, when).toBe(200);
      expect(JSON.stringify(data), when).not.toContain(secret);
      const listed = data.response!.find((k) => k.id === key.id);
      expect(listed?.key, when).toMatch(/^sk-\*{3}/);
      expect(listed?.keyPostfix, when).toBe(secret.slice(-4));

      const { data: self } = await apiSdk.forApiKey(secret).apiKeys.getApiKey();
      expect(JSON.stringify(self), when).not.toContain(secret);
    };

    await assertHidden("after creation");
    await owner.apiKeys.updateApiKey({
      keyId: key.id,
      updateApiKeyRequest: { name: "Autotest renamed" },
    });
    await assertHidden("after update");
  });

  test("GET /api/2.0/keys - Entries describe the key and its creator", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data: profile } = await owner.profiles.getSelfProfile();
    const before = Date.now();

    const withExpiry = await createKey(owner, {
      name: "Autotest expiring",
      permissions: ["rooms:read", "files:read"],
      expiresInDays: 7,
    });
    const open = await createKey(owner, { name: "Autotest open" });
    const deactivated = await createKey(owner, { name: "Autotest inactive" });
    await owner.apiKeys.updateApiKey({
      keyId: deactivated.id,
      updateApiKeyRequest: { isActive: false },
    });

    const keys = await listKeys(owner);
    const ids = keys.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([withExpiry.id, open.id, deactivated.id].sort());

    for (const key of keys) {
      expect(key.createBy?.id).toBe(profile.response!.id);
      expectNear(toTime(key.createOn), before);
      // Never used so far
      expect(key.lastUsed).toBeFalsy();
    }

    const listedExpiring = keys.find((k) => k.id === withExpiry.id)!;
    expect(listedExpiring.permissions).toEqual(["rooms:read", "files:read"]);
    expect(listedExpiring.isActive).toBe(true);
    expectNear(toTime(listedExpiring.expiresAt), before + 7 * DAY_MS);

    const listedOpen = keys.find((k) => k.id === open.id)!;
    expect(listedOpen.permissions).toEqual([]);
    expect(listedOpen.expiresAt).toBeFalsy();

    // Deactivated keys stay in the list
    expect(keys.find((k) => k.id === deactivated.id)?.isActive).toBe(false);
  });
});

test.describe("POST /api/2.0/keys - issued keys", () => {
  test("POST /api/2.0/keys - Two keys with the same name get different IDs and secrets", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const first = await createKey(owner, { name: "Autotest twin" });
    const second = await createKey(owner, { name: "Autotest twin" });

    expect(second.id).not.toBe(first.id);
    expect(second.key).not.toBe(first.key);

    const listed = await listKeys(owner);
    expect(listed.map((k) => k.name)).toEqual([
      "Autotest twin",
      "Autotest twin",
    ]);
    // Each secret identifies its own key
    for (const key of [first, second]) {
      const { data } = await apiSdk.forApiKey(key.key!).apiKeys.getApiKey();
      expect(data.response?.id).toBe(key.id);
    }
  });

  test("POST /api/2.0/keys - Response describes the new key", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data: profile } = await owner.profiles.getSelfProfile();
    const before = Date.now();

    const key = await createKey(owner, {
      name: "Autotest dto",
      permissions: ["rooms:read"],
    });

    expect(key.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(key.key).toMatch(/^sk-[0-9a-f]{64}$/);
    expect(key.keyPostfix).toBe(key.key!.slice(-4));
    expect(key.isActive).toBe(true);
    expect(key.expiresAt).toBeFalsy();
    expect(key.lastUsed).toBeFalsy();
    expect(key.createBy?.id).toBe(profile.response!.id);
    expectNear(toTime(key.createOn), before);
  });

  test("GET /api/2.0/keys/@self - lastUsed is set after the key is used", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const key = await createKey(owner, {
      name: "Autotest last used",
      permissions: ["accounts.self:read"],
    });
    expect((await findKey(owner, key.id))?.lastUsed).toBeFalsy();

    const before = Date.now();
    expect(
      (await apiSdk.forApiKey(key.key!).profiles.getSelfProfile()).status,
    ).toBe(200);

    await expect(async () => {
      const used = await findKey(owner, key.id);
      expect(used?.lastUsed).toBeTruthy();
      expectNear(toTime(used?.lastUsed), before);
    }).toPass({ intervals: [1_000, 2_000], timeout: 15_000 });
  });

  // The API documents POST /keys as throttled. The limit is per user: when the
  // Owner is throttled, another user can still create keys.
  test("POST /api/2.0/keys - Creation is throttled per user", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    // Measured 2026-10-14: the budget is 5 per user and does not refill for 12+
    // minutes (still 429 on every 30 s probe), so a burst cannot straddle a window
    // boundary. A 6th 200 is a limiter failure, not test flakiness.
    const statuses: number[] = [];
    let limitHeader: string | undefined;
    for (let i = 0; i < 6; i++) {
      const { status, headers } = await owner.apiKeys.createApiKey({
        createApiKeyRequestDto: { name: `Autotest throttle ${i}` },
      });
      statuses.push(status);
      if (status === 429) limitHeader = headers["x-ratelimit-limit"];
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(limitHeader).toBe("5");
    // The rejected call creates nothing
    expect(await listKeys(owner)).toHaveLength(5);

    const other = await apiSdk.forRole("roomAdmin").apiKeys.createApiKey({
      createApiKeyRequestDto: { name: "Autotest ok" },
    });
    expect(other.status).toBe(200);
  });
});
