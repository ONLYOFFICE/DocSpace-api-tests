import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";
import config from "@/config";

// Who may read the profile catalogue, and who may use the provider-discovery
// route that validates a key against an upstream provider.
//
// The answer for the catalogue is "every member except a Guest". The answer for
// `list-provider-models` is "everyone, including a Guest" — which is the bug at
// the bottom of this file: section 4.2 requires the key-check endpoint to be
// closed to non-administrators, and it is the one route on this surface that
// spends an outbound request on caller-supplied input.
//
// create / update / delete are not in the matrix on purpose: the gateway build
// answers 403 to the Owner as well (profiles.spec.ts), so there is no role
// difference left to measure.

const MEMBER_ROLES: Array<{ label: string; type: UserType; role: AgentRole }> =
  [
    { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
    { label: "User", type: "User", role: "user" },
  ];

test.describe("AI Profiles - anonymous access", () => {
  test("GET|POST /api/2.0/ai/profiles/* - Anonymous gets 401 Unauthorized", async ({
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

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["list", profiles.listProfiles("anonymous")],
      ["get-by-id", profiles.getProfileById("anonymous", profile.id)],
      ["list-models", profiles.listModels("anonymous", profile.id)],
      [
        "list-provider-models",
        profiles.listProviderModels("anonymous", {
          providerType: "deepseek",
          baseUrl: "https://api.deepseek.com",
          apiKey: config.DEEPSEEK_API_KEY,
        }),
      ],
      ["test-connection", profiles.testConnection("anonymous", profile.id)],
      [
        "create",
        profiles.createProfile("anonymous", {
          name: "Autotest",
          providerType: "deepseek",
          baseUrl: "https://api.deepseek.com",
          key: config.DEEPSEEK_API_KEY,
          modelId: "deepseek-v4-flash",
        }),
      ],
      ["delete", profiles.deleteProfile("anonymous", profile.id)],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} as anonymous`).toBe(401);
    }
  });
});

test.describe("AI Profiles - catalogue read permissions", () => {
  for (const { label, type, role } of MEMBER_ROLES) {
    test(`GET /api/2.0/ai/profiles/list, get-by-id - ${label} reads the catalogue`, async ({
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

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await profiles.expectActingAs(role, memberData.response!.id!, label);

      const { status, data } = await profiles.listProfiles(role);
      expect(status).toBe(200);
      expect(data!.map((entry) => entry.id)).toContain(profile.id);

      const single = await profiles.getProfileById(role, profile.id);
      expect(single.status).toBe(200);
      expect(single.data?.modelId).toBe(profile.modelId);

      // A member sees the catalogue but not a credential in it — get-by-id
      // omits `key` entirely rather than masking it (unlike `list`, which
      // still carries the literal "onlyoffice" placeholder; see the DTO
      // comparison in profiles.spec.ts).
      expect(single.data?.key).toBeUndefined();
    });
  }

  test("GET /api/2.0/ai/profiles/list, get-by-id - a Guest cannot read the catalogue", async ({
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

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await profiles.expectActingAs("guest", guestData.response!.id!, "Guest");

    const { status } = await profiles.listProfiles("guest");
    expect(status).toBe(403);

    const single = await profiles.getProfileById("guest", profile.id);
    expect(single.status).toBe(403);

    // list-models is deliberately absent: it answers this Guest a 400 rather
    // than a 403, which is its own defect below.
    const connection = await profiles.testConnection("guest", profile.id);
    expect(connection.status).toBe(403);
  });

  test("BUG 82971 FIXED: GET /api/2.0/ai/profiles/list-models - a Guest is refused before the provider is dialled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Used to raise the provider-key failure ahead of the role check — the one
    // route in this controller that reached outward before refusing a Guest,
    // unlike its neighbours list, get-by-id and test-connection. Now refuses
    // first, like them.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await profiles.expectActingAs("guest", guestData.response!.id!, "Guest");

    const { status, error } = await profiles.listModels("guest", profile.id);
    expect(status, "a Guest is refused before the provider is dialled").toBe(
      403,
    );
    expect(error).toBe("Forbidden");
  });
});

test.describe("AI Profiles - provider discovery permissions", () => {
  for (const { label, type, role } of MEMBER_ROLES) {
    test(`POST /api/2.0/ai/profiles/list-provider-models - ${label} may validate a provider key`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await profiles.expectActingAs(role, memberData.response!.id!, label);

      // Recorded as the current contract rather than as a bug: a User can create
      // neither a profile nor anything else with the result, and the route is
      // reachable by every non-Guest member. The Guest case below is the one that
      // contradicts the rest of the surface.
      const { status, data } = await profiles.listProviderModels(role, {
        providerType: "deepseek",
        baseUrl: "https://api.deepseek.com",
        apiKey: config.DEEPSEEK_API_KEY,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });
  }

  test("BUG 82824: POST /api/2.0/ai/profiles/list-provider-models - a Guest validates a provider key and makes the portal dial an external host", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await profiles.expectActingAs("guest", guestData.response!.id!, "Guest");

    // Every other route in the family is 403 for a Guest, so this is not a
    // deliberate "the catalogue is public" decision.
    const blocked = await profiles.listProfiles("guest");
    expect(blocked.status, "the Guest really is blocked elsewhere").toBe(403);

    const { status, data } = await profiles.listProviderModels("guest", {
      providerType: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: config.DEEPSEEK_API_KEY,
    });

    // The Guest gets a real answer from the upstream provider: the portal spent an
    // outbound request on a Guest-supplied URL and key.
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);

    test.fail();
    expect(
      status,
      "a Guest must not reach the provider-discovery endpoint",
    ).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Writes, and the routes the matrix above leaves out.
//
// create / update / delete are 403 for the Owner on a gateway portal, so there
// is no role difference to measure; what a role CAN still get wrong is a write
// that lands, or a refusal that is really a validation error. Every refusal is
// therefore followed by a look at the catalogue as the Owner.
// ---------------------------------------------------------------------------

const WRITE_ROLES: Array<{ label: string; type: UserType; role: AgentRole }> = [
  ...MEMBER_ROLES,
  { label: "Guest", type: "Guest", role: "guest" },
];

const catalogueOf = async (profiles: AiProfiles) =>
  JSON.stringify(
    (await profiles.catalogue("owner")).sort((a, b) =>
      (a.id ?? "").localeCompare(b.id ?? ""),
    ),
  );

test.describe("AI Profiles - write permissions", () => {
  test("PUT /api/2.0/ai/profiles/update - Anonymous gets 401, even with a body that would fail validation", async ({
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
    const before = await catalogueOf(profiles);

    const valid = await profiles.updateProfile("anonymous", {
      id: profile.id,
      name: "Autotest renamed",
      providerType: "onlyoffice",
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
    });
    expect(valid.status, "a well-formed update").toBe(401);

    const empty = await profiles.updateProfile("anonymous", {});
    expect(empty.status, "authentication comes before validation").toBe(401);

    expect(await catalogueOf(profiles), "nothing changed").toBe(before);
  });

  for (const { label, type, role } of WRITE_ROLES) {
    test(`POST|PUT|DELETE /api/2.0/ai/profiles - ${label} cannot create, update or delete a profile, and the catalogue is untouched`, async ({
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
      const before = await catalogueOf(profiles);

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await profiles.expectActingAs(role, memberData.response!.id!, label);

      const created = await profiles.createProfile(role, {
        name: "Autotest member create",
        providerType: "onlyoffice",
        baseUrl: profile.baseUrl,
        modelId: profile.modelId,
      });
      const updated = await profiles.updateProfile(role, {
        id: profile.id,
        name: "Autotest member rename",
        providerType: "onlyoffice",
        baseUrl: profile.baseUrl,
        modelId: profile.modelId,
      });
      // An empty body must not turn the refusal into a validation answer that
      // tells a non-admin what the route expects.
      const updatedEmpty = await profiles.updateProfile(role, {});
      const deleted = await profiles.deleteProfile(role, profile.id);

      // Side effects first: a write that landed matters more than its status.
      await apiSdk.authenticateOwner();
      expect(
        await catalogueOf(profiles),
        `${label} changed the catalogue`,
      ).toBe(before);

      expect(created.status, `${label} create`).toBe(403);
      expect(updated.status, `${label} update`).toBe(403);
      expect(updatedEmpty.status, `${label} update with an empty body`).toBe(
        403,
      );
      expect(deleted.status, `${label} delete`).toBe(403);
    });
  }
});

test.describe("AI Profiles - checks on a saved profile", () => {
  for (const { label, type, role } of MEMBER_ROLES) {
    test(`POST|GET /api/2.0/ai/profiles/test-connection, list-models - ${label} gets the same verdicts as the Owner`, async ({
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
      const ownerConnection = await profiles.testConnection(
        "owner",
        profile.id,
      );
      const ownerModels = await profiles.listModels("owner", profile.id);

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await profiles.expectActingAs(role, memberData.response!.id!, label);

      const connection = await profiles.testConnection(role, profile.id);
      expect(connection.status, `${label} test-connection`).toBe(
        ownerConnection.status,
      );
      expect(connection.data, `${label} test-connection verdict`).toEqual(
        ownerConnection.data,
      );

      const models = await profiles.listModels(role, profile.id);
      expect(models.status, `${label} list-models`).toBe(ownerModels.status);
      expect(models.error, `${label} list-models message`).toBe(
        ownerModels.error,
      );
    });
  }

  test("GET|POST /api/2.0/ai/profiles/* - a Guest is refused with 403 for a real id, and parameter validation answers 400 first", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The accepted convention of /ai/*: required-parameter and id-format checks
    // run before the role check (ai/assignments does the same for a Guest), and
    // unlike BUG 82971 they open no outbound connection. What must never change
    // is that a well-formed request from a Guest is refused.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await profiles.expectActingAs("guest", guestData.response!.id!, "Guest");

    for (const [label, call] of [
      ["get-by-id", profiles.getProfileById("guest", profile.id)],
      ["list-models", profiles.listModels("guest", profile.id)],
      ["test-connection", profiles.testConnection("guest", profile.id)],
    ] as Array<[string, Promise<{ status: number }>]>) {
      expect((await call).status, `${label} with a real id`).toBe(403);
    }

    for (const [label, call] of [
      ["get-by-id, malformed", profiles.getProfileById("guest", "not-a-guid")],
      ["list-models, malformed", profiles.listModels("guest", "not-a-guid")],
      [
        "test-connection, malformed",
        profiles.testConnection("guest", "not-a-guid"),
      ],
      ["test-connection without an id", profiles.testConnection("guest", {})],
    ] as Array<[string, Promise<{ status: number }>]>) {
      expect((await call).status, label).toBe(400);
    }
  });
});
