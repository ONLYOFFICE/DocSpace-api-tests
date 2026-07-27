import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { onlyofficeAiProvider } from "@/src/helpers/ai-providers";
import { ProviderType } from "@onlyoffice/docspace-api-sdk";
import {
  absoluteUrlBypassPayloads,
  specialAddressPayloads,
  expectAbsoluteUrlRejected,
  expectNotProxied,
  ATTACKER_HOST,
  INTERNAL_HOST,
  SSRF_CANARY_MARKER,
  unsafeSchemeUrls,
  nonResolvingAttackerUrls,
  forbiddenSpecialUrls,
  expectProviderUrlRefused,
} from "@/src/helpers/ssrf-payloads";

// The product runs AI through the built-in "ONLYOFFICE AI" gateway. Manual
// provider management (add / update / delete / set-default / available) is
// disabled by the gateway (returns 403), so only the read endpoints below are
// exercised — they return the single built-in gateway provider.
test.describe("AI Providers - Get", () => {
  test("GET /api/2.0/ai/providers - Owner gets the gateway provider", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.providers.getProviders();

    expect(status).toBe(200);
    expect(
      data.response?.some(
        (p) => p.title === onlyofficeAiProvider.providerTitle,
      ),
    ).toBe(true);
  });

  test("GET /api/2.0/ai/providers - DocSpaceAdmin gets the gateway provider", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getProviders();

    expect(status).toBe(200);
    expect(
      data.response?.some(
        (p) => p.title === onlyofficeAiProvider.providerTitle,
      ),
    ).toBe(true);
  });

  test("GET /api/2.0/ai/providers - RoomAdmin gets the gateway provider", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.providers.getProviders();

    expect(status).toBe(200);
    expect(
      data.response?.some(
        (p) => p.title === onlyofficeAiProvider.providerTitle,
      ),
    ).toBe(true);
  });
});

test.describe("AI Providers - Get Default", () => {
  test("GET /api/2.0/ai/providers/default - Owner gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.providerId).toBe(onlyofficeAiProvider.providerId);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });

  test("GET /api/2.0/ai/providers/default - DocSpaceAdmin gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });

  test("GET /api/2.0/ai/providers/default - RoomAdmin gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });

  test("GET /api/2.0/ai/providers/default - User gets the gateway default provider", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.providers.getDefaultProvider();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response?.defaultModel).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.providerTitle).toBe(
      onlyofficeAiProvider.providerTitle,
    );
  });
});

// Security regression for the OpenAI-compatible proxy
// (GET|POST|PUT|DELETE /api/2.0/ai/openai/:providerId/v1/{path}). The trailing
// {path} is appended to the saved provider base address; an absolute URL in
// {path} must NOT override that base (SSRF), and the provider secret must never
// be forwarded to an attacker host. See src/helpers/ssrf-payloads.ts for the
// canary-infrastructure limitation and why every payload targets a
// non-resolving .invalid host.
//
// VERIFIED (2026-07-23): the SSRF is NOT reproducible in this build. This proxy
// route is inert for the built-in gateway provider (the only provider this
// product build exposes, providerId -1): every request — relative or absolute,
// authenticated or anonymous, AI enabled or disabled — returns 404 with an
// empty body. Nothing is proxied and no canary content is ever returned. The
// vulnerable path append only exists for manual OpenAI-compatible providers,
// which were removed from the product. These tests therefore act as a
// regression guard: they pass on the current inert 404 and would fail the day a
// live proxy starts returning a proxied 2xx / canary response.
test.describe("AI Providers - OpenAI proxy SSRF protection", () => {
  // The provider id we proxy through is the one the product actually uses today:
  // the built-in gateway, read back the same way the app does — each test calls
  // getDefaultProvider() and uses data.response.providerId.

  test("GET /ai/openai/:providerId/v1/models - relative path is not treated as an absolute-URL SSRF rejection", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw("owner", providerId, "models");

    // A legitimate relative path must not be mistaken for an absolute URL and
    // rejected with the SSRF 400 guard, and must never surface canary content.
    // (In this build the proxy is inert and returns 404 for the relative path
    // too — see the describe header.)
    expect(result.text).not.toContain("Absolute URLs are not allowed");
    expect(result.text).not.toContain(SSRF_CANARY_MARKER);
    expect(result.status).not.toBe(400);
  });

  test("GET /ai/openai/:providerId/v1/{absolute http url} - Owner: absolute URL is not proxied", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw(
      "owner",
      providerId,
      `http://${ATTACKER_HOST}:9998/ssrf-test`,
    );

    expectAbsoluteUrlRejected(result);
  });

  test("GET /ai/openai/:providerId/v1/{absolute https url} - Owner: absolute URL is not proxied", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw(
      "owner",
      providerId,
      `https://${ATTACKER_HOST}/ssrf-test`,
    );

    expectAbsoluteUrlRejected(result);
  });

  // P1 — the same absolute URL must be blocked across every proxied HTTP method,
  // and a request body must never be forwarded to the attacker host.
  for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
    test(`${method} /ai/openai/:providerId/v1/{absolute url} - absolute URL is not proxied`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.providers.getDefaultProvider();
      const providerId = data.response!.providerId!;

      const result = await apiSdk.aiOpenAiProxyRaw(
        "owner",
        providerId,
        `http://${ATTACKER_HOST}:9998/ssrf-${method}`,
        {
          method,
          body:
            method === "POST" || method === "PUT"
              ? { secret: SSRF_CANARY_MARKER }
              : undefined,
        },
      );

      expectAbsoluteUrlRejected(result);
    });
  }

  // P1 — absolute-URI validation bypasses (mixed case, encoded, //host,
  // backslashes, userinfo, open-redirect query). None may reach the attacker.
  for (const { name, path } of absoluteUrlBypassPayloads) {
    test(`GET /ai/openai/:providerId/v1/* - rejects bypass variant: ${name}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.providers.getDefaultProvider();
      const providerId = data.response!.providerId!;

      const result = await apiSdk.aiOpenAiProxyRaw("owner", providerId, path);

      // Either a hard 400 or a safe pre-controller rejection (404), never a
      // proxied 2xx and never canary content.
      expectNotProxied(result, [400, 404]);
    });
  }

  // P1 — query string handling. A relative path keeps its query for the
  // provider; a query must not be usable to smuggle an absolute destination.
  test("GET /ai/openai/:providerId/v1/models?x=1&y=2 - relative query is preserved, not treated as SSRF", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw(
      "owner",
      providerId,
      "models",
      {
        rawQuery: "x=1&y=2",
      },
    );

    expect(result.text).not.toContain("Absolute URLs are not allowed");
    expect(result.text).not.toContain(SSRF_CANARY_MARKER);
    expect(result.status).not.toBe(400);
  });

  test("GET /ai/openai/:providerId/v1/{absolute url with query} - absolute URL with query is not proxied", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw(
      "owner",
      providerId,
      `http://${ATTACKER_HOST}:9998/test`,
      { rawQuery: `redirect=http://${INTERNAL_HOST}:8080/private` },
    );

    expectNotProxied(result, [400, 404]);
  });

  // Auth: an anonymous caller must never get a proxied response. A live proxy
  // should reject with 401; this inert build returns 404 (route not matched).
  // Both are safe — the guard is "no canary, not proxied".
  test("GET /ai/openai/:providerId/v1/{absolute url} - Anonymous is not proxied", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw(
      null,
      providerId,
      `http://${ATTACKER_HOST}:9998/ssrf-test`,
    );

    expectNotProxied(result, [401, 404]);
  });

  // ------------------------------------------------------------------------
  // Internal / special-address cases. Safe to run here: the proxy route is inert
  // (404) for the gateway provider, so the special address is never contacted.
  // Should manual OpenAI-compatible providers ever return, these become live —
  // run them ONLY against the isolated local stand with a controlled canary.
  // ------------------------------------------------------------------------
  for (const { name, path } of specialAddressPayloads) {
    test(`GET /ai/openai/:providerId/v1/* - internal/special address is not proxied: ${name}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data } = await ownerApi.providers.getDefaultProvider();
      const providerId = data.response!.providerId!;

      const result = await apiSdk.aiOpenAiProxyRaw("owner", providerId, path);

      expectNotProxied(result, [400, 404]);
    });
  }

  // Redirect-style path pointing at an internal host must not be proxied. Uses a
  // non-resolving .invalid target so nothing real is contacted; the true
  // "302 -> internal is not followed" semantics require manual providers (absent
  // in this build) plus a canary redirect server.
  test("GET /ai/openai/:providerId/v1/* - redirect-style path to an internal address is not proxied", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw(
      "owner",
      providerId,
      `http://${ATTACKER_HOST}:9998/redirect`,
      { rawQuery: `next=http://${INTERNAL_HOST}:8080/models` },
    );

    expectNotProxied(result, [400, 404]);
  });

  // DNS-rebinding-style host must not be proxied. Uses a non-resolving .invalid
  // host; the true rebinding (public-at-resolve / private-at-connect) semantics
  // require manual providers plus a controlled rebinding host in the canary env.
  test("GET /ai/openai/:providerId/v1/* - rebinding-style host is not proxied", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.providers.getDefaultProvider();
    const providerId = data.response!.providerId!;

    const result = await apiSdk.aiOpenAiProxyRaw(
      "owner",
      providerId,
      `http://rebind.${ATTACKER_HOST}/models`,
    );

    expectNotProxied(result, [400, 404]);
  });
});

// Security regression for the provider-URL SSRF surface: the endpoints where an
// admin supplies the provider base URL + key directly, and the server would
// connect to `<url>/models` to enumerate models.
//   POST /api/2.0/ai/providers/preview  (previewProviderModels)
//   POST /api/2.0/ai/providers          (addProvider)
//   PUT  /api/2.0/ai/providers/{id}     (updateProvider)
//
// VERIFIED (2026-07-23): in this build all three are refused up front with 403
// by AiProviderService.ThrowIfGatewayConfigured() — the FIRST statement in each
// service method, before the url is parsed or any socket is opened. Manual
// providers are disabled by the built-in "ONLYOFFICE AI" gateway, so the
// provider-URL SSRF path is NOT reachable here. Because the 403 precedes any
// connection, these tests can safely send even real loopback / metadata URLs:
// the guard rejects them before the address is ever contacted. They act as a
// regression guard — the day the gateway guard is removed (re-enabling manual
// providers), the status changes and these fail, signalling that the egress
// validation from the security spec now has to be verified in the canary env.
const forbiddenProviderUrls = [
  ...nonResolvingAttackerUrls,
  ...forbiddenSpecialUrls,
  ...unsafeSchemeUrls,
];

test.describe("AI Providers - Provider URL SSRF protection (preview)", () => {
  for (const { name, url } of forbiddenProviderUrls) {
    test(`POST /api/2.0/ai/providers/preview - Owner: forbidden URL is refused before connect: ${name}`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .providers.previewProviderModels({
          previewProviderModelsRequestDto: {
            type: ProviderType.OpenAiCompatible,
            url,
            key: "sk-security-test",
          },
        });

      expectProviderUrlRefused(status);
    });
  }
});

test.describe("AI Providers - Provider URL SSRF protection (create)", () => {
  for (const { name, url } of forbiddenProviderUrls) {
    test(`POST /api/2.0/ai/providers - Owner: forbidden URL is refused before connect: ${name}`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk.forRole("owner").providers.addProvider({
        createProviderRequestDto: {
          type: ProviderType.OpenAiCompatible,
          title: `ssrf-create-${name}`,
          url,
          key: "sk-security-test",
          modelSettings: new Set([
            { modelId: "gpt-4o", isEnabled: true } as never,
          ]),
        },
      });

      expectProviderUrlRefused(status);
    });
  }

  test("POST /api/2.0/ai/providers - a provider with a forbidden URL is not persisted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const title = `ssrf-not-persisted-${Date.now()}`;

    const { status } = await ownerApi.providers.addProvider({
      createProviderRequestDto: {
        type: ProviderType.OpenAiCompatible,
        title,
        url: `http://${ATTACKER_HOST}:9999/models`,
        key: "sk-security-test",
        modelSettings: new Set([
          { modelId: "gpt-4o", isEnabled: true } as never,
        ]),
      },
    });

    // Side-effect check BEFORE the status assertion: no partial provider record.
    const { data: list } = await ownerApi.providers.getProviders();
    expect(list.response?.some((p) => p.title === title)).toBe(false);

    expectProviderUrlRefused(status);
  });
});

test.describe("AI Providers - Provider URL SSRF protection (update)", () => {
  for (const { name, url } of forbiddenProviderUrls) {
    test(`PUT /api/2.0/ai/providers/:id - Owner: forbidden URL is refused before connect: ${name}`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .providers.updateProvider({
          id: 1,
          updateProviderBody: {
            title: "ssrf-update",
            url,
            key: "sk-security-test",
          },
        });

      expectProviderUrlRefused(status);
    });
  }

  // Scenario 2 (new URL, no new key) from the security spec: even the
  // key-reuse exfiltration variant cannot proceed, because the request is
  // refused before the stored key would be attached to any outbound call.
  test("PUT /api/2.0/ai/providers/:id - forbidden URL without a new key is still refused before connect", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").providers.updateProvider({
      id: 1,
      updateProviderBody: {
        title: "ssrf-update-no-key",
        url: `http://${ATTACKER_HOST}:9999/models`,
      },
    });

    expectProviderUrlRefused(status);
  });
});
