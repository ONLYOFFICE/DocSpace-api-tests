import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders } from "@/src/helpers/ai-providers";

const provider = aiProviders.openAi;
const forbiddenRoles = ["RoomAdmin", "User", "Guest"] as const;

test.describe("AI Providers - Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`POST /api/2.0/ai/providers - ${role} cannot add provider`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.providers.addProvider({
        createProviderRequestDto: {
          type: provider.type,
          title: provider.title,
          key: provider.key,
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("POST /api/2.0/ai/providers - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/ai/providers - Owner gets 400 when adding duplicate provider", async ({
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

    const { data, status } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });
    console.log(data);
    expect(status).toBe(400);
    expect((data as any).error.message).toBe("Provider name already exists");
  });

  test("POST /api/2.0/ai/providers - Owner gets 400 with invalid API key", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: "invalid-api-key",
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "The specified API key is invalid or does not have access rights. Verify that the key is correct and try again",
    );
  });
});

test.describe("AI Providers - Delete Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`DELETE /api/2.0/ai/providers - ${role} cannot delete provider`, async ({
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

      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.providers.deleteProviders({
        removeProviderRequestDto: {
          ids: new Set([providerId]),
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("DELETE /api/2.0/ai/providers - Anonymous gets 401 Unauthorized", async ({
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

    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.deleteProviders({
      removeProviderRequestDto: {
        ids: new Set([providerId]),
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("AI Providers - Get Available Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`GET /api/2.0/ai/providers/available - ${role} cannot get available providers`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.providers.getAvailableProviders();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("GET /api/2.0/ai/providers/available - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.getAvailableProviders();

    expect(status).toBe(401);
  });
});

test.describe("AI Providers - Get Default Permissions", () => {
  for (const role of ["User", "Guest"] as const) {
    test.fail(
      `BUG : GET /api/2.0/ai/providers/default - ${role} cannot get default provider`,
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");

        await ownerApi.providers.addProvider({
          createProviderRequestDto: {
            type: provider.type,
            title: provider.title,
            key: provider.key,
          },
        });

        const { api } = await apiSdk.addAuthenticatedMember("owner", role);

        const { data, status } = await api.providers.getDefaultProvider();

        expect(status).toBe(403);
        expect((data as any).error.message).toBe("Access denied");
      },
    );
  }

  test("GET /api/2.0/ai/providers/default - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.getDefaultProvider();

    expect(status).toBe(401);
  });
});
