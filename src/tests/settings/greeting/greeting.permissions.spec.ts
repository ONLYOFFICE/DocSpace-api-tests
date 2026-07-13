import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("POST /api/2.0/settings/greetingsettings - access control", () => {
  test("POST /api/2.0/settings/greetingsettings - Save greeting settings without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.greetingSettings.saveGreetingSettings({
      greetingSettingsRequestsDto: { title: "Unauthorized Title" },
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
        greetingSettingsRequestsDto: { title: "RoomAdmin Title" },
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
        greetingSettingsRequestsDto: { title: "User Title" },
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
        greetingSettingsRequestsDto: { title: "Guest Title" },
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

test.describe("GET /api/2.0/settings/greetingsettings - permissions", () => {
  test("GET /api/2.0/settings/greetingsettings - Anonymous cannot get greeting settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .greetingSettings.getGreetingSettings();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/greetingsettings/isdefault - permissions", () => {
  test("GET /api/2.0/settings/greetingsettings/isdefault - Anonymous cannot check default greeting settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .greetingSettings.getIsDefaultGreetingSettings();

    expect(status).toBe(401);
  });
});
