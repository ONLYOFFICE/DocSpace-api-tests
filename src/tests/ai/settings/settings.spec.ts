import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders, toCreateDto } from "@/src/helpers/ai-providers";
import {
  EmbeddingProviderType,
  EngineType,
} from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

test.describe("AI Settings - getAiSettings", () => {
  test("GET /api/2.0/ai/config - Owner gets AI settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.aiSettings.getAiSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response).toBeDefined();
    expect(response?.webSearchEnabled).toBe(false);
    expect(response?.webSearchNeedReset).toBe(false);
    expect(response?.vectorizationEnabled).toBe(false);
    expect(response?.vectorizationNeedReset).toBe(false);
    expect(response?.aiReady).toBe(false);
    expect(response?.aiReadyNeedReset).toBe(false);
    expect(response?.portalMcpServerId).toBeDefined();
    expect(response?.embeddingModel).toBe("text-embedding-3-small");
    expect(response?.modelAliases).toBeDefined();
    expect(response?.knowledgeSearchToolName).toBe("docspace_knowledge_search");
    expect(response?.webSearchToolName).toBe("docspace_web_search");
    expect(response?.webCrawlingToolName).toBe("docspace_web_crawling");
    expect(response?.generateDocxToolName).toBe("docspace_generate_docx");
    expect(response?.generateFormToolName).toBe("docspace_generate_form");
    expect(response?.generatePresentationToolName).toBe(
      "docspace_generate_presentation",
    );
    expect((response as any)?.systemAiEnabled).toBe(false);
  });

  test("GET /api/2.0/ai/config - DocSpaceAdmin gets AI settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.aiSettings.getAiSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response).toBeDefined();
    expect(response?.webSearchEnabled).toBe(false);
    expect(response?.webSearchNeedReset).toBe(false);
    expect(response?.vectorizationEnabled).toBe(false);
    expect(response?.vectorizationNeedReset).toBe(false);
    expect(response?.aiReady).toBe(false);
    expect(response?.aiReadyNeedReset).toBe(false);
    expect(response?.portalMcpServerId).toBeDefined();
    expect(response?.embeddingModel).toBe("text-embedding-3-small");
    expect(response?.modelAliases).toBeDefined();
    expect(response?.knowledgeSearchToolName).toBe("docspace_knowledge_search");
    expect(response?.webSearchToolName).toBe("docspace_web_search");
    expect(response?.webCrawlingToolName).toBe("docspace_web_crawling");
    expect(response?.generateDocxToolName).toBe("docspace_generate_docx");
    expect(response?.generateFormToolName).toBe("docspace_generate_form");
    expect(response?.generatePresentationToolName).toBe(
      "docspace_generate_presentation",
    );
    expect((response as any)?.systemAiEnabled).toBe(false);
  });

  test("GET /api/2.0/ai/config - RoomAdmin gets AI settings", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await api.aiSettings.getAiSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response).toBeDefined();
    expect(response?.webSearchEnabled).toBe(false);
    expect(response?.vectorizationEnabled).toBe(false);
    expect(response?.aiReady).toBe(false);
    expect(response?.portalMcpServerId).toBeDefined();
    expect(response?.embeddingModel).toBe("text-embedding-3-small");
    expect(response?.modelAliases).toBeDefined();
  });

  test("GET /api/2.0/ai/config - User gets AI settings", async ({ apiSdk }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await api.aiSettings.getAiSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response).toBeDefined();
    expect(response?.webSearchEnabled).toBe(false);
    expect(response?.vectorizationEnabled).toBe(false);
    expect(response?.aiReady).toBe(false);
    expect(response?.portalMcpServerId).toBeDefined();
    expect(response?.embeddingModel).toBe("text-embedding-3-small");
    expect(response?.modelAliases).toBeDefined();
  });

  test("GET /api/2.0/ai/config - Guest gets AI settings", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.aiSettings.getAiSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response).toBeDefined();
    expect(response?.webSearchEnabled).toBe(false);
    expect(response?.vectorizationEnabled).toBe(false);
    expect(response?.aiReady).toBe(false);
    expect(response?.portalMcpServerId).toBeDefined();
    expect(response?.embeddingModel).toBe("text-embedding-3-small");
    expect(response?.modelAliases).toBeDefined();
  });
});

test.describe("AI Settings - setVectorizationSettings", () => {
  const provider = aiProviders.openAi;

  test("PUT /api/2.0/ai/config/vectorization - Owner enables vectorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data, status } = await ownerApi.aiSettings.setVectorizationSettings(
      {
        setEmbeddingConfigRequestBody: {
          type: EmbeddingProviderType.OpenAi,
          key: provider.key,
        },
      },
    );

    expect(status).toBe(200);

    const response = data.response;
    expect(response?.type).toBe(EmbeddingProviderType.OpenAi);
    expect(response?.needReset).toBe(false);
  });

  test("PUT /api/2.0/ai/config/vectorization - DocSpaceAdmin enables vectorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.aiSettings.setVectorizationSettings(
      {
        setEmbeddingConfigRequestBody: {
          type: EmbeddingProviderType.OpenAi,
          key: provider.key,
        },
      },
    );

    expect(status).toBe(200);

    const response = data.response;
    expect(response?.type).toBe(EmbeddingProviderType.OpenAi);
    expect(response?.needReset).toBe(false);
  });
});

test.describe("AI Settings - getVectorizationSettings", () => {
  const provider = aiProviders.openAi;

  test("GET /api/2.0/ai/config/vectorization - Owner gets vectorization settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    await ownerApi.aiSettings.setVectorizationSettings({
      setEmbeddingConfigRequestBody: {
        type: EmbeddingProviderType.OpenAi,
        key: provider.key,
      },
    });

    const { data, status } =
      await ownerApi.aiSettings.getVectorizationSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response?.type).toBe(EmbeddingProviderType.OpenAi);
    expect(response?.needReset).toBe(false);
  });

  test("GET /api/2.0/ai/config/vectorization - DocSpaceAdmin gets vectorization settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    await ownerApi.aiSettings.setVectorizationSettings({
      setEmbeddingConfigRequestBody: {
        type: EmbeddingProviderType.OpenAi,
        key: provider.key,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.aiSettings.getVectorizationSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response?.type).toBe(EmbeddingProviderType.OpenAi);
    expect(response?.needReset).toBe(false);
  });
});

test.describe("AI Settings - setWebSearchSettings", () => {
  const provider = aiProviders.openAi;

  test("PUT /api/2.0/ai/config/web-search - Owner enables web search with Exa", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data, status } = await ownerApi.aiSettings.setWebSearchSettings({
      setWebSearchSettingsRequestBody: {
        enabled: true,
        type: EngineType.Exa,
        key: config.EXA_API_KEY,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);

    const response = data.response;
    expect(response?.enabled).toBe(true);
    expect(response?.type).toBe(EngineType.Exa);
    expect(response?.needReset).toBe(false);
  });

  test("PUT /api/2.0/ai/config/web-search - DocSpaceAdmin enables web search with Exa", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.aiSettings.setWebSearchSettings({
      setWebSearchSettingsRequestBody: {
        enabled: true,
        type: EngineType.Exa,
        key: config.EXA_API_KEY,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);

    const response = data.response;
    expect(response?.enabled).toBe(true);
    expect(response?.type).toBe(EngineType.Exa);
    expect(response?.needReset).toBe(false);
  });
});

test.describe("AI Settings - getWebSearchSettings", () => {
  const provider = aiProviders.openAi;

  test("GET /api/2.0/ai/config/web-search - Owner gets web search settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    await ownerApi.aiSettings.setWebSearchSettings({
      setWebSearchSettingsRequestBody: {
        enabled: true,
        type: EngineType.Exa,
        key: config.EXA_API_KEY,
      },
    });

    const { data, status } = await ownerApi.aiSettings.getWebSearchSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response?.enabled).toBe(true);
    expect(response?.type).toBe(EngineType.Exa);
    expect(response?.needReset).toBe(false);
  });

  test("GET /api/2.0/ai/config/web-search - DocSpaceAdmin gets web search settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    await ownerApi.aiSettings.setWebSearchSettings({
      setWebSearchSettingsRequestBody: {
        enabled: true,
        type: EngineType.Exa,
        key: config.EXA_API_KEY,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.aiSettings.getWebSearchSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response?.enabled).toBe(true);
    expect(response?.type).toBe(EngineType.Exa);
    expect(response?.needReset).toBe(false);
  });
});
