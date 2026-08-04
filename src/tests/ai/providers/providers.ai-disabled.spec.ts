import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiBuiltinProviderType } from "@onlyoffice/docspace-api-sdk";
import { ATTACKER_HOST, expectNotProxied } from "@/src/helpers/ssrf-payloads";

// SKIPPED: the whole provider area was removed from the product. Every
// /api/2.0/ai/providers* route answers 404 — manual providers were replaced by
// gateway profiles (GET /api/2.0/ai/profiles/list), see src/helpers/ai-agent-chat.ts.
//
// Kept rather than deleted because the feature may come back. If it does, drop
// the .skip on the describes below and re-verify against the live contract —
// these assertions were written for the pre-rewrite API and the error envelope
// has changed since ({"error":"..."}, no statusCode / error.message).
//
// Note this also parks the SSRF regression tests for the OpenAI proxy and the
// provider-URL surface. Both were already inert on the gateway build (404 / 403
// before any URL handling), so nothing reachable is left uncovered today.

const fakeProviderId = 1;

test.describe.skip("AI Providers - AI Disabled", () => {
  test("POST /api/2.0/ai/providers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.aiProfilesCreate({
      aiCreateProfileInput: {
        name: "test",
        key: "fake-key",
        providerType: AiBuiltinProviderType.Openaicompatible,
        baseUrl: "",
        modelId: "",
      },
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

    const { status } = await ownerApi.providers.aiProfilesDelete({
      body: String(fakeProviderId),
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

    const { status } = await ownerApi.providers.aiProfilesList();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/providers/available - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.aiProfilesList();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/providers/default - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.aiProfilesList();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/providers/:providerId/models - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.providers.aiProfilesListModels({
      profileId: String(fakeProviderId),
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

    const { status } = await ownerApi.providers.aiProfilesListProviderModels({
      aiProfilesListProviderModelsRequest: {
        providerType: AiBuiltinProviderType.Openaicompatible,
        baseUrl: "",
        apiKey: "",
      },
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

    const { status } = await ownerApi.providers.aiProfilesUpdate({
      aiProfile: {
        id: "1",
        name: "test",
        providerType: AiBuiltinProviderType.Openaicompatible,
        baseUrl: "",
        modelId: "",
      },
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

    const { status } = await ownerApi.providers.aiProfilesUpdate({
      aiProfile: {
        id: String(fakeProviderId),
        name: "test",
        providerType: AiBuiltinProviderType.Openaicompatible,
        baseUrl: "",
        modelId: "",
        key: "new-key",
      },
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
