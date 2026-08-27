import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { RESOLVABLE_NON_PROVIDER_URL } from "@/src/helpers/ssrf-payloads";
import config from "@/config";

// The profile routes with the portal AI switch (PUT /settings/ai-access) off.
//
// `GET /ai/profiles/list` under the switch is already covered by the providers
// suite; this file takes the rest of the family, and the one route that ignores
// the switch entirely.

test.describe("AI Profiles - AI Disabled", () => {
  test("GET|POST|PUT|DELETE /api/2.0/ai/profiles/* - the profile routes return 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    // Reading the switch back matters: a failed disable turns every 403 below
    // into a false positive.
    const { writeStatus, readStatus, enabled } = await setPortalAiAccess(
      ownerApi,
      false,
    );
    expect(writeStatus).toBe(200);
    expect(readStatus).toBe(200);
    expect(enabled).toBe(false);

    // list-models is deliberately absent: it answers the provider error rather
    // than the gate, which is its own defect below.
    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["get-by-id", profiles.getProfileById("owner", profile.id)],
      ["test-connection", profiles.testConnection("owner", profile.id)],
      [
        "create",
        profiles.createProfile("owner", {
          name: "Autotest",
          providerType: "deepseek",
          baseUrl: "https://api.deepseek.com",
          key: config.DEEPSEEK_API_KEY,
          modelId: "deepseek-v4-flash",
        }),
      ],
      [
        "update",
        profiles.updateProfile("owner", {
          id: profile.id,
          name: "Autotest renamed",
          providerType: "onlyoffice",
          baseUrl: profile.baseUrl,
          modelId: profile.modelId,
        }),
      ],
      ["delete", profiles.deleteProfile("owner", profile.id)],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} with AI access disabled`).toBe(403);
    }
  });

  test("BUG 82971 FIXED: GET /api/2.0/ai/profiles/list-models - the AI switch is checked before the provider is dialled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Used to answer the provider-key failure ahead of the role check — the
    // one route in this controller that reached outward before refusing a
    // disabled portal, unlike its neighbours get-by-id and test-connection
    // (sweep above) and create (test below). Now refuses first, like them.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    const { status, error } = await profiles.listModels("owner", profile.id);
    expect(status, "the AI switch is checked first").toBe(403);
    expect(error).toBe("Forbidden");
  });

  test("POST /api/2.0/ai/profiles/create - the AI switch is checked before the provider type is resolved", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // With AI on, an unknown provider type is answered as a validation error
    // (200 + success:false) rather than by the read-only gate — see
    // profiles.spec.ts. So if the switch were checked last, this body would keep
    // producing that soft error after the disable.
    //
    // The baseUrl has to resolve for that to be true: the baseUrl guard runs ahead
    // of provider resolution, so an `.invalid` host answers 400 both before and
    // after the disable and the comparison would prove nothing about the switch.
    const unknownProvider = {
      name: "Autotest unknown provider",
      providerType: "totally-unknown",
      baseUrl: RESOLVABLE_NON_PROVIDER_URL,
      modelId: "m",
    };

    const before = await profiles.createProfile("owner", unknownProvider);
    expect(before.status).toBe(200);
    expect(before.data?.success).toBe(false);

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    // It does not: the AI switch wins over body validation on this route, unlike
    // text-to-docx where validation runs first.
    const { status } = await profiles.createProfile("owner", unknownProvider);
    expect(status).toBe(403);
  });

  test("BUG 82810: POST /api/2.0/ai/profiles/list-provider-models - provider discovery still runs when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    // The switch is being enforced on the neighbouring route, so this is not
    // "the disable did not take effect".
    const gated = await profiles.getProfileById("owner", profile.id);
    expect(gated.status, "get-by-id is gated").toBe(403);

    const { status, data } = await profiles.listProviderModels("owner", {
      providerType: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: config.DEEPSEEK_API_KEY,
    });

    // The portal still contacted the provider on a portal where AI is switched
    // off, and still handed back its catalogue.
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);

    test.fail();
    expect(
      status,
      "provider discovery must be refused when AI access is disabled",
    ).toBe(403);
  });
});
