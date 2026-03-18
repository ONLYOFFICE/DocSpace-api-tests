import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/security/loginsettings - access control", () => {
  test("GET /api/2.0/settings/security/loginsettings - anonymous cannot get login settings", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.loginSettings.getLoginSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/security/loginsettings - RoomAdmin cannot get login settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.loginSettings.getLoginSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/security/loginsettings - User cannot get login settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.loginSettings.getLoginSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/security/loginsettings - Guest cannot get login settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.loginSettings.getLoginSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/settings/security/loginsettings - access control", () => {
  test("PUT /api/2.0/settings/security/loginsettings - Update login settings without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.loginSettings.updateLoginSettings({
      attemptCount: 3,
      blockTime: 10,
      checkPeriod: 60,
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/security/loginsettings - RoomAdmin updates login settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.loginSettings.updateLoginSettings({
        attemptCount: 3,
        blockTime: 10,
        checkPeriod: 60,
      });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/security/loginsettings - User updates login settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.loginSettings.updateLoginSettings({
      attemptCount: 3,
      blockTime: 10,
      checkPeriod: 60,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/security/loginsettings - Guest updates login settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.loginSettings.updateLoginSettings({
      attemptCount: 3,
      blockTime: 10,
      checkPeriod: 60,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/settings/security/loginsettings - access control", () => {
  test("DELETE /api/2.0/settings/security/loginsettings - Restore default login settings without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.loginSettings.setDefaultLoginSettings();

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/settings/security/loginsettings - RoomAdmin restores default login settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.loginSettings.setDefaultLoginSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/settings/security/loginsettings - User restores default login settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.loginSettings.setDefaultLoginSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/settings/security/loginsettings - Guest restores default login settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.loginSettings.setDefaultLoginSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
