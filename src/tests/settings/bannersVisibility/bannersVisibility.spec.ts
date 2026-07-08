import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/banner", () => {
  test("GET /api/2.0/settings/banner - Owner gets banner settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .bannersVisibility.getTenantBannerSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.hidden).toBe("boolean");
    expect(
      new Date(data.response?.lastModified as string).getTime(),
    ).not.toBeNaN();
  });

  test("GET /api/2.0/settings/banner - DocSpaceAdmin gets banner settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .bannersVisibility.getTenantBannerSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.hidden).toBe("boolean");
    expect(
      new Date(data.response?.lastModified as string).getTime(),
    ).not.toBeNaN();
  });

  test("GET /api/2.0/settings/banner - RoomAdmin gets banner settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .bannersVisibility.getTenantBannerSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.hidden).toBe("boolean");
  });

  test("GET /api/2.0/settings/banner - User gets banner settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .bannersVisibility.getTenantBannerSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.hidden).toBe("boolean");
  });

  test("GET /api/2.0/settings/banner - Guest gets banner settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .bannersVisibility.getTenantBannerSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.hidden).toBe("boolean");
  });
});
