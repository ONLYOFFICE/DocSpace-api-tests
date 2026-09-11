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

// linkThirdPartyAccount, signupThirdPartyAccount, unlinkThirdPartyAccount
// require real OAuth credentials from third-party providers (Google, Zoom, etc.)
// with possible 2FA — not possible to automate in API tests
