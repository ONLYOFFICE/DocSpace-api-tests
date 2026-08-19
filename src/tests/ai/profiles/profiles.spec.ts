import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiProfiles,
  AI_CAPS,
  AI_CAP_BITS,
  AI_CAP_KNOWN_BITS,
  AiProviderModel,
} from "@/src/helpers/ai-profiles";
import { AiBuiltinProviderType } from "@onlyoffice/docspace-api-sdk";
import {
  unsafeSchemeUrls,
  nonResolvingAttackerUrls,
  ATTACKER_HOST,
  RESOLVABLE_NON_PROVIDER_URL,
  RESOLVABLE_UNREACHABLE_URL,
  PROVIDER_UNREACHABLE_ERROR,
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
// `list-provider-models` is also a live egress surface, though a narrower one
// than it used to be: since 2026-08-18 both it and `create` refuse a `baseUrl`
// that does not resolve or points at a private/loopback/metadata address, BEFORE
// opening a socket — see the guard's contract in ssrf-payloads.ts. Any *public*
// host the caller supplies is still dialled.
//
// That guard is why the tests below reach the provider probe through the
// resolvable `example.com` rather than through a `.invalid` name: on these two
// routes an `.invalid` host now stops at the guard and never exercises provider
// resolution, the read-only gate, or the probe at all. Payloads whose whole point
// IS to be refused still use `.invalid`, per the policy in ssrf-payloads.ts.

// Section 4 states the profile form carries no generation tuning: no
// temperature, no token limit. `reasoning` and `capabilities` are model
// *capability* metadata and are expected — these are the tuning knobs that must
// not be there.
const GENERATION_KNOBS = [
  "temperature",
  "topP",
  "top_p",
  "topK",
  "top_k",
  "maxTokens",
  "max_tokens",
  "maxOutputTokens",
  "max_output_tokens",
  "frequencyPenalty",
  "frequency_penalty",
  "presencePenalty",
  "presence_penalty",
  "stop",
  "stopSequences",
  "stop_sequences",
  "seed",
] as const;

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

  test("GET /api/2.0/ai/profiles/list, get-by-id - a profile carries no generation-tuning fields", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    // The create side of this claim is unobservable here (create is 403, below),
    // so the guard sits on the read side — the same DTO the composer binds to and
    // the only place such a field could surface. The day one appears, section 4
    // is out of date and every "the model answered X" test in this suite has
    // acquired a hidden variable.
    const expectNoKnobs = (profile: Record<string, unknown>, where: string) => {
      const present = GENERATION_KNOBS.filter((knob) => knob in profile);
      expect(present, `${where} must expose no generation tuning`).toEqual([]);
    };

    for (const profile of catalogue) {
      expectNoKnobs(profile, `list: ${profile.modelId}`);
    }

    const one = AiProfiles.byCapabilities(catalogue, AI_CAPS.textVisionTools);
    const { status, data } = await profiles.getProfileById("owner", one.id);
    expect(status).toBe(200);
    expectNoKnobs(data!, `get-by-id: ${one.modelId}`);

    // The expansion behind an assignment is what actually configures a call to
    // the provider, so it is checked too rather than only the catalogue view.
    const resolved = await profiles.resolveForAction("owner", "Chat");
    expect(resolved.status).toBe(200);
    expect(
      resolved.data?.profile?.modelId,
      "the Chat action resolves",
    ).toBeTruthy();
    expectNoKnobs(resolved.data!.profile!, "resolve-for-action: Chat");

    // Positive control: the same objects DO carry the capability metadata, so an
    // empty `present` list above is not just an empty profile object.
    expect(typeof data?.capabilities).toBe("number");
    expect(typeof resolved.data?.profile?.capabilities).toBe("number");
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
    //
    // The host has to resolve to get this far: the baseUrl guard runs before
    // provider resolution, so an `.invalid` name would be answered 400 "baseUrl
    // host could not be resolved" and this test would be pinning the guard
    // instead of the validation error it is about.
    const { status, data } = await profiles.createProfile("owner", {
      name: "Autotest unknown provider",
      providerType: "totally-unknown",
      baseUrl: RESOLVABLE_NON_PROVIDER_URL,
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

// Section 4's "about 17 providers are supported (OpenAI, Anthropic, Google,
// Mistral, local Ollama / LM Studio / GPT4All, …)".
//
// On a gateway portal no profile can be created, so the created bundle is not
// observable — but the provider list is, and through `create` of all places. What
// the run below establishes is the order of the three things `create` does:
//
//   1. resolve the provider type — an unknown name is HTTP 200 +
//      `{success:false, error:{message:"Unknown provider type: …"}}`, and no
//      built-in name ever answers that. This is the oracle for the 17.
//   2. probe the provider with the caller's baseUrl and key. Against a host that
//      resolves but is not a model server, every built-in transport stops here
//      with a `{field:"key"|"url"}` complaint — still HTTP 200 + success:false.
//   3. only then the gateway's read-only 403 (the deepseek step of the read-only
//      test above reaches it, because api.deepseek.com answers the probe).
//
// So the gate is LAST, not first, which is the bug two tests down: a route that
// can never create anything still spends an outbound request on a caller-supplied
// host.
//
// Step 0, since 2026-08-18, is the baseUrl egress guard, and it is what forced
// these bodies onto a resolvable host: it refuses an unresolvable or private
// `baseUrl` with a 400 before step 1 runs, so the `.invalid` name these tests
// used to carry never reached provider resolution and turned the whole block into
// a test of the guard. See ssrf-payloads.ts.
//
// The names are read out of the SDK enum instead of being retyped, so a provider
// dropped or renamed in the API breaks these tests rather than quietly shrinking
// the matrix.
const BUILT_IN_PROVIDER_TYPES: string[] = Object.values(AiBuiltinProviderType);

/**
 * `external` has no transport of its own — it delegates every request to the
 * host and parses the reply with the provider named in `basedOn`. It is the one
 * entry whose resolution cannot be read off `create` at all: it answers 500. See
 * the bug at the bottom of this block.
 */
const EXTERNAL_PROVIDER_TYPE = "external";

const TRANSPORT_PROVIDER_TYPES = BUILT_IN_PROVIDER_TYPES.filter(
  (providerType) => providerType !== EXTERNAL_PROVIDER_TYPE,
);

/** Names from the section-4 prose and plausible near-misses. None is an identifier. */
const NON_IDENTIFIERS = [
  "google",
  "gemini",
  "lmstudio",
  "open-ai",
  "gpt-4all",
  "local",
];

/**
 * A create body that gets as far as the provider probe and fails there, so no
 * profile can result — see the policy note above.
 *
 * The host resolves on purpose. It has to: the baseUrl guard is step 0 and would
 * refuse an unresolvable one before the provider type is even looked at. The key
 * is bogus and the host is not a model server, so the probe cannot succeed.
 */
const probedProfile = (providerType: string) => ({
  name: `Autotest ${providerType}`,
  providerType,
  baseUrl: RESOLVABLE_NON_PROVIDER_URL,
  key: "sk-autotest-not-a-real-key",
  modelId: "autotest-model",
});

test.describe("AI Profiles - the built-in provider types", () => {
  test("POST /api/2.0/ai/profiles/create - every built-in provider type is resolved by the backend", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const before = await profiles.catalogue("owner");

    // The count section 4 quotes as "about 17", pinned so the prose and the API
    // cannot drift apart in silence.
    expect(BUILT_IN_PROVIDER_TYPES, "the built-in provider list").toHaveLength(
      17,
    );

    const outcomes: Array<{ type: string; status: number; message?: string }> =
      [];

    for (const providerType of TRANSPORT_PROVIDER_TYPES) {
      const { status, data } = await profiles.createProfile(
        "owner",
        probedProfile(providerType),
      );
      outcomes.push({
        type: providerType,
        status,
        message: data?.error?.message,
      });
    }

    // The claim: all sixteen transports are still known to the backend. Anything
    // that fell out of the API reports itself by name here.
    const unresolved = outcomes.filter((outcome) =>
      (outcome.message ?? "").startsWith("Unknown provider type"),
    );
    expect(
      unresolved.map((outcome) => outcome.type),
      "these provider types are no longer known to the backend",
    ).toEqual([]);

    // Each one got past resolution into the part of `create` that is specific to
    // it, which is what "resolved" means on this route. There are two shapes that
    // count, and both are the opposite of a plumbing 400 or a crash:
    //
    //   * the provider probe ran and refused — a soft 200 naming the field it
    //     blames (`key` for the cloud transports, `url` for the local ones), or
    //   * the probe was satisfied and the read-only gate refused instead — a hard
    //     403, which proves resolution more strongly than the soft error does.
    //     `stabilityai` is the one transport that lands here today.
    const unexpected = outcomes.filter(
      (outcome) =>
        outcome.status !== 403 && !(outcome.status === 200 && outcome.message),
    );
    expect(
      unexpected,
      "a resolved provider type is either probed and refused, or gated",
    ).toEqual([]);

    // Sixteen refusals were sixteen refusals.
    const after = await profiles.catalogue("owner");
    expect(after.map((profile) => profile.id).sort()).toEqual(
      before.map((profile) => profile.id).sort(),
    );
  });

  test("POST /api/2.0/ai/profiles/create - a provider named the way section 4 spells it is not an identifier", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Negative control for the test above: reaching the provider probe has to
    // mean "this name resolved", not "every name gets that far". Google is
    // `genai` and LM Studio is `lm-studio`, so the human-readable names of
    // section 4 must NOT bind.
    for (const providerType of NON_IDENTIFIERS) {
      const { status, data } = await profiles.createProfile(
        "owner",
        probedProfile(providerType),
      );

      expect(status, `${providerType} is not a provider identifier`).toBe(200);
      expect(data?.success).toBe(false);
      expect(data?.error?.message).toBe(
        `Unknown provider type: ${providerType}`,
      );
    }
  });

  test("BUG 83112: POST /api/2.0/ai/profiles/create - the provider is dialled before the read-only gate refuses the request", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // The tell is that the portal hands back CONTENT it could only have fetched
    // from the caller's host: lm-studio reports the probe failure by quoting the
    // upstream reply, and the reply is example.com's own page. A body that
    // contains "Example Domain" cannot have been produced locally — the portal
    // made the request itself, on a route that cannot create a profile under any
    // circumstances.
    //
    // This replaces the old "Failed to connect" tell, which was measured on an
    // `.invalid` host and is no longer reachable: the baseUrl guard now refuses an
    // unresolvable host with a 400 before the provider is dialled at all. Egress to
    // a resolvable public host is not guarded, so the bug itself is unchanged.
    const dialled = await profiles.createProfile(
      "owner",
      probedProfile("lm-studio"),
    );
    expect(dialled.data?.success).toBe(false);
    expect(
      dialled.data?.error?.message,
      "the portal fetched the caller's host and quoted the reply back",
    ).toContain("Example Domain");

    // Positive control that the gate does exist for this exact body shape: swap
    // the caller's host for one that answers the probe and the same call is
    // refused with 403 (same as the deepseek step of the read-only test above).
    const gated = await profiles.createProfile("owner", {
      name: "Autotest gate control",
      providerType: "deepseek",
      baseUrl: "https://api.deepseek.com",
      key: config.DEEPSEEK_API_KEY,
      modelId: "deepseek-v4-flash",
    });
    expect(gated.status, "a reachable provider hits the read-only gate").toBe(
      403,
    );

    test.fail();
    expect(
      dialled.status,
      "the read-only gate must refuse before the provider is dialled",
    ).toBe(403);
  });

  test("BUG 83114: POST /api/2.0/ai/profiles/create - the `external` provider type answers 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // The seventeenth built-in type crashes the route instead of answering it.
    // Nothing distinguishes it from a typo for the caller: there is no
    // `success:false`, no message, and no way to tell whether the name was even
    // recognised. A 400 naming what the body is missing is the answer the route
    // owes the caller instead of a crash.
    const bare = await profiles.createProfile(
      "owner",
      probedProfile(EXTERNAL_PROVIDER_TYPE),
    );
    expect(bare.data?.error?.message, "no reason is reported").toBeUndefined();

    // `basedOn` is the inner provider `external` parses replies with, so a missing
    // one is the obvious suspect — it makes no difference.
    const withBasedOn = await profiles.createProfile("owner", {
      ...probedProfile(EXTERNAL_PROVIDER_TYPE),
      basedOn: "openai",
    });
    expect(withBasedOn.status, "supplying basedOn does not help").toBe(
      bare.status,
    );

    test.fail();
    expect(bare.status, "a built-in provider type must not crash").toBe(400);
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

    // 502 "unreachable" is the tell that the connection was actually attempted:
    // the host resolves, so the only way to learn that its port does not answer is
    // to have tried it.
    //
    // The guard in front of this route filters by ADDRESS, not by allow-list: it
    // refuses what cannot resolve and what is private, and lets every other public
    // host through to be dialled. So a caller still chooses who this portal talks
    // to, within the public internet.
    const { status, error } = await profiles.listProviderModels("owner", {
      providerType: "deepseek",
      baseUrl: RESOLVABLE_UNREACHABLE_URL,
      apiKey: config.DEEPSEEK_API_KEY,
    });

    expect(status).toBe(502);
    expect(error).toBe(PROVIDER_UNREACHABLE_ERROR);

    // The other half of the guard's shape, and the reason the loopback / metadata
    // cases below are no longer reachable: an unresolvable host is refused up
    // front, with an address complaint rather than a connection one.
    const unresolvable = await profiles.listProviderModels("owner", {
      providerType: "deepseek",
      baseUrl: `http://${ATTACKER_HOST}:9999`,
      apiKey: config.DEEPSEEK_API_KEY,
    });
    expect(unresolvable.status, "an unresolvable host never gets dialled").toBe(
      400,
    );
    expect(unresolvable.error).toBe("baseUrl host could not be resolved");
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
  // Loopback / private / link-local / metadata targets (BUG 83005 — FIXED).
  //
  // BUG 83005 was filed because this route had NO pre-connection egress guard: a
  // closed loopback port answered 502 (connection refused) and a filtered private
  // host hung for the full 30s connect timeout, which proved the addresses were
  // dialled rather than rejected. Running them was therefore unsafe on shared
  // infrastructure and the case was left untested.
  //
  // Measured 2026-08-18: the guard now exists and refuses these addresses BEFORE
  // opening a socket, which is what makes the test below safe to run at last — the
  // 400 arrives without anything being contacted, so no internal service is
  // touched and no metadata endpoint can return credentials.
  // ------------------------------------------------------------------------

  for (const { name, url } of [
    { name: "loopback 127.0.0.1", url: "http://127.0.0.1:11434/v1" },
    { name: "cloud metadata", url: "http://169.254.169.254/latest/meta-data/" },
    { name: "private 10.x", url: "http://10.0.0.1:9999/v1" },
  ]) {
    test(`POST /api/2.0/ai/profiles/list-provider-models - ${name} is refused before any connection`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const { status, error, data } = await profiles.listProviderModels(
        "owner",
        {
          providerType: AiBuiltinProviderType.Deepseek,
          baseUrl: url,
          apiKey: config.DEEPSEEK_API_KEY,
        },
      );

      // The message is the whole point: an ADDRESS complaint means the guard
      // classified the host and stopped. A 502 "unreachable" here would mean the
      // socket was opened after all — the original bug — and a 200 would mean an
      // internal service answered.
      expect(status, `${name} must not be dialled`).toBe(400);
      expect(error).toBe("baseUrl host is not allowed");
      expect(Array.isArray(data)).toBe(false);
    });
  }

  // Still out of reach here: the normalization variants of `forbiddenSpecialUrls`
  // (decimal / hex / octal / short-form loopback, IPv6 literals). Whether the
  // guard canonicalises those before classifying them cannot be established
  // safely on shared infrastructure — if one slipped through it would be dialled,
  // which is the exact thing that must not happen on a live portal. Verifying
  // them needs the isolated canary environment of ssrf-payloads.ts.
  test.fixme("POST /api/2.0/ai/profiles/list-provider-models - loopback normalization variants are refused too", () => {});
});

// ===========================================================================
// Section 4.2, the provider form's model picker: "entering the key and the URL
// pulls in the model list with an icon per capability (text, vision, image
// generation, tools, reasoning); a wrong key or URL highlights the field that is
// wrong; local providers work without a key."
//
// All of it hangs off `list-provider-models`, the route that form calls, plus the
// catalogue its output is compared against. Three measured facts shape the
// assertions below (portal run 2026-08-13):
//
//   * the icons are the `capabilities` bitmask plus the separate `reasoning`
//     boolean, so "an icon per capability" is only testable as "every bit is
//     published, decodable, and actually differs between models";
//   * failures come back as a flat `{error: "<message>"}` — this route has NO
//     `field` marker, unlike `create` and `test-connection`, which answer
//     `{field, message}`. So "highlights the field" can only be asserted through
//     the wording, and these tests pin the wording;
//   * a local provider is unreachable from a shared portal, so the observable
//     half of "works without a key" is that the key is not part of the decision.
//     Note the stand-in for a dead local server is a filtered PUBLIC port, not a
//     loopback address: since 2026-08-18 the baseUrl guard refuses loopback with an
//     address error, which would answer a different question than the one asked.
// ===========================================================================

/** The host+transport pair that really answers, used as the control everywhere. */
const REACHABLE_PROVIDER = {
  providerType: AiBuiltinProviderType.Deepseek,
  baseUrl: "https://api.deepseek.com",
};

/**
 * Stands in for a local model server that is not running.
 *
 * It cannot be an actual local address: `127.0.0.1:11434` is refused by the
 * baseUrl guard with an address complaint, which says nothing about how a local
 * transport reports a dead server. A resolvable public host on a filtered port is
 * the closest reachable equivalent — the connection is attempted and fails, which
 * is exactly what a stopped Ollama would produce.
 */
const LOCAL_SERVER_URL = RESOLVABLE_UNREACHABLE_URL;

/**
 * The transports a locally hosted model server is reached through. Read off the
 * SDK enum, so a provider dropped or renamed in the API breaks the test instead
 * of quietly shrinking it.
 */
const LOCAL_PROVIDER_TYPES: string[] = [
  AiBuiltinProviderType.Ollama,
  AiBuiltinProviderType.LmStudio,
  AiBuiltinProviderType.Gpt4all,
];

test.describe("AI Profiles - the model picker's capability icons", () => {
  test("POST /api/2.0/ai/profiles/list-provider-models - a discovered model carries everything the capability icons are drawn from", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const { status, data } = await profiles.listProviderModels("owner", {
      ...REACHABLE_PROVIDER,
      apiKey: config.DEEPSEEK_API_KEY,
    });

    expect(status).toBe(200);
    expect(data!.length).toBeGreaterThan(0);

    for (const model of data!) {
      expect(model.id, "model id").toBeTruthy();
      expect(model.name, `${model.id} display name`).toBeTruthy();
      expect(model.provider).toBe(AiBuiltinProviderType.Deepseek);
      expect(typeof model.reasoning, `${model.id} reasoning`).toBe("boolean");

      const capabilities = model.capabilities ?? 0;
      // An all-zero mask leaves the picker with no icons at all, and a bit the
      // client does not know leaves it with an icon it cannot draw — both are
      // invisible to a `typeof capabilities === "number"` check.
      expect(capabilities, `${model.id} capabilities`).toBeGreaterThan(0);
      expect(
        capabilities & ~AI_CAP_KNOWN_BITS,
        `${model.id} capability bits outside the known set`,
      ).toBe(0);
      expect(
        capabilities & AI_CAP_BITS.text,
        `${model.id} is a text model`,
      ).toBe(AI_CAP_BITS.text);
    }
  });

  test("GET /api/2.0/ai/profiles/list - each of the five capability kinds is separately readable", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    const withBit = (bit: number) =>
      catalogue.filter(
        (profile) => ((profile.capabilities ?? 0) & bit) === bit,
      );

    // Four of the five icons are bits. The catalogue-shape test above pins the
    // three composite masks that happen to be shipped; this one pins the thing
    // the UI actually needs, namely that each individual capability is
    // represented by at least one model and is therefore drawable.
    expect(withBit(AI_CAP_BITS.text).length, "text models").toBeGreaterThan(0);
    expect(withBit(AI_CAP_BITS.vision).length, "vision models").toBeGreaterThan(
      0,
    );
    expect(
      withBit(AI_CAP_BITS.imageGeneration).length,
      "image-generation models",
    ).toBeGreaterThan(0);
    expect(
      withBit(AI_CAP_BITS.tools).length,
      "tool-calling models",
    ).toBeGreaterThan(0);

    // The fifth icon is the only one that is not a bit, and it is only an icon if
    // both values occur — a catalogue where everything reasons carries no
    // information for the user.
    expect(
      catalogue.filter((profile) => profile.reasoning === true).length,
      "reasoning models",
    ).toBeGreaterThan(0);
    expect(
      catalogue.filter((profile) => profile.reasoning === false).length,
      "non-reasoning models",
    ).toBeGreaterThan(0);

    // `canUseTool` and the tools bit are two spellings of one capability: the
    // picker draws the icon from the bit while chat enforces `canUseTool`, so a
    // disagreement would put a tools icon on a model that cannot call tools.
    const disagreeing = catalogue.filter(
      (profile) =>
        (((profile.capabilities ?? 0) & AI_CAP_BITS.tools) ===
          AI_CAP_BITS.tools) !==
        (profile.canUseTool === true),
    );
    expect(
      disagreeing.map((profile) => profile.modelId),
      "the tools bit and canUseTool disagree for these models",
    ).toEqual([]);
  });

  test("BUG 83113: GET /api/2.0/ai/profiles/list vs list-provider-models - the same model is published with different capabilities", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const { status, data } = await profiles.listProviderModels("owner", {
      ...REACHABLE_PROVIDER,
      apiKey: config.DEEPSEEK_API_KEY,
    });
    expect(status).toBe(200);

    // Only a model the portal describes twice can contradict itself.
    const shared = data!
      .map((model) => ({
        model,
        listed: catalogue.find((profile) => profile.modelId === model.id),
      }))
      .filter((pair) => pair.listed);
    expect(
      shared.length,
      "the two surfaces have to share a model id for this to mean anything",
    ).toBeGreaterThan(0);

    const contradictions = shared
      .filter(
        (pair) =>
          pair.listed!.capabilities !== pair.model.capabilities ||
          pair.listed!.reasoning !== pair.model.reasoning,
      )
      .map(
        (pair) =>
          `${pair.model.id}: catalogue ${pair.listed!.capabilities}/reasoning=${pair.listed!.reasoning}` +
          ` vs discovery ${pair.model.capabilities}/reasoning=${pair.model.reasoning}`,
      );

    test.fail();
    // Measured: `deepseek-v4-pro` is 257 with reasoning:true in the catalogue and
    // 385 with reasoning:false through discovery. Both numbers are icon data for
    // the same model id, so the portal shows a vision icon and no reasoning icon
    // on one screen and the opposite on the other.
    expect(
      contradictions,
      "a model must not be described differently by the two surfaces",
    ).toEqual([]);
  });
});

test.describe("AI Profiles - which field the model picker blames", () => {
  test("POST /api/2.0/ai/profiles/list-provider-models - a key that cannot work is reported against the key", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Positive control first: this host and this key do produce a model list, so
    // every refusal below is caused by the key and by nothing else.
    const control = await profiles.listProviderModels("owner", {
      ...REACHABLE_PROVIDER,
      apiKey: config.DEEPSEEK_API_KEY,
    });
    expect(control.status, "the control call reaches the provider").toBe(200);

    // A key field left empty, cleared, or filled with spaces is the ordinary way
    // a user gets this wrong, and all three have to land on the key rather than
    // on the URL or on a generic failure.
    const emptyKeys: Array<[string, Record<string, unknown>]> = [
      ["omitted", {}],
      ["empty string", { apiKey: "" }],
      ["whitespace only", { apiKey: "   " }],
    ];

    for (const [label, patch] of emptyKeys) {
      const { status, error } = await profiles.listProviderModels("owner", {
        ...REACHABLE_PROVIDER,
        ...patch,
      });
      expect(status, `${label} key`).toBe(400);
      expect(error, `${label} key`).toBe("Invalid API key for the AI provider");
    }
  });

  test("POST /api/2.0/ai/profiles/list-provider-models - a base URL that is not the provider's API endpoint is reported against the URL", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // The host is right and the key is right — only the path is wrong, which is
    // the case a "baseUrl is not a valid URL" check cannot catch.
    const { status, error } = await profiles.listProviderModels("owner", {
      providerType: AiBuiltinProviderType.Deepseek,
      baseUrl: "https://api.deepseek.com/nope/v9",
      apiKey: config.DEEPSEEK_API_KEY,
    });

    expect(status).toBe(400);
    expect(error).toBe(
      "Invalid base URL — expected an OpenAI-compatible endpoint (e.g. ending in /v1)",
    );
    // The wording is all a client has to decide which input to highlight, so it
    // has to name the URL and must not blame the key that was in fact correct.
    expect(error?.toLowerCase()).toContain("url");
    expect(error?.toLowerCase()).not.toContain("api key");
  });

  test("BUG 83116: POST /api/2.0/ai/profiles/list-provider-models - a missing base URL and a missing provider type get the same two-field message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    const noBaseUrl = await profiles.listProviderModels("owner", {
      providerType: AiBuiltinProviderType.Deepseek,
      apiKey: config.DEEPSEEK_API_KEY,
    });
    const noProviderType = await profiles.listProviderModels("owner", {
      baseUrl: "https://api.deepseek.com",
      apiKey: config.DEEPSEEK_API_KEY,
    });

    // Refusing both is correct — the request cannot be built without them.
    expect(noBaseUrl.status, "a request with no baseUrl").toBe(400);
    expect(noProviderType.status, "a request with no providerType").toBe(400);

    test.fail();
    // Measured: both answer "providerType and baseUrl required". So the form is
    // told that two of its inputs are wrong when one of them was filled in
    // correctly, and it cannot tell which one to highlight. `create` shows the
    // shape this route is missing — a single `{field, message}` pair.
    expect(
      noBaseUrl.error,
      "a missing baseUrl is reported without blaming providerType",
    ).not.toContain("providerType");
    expect(
      noProviderType.error,
      "a missing providerType is reported without blaming baseUrl",
    ).not.toContain("baseUrl");
  });

  test("BUG 83117: POST /api/2.0/ai/profiles/list-provider-models - an unknown provider type is answered with 502 instead of a validation error", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // The control: on `create` the very same name is caught by provider
    // resolution and named back to the caller, so the backend can tell an unknown
    // provider type from an unreachable one.
    const created = await profiles.createProfile(
      "owner",
      probedProfile("not-a-provider"),
    );
    expect(created.status, "create resolves the provider type first").toBe(200);
    expect(created.data?.error?.message).toBe(
      "Unknown provider type: not-a-provider",
    );

    const { status, error } = await profiles.listProviderModels("owner", {
      providerType: "not-a-provider",
      baseUrl: "https://api.deepseek.com",
      apiKey: config.DEEPSEEK_API_KEY,
    });

    test.fail();
    // Measured: 502 "Failed to list provider models" — a gateway error for a name
    // that is not a provider at all. Nothing in the response points at the
    // provider selector, so a typo there is indistinguishable from an outage.
    expect(status, "an unknown provider type is a client error").toBe(400);
    expect(error, "and the response names what was not understood").toContain(
      "Unknown provider type",
    );
  });
});

test.describe("AI Profiles - local providers need no key", () => {
  test("POST /api/2.0/ai/profiles/list-provider-models - a local provider type never refuses the request over the key", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Control: for a cloud provider the key IS the deciding input. Same route,
    // same host: a list with the key, a complaint about the key without it.
    const withKey = await profiles.listProviderModels("owner", {
      ...REACHABLE_PROVIDER,
      apiKey: config.DEEPSEEK_API_KEY,
    });
    expect(withKey.status, "the cloud control with a key").toBe(200);

    const withoutKey = await profiles.listProviderModels(
      "owner",
      REACHABLE_PROVIDER,
    );
    expect(withoutKey.status, "the cloud control without a key").toBe(400);
    expect(withoutKey.error).toBe("Invalid API key for the AI provider");

    // A local model server cannot be stood up from a shared portal, so what is
    // observable here is that the key never enters the decision: no key, an empty
    // key and a bogus key all get the same answer, and none of them is about a
    // key. On a portal that CAN reach a local server the same test would show a
    // model list for all three.
    for (const providerType of LOCAL_PROVIDER_TYPES) {
      const body = { providerType, baseUrl: LOCAL_SERVER_URL };

      const outcomes: string[] = [];
      for (const patch of [
        {},
        { apiKey: "" },
        { apiKey: "sk-not-a-real-key" },
      ]) {
        const { status, error } = await profiles.listProviderModels("owner", {
          ...body,
          ...patch,
        });
        outcomes.push(`${status} ${error ?? ""}`.trim());
      }

      const [noKey, emptyKey, bogusKey] = outcomes;
      expect(
        [emptyKey, bogusKey],
        `${providerType} treats the key as irrelevant`,
      ).toEqual([noKey, noKey]);
      expect(
        noKey,
        `${providerType} does not refuse a keyless request over the key`,
      ).not.toContain("API key");
    }
  });

  test("BUG 83118: POST /api/2.0/ai/profiles/list-provider-models - gpt4all reports an unreachable server as an empty model list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // Control: the other two local transports call the very same dead server
    // unreachable, so what follows is a gpt4all verdict and not the policy of the
    // route. It also pins that the host really is dialled — a 400 here would mean
    // the baseUrl guard answered instead and the comparison proved nothing.
    for (const providerType of [
      AiBuiltinProviderType.Ollama,
      AiBuiltinProviderType.LmStudio,
    ]) {
      const { status, error } = await profiles.listProviderModels("owner", {
        providerType,
        baseUrl: LOCAL_SERVER_URL,
      });
      expect(status, `${providerType} on an unreachable server`).toBe(502);
      expect(error).toBe(PROVIDER_UNREACHABLE_ERROR);
    }

    const { status } = await profiles.listProviderModels("owner", {
      providerType: AiBuiltinProviderType.Gpt4all,
      baseUrl: LOCAL_SERVER_URL,
    });

    test.fail();
    // Measured: 200 `[]`. A form that gets that shows "no models" for a server
    // that is not running, and the answer is indistinguishable from a running
    // server with an empty catalogue — the case the `onlyoffice` test above pins.
    expect(status, "an unreachable gpt4all server is reported as such").toBe(
      502,
    );
  });
});

test.describe("AI Profiles - the transport is not checked against the host", () => {
  /** Three transports pointed at one host, so only the transport differs. */
  const MISMATCHED_TRANSPORTS: string[] = [
    AiBuiltinProviderType.Deepseek,
    AiBuiltinProviderType.Openai,
    AiBuiltinProviderType.Anthropic,
  ];

  const discoverThroughEach = async (profiles: AiProfiles) => {
    const byTransport: Record<string, AiProviderModel[]> = {};
    for (const providerType of MISMATCHED_TRANSPORTS) {
      const { status, data } = await profiles.listProviderModels("owner", {
        providerType,
        baseUrl: "https://api.deepseek.com",
        apiKey: config.DEEPSEEK_API_KEY,
      });
      expect(status, `${providerType} against a deepseek host`).toBe(200);
      byTransport[providerType] = data!;
    }
    return byTransport;
  };

  test("POST /api/2.0/ai/profiles/list-provider-models - a transport pointed at another provider's host is answered, not refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const byTransport = await discoverThroughEach(profiles);

    // Recorded as the current contract rather than as a bug: the transports are
    // OpenAI-compatible enough that a deepseek host answers all three. What makes
    // it worth pinning is that each model's `provider` echoes what the CALLER
    // asked for, so nothing in the response reveals the mismatch — and the bug
    // below is a consequence of that. If this ever starts refusing, this test
    // goes red first and the bug test stops being about a live mismatch.
    for (const [providerType, models] of Object.entries(byTransport)) {
      expect(models.length, `${providerType} model count`).toBeGreaterThan(0);
      expect(
        models.map((model) => model.provider),
        `${providerType} echoes the requested provider`,
      ).toEqual(models.map(() => providerType));
    }
  });

  test("BUG 83119: POST /api/2.0/ai/profiles/list-provider-models - the anthropic transport returns models with no display name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const byTransport = await discoverThroughEach(profiles);

    // Control: the other two transports label every row.
    for (const providerType of [
      AiBuiltinProviderType.Deepseek,
      AiBuiltinProviderType.Openai,
    ]) {
      expect(
        byTransport[providerType].filter((model) => !model.name),
        `${providerType} names every model`,
      ).toEqual([]);
    }

    test.fail();
    // Measured: the anthropic transport drops `name` entirely, leaving the picker
    // with nothing to write in the row next to the capability icons.
    expect(
      byTransport[AiBuiltinProviderType.Anthropic]
        .filter((model) => !model.name)
        .map((model) => model.id),
      "these models came back without a display name",
    ).toEqual([]);
  });
});
