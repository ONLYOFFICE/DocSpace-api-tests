import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import {
  enableAiGateway,
  isWalletServiceEnabled,
  setAiSearchAddon,
} from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiWebSearch,
  WEB_SEARCH_BASE_URL_ERRORS,
} from "@/src/helpers/ai-web-search";
import { RESOLVABLE_NON_PROVIDER_URL } from "@/src/helpers/ssrf-payloads";
import { UserType } from "@/src/services/api-sdk";
import { Role } from "@/src/services/token-store";
import config from "@/config";

// PUT /ai/web-search/set-active-config, PUT /ai/web-search/configure and the
// state reads — the half of the surface web-search.spec.ts leaves out. Read the
// header of that file first: the manual configuration path is retired, and what
// is pinned here is what the live routes do today, measured 2026-10-09.
//
// WHAT `set-active-config` DOES — and how that differs from its JSDoc.
//
// The SDK documents it as "stores a web-search configuration without contacting
// the provider first". It does not: every request that gets past validation
// answers `403 {"error":"Forbidden"}` — for the owner, for every other role,
// with and without the AI search add-on, for the portal scope and for a room —
// and nothing is stored. So "saves a configuration without a probe", "replaces
// an existing one" and "a room keeps its own" cannot be observed on any portal,
// and no test below pretends otherwise. The 403 is what the web-search.spec.ts
// header already names as the expected behaviour for a retired manual path (what
// `clear` and `configure` give while the add-on owns the provider), so these
// are pinned as ordinary tests and the divergence from the JSDoc is raised in
// the report rather than filed: whether the documentation or the route is stale
// is a product call.
//
// `configure` is not the same: it really probes the provider first. A wrong key
// is a `400 {success:false, error:{field:"key", message:"Invalid API key"}}`,
// and even a valid one is then refused with 403 — nothing is ever stored.

/** The unconfigured state every test here starts from, read back to prove it. */
async function expectNothingStored(
  webSearch: AiWebSearch,
  entityId?: number | string,
) {
  const configured = await webSearch.isConfigured("owner", entityId);
  expect(configured.status, "is-configured").toBe(200);
  expect(configured.data, "is-configured").toBe(false);
  const active = await webSearch.getActiveConfig("owner", entityId);
  expect(active.status, "get-active-config").toBe(200);
  expect(active.data, "get-active-config").toBeNull();
}

test.describe("AI Web Search - set-active-config", () => {
  test("PUT /api/2.0/ai/web-search/set-active-config - a well-formed configuration is refused with 403 and nothing is stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Web Search Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    await expectNothingStored(webSearch);

    const bodies: Array<[string, Record<string, unknown>]> = [
      ["exa", { config: { provider: "exa", key: "not-a-real-exa-key" } }],
      [
        "exa with the real key",
        { config: { provider: "exa", key: config.EXA_API_KEY } },
      ],
      [
        "onlyoffice with a public base URL",
        {
          config: {
            provider: "onlyoffice",
            key: "k",
            baseUrl: RESOLVABLE_NON_PROVIDER_URL,
          },
        },
      ],
      [
        "a cloud provider with headers",
        {
          config: {
            provider: "exa",
            key: "k",
            isCloudProvider: true,
            baseUrl: RESOLVABLE_NON_PROVIDER_URL,
            headers: { "x-autotest": "1" },
          },
        },
      ],
      ["an unknown provider name", { config: { provider: "nope", key: "k" } }],
      [
        "a room scope",
        {
          config: { provider: "exa", key: "k" },
          entityId: String(roomId),
        },
      ],
    ];

    for (const [label, body] of bodies) {
      const { status, data, text } = await webSearch.setActiveConfig(
        "owner",
        body,
      );
      expect(status, `${label}: ${text}`).toBe(403);
      expect(data, label).toEqual({ error: "Forbidden" });
    }

    // The state is what matters: a refusal that still stored something would be
    // worse than a 200. Both scopes are read, and the key is not echoed anywhere.
    await expectNothingStored(webSearch);
    await expectNothingStored(webSearch, roomId);
  });

  test("PUT /api/2.0/ai/web-search/set-active-config - the add-on's configuration survives an attempted overwrite", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    await setAiSearchAddon(ownerApi.payment, true);

    const before = await webSearch.getActiveConfig("owner");
    expect(before.data?.provider, "the add-on's configuration").toBe(
      "onlyoffice",
    );

    const { status, text } = await webSearch.setActiveConfig("owner", {
      config: { provider: "exa", key: config.EXA_API_KEY },
    });
    expect(status, text).toBe(403);

    const after = await webSearch.getActiveConfig("owner");
    expect(after.status).toBe(200);
    expect(after.data, "the configuration is exactly what it was").toEqual(
      before.data,
    );
    expect((await webSearch.isConfigured("owner")).data).toBe(true);
  });

  // The route validates its body before it decides whether the caller may write
  // at all, so what a malformed body gets is a 400 naming the field. These are
  // measured messages; the order problem itself is the BUG XXXXX pair further
  // down.
  test("PUT /api/2.0/ai/web-search/set-active-config - a malformed configuration is a 400 that names the field", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const CONFIG_REQUIRED = "config is required and must be an object";
    const PROVIDER_REQUIRED =
      "config.provider is required and must be a non-empty string";

    const refused: Array<[string, Record<string, unknown>, string]> = [
      ["an empty body", {}, CONFIG_REQUIRED],
      ["config: null", { config: null }, CONFIG_REQUIRED],
      ["config as a string", { config: "x" }, CONFIG_REQUIRED],
      ["config as an array", { config: [] }, CONFIG_REQUIRED],
      ["an empty config", { config: {} }, PROVIDER_REQUIRED],
      ["an empty provider", { config: { provider: "" } }, PROVIDER_REQUIRED],
      ["a numeric provider", { config: { provider: 5 } }, PROVIDER_REQUIRED],
      [
        "a numeric key",
        { config: { provider: "exa", key: 5 } },
        "config.key must be a string",
      ],
      [
        "a numeric baseUrl",
        { config: { provider: "onlyoffice", baseUrl: 5 } },
        "config.baseUrl must be a string",
      ],
      [
        "headers as a string",
        { config: { provider: "exa", key: "k", headers: "x" } },
        "config.headers must be an object",
      ],
    ];

    for (const [label, body, message] of refused) {
      const { status, error, text } = await webSearch.setActiveConfig(
        "owner",
        body,
      );
      expect(status, `${label}: ${text}`).toBe(400);
      expect(error, label).toBe(message);
    }

    await expectNothingStored(webSearch);
  });

  test("PUT /api/2.0/ai/web-search/set-active-config - an unknown or malformed entityId is a 404, and nothing is stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Same contract the read side has (web-search.spec.ts): an entity that does
    // not resolve is a 404, not a silent no-op.
    for (const entityId of ["999999999", "abc", "0", "-1"]) {
      const { status, data, text } = await webSearch.setActiveConfig("owner", {
        config: { provider: "exa", key: "k" },
        entityId,
      });
      expect(status, `entityId ${entityId}: ${text}`).toBe(404);
      expect(data, entityId).toEqual({
        error: `Entity "${entityId}" not found`,
      });
    }

    await expectNothingStored(webSearch);
  });

  const MEMBERS: Array<{ label: string; type: UserType; role: Role }> = [
    { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
    { label: "User", type: "User", role: "user" },
    { label: "Guest", type: "Guest", role: "guest" },
  ];

  test("PUT /api/2.0/ai/web-search/set-active-config - no role can store a configuration, and a refusal changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Created while the shared context is the owner's, authenticated one at a
    // time — a member cannot create members, and two authentications back to
    // back flake with 401.
    const members = [];
    for (const { label, type, role } of MEMBERS) {
      const { data, userData } = await apiSdk.addMember("owner", type);
      expect(data.response?.id, `${label} was created`).toBeTruthy();
      members.push({ label, type, role, userData, id: data.response!.id! });
    }

    for (const { label, type, role, userData, id } of members) {
      await apiSdk.authenticateMember(userData, type);
      await webSearch.expectActingAs(role, id, label);

      const { status, data, text } = await webSearch.setActiveConfig(role, {
        config: { provider: "exa", key: config.EXA_API_KEY },
      });
      expect(status, `${label}: ${text}`).toBe(403);
      expect(data, label).toEqual({ error: "Forbidden" });
    }

    await apiSdk.authenticateOwner();
    await expectNothingStored(webSearch);
  });

  // The same order defect BUG 84312 / BUG 84313 describe for `configure`:
  // `set-active-config` validates the body before it checks who is asking or
  // whether AI is on, so a Guest and an AI-disabled portal reach validation and
  // get a 400 naming a field, where the read side and `clear` answer 403.
  test("BUG XXXXX: PUT /api/2.0/ai/web-search/set-active-config - Guest reaches body validation instead of being rejected with 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const { data: guest } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await webSearch.expectActingAs("guest", guest.response!.id!, "Guest");

    // Controls: the Guest IS refused on the read side and for a valid body, so
    // the rule exists and the malformed body is what slips past it.
    expect((await webSearch.getActiveConfig("guest")).status).toBe(403);
    expect(
      (
        await webSearch.setActiveConfig("guest", {
          config: { provider: "exa", key: "k" },
        })
      ).status,
    ).toBe(403);

    const malformed = await webSearch.setActiveConfig("guest", {});
    const private_ = await webSearch.setActiveConfig("guest", {
      config: {
        provider: "onlyoffice",
        key: "k",
        baseUrl: "http://127.0.0.1:1/",
      },
    });

    await apiSdk.authenticateOwner();
    await expectNothingStored(webSearch);

    test.fail();
    expect(
      [malformed.status, private_.status],
      "a Guest must be refused with 403 before the body is ever validated",
    ).toEqual([403, 403]);
  });

  test("BUG XXXXX: PUT /api/2.0/ai/web-search/set-active-config - the portal AI switch does not gate the route, a malformed body reaches validation instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    // Controls: the switch took effect on the read side, and a valid body is
    // refused with 403 — only the malformed one gets through to validation.
    expect((await webSearch.getActiveConfig("owner")).status).toBe(403);
    expect(
      (
        await webSearch.setActiveConfig("owner", {
          config: { provider: "exa", key: "k" },
        })
      ).status,
    ).toBe(403);

    const { status } = await webSearch.setActiveConfig("owner", {});

    test.fail();
    expect(
      status,
      "set-active-config must be refused with 403 when AI access is disabled, before the body is parsed",
    ).toBe(403);
  });
});

test.describe("AI Web Search - configure without the add-on", () => {
  test("PUT /api/2.0/ai/web-search/configure - a wrong key is a 400 from the provider probe, a valid one is still refused, and nothing is stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // The add-on test in web-search.spec.ts pins `configure` while the add-on
    // owns the provider. This is the same route on a portal that has none, where
    // it is NOT refused up front: the key really goes to the provider.
    const wrong = await webSearch.configure("owner", {
      config: { provider: "exa", key: "not-a-real-exa-key" },
    });
    expect(wrong.status, wrong.text).toBe(400);
    expect(wrong.data).toEqual({
      success: false,
      error: { field: "key", message: "Invalid API key" },
    });
    expect(
      wrong.text,
      "the key that was sent is not echoed back in the error",
    ).not.toContain("not-a-real-exa-key");

    // The provider accepts this key (test-connection says `true` for it) and the
    // route still stores nothing — there is no way to end up configured by hand.
    const probe = await webSearch.testConnection("owner", {
      provider: "exa",
      key: config.EXA_API_KEY,
    });
    expect(probe.data, "the control: this key is valid").toBe(true);

    const valid = await webSearch.configure("owner", {
      config: { provider: "exa", key: config.EXA_API_KEY },
    });
    expect(valid.status, valid.text).toBe(403);
    expect(valid.data).toEqual({ error: "Forbidden" });
    expect(
      valid.text,
      "the stored-nothing answer does not echo the key",
    ).not.toContain(config.EXA_API_KEY);

    await expectNothingStored(webSearch);
  });
});

// Every route that takes a `baseUrl` is guarded the same way test-connection is
// (BUG 83005's fix): the host is checked BEFORE any socket is opened and before
// authorization, so a refusal is a 400 from the guard, not the provider's
// answer. The guard does not depend on the provider name — it fires for `exa`
// too, where test-connection ignores a pointless `baseUrl`.
//
// Only loopback spellings and unresolvable names are sent. They cover the same
// parsing paths as the private ranges (decimal, hex, octal, short forms, IPv6)
// while a regression could reach nothing but the portal's own host on a port
// nothing listens on; the RFC 1918 and metadata addresses are covered for
// test-connection in web-search.spec.ts and are not sent to new routes.
test.describe("AI Web Search - baseUrl egress guard on configure and set-active-config", () => {
  const FORBIDDEN_HOSTS: Array<[string, string]> = [
    ["loopback 127.0.0.1", "http://127.0.0.1:1/v1"],
    ["short loopback 127.1", "http://127.1:1/v1"],
    ["decimal loopback", "http://2130706433:1/v1"],
    ["hex loopback", "http://0x7f000001:1/v1"],
    ["octal loopback", "http://017700000001:1/v1"],
    ["ipv6 loopback", "http://[::1]:1/v1"],
    ["localhost", "http://localhost:1/v1"],
    ["localhost.localdomain", "http://localhost.localdomain:1/v1"],
    ["unspecified address", "http://0.0.0.0:1/v1"],
  ];
  const BAD_URLS: Array<[string, string, string]> = [
    [
      "an unresolvable host",
      "https://web-search-attacker.invalid",
      WEB_SEARCH_BASE_URL_ERRORS.unresolvable,
    ],
    ["not a URL", "not-a-url", WEB_SEARCH_BASE_URL_ERRORS.invalid],
    ["file://", "file:///etc/passwd", "baseUrl must use http or https"],
    ["ftp://", "ftp://example.com/", "baseUrl must use http or https"],
    [
      "credentials in the URL",
      "http://user:pw@127.0.0.1:1/",
      "baseUrl must not contain credentials",
    ],
  ];

  for (const route of ["configure", "set-active-config"] as const) {
    test(`PUT /api/2.0/ai/web-search/${route} - a loopback, unresolvable or malformed baseUrl is refused with 400 and nothing is stored`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

      const send = (baseUrl: string, provider = "onlyoffice") => {
        const body = { config: { provider, key: "k", baseUrl } };
        return route === "configure"
          ? webSearch.configure("owner", body)
          : webSearch.setActiveConfig("owner", body);
      };

      for (const [label, url] of FORBIDDEN_HOSTS) {
        const { status, error, text } = await send(url);
        expect(status, `${label}: ${text}`).toBe(400);
        expect(error, label).toBe(WEB_SEARCH_BASE_URL_ERRORS.notAllowed);
      }
      for (const [label, url, message] of BAD_URLS) {
        const { status, error, text } = await send(url);
        expect(status, `${label}: ${text}`).toBe(400);
        expect(error, label).toBe(message);
      }

      // The guard is about the host, not the provider: `exa` is refused the same.
      const exa = await send("http://127.0.0.1:1/v1", "exa");
      expect(exa.status, exa.text).toBe(400);
      expect(exa.error).toBe(WEB_SEARCH_BASE_URL_ERRORS.notAllowed);

      // The control: a public host passes the guard and meets the next check, so
      // the 400s above are the host rules and not a blanket refusal of baseUrl.
      // What the next check is differs by route: `configure` dials the host and
      // relays its answer, `set-active-config` goes on to its 403.
      const allowed = await send(RESOLVABLE_NON_PROVIDER_URL);
      expect(
        allowed.text,
        "a public host is not refused by the guard",
      ).not.toMatch(/baseUrl/);
      if (route === "configure") {
        expect(allowed.status, allowed.text).toBe(400);
        expect(allowed.data).toEqual({
          success: false,
          error: {
            field: "key",
            message: expect.stringMatching(/^Request failed with status \d+$/),
          },
        });
      } else {
        expect(allowed.status, allowed.text).toBe(403);
      }

      await expectNothingStored(webSearch);
    });
  }

  test("POST /api/2.0/ai/web-search/test-connection - a non-http scheme and credentials in the baseUrl are refused too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // web-search.spec.ts covers hosts; the scheme and userinfo rules were only
    // ever measured on the two PUT routes.
    for (const [label, url, message] of BAD_URLS) {
      const { status, error, text } = await webSearch.testConnection("owner", {
        provider: "onlyoffice",
        key: "k",
        baseUrl: url,
      });
      expect(status, `${label}: ${text}`).toBe(400);
      expect(error, label).toBe(message);
    }
  });
});

test.describe("AI Web Search - state reads and clear", () => {
  test("GET /api/2.0/ai/web-search/is-configured, get-active-config - repeated and parallel reads agree and never change the state", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const readAll = async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, async () => ({
          configured: await webSearch.isConfigured("owner"),
          active: await webSearch.getActiveConfig("owner"),
        })),
      );
      return {
        configured: results.map(
          (r) => `${r.configured.status}:${r.configured.text}`,
        ),
        active: results.map((r) => `${r.active.status}:${r.active.text}`),
      };
    };

    const off = await readAll();
    expect(new Set(off.configured), "is-configured, add-on off").toEqual(
      new Set(["200:false"]),
    );
    expect(new Set(off.active), "get-active-config, add-on off").toEqual(
      new Set(["200:null"]),
    );

    await setAiSearchAddon(ownerApi.payment, true);

    const on = await readAll();
    expect(new Set(on.configured), "is-configured, add-on on").toEqual(
      new Set(["200:true"]),
    );
    expect(new Set(on.active).size, "one answer to every read").toBe(1);
    const active = JSON.parse(on.active[0].slice("200:".length));
    expect(active.provider).toBe("onlyoffice");
    expect(
      Object.keys(active).sort(),
      "the configuration is the provider and the endpoint — no key, no token",
    ).toEqual(["baseUrl", "provider"]);

    // Reading is not writing: the add-on is exactly as it was.
    expect(await isWalletServiceEnabled(ownerApi.payment, "aiSearch")).toBe(
      true,
    );
  });

  test("GET /api/2.0/ai/web-search/is-configured, get-active-config - an add-on configuration is reported in a folder scope too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: myFolder.response!.current!.id!,
      createFolder: { title: "Autotest Web Search Folder" },
    });
    const folderId = folder.response!.id!;

    expect((await webSearch.isConfigured("owner", folderId)).data).toBe(false);
    await setAiSearchAddon(ownerApi.payment, true);

    // web-search.spec.ts shows an agent and a room; a chat is opened from a
    // folder just as often, and it must see the portal-wide add-on as well.
    const configured = await webSearch.isConfigured("owner", folderId);
    expect(configured.status).toBe(200);
    expect(configured.data).toBe(true);
    const active = await webSearch.getActiveConfig("owner", folderId);
    expect(active.data?.provider).toBe("onlyoffice");
  });

  test("DELETE /api/2.0/ai/web-search/clear - clearing twice is accepted and leaves the other AI settings alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    expect(
      await isWalletServiceEnabled(ownerApi.payment, "aiTools"),
      "the premise: AI Tools is on",
    ).toBe(true);

    for (const attempt of [1, 2]) {
      const { status, data } = await webSearch.clear("owner", {});
      expect(status, `clear #${attempt}`).toBe(200);
      expect(data, `clear #${attempt}`).toEqual({ success: true });
    }

    // A body that names a room does not turn it into a room-scoped clear either:
    // the portal-wide answer is the same and the portal state is untouched.
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Web Search Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const scoped = await webSearch.clear("owner", {
      entityId: String(room.response!.id!),
    });
    expect(scoped.status).toBe(200);

    await expectNothingStored(webSearch);
    expect(await isWalletServiceEnabled(ownerApi.payment, "aiTools")).toBe(
      true,
    );
    const { enabled } = await setPortalAiAccess(ownerApi, true);
    expect(enabled, "the portal AI switch is untouched").toBe(true);
  });
});
