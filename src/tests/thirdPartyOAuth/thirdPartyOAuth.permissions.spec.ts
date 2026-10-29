import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { LoginProvider } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/thirdparty/:provider - access control", () => {
  test("User (non-admin) can get a provider consent URL - no admin permission needed", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.thirdPartyOAuth.getThirdPartyCode({
      provider: LoginProvider.Google,
    });
    expect(status).toBe(200);
  });

  test("Anonymous cannot get a provider consent URL", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyOAuth.getThirdPartyCode({ provider: LoginProvider.Google });
    expect(status).toBe(401);
  });
});
