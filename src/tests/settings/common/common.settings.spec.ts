import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

import { DeepLinkHandlingMode } from "@onlyoffice/docspace-api-sdk";

// getPortalHostname GET /api/2.0/settings/machine — returns 403 for all roles including Owner,
// both in cloud and on-premise. Likely a deprecated or internal-only endpoint.

// closeAdminHelper PUT /api/2.0/settings/closeadminhelper — not available in cloud,
// returns 415 "Not available" for all roles including Owner.
// This is an on-premise only feature for dismissing the admin setup helper notification.

// completeWizard PUT /api/2.0/settings/wizard/complete — not available in cloud,
// on-premise only feature for completing the initial setup wizard after first installation.

test.describe("POST /api/2.0/settings/deeplink - Configure deep link settings", () => {
  test("POST /api/2.0/settings/deeplink - Owner configures deep link (Web mode)", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.configureDeepLink({
        deepLinkConfigurationRequestsDto: {
          deepLinkSettings: { handlingMode: DeepLinkHandlingMode.Web },
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.handlingMode).toBe(DeepLinkHandlingMode.Web);
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

  test("POST /api/2.0/settings/deeplink - Owner configures deep link (ProvideChoice mode)", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.configureDeepLink({
        deepLinkConfigurationRequestsDto: {
          deepLinkSettings: {
            handlingMode: DeepLinkHandlingMode.ProvideChoice,
          },
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.handlingMode).toBe(
      DeepLinkHandlingMode.ProvideChoice,
    );
  });

  test("POST /api/2.0/settings/deeplink - DocSpaceAdmin configures deep link", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.commonSettings.configureDeepLink({
      deepLinkConfigurationRequestsDto: {
        deepLinkSettings: { handlingMode: DeepLinkHandlingMode.App },
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.handlingMode).toBe(DeepLinkHandlingMode.App);
  });
});

test.describe("PUT /api/2.0/settings/colortheme - Save portal color theme", () => {
  test("PUT /api/2.0/settings/colortheme - Owner saves portal color theme", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.savePortalColorTheme({
        customColorThemesSettingsRequestsDto: {
          theme: {
            name: "Test Theme",
            main: { accent: "#0F4071", buttons: "#5299E0" },
            text: { accent: "#FFFFFF", buttons: "#FFFFFF" },
          },
        },
      });
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(data.response?.themes!.length).toBeGreaterThan(0);
    expect(typeof data.response?.selected).toBe("number");
    expect(typeof data.response?.limit).toBe("number");
  });

  test("PUT /api/2.0/settings/colortheme - DocSpaceAdmin saves portal color theme", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.commonSettings.savePortalColorTheme(
      {
        customColorThemesSettingsRequestsDto: {
          theme: {
            name: "Admin Theme",
            main: { accent: "#333333", buttons: "#666666" },
            text: { accent: "#FFFFFF", buttons: "#FFFFFF" },
          },
        },
      },
    );

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(data.response?.themes!.length).toBeGreaterThan(0);
    expect(typeof data.response?.selected).toBe("number");
  });
});

test.describe("GET /api/2.0/settings/ai-access - Get tenant AI access settings", () => {
  test("GET /api/2.0/settings/ai-access - Owner gets AI access settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.getTenantAiAccessSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.enabled).toBe("boolean");
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

  test("GET /api/2.0/settings/ai-access - DocSpaceAdmin gets AI access settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.commonSettings.getTenantAiAccessSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.enabled).toBe("boolean");
  });

  test("GET /api/2.0/settings/ai-access - RoomAdmin gets AI access settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.getTenantAiAccessSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.enabled).toBe("boolean");
  });

  test("GET /api/2.0/settings/ai-access - User gets AI access settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.commonSettings.getTenantAiAccessSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.enabled).toBe("boolean");
  });

  test("GET /api/2.0/settings/ai-access - Guest gets AI access settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.commonSettings.getTenantAiAccessSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.enabled).toBe("boolean");
  });
});

test.describe("GET /api/2.0/settings/socket - Get socket settings", () => {
  test("GET /api/2.0/settings/socket - Owner gets socket settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.getSocketSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/settings/socket - DocSpaceAdmin gets socket settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.commonSettings.getSocketSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/settings/socket - RoomAdmin gets socket settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.getSocketSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/settings/socket - User gets socket settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.getSocketSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/settings/socket - Guest gets socket settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.commonSettings.getSocketSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });
});

test.describe("GET /api/2.0/settings/logo - Get portal logo", () => {
  test("GET /api/2.0/settings/logo - Owner gets portal logo", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.getPortalLogo();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("string");
  });

  test("GET /api/2.0/settings/logo - DocSpaceAdmin gets portal logo", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.commonSettings.getPortalLogo();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("string");
  });

  test("GET /api/2.0/settings/logo - RoomAdmin gets portal logo", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.commonSettings.getPortalLogo();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("string");
  });

  test("GET /api/2.0/settings/logo - User gets portal logo", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.getPortalLogo();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("string");
  });

  test("GET /api/2.0/settings/logo - Guest gets portal logo", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.commonSettings.getPortalLogo();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("string");
  });
});

test.describe("DELETE /api/2.0/settings/colortheme - Delete portal color theme", () => {
  test("DELETE /api/2.0/settings/colortheme - Owner deletes portal color theme", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: created } =
      await ownerApi.commonSettings.savePortalColorTheme({
        customColorThemesSettingsRequestsDto: {
          theme: {
            name: "Theme To Delete",
            main: { accent: "#0F4071", buttons: "#5299E0" },
            text: { accent: "#FFFFFF", buttons: "#FFFFFF" },
          },
        },
      });

    const themeId = Math.max(...created.response!.themes!.map((t) => t.id!));
    const countBefore = created.response!.themes!.length;

    const { data, status } =
      await ownerApi.commonSettings.deletePortalColorTheme({
        id: themeId,
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(data.response?.themes!.length).toBe(countBefore - 1);
    expect(data.response?.themes!.some((t) => t.id === themeId)).toBe(false);
  });

  test("DELETE /api/2.0/settings/colortheme - DocSpaceAdmin deletes portal color theme", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: created } =
      await ownerApi.commonSettings.savePortalColorTheme({
        customColorThemesSettingsRequestsDto: {
          theme: {
            name: "Theme To Delete",
            main: { accent: "#333333", buttons: "#666666" },
            text: { accent: "#FFFFFF", buttons: "#FFFFFF" },
          },
        },
      });

    const themeId = Math.max(...created.response!.themes!.map((t) => t.id!));

    const { data, status } =
      await adminApi.commonSettings.deletePortalColorTheme({
        id: themeId,
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(data.response?.themes!.some((t) => t.id === themeId)).toBe(false);
  });
});

test.describe("GET /api/2.0/settings/colortheme - Get portal color theme", () => {
  test("GET /api/2.0/settings/colortheme - Owner gets portal color theme", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.getPortalColorTheme();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(data.response?.themes!.length).toBeGreaterThan(0);
    expect(typeof data.response?.selected).toBe("number");
    expect(typeof data.response?.limit).toBe("number");
  });

  test("GET /api/2.0/settings/colortheme - DocSpaceAdmin gets portal color theme", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.commonSettings.getPortalColorTheme();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(data.response?.themes!.length).toBeGreaterThan(0);
    expect(typeof data.response?.selected).toBe("number");
    expect(typeof data.response?.limit).toBe("number");
  });

  test("GET /api/2.0/settings/colortheme - RoomAdmin gets portal color theme", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.getPortalColorTheme();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(typeof data.response?.selected).toBe("number");
  });

  test("GET /api/2.0/settings/colortheme - User gets portal color theme", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.getPortalColorTheme();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(typeof data.response?.selected).toBe("number");
  });

  test("GET /api/2.0/settings/colortheme - Guest gets portal color theme", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.commonSettings.getPortalColorTheme();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response?.themes)).toBe(true);
    expect(typeof data.response?.selected).toBe("number");
  });
});

test.describe("GET /api/2.0/settings/payment - Get payment settings", () => {
  test("GET /api/2.0/settings/payment - Owner gets payment settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.getPaymentSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.salesEmail).toBe("string");
    expect(typeof data.response?.buyUrl).toBe("string");
    expect(typeof data.response?.standalone).toBe("boolean");
    expect(typeof data.response?.max).toBe("number");
    expect(data.response?.currentLicense).toBeDefined();
    expect(typeof data.response?.currentLicense.trial).toBe("boolean");
    expect(typeof data.response?.currentLicense.dueDate).toBe("string");
  });

  test("GET /api/2.0/settings/payment - DocSpaceAdmin gets payment settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.commonSettings.getPaymentSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.salesEmail).toBe("string");
    expect(typeof data.response?.buyUrl).toBe("string");
    expect(typeof data.response?.standalone).toBe("boolean");
    expect(typeof data.response?.max).toBe("number");
    expect(data.response?.currentLicense).toBeDefined();
    expect(typeof data.response?.currentLicense.trial).toBe("boolean");
    expect(typeof data.response?.currentLicense.dueDate).toBe("string");
  });
});

test.describe("GET /api/2.0/settings/deeplink - Get deep link settings", () => {
  test("GET /api/2.0/settings/deeplink - Owner gets deep link settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .commonSettings.getDeepLinkSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.handlingMode).toBe("number");
  });

  test("GET /api/2.0/settings/deeplink - DocSpaceAdmin gets deep link settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.commonSettings.getDeepLinkSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.handlingMode).toBe("number");
  });
});

test.describe("GET /api/2.0/settings/cultures - Get supported cultures", () => {
  test("GET /api/2.0/settings/cultures - Owner gets supported cultures", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } =
      await ownerApi.commonSettings.getSupportedCultures();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.count).toBeGreaterThan(0);

    // Each item should be a non-empty culture string (e.g. "en-US", "de", "fr")
    for (const culture of data.response!) {
      expect(typeof culture).toBe("string");
      expect(culture.length).toBeGreaterThan(0);
    }

    // English culture must be present
    expect(data.response).toContain("en-US");
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
    expect(data.count).toBeGreaterThan(0);
    expect(data.response).toContain("en-US");
  });
});

test.describe("GET /api/2.0/settings - Get portal settings", () => {
  test("GET /api/2.0/settings - Owner gets portal settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.commonSettings.getPortalSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.culture).toBeTruthy();
    expect(data.response!.baseDomain).toBeTruthy();
    expect(data.response!.docSpace).toBe(true);
    expect(data.response!.ownerId).toBeTruthy();
    expect(typeof data.response!.cookieSettingsEnabled).toBe("boolean");
    expect(data.response!.deepLink).toBeDefined();
    expect(data.response!.version).toBeTruthy();
  });

  test("GET /api/2.0/settings - Owner gets portal settings with password hash (withpassword: true)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.commonSettings.getPortalSettings({
      withpassword: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.passwordHash).toBeDefined();
    expect(data.response!.passwordHash!.size).toBeGreaterThan(0);
    expect(data.response!.passwordHash!.iterations).toBeGreaterThan(0);
    expect(data.response!.passwordHash!.salt).toBeTruthy();
  });

  test("GET /api/2.0/settings - DocSpace admin gets portal settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.commonSettings.getPortalSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.culture).toBeTruthy();
    expect(data.response!.baseDomain).toBeTruthy();
    expect(data.response!.docSpace).toBe(true);
    expect(data.response!.ownerId).toBeTruthy();
  });

  test("GET /api/2.0/settings - Room admin gets portal settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.commonSettings.getPortalSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.culture).toBeTruthy();
    expect(data.response!.baseDomain).toBeTruthy();
    expect(data.response!.docSpace).toBe(true);
  });

  test("GET /api/2.0/settings - User gets portal settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.commonSettings.getPortalSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.culture).toBeTruthy();
    expect(data.response!.baseDomain).toBeTruthy();
    expect(data.response!.docSpace).toBe(true);
  });

  test("GET /api/2.0/settings - Guest gets portal settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.commonSettings.getPortalSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.culture).toBeTruthy();
    expect(data.response!.baseDomain).toBeTruthy();
    expect(data.response!.docSpace).toBe(true);
  });
});
