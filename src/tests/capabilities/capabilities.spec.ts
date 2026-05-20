import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("GET /api/2.0/capabilities", () => {
  test("GET /api/2.0/capabilities - Anonymous gets portal capabilities", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .capabilities.getPortalCapabilities();

    expect(status).toBe(200);
    expect(typeof data.response?.ldapEnabled).toBe("boolean");
    expect(typeof data.response?.oauthEnabled).toBe("boolean");
    expect(typeof data.response?.identityServerEnabled).toBe("boolean");
    expect(Array.isArray(data.response?.providers)).toBe(true);
  });

  test("GET /api/2.0/capabilities - Owner gets portal capabilities", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .capabilities.getPortalCapabilities();

    expect(status).toBe(200);
    expect(typeof data.response?.ldapEnabled).toBe("boolean");
    expect(typeof data.response?.oauthEnabled).toBe("boolean");
    expect(typeof data.response?.identityServerEnabled).toBe("boolean");
    expect(Array.isArray(data.response?.providers)).toBe(true);
  });
});
