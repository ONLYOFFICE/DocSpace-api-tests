import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { faker } from "@faker-js/faker";
import { Role } from "@/src/services/token-store";

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
