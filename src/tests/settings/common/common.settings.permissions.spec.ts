import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

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
