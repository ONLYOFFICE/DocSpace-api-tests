import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/cookiesettings", () => {
  test("GET /api/2.0/settings/cookiesettings - Owner gets cookie settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .cookies.getCookieSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.lifeTime).toBe("number");
    expect(typeof data.response?.enabled).toBe("boolean");
  });

  test("GET /api/2.0/settings/cookiesettings - DocSpaceAdmin gets cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .cookies.getCookieSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.lifeTime).toBe("number");
    expect(typeof data.response?.enabled).toBe("boolean");
  });
});

test.describe("PUT /api/2.0/settings/cookiesettings", () => {
  test("PUT /api/2.0/settings/cookiesettings - Owner updates cookie settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .cookies.updateCookieSettings({
        cookieSettingsRequestsDto: { lifeTime: 720, enabled: true },
      });

    expect(status).toBe(200);
    expect(data.response).toBe("Settings have been successfully updated");

    // Session is invalidated after updating cookie settings — re-authenticate for fixture cleanup
    await apiSdk.authenticateOwner();
  });

  test("PUT /api/2.0/settings/cookiesettings - DocSpaceAdmin updates cookie settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .cookies.updateCookieSettings({
        cookieSettingsRequestsDto: { lifeTime: 720, enabled: true },
      });

    expect(status).toBe(200);
    expect(data.response).toBe("Settings have been successfully updated");

    // Owner was logged out by this operation — re-authenticate for fixture cleanup
    await apiSdk.authenticateOwner();
  });
});
