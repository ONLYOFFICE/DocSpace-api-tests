import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiBuiltinProviderType } from "@onlyoffice/docspace-api-sdk";
import {
  expectAbsoluteUrlRejected,
  ATTACKER_HOST,
} from "@/src/helpers/ssrf-payloads";

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

// The product runs AI through the built-in "ONLYOFFICE AI" gateway, so manual
// provider management (add / update / delete / set-default / available) is gone
// — those endpoints return 403 for everyone. Only access control on the read
// endpoints (getProviders / getDefaultProvider) is still meaningful.

test.describe.skip("AI Providers - Get Permissions", () => {
  for (const role of ["User", "Guest"] as const) {
    test(`GET /api/2.0/ai/providers - ${role} cannot get providers`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.providers.aiProfilesList();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("GET /api/2.0/ai/providers - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.aiProfilesList();

    expect(status).toBe(401);
  });
});

test.describe.skip("AI Providers - Get Default Permissions", () => {
  test("BUG 80713: GET /api/2.0/ai/providers/default - Guest cannot get default provider", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.providers.aiProfilesList();

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/ai/providers/default - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.providers.aiProfilesList();

    expect(status).toBe(401);
  });
});

// The SSRF guard on the OpenAI proxy must hold for low-privileged callers too:
// an absolute URL must not become a canary/SSRF primitive for anyone who can
// reach the endpoint. The provider id is read as owner (the id is the same
// gateway id for every role); the malicious call is made AS the low-priv role.
test.describe
  .skip("AI Providers - OpenAI proxy SSRF protection Permissions", () => {
  for (const role of ["RoomAdmin", "User", "Guest"] as const) {
    test(`GET /ai/openai/:providerId/v1/{absolute url} - ${role}: absolute URL is not proxied`, async ({
      apiSdk,
    }) => {
      const { data } = await apiSdk.forRole("owner").providers.aiProfilesList();
      const providerId = data?.[0]?.id ?? "";

      const { api } = await apiSdk.addAuthenticatedMember("owner", role);
      const roleName = role.charAt(0).toLowerCase() + role.slice(1);
      // addAuthenticatedMember also stores the token under the role slug, so the
      // proxy helper can authenticate as this role.
      void api;

      const result = await apiSdk.aiOpenAiProxyRaw(
        roleName as "roomAdmin" | "user" | "guest",
        providerId,
        `http://${ATTACKER_HOST}:9998/ssrf-${role}`,
      );

      expectAbsoluteUrlRejected(result);
    });
  }
});

// Role enforcement for the provider-URL SSRF surface (preview / create /
// update). The security spec requires that non-admin roles are stopped by the
// authorization gate BEFORE any outbound request could be made. Here the role
// check returns 403 (never 400), which — unlike a connection error — proves the
// request never reached URL handling. The attacker URL uses a non-resolving
// `.invalid` host so nothing is contacted even if a regression flipped the
// order. Confirming "the canary received no request" additionally requires the
// isolated canary env (see the fixme in providers.spec.ts).
const forbiddenProviderRoles = ["RoomAdmin", "User", "Guest"] as const;
const attackerProviderUrl = `http://${ATTACKER_HOST}:9999/models`;

test.describe
  .skip("AI Providers - Provider URL SSRF protection Permissions", () => {
  for (const role of forbiddenProviderRoles) {
    test(`POST /api/2.0/ai/providers/preview - ${role} cannot trigger a provider preview request`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.providers.aiProfilesListProviderModels(
        {
          aiProfilesListProviderModelsRequest: {
            providerType: AiBuiltinProviderType.Openaicompatible,
            baseUrl: attackerProviderUrl,
            apiKey: "sk-security-test",
          },
        },
      );

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    test(`POST /api/2.0/ai/providers - ${role} cannot create a provider with an attacker URL`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { status } = await api.providers.aiProfilesCreate({
        aiCreateProfileInput: {
          providerType: AiBuiltinProviderType.Openaicompatible,
          name: `ssrf-${role}`,
          baseUrl: attackerProviderUrl,
          key: "sk-security-test",
          modelId: "",
        },
      });

      expect(status).toBe(403);
    });

    test(`PUT /api/2.0/ai/providers/:id - ${role} cannot update a provider with an attacker URL`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { status } = await api.providers.aiProfilesUpdate({
        aiProfile: {
          id: "1",
          name: "test",
          providerType: AiBuiltinProviderType.Openaicompatible,
          baseUrl: attackerProviderUrl,
          key: "sk-security-test",
          modelId: "",
        },
      });

      expect(status).toBe(403);
    });
  }

  test("POST /api/2.0/ai/providers/preview - Anonymous gets 401 before any connect", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .providers.aiProfilesListProviderModels({
        aiProfilesListProviderModelsRequest: {
          providerType: AiBuiltinProviderType.Openaicompatible,
          baseUrl: attackerProviderUrl,
          apiKey: "sk-security-test",
        },
      });

    expect(status).toBe(401);
  });
});
