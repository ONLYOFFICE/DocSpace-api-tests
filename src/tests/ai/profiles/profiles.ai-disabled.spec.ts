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

  test("POST /api/2.0/ai/profiles/create - the AI switch is its own gate, ahead of the read-only one", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Fixed alongside BUG 83112, `create` is now refused before provider-type
    // resolution even with AI on — by the read-only gate, since this profile
    // catalogue is gateway-managed (see profiles.spec.ts). What this test still
    // pins: the AI switch is a distinct, higher-priority gate rather than the
    // read-only one silently covering for it — disabling AI swaps the 403's
    // reason from "read-only" to "Forbidden", it does not just repeat the same
    // refusal for a different reason.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const unknownProvider = {
      name: "Autotest unknown provider",
      providerType: "totally-unknown",
      baseUrl: RESOLVABLE_NON_PROVIDER_URL,
      modelId: "m",
    };

    const before = await profiles.createProfile("owner", unknownProvider);
    expect(before.status).toBe(403);
    expect(before.error).toBe(
      "AI profiles are read-only on this portal (managed by the AI gateway)",
    );

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    const after = await profiles.createProfile("owner", unknownProvider);
    expect(after.status).toBe(403);
    expect(after.error, "a different gate refused this one").toBe("Forbidden");
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

test.describe("AI Profiles - AI Disabled, ordering and side effects", () => {
  test("GET|POST /api/2.0/ai/profiles/* - the AI switch is checked before a malformed id is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Control, with AI on: the same id is a 400 for the Owner, so a 403 below
    // can only come from the switch.
    expect((await profiles.getProfileById("owner", "not-a-guid")).status).toBe(
      400,
    );

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    for (const [label, call] of [
      ["get-by-id", profiles.getProfileById("owner", "not-a-guid")],
      ["list-models", profiles.listModels("owner", "not-a-guid")],
      ["test-connection", profiles.testConnection("owner", "not-a-guid")],
    ] as Array<[string, Promise<{ status: number }>]>) {
      const { status } = await call;
      expect(status, `${label} with AI access disabled`).toBe(403);
    }
  });

  test("GET|POST /api/2.0/ai/profiles/* - a missing required parameter is still a 400 while AI is off, a well-formed request is a 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The accepted convention of /ai/*: required-parameter checks run before the
    // AI switch (ai/assignments does the same), and unlike BUG 82971 they open no
    // outbound connection. What must never change is that a well-formed request
    // is refused.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    // Control: with AI on, the missing id is the same 400, so the 400s below
    // are the validation answer and not an artefact of the switch.
    const control = await profiles.rawGet(
      "owner",
      "/api/2.0/ai/profiles/get-by-id",
    );
    expect(control.status, "AI is on").toBe(400);

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    const refused: Array<[string, Promise<{ status: number }>]> = [
      ["get-by-id", profiles.getProfileById("owner", profile.id)],
      ["list-models", profiles.listModels("owner", profile.id)],
      ["test-connection", profiles.testConnection("owner", profile.id)],
    ];
    for (const [label, call] of refused) {
      const { status } = await call;
      expect(status, `${label} with a real id and AI access disabled`).toBe(
        403,
      );
    }

    const invalid: Array<[string, Promise<{ status: number }>]> = [
      [
        "get-by-id without an id",
        profiles.rawGet("owner", "/api/2.0/ai/profiles/get-by-id"),
      ],
      [
        "list-models without a profileId",
        profiles.rawGet("owner", "/api/2.0/ai/profiles/list-models"),
      ],
      ["test-connection without an id", profiles.testConnection("owner", {})],
    ];
    for (const [label, call] of invalid) {
      const { status } = await call;
      expect(status, `${label} with AI access disabled`).toBe(400);
    }
  });

  test("POST|PUT|DELETE /api/2.0/ai/profiles/* - writes refused while AI is off leave the catalogue exactly as it was", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const before = JSON.stringify(
      (await profiles.catalogue("owner")).sort((a, b) =>
        (a.id ?? "").localeCompare(b.id ?? ""),
      ),
    );
    const profile = AiProfiles.byCapabilities(
      JSON.parse(before),
      AI_CAPS.textVisionTools,
    );

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    const created = await profiles.createProfile("owner", {
      name: "Autotest while off",
      providerType: "onlyoffice",
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
    });
    const updated = await profiles.updateProfile("owner", {
      id: profile.id,
      name: "Autotest renamed while off",
      providerType: "onlyoffice",
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
    });
    const deleted = await profiles.deleteProfile("owner", profile.id);

    // The catalogue can only be read with the switch back on, so look afterwards.
    const { enabled: reEnabled } = await setPortalAiAccess(ownerApi, true);
    expect(reEnabled).toBe(true);
    const after = JSON.stringify(
      (await profiles.catalogue("owner")).sort((a, b) =>
        (a.id ?? "").localeCompare(b.id ?? ""),
      ),
    );
    expect(after, "nothing changed while AI was off").toBe(before);

    expect(created.status, "create").toBe(403);
    expect(updated.status, "update").toBe(403);
    expect(deleted.status, "delete").toBe(403);
  });
});
