import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { ATTACKER_HOST, expectNotProxied } from "@/src/helpers/ssrf-payloads";

const fakeProviderId = 1;

test.describe("AI Providers - AI Disabled", () => {
  test("POST /api/2.0/ai/providers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.addProvider({
      createProviderRequestDto: { title: "test", key: "fake-key" },
    });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/providers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.deleteProviders({
      removeProviderRequestDto: { ids: new Set([fakeProviderId]) },
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/providers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.getProviders();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/providers/available - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.getAvailableProviders();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/providers/default - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.getDefaultProvider();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/providers/:providerId/models - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.getProviderModels({
      providerId: fakeProviderId,
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/providers/preview - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.previewProviderModels({
      previewProviderModelsRequestDto: { key: null },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/providers/default - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.setDefaultProvider({
      setDefaultProviderRequestDto: { defaultModel: null },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/providers/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.updateProvider({
      id: fakeProviderId,
      updateProviderBody: { key: "new-key" },
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/openai/:providerId/v1/* - proxy returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    // With AI disabled the proxy must refuse before touching any provider. Sent
    // with an absolute URL so a regression cannot both bypass the AI gate AND
    // proxy to the attacker; either way no canary content may appear. A live
    // proxy should return 403; this inert build returns 404 (route not matched).
    const result = await apiSdk.aiOpenAiProxyRaw(
      "owner",
      fakeProviderId,
      `http://${ATTACKER_HOST}:9998/ssrf-test`,
    );

    expectNotProxied(result, [403, 404]);
  });
});
