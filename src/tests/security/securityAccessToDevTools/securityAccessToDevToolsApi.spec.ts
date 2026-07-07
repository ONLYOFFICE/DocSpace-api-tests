import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("POST /api/2.0/settings/devtoolsaccess", () => {
  test("POST /api/2.0/settings/devtoolsaccess - Owner enables limited access for users", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    expect(status).toBe(200);
    expect(data.response?.limitedAccessForUsers).toBe(true);
    expect(data.response?.lastModified).toBeDefined();
  });

  test("POST /api/2.0/settings/devtoolsaccess - Owner disables limited access for users", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: false },
      });

    expect(status).toBe(200);
    expect(data.response?.limitedAccessForUsers).toBe(false);
    expect(data.response?.lastModified).toBeDefined();
  });

  test("POST /api/2.0/settings/devtoolsaccess - DocSpaceAdmin can update settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    expect(status).toBe(200);
  });
});
