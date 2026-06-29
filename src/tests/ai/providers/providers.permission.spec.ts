import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

// The product runs AI through the built-in "ONLYOFFICE AI" gateway, so manual
// provider management (add / update / delete / set-default / available) is gone
// — those endpoints return 403 for everyone. Only access control on the read
// endpoints (getProviders / getDefaultProvider) is still meaningful.

test.describe("AI Providers - Get Permissions", () => {
  for (const role of ["User", "Guest"] as const) {
    test(`GET /api/2.0/ai/providers - ${role} cannot get providers`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.providers.getProviders();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("GET /api/2.0/ai/providers - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.getProviders();

    expect(status).toBe(401);
  });
});

test.describe("AI Providers - Get Default Permissions", () => {
  test("BUG 80713: GET /api/2.0/ai/providers/default - Guest cannot get default provider", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.providers.getDefaultProvider();

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/ai/providers/default - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.getDefaultProvider();

    expect(status).toBe(401);
  });
});
