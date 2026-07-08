import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// Promotional banners are currently hidden both in UI and API.
// Tests are skipped until banners are re-enabled in the product.

test.describe("POST /api/2.0/settings/banner", () => {
  test.skip(
    true,
    "Promotional banners are currently hidden both in UI and API",
  );

  test("POST /api/2.0/settings/banner - Owner sets banner visibility", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .securityBanners.setTenantBannerSettings({
        tenantBannerSettingsDto: { hidden: true },
      });

    expect(status).toBe(200);
    expect(data.response?.hidden).toBe(true);
    expect(data.response?.lastModified).toBeDefined();
  });

  test("POST /api/2.0/settings/banner - DocSpaceAdmin sets banner visibility", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .securityBanners.setTenantBannerSettings({
        tenantBannerSettingsDto: { hidden: true },
      });

    expect(status).toBe(200);
    expect(data.response?.hidden).toBe(true);
    expect(data.response?.lastModified).toBeDefined();
  });
});
