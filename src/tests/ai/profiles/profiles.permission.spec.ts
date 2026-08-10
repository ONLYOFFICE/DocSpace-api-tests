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

      // A member sees the catalogue but not a credential in it.
      expect(single.data?.key).toBe("onlyoffice");
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

  test("BUG XXXXX: GET /api/2.0/ai/profiles/list-models - a Guest gets the provider error instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The provider-key failure is raised ahead of the role check, so the one
    // route in this controller that reaches outward is also the one that does
    // not refuse a Guest first. Its three neighbours — list, get-by-id and
    // test-connection — all answer 403, which is what makes this an ordering
    // defect rather than the intended contract.
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
    expect(error).toBe("Invalid API key for the AI provider");

    test.fail();
    expect(
      status,
      "a Guest must be refused before the provider is dialled",
    ).toBe(403);
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
