import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

const expectedProviders = [
  "google",
  "zoom",
  "linkedin",
  "twitter",
  "appleid",
  "weixin",
];

test.describe("GET /people/thirdparty/providers - Get third-party auth providers", () => {
  test("GET /people/thirdparty/providers - Owner gets third-party auth providers", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .thirdPartyAccounts.getThirdPartyAuthProviders();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const response = data.response as any[];

    for (const name of expectedProviders) {
      const provider = response.find((p: any) => p.provider === name);
      expect(provider, `Provider "${name}" should be present`).toBeDefined();
      expect(provider.linked).toBe(false);
    }
  });

  test("GET /people/thirdparty/providers - DocSpace admin gets third-party auth providers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .thirdPartyAccounts.getThirdPartyAuthProviders();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const response = data.response as any[];

    for (const name of expectedProviders) {
      const provider = response.find((p: any) => p.provider === name);
      expect(provider, `Provider "${name}" should be present`).toBeDefined();
      expect(provider.linked).toBe(false);
    }
  });

  test("GET /people/thirdparty/providers - Room admin gets third-party auth providers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .thirdPartyAccounts.getThirdPartyAuthProviders();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const response = data.response as any[];

    for (const name of expectedProviders) {
      const provider = response.find((p: any) => p.provider === name);
      expect(provider, `Provider "${name}" should be present`).toBeDefined();
      expect(provider.linked).toBe(false);
    }
  });

  test("GET /people/thirdparty/providers - User gets third-party auth providers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .thirdPartyAccounts.getThirdPartyAuthProviders();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const response = data.response as any[];

    for (const name of expectedProviders) {
      const provider = response.find((p: any) => p.provider === name);
      expect(provider, `Provider "${name}" should be present`).toBeDefined();
      expect(provider.linked).toBe(false);
    }
  });

  test("GET /people/thirdparty/providers - Guest gets third-party auth providers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .thirdPartyAccounts.getThirdPartyAuthProviders();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const response = data.response as any[];

    for (const name of expectedProviders) {
      const provider = response.find((p: any) => p.provider === name);
      expect(provider, `Provider "${name}" should be present`).toBeDefined();
      expect(provider.linked).toBe(false);
    }
  });
});

// The *positive* path of linkThirdPartyAccount and signupThirdPartyAccount -
// actually linking/signing up through a real provider - needs a genuine
// completed OAuth authorization (serializedProfile is opaque server-issued
// state, not something a test can construct) and stays untestable. But their
// *negative* paths, and unlinkThirdPartyAccount entirely, need no real OAuth
// credentials at all and are covered below.

test.describe("DELETE /people/thirdparty/unlinkaccount - Unlink a third-party account", () => {
  test("Owner can unlink a provider that was never linked - idempotent, safe to retry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const first = await ownerApi.thirdPartyAccounts.unlinkThirdPartyAccount({
      provider: "google",
    });
    expect(first.status).toBe(200);

    const second = await ownerApi.thirdPartyAccounts.unlinkThirdPartyAccount({
      provider: "google",
    });
    expect(second.status).toBe(200);
  });

  test("Owner's call with an unrecognized provider name is accepted and changes nothing", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyAccounts.unlinkThirdPartyAccount({
        provider: "not-a-real-provider",
      });

    expect(status).toBe(200);
  });

  test("Owner's call with no provider named at all is accepted", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyAccounts.unlinkThirdPartyAccount({});

    expect(status).toBe(200);
  });
});

test.describe("DELETE /people/thirdparty/unlinkaccount - access control", () => {
  test("User (non-admin) can unlink a provider from their own account - no admin permission needed", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.thirdPartyAccounts.unlinkThirdPartyAccount(
      { provider: "google" },
    );
    expect(status).toBe(200);
  });

  test("Anonymous cannot unlink a provider", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyAccounts.unlinkThirdPartyAccount({ provider: "google" });
    expect(status).toBe(401);
  });
});

test.describe("PUT /people/thirdparty/linkaccount - Link a third-party account", () => {
  test("Owner is refused with 400 when serializedProfile is missing entirely", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .thirdPartyAccounts.linkThirdPartyAccount({
        linkAccountRequestDto: {},
      });

    expect(status).toBe(400);
  });

  // BUG 85084: confirmed live - a serializedProfile that isn't valid Base64
  // crashes with 500 ("System.FormatException: The input is not a valid
  // Base-64 string...") instead of the clean 400 a malformed request body
  // should get. A completely missing serializedProfile is handled fine
  // (400, see the test above) - only a non-empty-but-garbled one crashes.
  test.fail(
    "BUG 85084: a non-Base64 serializedProfile crashes linkThirdPartyAccount with 500 instead of 400",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .thirdPartyAccounts.linkThirdPartyAccount({
          linkAccountRequestDto: { serializedProfile: "not-a-real-profile" },
        });

      expect(status).toBe(400);
    },
  );

  test("Anonymous cannot link a third-party account", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyAccounts.linkThirdPartyAccount({
        linkAccountRequestDto: { serializedProfile: "x" },
      });
    expect(status).toBe(401);
  });
});

test.describe("POST /people/thirdparty/signup - Sign up with a provider", () => {
  test("Anonymous is refused with 400 when both key and serializedProfile are empty", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .thirdPartyAccounts.signupThirdPartyAccount({
        signupAccountRequestDto: { key: "", serializedProfile: "" },
      });

    expect(status).toBe(400);
  });

  // BUG 85085: same root cause as BUG 85084 (linkThirdPartyAccount) - both
  // controllers call the same ASC.FederatedLogin.Profile.LoginProfileTransport
  // .FromTransport parser - a non-Base64 serializedProfile crashes with 500
  // instead of 400. Confirmed this happens regardless of whether the
  // invitation key is valid or not: the profile is parsed before the key is
  // ever checked, so an invalid key never gets the chance to answer its own
  // documented 403.
  test.fail(
    "BUG 85085: a non-Base64 serializedProfile crashes signupThirdPartyAccount with 500 instead of 400",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forAnonymous()
        .thirdPartyAccounts.signupThirdPartyAccount({
          signupAccountRequestDto: {
            key: "any-key-invalid-or-not",
            serializedProfile: "not-a-real-profile",
          },
        });

      expect(status).toBe(400);
    },
  );
});
