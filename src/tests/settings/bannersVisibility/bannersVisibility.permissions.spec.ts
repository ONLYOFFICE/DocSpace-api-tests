import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/banner - permissions", () => {
  test("GET /api/2.0/settings/banner - Anonymous cannot get banner settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .bannersVisibility.getTenantBannerSettings();

    expect(status).toBe(401);
  });
});
