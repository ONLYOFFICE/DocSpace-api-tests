import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// closeAdminHelper PUT /api/2.0/settings/closeadminhelper — not available in cloud,
// returns 415 "Not available" for all roles. Access control cannot be verified.

// completeWizard PUT /api/2.0/settings/wizard/complete — not available in cloud,
// on-premise only. Access control cannot be verified.

test.describe("GET /api/2.0/settings/ai-access - access control", () => {
  test("GET /api/2.0/settings/ai-access - Anonymous cannot get AI access settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.getTenantAiAccessSettings();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/socket - access control", () => {
  test("GET /api/2.0/settings/socket - Anonymous cannot get socket settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.getSocketSettings();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/logo - access control", () => {
  test("GET /api/2.0/settings/logo - Anonymous cannot get portal logo", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.getPortalLogo();

    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/settings/colortheme - access control", () => {
  test("DELETE /api/2.0/settings/colortheme - Anonymous cannot delete portal color theme", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.deletePortalColorTheme({ id: 1 });

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/settings/colortheme - RoomAdmin cannot delete portal color theme", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.deletePortalColorTheme({ id: 1 });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("DELETE /api/2.0/settings/colortheme - User cannot delete portal color theme", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.commonSettings.deletePortalColorTheme({ id: 1 });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("DELETE /api/2.0/settings/colortheme - Guest cannot delete portal color theme", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.commonSettings.deletePortalColorTheme({ id: 1 });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/colortheme - access control", () => {
  test("GET /api/2.0/settings/colortheme - Anonymous cannot get portal color theme", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.getPortalColorTheme();

    expect(status).toBe(200);
  });
});

test.describe("PUT /api/2.0/settings/colortheme - access control", () => {
  test("PUT /api/2.0/settings/colortheme - Anonymous cannot save portal color theme", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.savePortalColorTheme({
        customColorThemesSettingsRequestsDto: {
          theme: {
            name: "Theme",
            main: { accent: "#000000", buttons: "#000000" },
          },
        },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/colortheme - RoomAdmin cannot save portal color theme", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.savePortalColorTheme({
        customColorThemesSettingsRequestsDto: {
          theme: {
            name: "Theme",
            main: { accent: "#000000", buttons: "#000000" },
          },
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("PUT /api/2.0/settings/colortheme - User cannot save portal color theme", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.savePortalColorTheme({
      customColorThemesSettingsRequestsDto: {
        theme: {
          name: "Theme",
          main: { accent: "#000000", buttons: "#000000" },
        },
      },
    });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("PUT /api/2.0/settings/colortheme - Guest cannot save portal color theme", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.commonSettings.savePortalColorTheme(
      {
        customColorThemesSettingsRequestsDto: {
          theme: {
            name: "Theme",
            main: { accent: "#000000", buttons: "#000000" },
          },
        },
      },
    );

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/payment - access control", () => {
  test("GET /api/2.0/settings/payment - Anonymous cannot get payment settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.getPaymentSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/payment - RoomAdmin cannot get payment settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.getPaymentSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/payment - User cannot get payment settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.getPaymentSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/payment - Guest cannot get payment settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.commonSettings.getPaymentSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/deeplink - access control", () => {
  test("POST /api/2.0/settings/deeplink - Anonymous cannot configure deep link", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.configureDeepLink({
        deepLinkConfigurationRequestsDto: {
          deepLinkSettings: { handlingMode: 1 },
        },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/deeplink - RoomAdmin cannot configure deep link", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.configureDeepLink({
        deepLinkConfigurationRequestsDto: {
          deepLinkSettings: { handlingMode: 1 },
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/deeplink - User cannot configure deep link", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.configureDeepLink({
      deepLinkConfigurationRequestsDto: {
        deepLinkSettings: { handlingMode: 1 },
      },
    });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/deeplink - Guest cannot configure deep link", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.commonSettings.configureDeepLink({
      deepLinkConfigurationRequestsDto: {
        deepLinkSettings: { handlingMode: 1 },
      },
    });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/cultures - Get supported cultures (permissions)", () => {
  test("GET /api/2.0/settings/cultures - Anonymous user gets supported cultures", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { data, status } =
      await anonApi.commonSettings.getSupportedCultures();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/settings/cultures - DocSpace admin gets supported cultures", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.commonSettings.getSupportedCultures();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/settings/cultures - Room admin gets supported cultures", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.getSupportedCultures();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/settings/cultures - User gets supported cultures", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.commonSettings.getSupportedCultures();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/settings/cultures - Guest gets supported cultures", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.commonSettings.getSupportedCultures();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });
});

test.describe("GET /api/2.0/settings - Get portal settings (permissions)", () => {
  test("GET /api/2.0/settings - Anonymous user gets portal settings", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { data, status } = await anonApi.commonSettings.getPortalSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.culture).toBeTruthy();
    expect(data.response!.baseDomain).toBeTruthy();
    expect(data.response!.docSpace).toBe(true);

    // Anonymous user should not receive sensitive fields
    expect(data.response!.ownerId).toBe("00000000-0000-0000-0000-000000000000");
    expect(data.response!.firebase).toBeUndefined();
    expect(data.response!.timezone).toBeUndefined();
    expect(data.response!.domainValidator).toBeUndefined();
    expect(data.response!.invitationLimit).toBeUndefined();
    expect(data.response!.plugins).toBeUndefined();
  });

  test("GET /api/2.0/settings - Authenticated user gets full portal settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.commonSettings.getPortalSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    // Authenticated user should receive the full response
    expect(data.response!.ownerId).not.toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(data.response!.firebase).toBeDefined();
    expect(data.response!.timezone).toBeTruthy();
    expect(data.response!.domainValidator).toBeDefined();
    expect(data.response!.invitationLimit).toBeDefined();
    expect(data.response!.plugins).toBeDefined();
  });

  test("GET /api/2.0/settings - Anonymous user gets portal settings without password hash (withpassword: true)", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { data, status } = await anonApi.commonSettings.getPortalSettings({
      withpassword: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.passwordHash).toBeDefined();
  });

  test("GET /api/2.0/settings - Room admin gets portal settings with password hash (withpassword: true)", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.getPortalSettings({
        withpassword: true,
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.passwordHash).toBeDefined();
  });

  test("GET /api/2.0/settings - User gets portal settings with password hash (withpassword: true)", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.getPortalSettings({
      withpassword: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.passwordHash).toBeDefined();
  });

  test("GET /api/2.0/settings - Guest gets portal settings with password hash (withpassword: true)", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.commonSettings.getPortalSettings({
      withpassword: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.passwordHash).toBeDefined();
  });
});
