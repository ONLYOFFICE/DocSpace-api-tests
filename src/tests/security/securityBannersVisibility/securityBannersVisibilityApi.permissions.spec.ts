import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// Promotional banners are currently hidden both in UI and API.
// Tests are skipped until banners are re-enabled in the product.

test.describe("POST /api/2.0/settings/banner - permissions", () => {
  test.skip(
    true,
    "Promotional banners are currently hidden both in UI and API",
  );

  test("POST /api/2.0/settings/banner - Anonymous cannot set banner visibility", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .securityBanners.setTenantBannerSettings({
        tenantBannerSettingsDto: { hidden: true },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/banner - RoomAdmin cannot set banner visibility", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .securityBanners.setTenantBannerSettings({
        tenantBannerSettingsDto: { hidden: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/banner - User cannot set banner visibility", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .securityBanners.setTenantBannerSettings({
        tenantBannerSettingsDto: { hidden: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/banner - Guest cannot set banner visibility", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .securityBanners.setTenantBannerSettings({
        tenantBannerSettingsDto: { hidden: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});
