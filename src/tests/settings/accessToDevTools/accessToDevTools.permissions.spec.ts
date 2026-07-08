import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/devtoolsaccess - permissions", () => {
  test("GET /api/2.0/settings/devtoolsaccess - Anonymous cannot get dev tools access settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/devtoolsaccess - RoomAdmin can get dev tools access settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.limitedAccessForUsers).toBe("boolean");
  });

  test("GET /api/2.0/settings/devtoolsaccess - User can get dev tools access settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.limitedAccessForUsers).toBe("boolean");
  });

  test("GET /api/2.0/settings/devtoolsaccess - Guest can get dev tools access settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .accessToDevTools.getTenantAccessDevToolsSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.limitedAccessForUsers).toBe("boolean");
  });
});
