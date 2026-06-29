import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { onlyofficeAiProvider } from "@/src/helpers/ai-providers";

// The product runs AI through the built-in "ONLYOFFICE AI" gateway. Manual
// provider management (add / update / delete / set-default / available) is
// disabled by the gateway (returns 403), so only the read endpoints below are
// exercised — they return the single built-in gateway provider.
test.describe("AI Providers - Get", () => {
  test("GET /api/2.0/ai/providers - Owner gets the gateway provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.providers.getProviders();

    expect(status).toBe(200);
    expect(
      data.response?.some(
        (p) => p.title === onlyofficeAiProvider.providerTitle,
      ),
    ).toBe(true);
  });

  test("GET /api/2.0/ai/providers - DocSpaceAdmin gets the gateway provider", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getProviders();

    expect(status).toBe(200);
    expect(
      data.response?.some(
        (p) => p.title === onlyofficeAiProvider.providerTitle,
      ),
    ).toBe(true);
  });

  test("GET /api/2.0/ai/providers - RoomAdmin gets the gateway provider", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.providers.getProviders();

    expect(status).toBe(200);
    expect(
      data.response?.some(
        (p) => p.title === onlyofficeAiProvider.providerTitle,
      ),
    ).toBe(true);
  });
});

test.describe("AI Providers - Get Default", () => {
  test("GET /api/2.0/ai/providers/default - Owner gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.providerId).toBe(onlyofficeAiProvider.providerId);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });

  test("GET /api/2.0/ai/providers/default - DocSpaceAdmin gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });

  test("GET /api/2.0/ai/providers/default - RoomAdmin gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });

  test("GET /api/2.0/ai/providers/default - User gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });
});
