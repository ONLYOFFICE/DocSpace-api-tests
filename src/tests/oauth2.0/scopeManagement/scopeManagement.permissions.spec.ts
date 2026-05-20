import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("GET /api/2.0/scopes - permissions", () => {
  test("GET /api/2.0/scopes - Anonymous cannot get OAuth2 scopes", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().scopeManagement.getScopes();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/scopes - Guest cannot get OAuth2 scopes", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .scopeManagement.getScopes();

    expect(status).toBe(403);
  });
});
