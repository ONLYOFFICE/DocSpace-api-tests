import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  EmbeddingProviderType,
  EngineType,
} from "@onlyoffice/docspace-api-sdk";
import { aiProviders } from "@/src/helpers/ai-providers";
import config from "@/config";

const forbiddenRoles = ["RoomAdmin", "User", "Guest"] as const;

test.describe("AI Settings - getAiSettings Permissions", () => {
  for (const role of forbiddenRoles) {
    test.fail(
      `BUG : GET /api/2.0/ai/config - ${role} cannot get AI settings`,
      async ({ apiSdk }) => {
        const { api } = await apiSdk.addAuthenticatedMember("owner", role);

        const { data, status } = await api.aiSettings.getAiSettings();

        expect(status).toBe(403);
        expect((data as any).error.message).toBe("Access denied");
      },
    );
  }

  test("GET /api/2.0/ai/config - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.aiSettings.getAiSettings();

    expect(status).toBe(401);
  });
});

test.describe("AI Settings - setVectorizationSettings Permissions", () => {
  const provider = aiProviders.openAi;

  for (const role of forbiddenRoles) {
    test(`PUT /api/2.0/ai/config/vectorization - ${role} cannot set vectorization settings`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.aiSettings.setVectorizationSettings({
        setEmbeddingConfigRequestBody: {
          type: EmbeddingProviderType.OpenAi,
          key: provider.key,
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("PUT /api/2.0/ai/config/vectorization - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.aiSettings.setVectorizationSettings({
      setEmbeddingConfigRequestBody: {
        type: EmbeddingProviderType.OpenAi,
        key: provider.key,
      },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/ai/config/vectorization - Owner gets 400 with invalid API key", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.aiSettings.setVectorizationSettings(
      {
        setEmbeddingConfigRequestBody: {
          type: EmbeddingProviderType.OpenAi,
          key: "invalid-api-key",
        },
      },
    );

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "The specified API key is invalid or does not have access rights. Verify that the key is correct and try again",
    );
  });
});

test.describe("AI Settings - getVectorizationSettings Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`GET /api/2.0/ai/config/vectorization - ${role} cannot get vectorization settings`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.aiSettings.getVectorizationSettings();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("GET /api/2.0/ai/config/vectorization - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.aiSettings.getVectorizationSettings();

    expect(status).toBe(401);
  });
});

test.describe("AI Settings - setWebSearchSettings Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`PUT /api/2.0/ai/config/web-search - ${role} cannot set web search settings`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.aiSettings.setWebSearchSettings({
        setWebSearchSettingsRequestBody: {
          enabled: true,
          type: EngineType.Exa,
          key: config.EXA_API_KEY,
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("PUT /api/2.0/ai/config/web-search - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.aiSettings.setWebSearchSettings({
      setWebSearchSettingsRequestBody: {
        enabled: true,
        type: EngineType.Exa,
        key: config.EXA_API_KEY,
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("AI Settings - getWebSearchSettings Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`GET /api/2.0/ai/config/web-search - ${role} cannot get web search settings`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } =
        await api.aiSettings.getWebSearchSettings();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("GET /api/2.0/ai/config/web-search - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.aiSettings.getWebSearchSettings();

    expect(status).toBe(401);
  });
});
