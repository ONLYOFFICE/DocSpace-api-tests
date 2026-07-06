import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/security/oauth2/token - permissions", () => {
  test("GET /api/2.0/security/oauth2/token - Anonymous cannot generate JWT token", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().oauth2.generateJwtToken();

    expect(status).toBe(401);
  });
});
