import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { LoginProvider } from "@onlyoffice/docspace-api-sdk";

// Builds the OAuth 2.0 consent URL for one external provider. This is a
// distinct SDK class from ThirdPartyIntegrationApi (connecting a room's
// storage) and ThirdPartyAccountsApi (linking a personal account) - this one
// only ever returns a URL string, never touches a connection.
//
// Only 7 of the 15 LoginProvider values actually produce a URL (Google,
// Dropbox, Docusign, Box, OneDrive, Wordpress, Github); the rest come back
// 200 with no `response` field. Google's OAuth client id is already
// pre-configured on this SaaS test portal, so that's the one real URL this
// suite can exercise end-to-end without configuring anything via
// `authservice` first.
//
// Gotcha: the SDK doc says "any other value is answered with 200 and no URL
// instead of an error", which is only true for a value that's a *valid*
// LoginProvider enum member just not in the URL-producing list (e.g.
// Facebook). A genuinely out-of-enum-range integer (e.g. 999) is rejected by
// ASP.NET's own enum model binding with 400, not 200 - confirmed live, not a
// bug (behavior is stricter/safer than the doc implies, not a misbehavior).

test.describe("GET /api/2.0/thirdparty/:provider - Get provider consent URL", () => {
  test("Owner gets a real Google consent URL", async ({ apiSdk }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyOAuth.getThirdPartyCode({ provider: LoginProvider.Google });

    expect(status).toBe(200);
    expect(data.response).toContain("accounts.google.com");
    expect(data.response).toContain("response_type=code");
  });

  test("Owner gets 200 with no URL for a provider that isn't in the URL-producing list", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyOAuth.getThirdPartyCode({
        provider: LoginProvider.Facebook,
      });

    expect(status).toBe(200);
    expect(data.response).toBeFalsy();
  });

  test("Owner is refused with 400 for an out-of-range provider value", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyOAuth.getThirdPartyCode({ provider: 999 as LoginProvider });

    expect(status).toBe(400);
  });

  // desktop=true isn't exposed as a typed SDK parameter, so this goes
  // through the raw HTTP layer.
  test("desktop=true copies the whole query string into the callback state", async ({
    apiSdk,
  }) => {
    const headers = {
      Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
      Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
    };
    const base = `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/thirdparty/${LoginProvider.Google}`;

    const plain = await apiSdk.request.get(base, { headers });
    const plainBody = await plain.json();
    const plainState = new URL(plainBody.response).searchParams.get("state");
    expect(plainState).toBe(
      `${apiSdk.tokenStore.portalBaseUrl}/thirdparty/google/code`,
    );

    const desktop = await apiSdk.request.get(`${base}?desktop=true&foo=bar`, {
      headers,
    });
    const desktopBody = await desktop.json();
    const desktopState = new URL(desktopBody.response).searchParams.get(
      "state",
    );
    expect(desktopState).toBe(
      `${apiSdk.tokenStore.portalBaseUrl}/thirdparty/google/code?desktop=true&foo=bar`,
    );
  });
});
