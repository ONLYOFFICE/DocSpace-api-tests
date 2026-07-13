import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/cookiesettings - permissions", () => {
  test("GET /api/2.0/settings/cookiesettings - Anonymous cannot get cookie settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().cookies.getCookieSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/cookiesettings - RoomAdmin cannot get cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .cookies.getCookieSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/cookiesettings - User cannot get cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .cookies.getCookieSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/cookiesettings - Guest cannot get cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .cookies.getCookieSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/settings/cookiesettings - permissions", () => {
  test("PUT /api/2.0/settings/cookiesettings - Anonymous cannot update cookie settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .cookies.updateCookieSettings({
        cookieSettingsRequestsDto: { lifeTime: 720, enabled: true },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/cookiesettings - RoomAdmin cannot update cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .cookies.updateCookieSettings({
        cookieSettingsRequestsDto: { lifeTime: 720, enabled: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/cookiesettings - User cannot update cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .cookies.updateCookieSettings({
        cookieSettingsRequestsDto: { lifeTime: 720, enabled: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/cookiesettings - Guest cannot update cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .cookies.updateCookieSettings({
        cookieSettingsRequestsDto: { lifeTime: 720, enabled: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/settings/cookiesettings - validation", () => {
  // API clamps lifeTime to 9999 instead of rejecting values above the maximum
  test("PUT /api/2.0/settings/cookiesettings - lifeTime exceeds maximum value of 9999 is clamped to 9999", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .cookies.updateCookieSettings({
        cookieSettingsRequestsDto: { lifeTime: 100000, enabled: true },
      });

    expect(status).toBe(200);
    expect(data.response).toBe("Settings have been successfully updated");

    await apiSdk.authenticateOwner();

    const { data: getData } = await apiSdk
      .forRole("owner")
      .cookies.getCookieSettings();

    expect(getData.response?.lifeTime).toBe(9999);
    expect(getData.response?.enabled).toBe(true);
  });
});
