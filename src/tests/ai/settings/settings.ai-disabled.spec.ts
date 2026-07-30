import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiSettings } from "@/src/helpers/ai-settings";

// With portal AI access off the settings-side routes answer 403. One notably
// does NOT: `/ai/config/user`, a per-user UI preference, stays 200. It is
// pinned below so the gap is visible rather than assumed.

test.describe("AI Settings - AI Disabled", () => {
  test("GET /api/2.0/ai/config/vectorization - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiSettings.getVectorizationSettings("owner");

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/config/vectorization - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiSettings.setVectorizationSettings("owner", {
      key: null,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/web-search/is-configured - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiSettings.webSearchIsConfigured("owner");

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/web-search/get-active-config - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiSettings.webSearchActiveConfig("owner");

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiSettings.textToDocx("owner", {
      title: "Exported AI Message",
      content: "hello",
      folderId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/config/user - stays readable when AI access is disabled", async ({
    apiSdk,
  }) => {
    // Deliberately pinned: this is a per-user UI preference, not an AI call,
    // and it is NOT gated by the portal AI switch.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { data, status } = await aiSettings.getUserConfig("owner");

    expect(status).toBe(200);
    expect(data?.response?.chatRecommendedModelVisible).toBe(true);
  });
});
