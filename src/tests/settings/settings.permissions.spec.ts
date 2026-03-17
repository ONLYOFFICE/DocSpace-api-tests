import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("POST /api/2.0/settings/greetingsettings - access control", () => {
  test("POST /api/2.0/settings/greetingsettings - Save greeting settings without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.greetingSettings.saveGreetingSettings({
      title: "Unauthorized Title",
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/greetingsettings - RoomAdmin saves greeting settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.greetingSettings.saveGreetingSettings({
        title: "RoomAdmin Title",
      });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/greetingsettings - User saves greeting settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.greetingSettings.saveGreetingSettings({
        title: "User Title",
      });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/greetingsettings - Guest saves greeting settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.greetingSettings.saveGreetingSettings({
        title: "Guest Title",
      });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/settings/greetingsettings/restore - access control", () => {
  test("POST /api/2.0/settings/greetingsettings/restore - Restore greeting settings without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.greetingSettings.restoreGreetingSettings();

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/greetingsettings/restore - RoomAdmin restores greeting settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.greetingSettings.restoreGreetingSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/greetingsettings/restore - User restores greeting settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.greetingSettings.restoreGreetingSettings();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/greetingsettings/restore - Guest restores greeting settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.greetingSettings.restoreGreetingSettings();

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
