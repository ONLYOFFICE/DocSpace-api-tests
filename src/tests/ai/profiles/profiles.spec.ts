import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import {
  unsafeSchemeUrls,
  nonResolvingAttackerUrls,
  ATTACKER_HOST,
} from "@/src/helpers/ssrf-payloads";
import config from "@/config";

// An AI "profile" is the provider + model + key + base URL bundle of section 4.
//
//   GET    /api/2.0/ai/profiles/list
//   GET    /api/2.0/ai/profiles/get-by-id?id=
//   GET    /api/2.0/ai/profiles/list-models?profileId=
//   POST   /api/2.0/ai/profiles/list-provider-models
//   POST   /api/2.0/ai/profiles/test-connection
//   POST   /api/2.0/ai/profiles/create
//   PUT    /api/2.0/ai/profiles/update
//   DELETE /api/2.0/ai/profiles/delete
//
// The shape of section 4 assumes a portal where profiles are created by hand.
// This build is not that portal: it runs the built-in "ONLYOFFICE AI" gateway,
// which ships a fixed catalogue and answers 403 to create / update / delete. So
// the create-validation matrix of 4.1 ("missing provider", "empty key",
// "duplicate name", "very long name", …) cannot be exercised — there is no
// create to validate. What is testable, and is what this spec pins, is:
//
//   * the catalogue contract and its capability metadata (4.2),
//   * the read routes, including two id-handling bugs,
//   * the 403 gate, and the fact that provider-type resolution runs BEFORE it,
//   * `list-provider-models`, the one route that really talks to a provider and
//     therefore carries the whole of 4.2's key/URL error contract.
//
// `list-provider-models` is also a live egress surface: it dials any http(s) URL
// the caller supplies. The runnable payloads here stay on non-resolving
// RFC 6761 `.invalid` hosts per the policy in ssrf-payloads.ts.

test.describe("AI Profiles - catalogue", () => {
  test("GET /api/2.0/ai/profiles/list - the catalogue carries capability metadata for every model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const { status, data } = await profiles.listProfiles("owner");

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);

    for (const profile of data!) {
      expect(profile.id, "profile id").toBeTruthy();
      expect(profile.name, "profile name").toBeTruthy();
      expect(profile.modelId, "profile modelId").toBeTruthy();
      expect(profile.providerType).toBe("onlyoffice");
      expect(
        typeof profile.capabilities,
        `${profile.modelId} capabilities`,
      ).toBe("number");
      expect(typeof profile.canUseTool, `${profile.modelId} canUseTool`).toBe(
        "boolean",
      );
      expect(typeof profile.reasoning, `${profile.modelId} reasoning`).toBe(
        "boolean",
      );
    }

    // Section 4.2 wants each of text / vision / image-generation / tools /
    // reasoning to be distinguishable. On this catalogue that distinction is the
    // `capabilities` bitmask plus `canUseTool`, and all three classes are present.
    const bitmasks = new Set(data!.map((profile) => profile.capabilities));
    expect(bitmasks, "text+vision+tools models are offered").toContain(
      AI_CAPS.textVisionTools,
    );
    expect(bitmasks, "text+tools models are offered").toContain(
      AI_CAPS.textTools,
    );
    expect(bitmasks, "image-generation models are offered").toContain(
      AI_CAPS.imageOnly,
    );

    // An image-generation profile cannot call tools; a text one can. If this ever
    // flips, every capability-based assignment test below is testing nothing.
    const image = AiProfiles.byCapabilities(data!, AI_CAPS.imageOnly);
    const text = AiProfiles.byCapabilities(data!, AI_CAPS.textVisionTools);
    expect(image.canUseTool).toBe(false);
    expect(text.canUseTool).toBe(true);
  });

  test("GET /api/2.0/ai/profiles/list - no profile hands out a provider secret", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    // The gateway profiles carry the literal placeholder "onlyoffice" in `key`,
    // which is the whole point of the check: what must never appear is an actual
    // upstream credential.
    for (const profile of catalogue) {
      expect(profile.key, `${profile.modelId} key`).toBe("onlyoffice");
      expect(
        JSON.stringify(profile),
        `${profile.modelId} must not carry a real API key`,
      ).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
    }
  });

  test("GET /api/2.0/ai/profiles/get-by-id - reads one profile back by id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const expected = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const { status, data } = await profiles.getProfileById(
      "owner",
      expected.id,
    );

    expect(status).toBe(200);
    expect(data?.id).toBe(expected.id);
    expect(data?.name).toBe(expected.name);
    expect(data?.modelId).toBe(expected.modelId);
    expect(data?.capabilities).toBe(expected.capabilities);
    expect(data?.canUseTool).toBe(expected.canUseTool);
  });

  test("GET /api/2.0/ai/profiles/get-by-id - a malformed id is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    const { status } = await profiles.getProfileById("owner", "not-a-guid");
    expect(status).toBe(400);

    const { status: emptyStatus } = await profiles.getProfileById("owner", "");
    expect(emptyStatus).toBe(400);
  });
});

test.describe("AI Profiles - catalogue bugs", () => {
  test("BUG 82818: GET /api/2.0/ai/profiles/get-by-id - an unknown profile id is a 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Well-formed but never issued — a UUIDv7 from a different portal's run.
    const { status, error } = await profiles.getProfileById(
      "owner",
      "019fcc1d-2c4d-7557-b8d2-6b4f1be1b212",
    );

    expect(status, "an unknown profile id must be 404").toBe(404);
    // It used to answer 200 with a null body, which a caller could not tell from
    // "a profile with no fields".
    expect(error, "and say so").toBe("Profile not found");
  });

  test("BUG 82821: GET /api/2.0/ai/profiles/get-by-id - the response leaks the gateway's internal address", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const listed = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    // `list` publishes the portal's own public address for the same profile...
    expect(listed.baseUrl).toBe(apiSdk.tokenStore.portalBaseUrl);

    const { status, data } = await profiles.getProfileById("owner", listed.id);
    expect(status).toBe(200);

    // ...while `get-by-id` hands back the cluster-internal service address of the
    // AI container, which section 22 says must not leave the backend.
    expect(data?.baseUrl, "the address get-by-id reports").toBe(
      "http://ai:5050/api/2.0/ai/gateway",
    );

    test.fail();
    expect(
      data?.baseUrl,
      "get-by-id must not expose an internal service address",
    ).toBe(listed.baseUrl);
  });

  test("BUG 82823: GET /api/2.0/ai/profiles/list-models - a valid profile id no longer crashes", async ({
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

    const malformed = await profiles.listModels("owner", "not-a-guid");
    expect(malformed.status).toBe(400);

    // Used to be a 500 for any real profile id. It is now a client error naming
    // the reason: on the "ONLYOFFICE AI" gateway a profile carries no provider
    // key of its own, so the outbound listing has nothing to authenticate with.
    // The 200 path is therefore not reachable from a gateway portal and is not
    // asserted here.
    const { status, error } = await profiles.listModels("owner", profile.id);
    expect(status, "listing a profile's models must not crash").toBe(400);
    expect(error).toBe("Invalid API key for the AI provider");
  });
});

test.describe("AI Profiles - the gateway catalogue is read-only", () => {
  test("POST|PUT|DELETE /api/2.0/ai/profiles - Owner cannot create, update or delete a profile", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const existing = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    await test.step("create a cloud-provider profile with a valid key", async () => {
      const { status } = await profiles.createProfile("owner", {
        name: "Autotest DeepSeek",
        providerType: "deepseek",
        baseUrl: "https://api.deepseek.com",
        key: config.DEEPSEEK_API_KEY,
        modelId: "deepseek-v4-flash",
        isCloudProvider: true,
      });
      expect(status).toBe(403);
    });

    await test.step("create a profile on the gateway provider itself", async () => {
      const { status } = await profiles.createProfile("owner", {
        name: "Autotest gateway clone",
        providerType: "onlyoffice",
        baseUrl: existing.baseUrl,
        modelId: existing.modelId,
      });
      expect(status).toBe(403);
    });

    await test.step("rename an existing profile", async () => {
      const { status } = await profiles.updateProfile("owner", {
        id: existing.id,
        name: "Autotest renamed",
        providerType: "onlyoffice",
        baseUrl: existing.baseUrl,
        modelId: existing.modelId,
      });
      expect(status).toBe(403);
    });

    await test.step("delete an existing profile", async () => {
      const { status } = await profiles.deleteProfile("owner", existing.id);
      expect(status).toBe(403);
    });

    // The refusals were real refusals: the catalogue is untouched.
    const after = await profiles.catalogue("owner");
    expect(after.map((profile) => profile.id).sort()).toEqual(
      catalogue.map((profile) => profile.id).sort(),
    );
    const stillThere = after.find((profile) => profile.id === existing.id);
    expect(stillThere?.name).toBe(existing.name);
  });

  test("POST /api/2.0/ai/profiles/create - an unknown provider type is reported as a validation error, not as the 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Provider-type resolution runs before the read-only gate, which is the only
    // way any of section 4.1's create validation is observable on this build.
    const { status, data } = await profiles.createProfile("owner", {
      name: "Autotest unknown provider",
      providerType: "totally-unknown",
      baseUrl: "https://example.invalid",
      modelId: "m",
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe("Unknown provider type: totally-unknown");

    const { status: missing, data: missingData } = await profiles.createProfile(
      "owner",
      { name: "Autotest no provider" },
    );
    expect(missing).toBe(200);
    expect(missingData?.success).toBe(false);
    expect(missingData?.error?.message).toBe(
      "Unknown provider type: undefined",
    );
  });

  test("DELETE /api/2.0/ai/profiles/delete - the id is the whole body", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const existing = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    // A `{profileId}` wrapper never reaches the read-only gate — the id is not
    // bound at all, so this is 400 rather than the 403 a real delete gets.
    const wrapped = await profiles.deleteProfile("owner", {
      profileId: existing.id,
    });
    expect(wrapped.status).toBe(400);
    expect(wrapped.error).toBe("id required");

    const bare = await profiles.deleteProfile("owner", existing.id);
    expect(bare.status).toBe(403);
  });
});

test.describe("AI Profiles - test-connection", () => {
  test("POST /api/2.0/ai/profiles/test-connection - the body is a bare profile id", async ({
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

    // Both the bare id and a `{profileId}` wrapper bind; the result is the
    // `{field, message}` pair of section 4.2, NOT a `success` envelope.
    for (const body of [profile.id, { profileId: profile.id }]) {
      const { status, data } = await profiles.testConnection("owner", body);
      expect(status).toBe(200);
      expect(data?.field).toBe("key");
      expect(typeof data?.message).toBe("string");
    }
  });

  test("POST /api/2.0/ai/profiles/test-connection - a request with no profile id is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await profiles.testConnection("owner", {
      name: "Autotest",
      providerType: "deepseek",
      baseUrl: "https://api.deepseek.com",
      key: config.DEEPSEEK_API_KEY,
      modelId: "deepseek-v4-flash",
    });

    expect(status).toBe(400);
    expect(error).toBe("profileId required");
  });
});

test.describe("AI Profiles - provider model discovery", () => {
  test("POST /api/2.0/ai/profiles/list-provider-models - a valid key returns the provider's models with capability metadata", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const { status, data } = await profiles.listProviderModels("owner", {
      providerType: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: config.DEEPSEEK_API_KEY,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);

    for (const model of data!) {
      expect(model.id, "model id").toBeTruthy();
      expect(model.provider).toBe("deepseek");
      expect(typeof model.capabilities, `${model.id} capabilities`).toBe(
        "number",
      );
      expect(typeof model.reasoning, `${model.id} reasoning`).toBe("boolean");
    }
  });

  test("POST /api/2.0/ai/profiles/list-provider-models - an empty catalogue is returned as an empty list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const gateway = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    // The gateway provider answers the discovery call but publishes nothing
    // through it — the "empty model list is handled" case of section 4.2.
    const { status, data } = await profiles.listProviderModels("owner", {
      providerType: "onlyoffice",
      baseUrl: gateway.baseUrl,
      apiKey: "onlyoffice",
    });

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  test("POST /api/2.0/ai/profiles/list-provider-models - an invalid key is reported against the key", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const { status, error } = await profiles.listProviderModels("owner", {
      providerType: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-definitely-not-a-real-key",
    });

    expect(status).toBe(400);
    expect(error).toBe("Invalid API key for the AI provider");
  });

  test("POST /api/2.0/ai/profiles/list-provider-models - a malformed base URL is rejected before any connection", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await profiles.listProviderModels("owner", {
      providerType: "deepseek",
      baseUrl: "not-a-url",
      apiKey: config.DEEPSEEK_API_KEY,
    });

    expect(status).toBe(400);
    expect(error).toBe("baseUrl is not a valid URL");
  });

  for (const { name, url } of unsafeSchemeUrls) {
    test(`POST /api/2.0/ai/profiles/list-provider-models - a ${name}: base URL is refused`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const { status, data } = await profiles.listProviderModels("owner", {
        providerType: "deepseek",
        baseUrl: url,
        apiKey: config.DEEPSEEK_API_KEY,
      });

      // Only http(s) may ever reach a provider, and the scheme has to be refused
      // by validation rather than by a failed connection.
      expect(status).toBe(400);
      expect(Array.isArray(data)).toBe(false);
    });
  }

  test("POST /api/2.0/ai/profiles/list-provider-models - the endpoint dials any caller-supplied host", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // 502 "unreachable" is the tell that the request was actually attempted: the
    // host is a non-resolving `.invalid` name, so a reply can only come from a
    // failed outbound lookup. There is no allow-list in front of this route —
    // which is what makes the loopback / metadata cases below meaningful, and why
    // they must not be run against shared infrastructure.
    const { status, error } = await profiles.listProviderModels("owner", {
      providerType: "deepseek",
      baseUrl: `http://${ATTACKER_HOST}:9999`,
      apiKey: config.DEEPSEEK_API_KEY,
    });

    expect(status).toBe(502);
    expect(error).toBe(
      "The AI provider is unreachable — check the base URL and that the service is running",
    );
  });

  for (const { name, url } of nonResolvingAttackerUrls) {
    test(`POST /api/2.0/ai/profiles/list-provider-models - ${name} does not return a model list`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const { status, data } = await profiles.listProviderModels("owner", {
        providerType: "deepseek",
        baseUrl: url,
        apiKey: config.DEEPSEEK_API_KEY,
      });

      // Whether the URL is rejected up front (400) or attempted and unreachable
      // (502), the invariant is that no attacker-controlled host ever gets to
      // supply this portal with a model catalogue.
      expect(status).not.toBe(200);
      expect(Array.isArray(data)).toBe(false);
    });
  }

  // ------------------------------------------------------------------------
  // Loopback / private / link-local / metadata targets (BUG 83005).
  //
  // BUG 83005 confirmed this route has NO pre-connection egress guard: a closed
  // loopback port answers 502 (connection refused) and a filtered private host
  // hangs for the full 30s connect timeout, so `forbiddenSpecialUrls` really are
  // dialled rather than rejected. There is deliberately no test here — running
  // those payloads on shared infrastructure would connect to internal addresses
  // (and the metadata targets could return credentials). The safe half of the
  // egress contract is already covered by the `nonResolvingAttackerUrls` loop
  // above, which never leaves a `.invalid` host.
  // ------------------------------------------------------------------------
});
