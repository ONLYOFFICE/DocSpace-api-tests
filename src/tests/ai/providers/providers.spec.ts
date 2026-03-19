import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  aiProviders,
  expectedAvailableProviders,
} from "@/src/helpers/ai-providers";

test.describe("AI Providers", () => {
  for (const [, provider] of Object.entries(aiProviders)) {
    test(`POST /api/2.0/ai/providers - Owner adds ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(provider.title);
    });
  }

  for (const [, provider] of Object.entries(aiProviders)) {
    test(`POST /api/2.0/ai/providers - DocSpaceAdmin adds ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(provider.title);
    });
  }
});

test.describe("AI Providers - Delete", () => {
  for (const [, provider] of Object.entries(aiProviders)) {
    test(`DELETE /api/2.0/ai/providers - Owner deletes ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: created } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = created.response!.id!;

      const { data, status } = await ownerApi.providers.deleteProviders({
        removeProviderRequestDto: {
          ids: new Set([providerId]),
        },
      });

      expect(status).toBe(204);
      expect(data).toBeFalsy();
    });
  }

  for (const [, provider] of Object.entries(aiProviders)) {
    test(`DELETE /api/2.0/ai/providers - DocSpaceAdmin deletes ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: created } = await ownerApi.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });
      const providerId = created.response!.id!;

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.providers.deleteProviders({
        removeProviderRequestDto: {
          ids: new Set([providerId]),
        },
      });

      expect(status).toBe(204);
      expect(data).toBeFalsy();
    });
  }
});

test.describe("AI Providers - Get Available", () => {
  test("GET /api/2.0/ai/providers/available - Owner gets available providers", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.providers.getAvailableProviders();

    expect(status).toBe(200);
    expect(data.count).toBe(7);
    for (const expected of expectedAvailableProviders) {
      const found = data.response?.find((p) => p.type === expected.type);
      expect(found).toBeDefined();
      expect(found?.url).toBe(expected.url);
    }
  });

  test("GET /api/2.0/ai/providers/available - DocSpaceAdmin gets available providers", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getAvailableProviders();

    expect(status).toBe(200);
    expect(data.count).toBe(7);
    for (const expected of expectedAvailableProviders) {
      const found = data.response?.find((p) => p.type === expected.type);
      expect(found).toBeDefined();
      expect(found?.url).toBe(expected.url);
    }
  });
});

test.describe("AI Providers - Get Default", () => {
  const defaultProvider = aiProviders.deepSeek;
  test("GET /api/2.0/ai/providers/default - Owner gets default provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: defaultProvider.type,
        title: defaultProvider.title,
        key: defaultProvider.key,
      },
    });

    const { data, status } = await ownerApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(defaultProvider.modelId);
    expect(data.response?.providerTitle).toBe(defaultProvider.title);
  });

  test("GET /api/2.0/ai/providers/default - DocSpaceAdmin gets default provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: defaultProvider.type,
        title: defaultProvider.title,
        key: defaultProvider.key,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(defaultProvider.modelId);
    expect(data.response?.providerTitle).toBe(defaultProvider.title);
  });

  test("GET /api/2.0/ai/providers/default - Room admin gets default provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: defaultProvider.type,
        title: defaultProvider.title,
        key: defaultProvider.key,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await adminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(defaultProvider.modelId);
    expect(data.response?.providerTitle).toBe(defaultProvider.title);
  });
});
