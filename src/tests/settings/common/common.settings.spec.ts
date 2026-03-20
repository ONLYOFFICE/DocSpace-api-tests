import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

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
