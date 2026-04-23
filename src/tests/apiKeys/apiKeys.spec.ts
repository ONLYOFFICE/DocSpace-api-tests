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
