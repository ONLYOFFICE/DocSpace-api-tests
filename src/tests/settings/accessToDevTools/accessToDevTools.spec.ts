import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/devtoolsaccess", () => {
  test("GET /api/2.0/settings/devtoolsaccess - Owner gets dev tools access settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.limitedAccessForUsers).toBe("boolean");
    expect(
      new Date(data.response?.lastModified as string).getTime(),
    ).not.toBeNaN();
  });

  test("GET /api/2.0/settings/devtoolsaccess - DocSpaceAdmin gets dev tools access settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.limitedAccessForUsers).toBe("boolean");
    expect(
      new Date(data.response?.lastModified as string).getTime(),
    ).not.toBeNaN();
  });

  test("GET /api/2.0/settings/devtoolsaccess - Owner sees limitedAccessForUsers true when restriction is enabled", async ({
    apiSdk,
  }) => {
    await apiSdk
      .forRole("owner")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    const { data, status } = await apiSdk
      .forRole("owner")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(data.response?.limitedAccessForUsers).toBe(true);
  });

  test("GET /api/2.0/settings/devtoolsaccess - Owner sees limitedAccessForUsers false when restriction is disabled", async ({
    apiSdk,
  }) => {
    await apiSdk
      .forRole("owner")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: false },
      });

    const { data, status } = await apiSdk
      .forRole("owner")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(data.response?.limitedAccessForUsers).toBe(false);
  });

  test("GET /api/2.0/settings/devtoolsaccess - DocSpaceAdmin sees limitedAccessForUsers true when restriction is enabled", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk
      .forRole("owner")
      .securityAccessToDevTools.setTenantDevToolsAccessSettings({
        tenantDevToolsAccessSettingsDto: { limitedAccessForUsers: true },
      });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(data.response?.limitedAccessForUsers).toBe(true);
  });
});
