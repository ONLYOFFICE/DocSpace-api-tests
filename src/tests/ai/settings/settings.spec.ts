import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

// Only getAiSettings is exercised: the AI gateway disables manual configuration
// of vectorization / web-search providers (those endpoints return 403), so the
// set/get vectorization and web-search tests were removed.
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
