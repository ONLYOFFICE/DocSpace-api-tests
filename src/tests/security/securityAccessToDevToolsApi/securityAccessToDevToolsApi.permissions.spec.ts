import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("POST /api/2.0/settings/devtoolsaccess - who can call the endpoint", () => {
  test("POST /api/2.0/settings/devtoolsaccess - Anonymous cannot update settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/devtoolsaccess - RoomAdmin cannot update settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk
      .forRole("roomAdmin")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/settings/devtoolsaccess - User cannot update settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/settings/devtoolsaccess - Guest cannot update settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/devtoolsaccess - effect with limitedAccessForUsers: true", () => {
  test("POST /api/2.0/settings/devtoolsaccess - Owner can still create API key when limited access is enabled", async ({
    apiSdk,
  }) => {
    await test.step("Owner enables limited access", async () => {
      await apiSdk
        .forRole("owner")
        .securityAccessToDevTools.setTenantDevToolsAccessSettings({
          tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
        });
    });

    await test.step("Owner creates API key", async () => {
      const { status } = await apiSdk.forRole("owner").apiKeys.createApiKey({
        createApiKeyRequestDto: { name: "Autotest Owner DevTools Key" },
      });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/settings/devtoolsaccess - DocSpaceAdmin can still create API key when limited access is enabled", async ({
    apiSdk,
  }) => {
    await test.step("Owner enables limited access", async () => {
      await apiSdk
        .forRole("owner")
        .securityAccessToDevTools.setTenantDevToolsAccessSettings({
          tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
        });
    });

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await test.step("DocSpaceAdmin creates API key", async () => {
      const { status } = await apiSdk
        .forRole("docSpaceAdmin")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: "Autotest Admin DevTools Key" },
        });

      expect(status).toBe(200);
    });
  });

  test.fail(
    "BUG 81236: POST /api/2.0/settings/devtoolsaccess - RoomAdmin cannot create API key when limited access is enabled",
    async ({ apiSdk }) => {
      await test.step("Owner enables limited access", async () => {
        await apiSdk
          .forRole("owner")
          .securityAccessToDevTools.setTenantDevToolsAccessSettings({
            tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
          });
      });

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      await test.step("RoomAdmin cannot create API key", async () => {
        const { data, status } = await apiSdk
          .forRole("roomAdmin")
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: "Autotest Room DevTools Key" },
          });

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe(
          "This operation available only for portal owner/admins",
        );
      });
    },
  );

  test.fail(
    "BUG 81236: POST /api/2.0/settings/devtoolsaccess - User cannot create API key when limited access is enabled",
    async ({ apiSdk }) => {
      await test.step("Owner enables limited access", async () => {
        await apiSdk
          .forRole("owner")
          .securityAccessToDevTools.setTenantDevToolsAccessSettings({
            tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
          });
      });

      await apiSdk.addAuthenticatedMember("owner", "User");

      await test.step("User cannot create API key", async () => {
        const { data, status } = await apiSdk
          .forRole("user")
          .apiKeys.createApiKey({
            createApiKeyRequestDto: { name: "Autotest User DevTools Key" },
          });

        expect(status).toBe(403);
        expect((data as any).error?.message).toBe(
          "This operation available only for portal owner/admins",
        );
      });
    },
  );
});

test.describe("POST /api/2.0/settings/devtoolsaccess - access restored with limitedAccessForUsers: false", () => {
  test("POST /api/2.0/settings/devtoolsaccess - RoomAdmin can create API key after limited access is disabled", async ({
    apiSdk,
  }) => {
    await test.step("Owner enables then disables limited access", async () => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });
      await ownerApi.securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: false },
      });
    });

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    await test.step("RoomAdmin can create API key", async () => {
      const { status } = await apiSdk
        .forRole("roomAdmin")
        .apiKeys.createApiKey({
          createApiKeyRequestDto: { name: "Autotest Room Restored Key" },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/settings/devtoolsaccess - User can create API key after limited access is disabled", async ({
    apiSdk,
  }) => {
    await test.step("Owner enables then disables limited access", async () => {
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });
      await ownerApi.securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: false },
      });
    });

    await apiSdk.addAuthenticatedMember("owner", "User");

    await test.step("User can create API key", async () => {
      const { status } = await apiSdk.forRole("user").apiKeys.createApiKey({
        createApiKeyRequestDto: { name: "Autotest User Restored Key" },
      });

      expect(status).toBe(200);
    });
  });
});
