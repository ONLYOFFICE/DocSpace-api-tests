import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("AI Settings - AI Disabled", () => {
  test("GET /api/2.0/ai/settings/vectorization - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.aiSettings.getVectorizationSettings();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/settings/web-search - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.aiSettings.getWebSearchSettings();

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/settings/vectorization - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.aiSettings.setVectorizationSettings({
      setEmbeddingConfigRequestBody: { key: null },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/settings/web-search - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.aiSettings.setWebSearchSettings({
      setWebSearchSettingsRequestBody: { enabled: false },
    });

    expect(status).toBe(403);
  });
});
