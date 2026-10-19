import { createHash } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  expectCapabilitiesContract,
  getCapabilities,
  portalWideView,
  rawCapabilities,
} from "@/src/helpers/capabilities";

// Secret-looking key names that must never appear anywhere in a payload that
// is served to people who have not signed in.
const SECRET_KEY = /secret|password|passwd|token|private|credential|apikey/i;

const collectKeys = (value: unknown, keys: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
};

test.describe("GET /api/2.0/capabilities", () => {
  test("GET /api/2.0/capabilities - Anonymous gets the documented contract", async ({
    isolatedSdk,
  }) => {
    const { data, status } = await isolatedSdk
      .forAnonymous()
      .capabilities.getPortalCapabilities();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expectCapabilitiesContract(data.response);
  });

  test("GET /api/2.0/capabilities - Owner gets the documented contract", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .capabilities.getPortalCapabilities();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expectCapabilitiesContract(data.response);
  });

  test("GET /api/2.0/capabilities - Response is a JSON envelope with a single object", async ({
    isolatedSdk,
  }) => {
    const response = await rawCapabilities(isolatedSdk);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    const body = await response.json();
    expect(body.statusCode).toBe(200);
    expect(body.count).toBe(1);
    expect(Array.isArray(body.response)).toBe(false);
    expect(typeof body.response).toBe("object");
    expect(body.error).toBeUndefined();
  });

  // Both lists name providers with the same lowercase keys (`google`,
  // `appleid`, ...) - capabilities documents them as the value to send as
  // `provider` to POST authentication, thirdparty/providers as the name every
  // other operation of its group expects. The relation asserted is SUBSET, not
  // equality: thirdparty/providers is "every enabled provider", while
  // capabilities is additionally gated by oauthEnabled, reduced to providers the
  // installation has credentials for and ordered by caller country. On the
  // current stand the two happen to be identical; that is not pinned.
  test("GET /api/2.0/capabilities - Providers are a subset of the portal's enabled third-party providers", async ({
    isolatedSdk,
  }) => {
    const anonymous = isolatedSdk.forAnonymous();
    const capabilities = await getCapabilities(anonymous);

    const { data, status } =
      await anonymous.thirdPartyAccounts.getThirdPartyAuthProviders();
    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    const enabled = (data.response ?? []).map((account) => account.provider);

    for (const provider of capabilities.providers ?? []) {
      expect(
        enabled,
        `capabilities offers ${provider}, thirdparty/providers does not`,
      ).toContain(provider);
    }
  });

  test("GET /api/2.0/capabilities - Response carries no secrets", async ({
    isolatedSdk,
  }) => {
    const response = await rawCapabilities(isolatedSdk);
    expect(response.status()).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text);

    const leaked = collectKeys(body).filter((key) => SECRET_KEY.test(key));
    expect(leaked, `secret-looking keys: ${leaked.join(", ")}`).toEqual([]);
    expect(text).not.toMatch(/Bearer\s+\S{8,}/i);
    expect(text).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  });
});

test.describe("GET /api/2.0/capabilities - stability", () => {
  test("GET /api/2.0/capabilities - Ten sequential reads return the same portal settings", async ({
    isolatedSdk,
  }) => {
    const anonymous = isolatedSdk.forAnonymous();
    const first = portalWideView(await getCapabilities(anonymous));

    for (let i = 1; i < 10; i++) {
      expect(
        portalWideView(await getCapabilities(anonymous)),
        `read #${i + 1}`,
      ).toEqual(first);
    }
  });

  test("GET /api/2.0/capabilities - Concurrent anonymous and owner reads agree", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const anonymous = isolatedSdk.forAnonymous();
    const owner = apiSdk.forRole("owner");
    const baseline = portalWideView(await getCapabilities(anonymous));

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 === 0 ? anonymous : owner).capabilities.getPortalCapabilities(),
      ),
    );

    results.forEach(({ data, status }, i) => {
      expect(status, `request #${i}`).toBe(200);
      expectCapabilitiesContract(data.response);
      expect(portalWideView(data.response), `request #${i}`).toEqual(baseline);
    });
  });

  test("GET /api/2.0/capabilities - Works from a fresh context with no session or cookies", async ({
    playwright,
    apiSdk,
  }) => {
    const context = await playwright.request.newContext({ timeout: 30000 });
    try {
      const response = await context.get(
        `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/capabilities`,
      );
      expect(response.status()).toBe(200);
      expectCapabilitiesContract((await response.json()).response);
    } finally {
      await context.dispose();
    }
  });

  // CAP-026 is PARTIAL. GET cannot be proven side-effect free from outside, only
  // that repeated reads leave three independent read-only views of the sign-in
  // configuration unchanged: this endpoint, the public provider list and the
  // owner's auth-services catalogue (which holds the saved provider keys, so it
  // is compared by digest and never printed). SSO and LDAP settings have no
  // usable read path on this stand (SSO answers 402 for the plan).
  test("GET /api/2.0/capabilities - Repeated reads leave the sign-in configuration unchanged", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const anonymous = isolatedSdk.forAnonymous();
    const owner = apiSdk.forRole("owner");

    const snapshot = async () => {
      const providers =
        await anonymous.thirdPartyAccounts.getThirdPartyAuthProviders();
      const services = await owner.settingsAuthorization.getAuthServices();
      expect(providers.status).toBe(200);
      expect(services.status).toBe(200);
      return {
        capabilities: portalWideView(await getCapabilities(anonymous)),
        providers: providers.data.response?.map((a) => a.provider),
        servicesDigest: createHash("sha256")
          .update(JSON.stringify(services.data.response))
          .digest("hex"),
      };
    };

    const before = await snapshot();
    for (let i = 0; i < 5; i++) {
      await getCapabilities(anonymous);
      await getCapabilities(owner);
    }
    expect(await snapshot()).toEqual(before);
  });

  test("GET /api/2.0/capabilities - Result does not depend on earlier calls in the session", async ({
    apiSdk,
    isolatedSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const cold = portalWideView(
      await getCapabilities(isolatedSdk.forAnonymous()),
    );

    // unrelated read-only calls first
    expect((await owner.profiles.getSelfProfile()).status).toBe(200);
    expect((await owner.rooms.getRoomsFolder({})).status).toBe(200);

    expect(portalWideView(await getCapabilities(owner))).toEqual(cold);
  });
});

// OBSERVED, not contractual. Behaviour measured against the live portal on
// 2026-10-15 that the SDK docs do not spell out: the route is GET-only (405 +
// Allow: GET), an extra query string is ignored and the payload does not vary
// with Accept. Pinned so a change is noticed. A failure here means "behaviour
// changed - triage against the docs", NOT "product defect": do not file a BUG
// or wrap these in test.fail without that check. Run or skip them with
// --grep @observed / --grep-invert @observed.
test.describe(
  "GET /api/2.0/capabilities - observed HTTP behaviour",
  { tag: "@observed" },
  () => {
    test("GET /api/2.0/capabilities - Unknown query parameters do not change the answer", async ({
      isolatedSdk,
    }) => {
      const baseline = portalWideView(
        await getCapabilities(isolatedSdk.forAnonymous()),
      );

      for (const query of [
        "?unknown=value",
        "?unknown=",
        "?unknown=123",
        "?a=1&b=2&a=3",
      ]) {
        const response = await rawCapabilities(isolatedSdk, { query });
        expect(response.status(), query).toBe(200);
        const { response: payload } = await response.json();
        expectCapabilitiesContract(payload);
        expect(portalWideView(payload), query).toEqual(baseline);
      }
    });

    test("GET /api/2.0/capabilities - Accept header does not change the answer", async ({
      isolatedSdk,
    }) => {
      const baseline = portalWideView(
        await getCapabilities(isolatedSdk.forAnonymous()),
      );

      for (const accept of [
        "application/json",
        "application/xml",
        "text/html",
        "image/png",
      ]) {
        const response = await rawCapabilities(isolatedSdk, {
          headers: { Accept: accept },
        });
        expect(response.status(), accept).toBe(200);
        const { response: payload } = await response.json();
        expect(portalWideView(payload), accept).toEqual(baseline);
      }
    });

    test("GET /api/2.0/capabilities - A custom User-Agent and an unknown header are harmless", async ({
      isolatedSdk,
    }) => {
      const response = await rawCapabilities(isolatedSdk, {
        headers: {
          "User-Agent": "api-tests/capabilities (+probe)",
          "X-Unknown-Header": "1",
        },
      });

      expect(response.status()).toBe(200);
      expectCapabilitiesContract((await response.json()).response);
    });

    test("GET /api/2.0/capabilities - Only GET is routed, other verbs are refused and change nothing", async ({
      isolatedSdk,
    }) => {
      const baseline = portalWideView(
        await getCapabilities(isolatedSdk.forAnonymous()),
      );

      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await rawCapabilities(isolatedSdk, { method });
        expect(response.status(), method).toBe(405);
        expect(response.headers()["allow"], method).toBe("GET");
        // the body carries no capabilities payload
        expect(await response.text(), method).not.toContain("ldapEnabled");
      }

      expect(
        portalWideView(await getCapabilities(isolatedSdk.forAnonymous())),
      ).toEqual(baseline);
    });
  },
);
