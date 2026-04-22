import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  aiProviders,
  expectedAvailableProviders,
  onlyofficeAiProvider,
} from "@/src/helpers/ai-providers";
import { topUpDeposit, buyWalletService } from "@/src/helpers/wallet-services";

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

test.describe("AI Providers - Update", () => {
  const provider = aiProviders.deepSeek;

  test("PUT /api/2.0/ai/providers/:id - Owner updates provider title", async ({
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

    const newTitle = "DeepSeek Updated";
    const { data, status } = await ownerApi.providers.updateProvider({
      id: providerId,
      updateProviderBody: { title: newTitle },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe(newTitle);
  });

  test("PUT /api/2.0/ai/providers/:id - DocSpaceAdmin updates provider title", async ({
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

    const newTitle = "DeepSeek Updated";
    const { data, status } = await adminApi.providers.updateProvider({
      id: providerId,
      updateProviderBody: { title: newTitle },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe(newTitle);
  });
});

test.describe("AI Providers - Get Available", () => {
  test("GET /api/2.0/ai/providers/available - Owner gets available providers", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.providers.getAvailableProviders();

    expect(status).toBe(200);
    expect(data.count).toBe(8);
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
    expect(data.count).toBe(8);
    for (const expected of expectedAvailableProviders) {
      const found = data.response?.find((p) => p.type === expected.type);
      expect(found).toBeDefined();
      expect(found?.url).toBe(expected.url);
    }
  });
});

test.describe("AI Providers - Get", () => {
  const provider = aiProviders.deepSeek;

  test("GET /api/2.0/ai/providers - Owner gets providers", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });

    const { data, status } = await ownerApi.providers.getProviders();

    expect(status).toBe(200);
    expect(data.response?.some((p) => p.title === provider.title)).toBe(true);
  });

  test("GET /api/2.0/ai/providers - DocSpaceAdmin gets providers", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getProviders();

    expect(status).toBe(200);
    expect(data.response?.some((p) => p.title === provider.title)).toBe(true);
  });

  test("GET /api/2.0/ai/providers - RoomAdmin gets providers", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.providers.getProviders();

    expect(status).toBe(200);
    expect(data.response?.some((p) => p.title === provider.title)).toBe(true);
  });
});

test.describe("AI Providers - Set Default", () => {
  const firstProvider = aiProviders.deepSeek;
  const secondProvider = aiProviders.openAi;

  test("PUT /api/2.0/ai/providers/default - Owner changes default provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: firstProvider.type,
        title: firstProvider.title,
        key: firstProvider.key,
      },
    });

    const { data: secondCreated } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: secondProvider.type,
        title: secondProvider.title,
        key: secondProvider.key,
      },
    });
    const secondId = secondCreated.response!.id!;

    const { data, status } = await ownerApi.providers.setDefaultProvider({
      setDefaultProviderRequestDto: {
        providerId: secondId,
        defaultModel: secondProvider.modelId,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.defaultModel).toBe(secondProvider.modelId);
    expect(data.response?.providerTitle).toBe(secondProvider.title);
  });

  test("PUT /api/2.0/ai/providers/default - DocSpaceAdmin changes default provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: firstProvider.type,
        title: firstProvider.title,
        key: firstProvider.key,
      },
    });

    const { data: secondCreated } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: secondProvider.type,
        title: secondProvider.title,
        key: secondProvider.key,
      },
    });
    const secondId = secondCreated.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.setDefaultProvider({
      setDefaultProviderRequestDto: {
        providerId: secondId,
        defaultModel: secondProvider.modelId,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.defaultModel).toBe(secondProvider.modelId);
    expect(data.response?.providerTitle).toBe(secondProvider.title);
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

  test("GET /api/2.0/ai/providers/default - User gets default provider", async ({
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

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(defaultProvider.modelId);
    expect(data.response?.providerTitle).toBe(defaultProvider.title);
  });

  test.fail(
    "BUG XXXXX: GET /api/2.0/ai/providers/default - Owner gets default provider on fresh portal without billing customer",
    async ({ apiSdk }) => {
      // Fresh portal from fixture. Do not touch paymentsApi or any payment endpoint
      const { status } = await apiSdk.forRole("owner").providers.getDefaultProvider();

      expect(status).toBe(200);
    },
  );
});

test.describe("AI Providers - Get Default (ONLYOFFICE AI with AI Tools enabled)", () => {
  const onlyofficeAi = onlyofficeAiProvider;

  test("GET /api/2.0/ai/providers/default - Owner gets ONLYOFFICE AI as default provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await topUpDeposit(ownerApi.payment, 100);
    await buyWalletService(ownerApi.payment, "aiTools", 50);

    await ownerApi.providers.setDefaultProvider({
      setDefaultProviderRequestDto: {
        providerId: onlyofficeAi.providerId,
        defaultModel: onlyofficeAi.defaultModel,
      },
    });

    const { data, status } = await ownerApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.response?.providerId).toBe(onlyofficeAi.providerId);
    expect(data.response?.defaultModel).toBe(onlyofficeAi.defaultModel);
    expect(data.response?.providerTitle).toBe(onlyofficeAi.providerTitle);
  });

  test("GET /api/2.0/ai/providers/default - DocSpaceAdmin gets ONLYOFFICE AI as default provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await topUpDeposit(ownerApi.payment, 100);
    await buyWalletService(ownerApi.payment, "aiTools", 50);

    await ownerApi.providers.setDefaultProvider({
      setDefaultProviderRequestDto: {
        providerId: onlyofficeAi.providerId,
        defaultModel: onlyofficeAi.defaultModel,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.response?.providerId).toBe(onlyofficeAi.providerId);
    expect(data.response?.defaultModel).toBe(onlyofficeAi.defaultModel);
    expect(data.response?.providerTitle).toBe(onlyofficeAi.providerTitle);
  });

  test("GET /api/2.0/ai/providers/default - RoomAdmin gets ONLYOFFICE AI as default provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await topUpDeposit(ownerApi.payment, 100);
    await buyWalletService(ownerApi.payment, "aiTools", 50);

    await ownerApi.providers.setDefaultProvider({
      setDefaultProviderRequestDto: {
        providerId: onlyofficeAi.providerId,
        defaultModel: onlyofficeAi.defaultModel,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.response?.providerId).toBe(onlyofficeAi.providerId);
    expect(data.response?.defaultModel).toBe(onlyofficeAi.defaultModel);
    expect(data.response?.providerTitle).toBe(onlyofficeAi.providerTitle);
  });

  test("GET /api/2.0/ai/providers/default - User gets ONLYOFFICE AI as default provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await topUpDeposit(ownerApi.payment, 100);
    await buyWalletService(ownerApi.payment, "aiTools", 50);

    await ownerApi.providers.setDefaultProvider({
      setDefaultProviderRequestDto: {
        providerId: onlyofficeAi.providerId,
        defaultModel: onlyofficeAi.defaultModel,
      },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.response?.providerId).toBe(onlyofficeAi.providerId);
    expect(data.response?.defaultModel).toBe(onlyofficeAi.defaultModel);
    expect(data.response?.providerTitle).toBe(onlyofficeAi.providerTitle);
  });
});
