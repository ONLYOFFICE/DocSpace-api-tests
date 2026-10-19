import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiSettings } from "@/src/helpers/ai-settings";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { enableAiGateway } from "@/src/helpers/wallet-services";

// The old `/ai/config/web-search` pair is gone (404) — manual web-search
// provider config is not exposed any more. What remains readable is
// `/ai/web-search/is-configured` and `/ai/web-search/get-active-config`, and
// both are covered for every role below.
//
// `/ai/config/vectorization` still exists but answers 403 to everyone, Owner
// included, in every portal state (AI switch on or off, AI Tools paid for or
// not): the AI gateway owns embedding configuration.
//
// Error bodies are `{"error":"Forbidden"}` / `{"error":"Unauthorized"}` — the
// old `data.error.message` ("Access denied") no longer exists.
//
// Guest column of this surface, measured 2026-08-19. A Guest is a Viewer — they may
// be invited no other way — and a Viewer's reads are theirs by design (correction from
// the developers, 2026-08-19), so the 200s here are the contract:
//
//   GET  /ai/config                    200, as for every other member type
//   GET  /ai/config/user               200, their own preference
//   PUT  /ai/config/user               200, and it persists
//   GET  /ai/config/vectorization      403 (403 for the Owner too)
//   PUT  /ai/config/vectorization      403 (403 for the Owner too)
//   GET  /ai/web-search/is-configured  403 <- 200 for every other type
//   GET  /ai/web-search/get-active-config 403 <- 200 for every other type
//   POST /ai/vectorization/tasks       200 on a file they cannot read <- defect,
//                                      vectorization.permission.spec.ts
//   POST /ai/text-to-docx              202 <- open question, messages.permission.spec.ts
//
// The two web-search 403s are the discriminator this file leans on: they are the one
// place a Guest is answered differently from a User on this surface, so a test that
// needs to prove its caller really is being treated as a Guest calls one of them.

const NON_OWNER_ROLES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
  { type: "Guest", role: "guest" },
];

const ALL_ROLES: Array<{ type?: UserType; role: AgentRole }> = [
  { role: "owner" },
  ...NON_OWNER_ROLES,
];

test.describe("AI Settings - getAiSettings permissions", () => {
  // Every member type, a Guest included, gets 200 — see settings.spec.ts for the
  // response contract.
  test("GET /api/2.0/ai/config - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiSettings.getAiConfig("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("GET /api/2.0/ai/config - a Guest reads the same portal AI settings a Viewer reads", async ({
    apiSdk,
  }) => {
    // A Guest is a Viewer, and this config is what a Viewer is shown, so the 200 is
    // the contract. What is asserted is the scope: the Guest's payload must not carry
    // a field the User's does not. Values are deliberately not compared field by
    // field — `aiReady` and friends are portal state, identical for both callers, and
    // a mismatch there would be a portal that changed mid-test, not a permission.
    //
    // `/ai/web-search/is-configured` is the discriminator: 403 for a Guest and 200 for
    // every other type, so it proves this caller really is being treated as a Guest
    // and not silently as the User authenticated beside them.
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // Plain members first, then authenticate serially: `addMember` after an
    // `addAuthenticatedMember` is refused, and two of those in one test flake.
    const guest = await apiSdk.addMember("owner", "Guest");
    const viewer = await apiSdk.addMember("owner", "User");

    await apiSdk.authenticateMember(viewer.userData, "User");
    await aiSettings.expectActingAs(
      "user",
      viewer.data.response!.id!,
      "the Viewer",
    );
    const seenByViewer = await aiSettings.getAiConfig("user");
    expect(seenByViewer.status).toBe(200);

    await apiSdk.authenticateMember(guest.userData, "Guest");
    await aiSettings.expectActingAs(
      "guest",
      guest.data.response!.id!,
      "the Guest",
    );

    const isGuest = await aiSettings.webSearchIsConfigured("guest");
    expect(isGuest.status, "the caller really is a Guest, not the User").toBe(
      403,
    );

    const { status, data } = await aiSettings.getAiConfig("guest");

    expect(status).toBe(200);
    expect(
      Object.keys(data?.response ?? {}).sort(),
      "a Guest must be shown no field the Viewer is not",
    ).toEqual(Object.keys(seenByViewer.data?.response ?? {}).sort());
  });
});

test.describe("AI Settings - vectorization config permissions", () => {
  // Not role-dependent: the gateway refuses manual embedding config outright,
  // so even the portal Owner is forbidden.
  for (const { type, role } of ALL_ROLES) {
    test(`GET /api/2.0/ai/config/vectorization - ${role} is forbidden`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }

      const { status, error } = await aiSettings.getVectorizationSettings(role);

      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });

    test(`PUT /api/2.0/ai/config/vectorization - ${role} is forbidden`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }

      const { status, error } = await aiSettings.setVectorizationSettings(
        role,
        { key: null },
      );

      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });
  }

  test("GET /api/2.0/ai/config/vectorization - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } =
      await aiSettings.getVectorizationSettings("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("PUT /api/2.0/ai/config/vectorization - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiSettings.setVectorizationSettings(
      "anonymous",
      { key: null },
    );

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });
});

test.describe("AI Settings - web search state permissions", () => {
  // Everyone but a Guest may read whether web search is wired up. Whether it
  // actually IS wired up is portal configuration, not a permission, so these
  // tests assert the payload's type and leave its value to
  // settings.ai-disabled.spec.ts.
  for (const { type, role } of ALL_ROLES) {
    test(`GET /api/2.0/ai/web-search/is-configured - ${role} read access`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }

      const { status, data, error } =
        await aiSettings.webSearchIsConfigured(role);

      if (role === "guest") {
        expect(error).toBe("Forbidden");
        expect(status).toBe(403);
      } else {
        expect(typeof data).toBe("boolean");
        expect(status).toBe(200);
      }
    });

    test(`GET /api/2.0/ai/web-search/get-active-config - ${role} read access`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }

      const { status, data, error } =
        await aiSettings.webSearchActiveConfig(role);

      if (role === "guest") {
        expect(error).toBe("Forbidden");
        expect(status).toBe(403);
      } else {
        // `null` while no web-search provider is configured on the portal.
        expect(error).toBeUndefined();
        expect(data === null || typeof data === "object").toBe(true);
        expect(status).toBe(200);
      }
    });
  }

  test("GET /api/2.0/ai/web-search/is-configured - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } =
      await aiSettings.webSearchIsConfigured("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("GET /api/2.0/ai/web-search/get-active-config - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } =
      await aiSettings.webSearchActiveConfig("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });
});

test.describe("AI Settings - per-user chat config permissions", () => {
  // The preference is per-user and not gated by role — every type, a Guest included,
  // may read and set their own. A Guest holds it for the same reason a Viewer does:
  // they are one. Isolation between users is proven in settings.spec.ts.
  for (const { type, role } of ALL_ROLES) {
    test(`GET /api/2.0/ai/config/user - ${role} reads their own preference`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }

      const { status, data } = await aiSettings.getUserConfig(role);

      expect(status).toBe(200);
      expect(typeof data?.response?.chatRecommendedModelVisible).toBe(
        "boolean",
      );
    });

    test(`PUT /api/2.0/ai/config/user - ${role} updates their own preference`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      if (type) {
        await apiSdk.addAuthenticatedMember("owner", type);
      }

      const { data: before, status: beforeStatus } =
        await aiSettings.getUserConfig(role);
      expect(beforeStatus).toBe(200);
      const target = !before?.response?.chatRecommendedModelVisible;

      const { data, status } = await aiSettings.setUserConfig(role, {
        chatRecommendedModelVisible: target,
      });
      expect(status).toBe(200);
      expect(data?.response?.chatRecommendedModelVisible).toBe(target);

      // The PUT response echoing the value proves nothing about storage.
      const { data: after, status: afterStatus } =
        await aiSettings.getUserConfig(role);
      expect(afterStatus).toBe(200);
      expect(after?.response?.chatRecommendedModelVisible).toBe(target);
    });
  }

  test("GET /api/2.0/ai/config/user - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiSettings.getUserConfig("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("PUT /api/2.0/ai/config/user - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiSettings.setUserConfig("anonymous", {
      chatRecommendedModelVisible: false,
    });

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  // A Guest's own read and write of this preference are covered by the matrix above,
  // which now carries the Guest row: the write is asserted to persist through the
  // Guest's own re-read, which is the whole of what this route offers them.
});

// ---------------------------------------------------------------------------
// Audit additions (SettingsApi, SDK 4.0.0).
// ---------------------------------------------------------------------------

test.describe("AI Settings - an invalid token is refused on every settings route", () => {
  // `Anonymous gets 401` above covers a missing token. This is a token that is
  // present but wrong: the real one with its signature tail overwritten, which
  // the platform answers 401 on `/people/@self` and `/files/rooms` as well.
  //
  // A token that is not decodable at all (e.g. `garbage.token.value`) answers
  // 400 `IDX12729` on the core routes too — measured 2026-10-09 — so that is
  // platform behaviour, not an AI-settings one, and is deliberately not pinned
  // here. Logging out does not revoke a bearer token (the same token still
  // answers 200 afterwards), so a revoked-token case cannot be built either.
  const ROUTES: Array<{
    label: string;
    method: "get" | "put";
    path: string;
    body?: unknown;
    /** What the genuine token gets: the positive control. */
    genuine: number;
  }> = [
    {
      label: "GET /ai/config",
      method: "get",
      path: "/api/2.0/ai/config",
      genuine: 200,
    },
    {
      label: "GET /ai/config/user",
      method: "get",
      path: "/api/2.0/ai/config/user",
      genuine: 200,
    },
    {
      label: "PUT /ai/config/user",
      method: "put",
      path: "/api/2.0/ai/config/user",
      genuine: 200,
    },
    {
      label: "GET /ai/config/vectorization",
      method: "get",
      path: "/api/2.0/ai/config/vectorization",
      genuine: 403,
    },
    {
      label: "PUT /ai/config/vectorization",
      method: "put",
      path: "/api/2.0/ai/config/vectorization",
      body: { key: null },
      genuine: 403,
    },
  ];

  for (const route of ROUTES) {
    test(`${route.label} - a token with a corrupted signature gets 401 Unauthorized`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      const base = apiSdk.tokenStore.portalBaseUrl;
      const genuine = apiSdk.tokenStore.getToken("owner");
      const tampered = `${genuine.slice(0, -4)}AAAA`;
      expect(tampered).not.toBe(genuine);

      const before = await aiSettings.getUserConfig("owner");
      expect(before.status).toBe(200);
      const stored = before.data?.response?.chatRecommendedModelVisible;
      expect(typeof stored).toBe("boolean");

      // The write tries to flip the stored preference, so a PUT that slipped
      // past the gate shows in the read-back below.
      const body =
        route.label === "PUT /ai/config/user"
          ? { chatRecommendedModelVisible: !stored }
          : route.body;
      const send = (token: string) =>
        apiSdk.request[route.method](`${base}${route.path}`, {
          headers: {
            Origin: base,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { data: body }),
        });

      const refused = await send(tampered);
      const refusedText = await refused.text();

      // State before status: nothing may have been stored by a refused call.
      const after = await aiSettings.getUserConfig("owner");
      expect(after.data?.response?.chatRecommendedModelVisible).toBe(stored);

      // Positive control: the genuine token gets past the authentication gate on
      // the same request, so the 401 is about the token and nothing else.
      expect((await send(genuine)).status()).toBe(route.genuine);

      expect(JSON.parse(refusedText)).toEqual({ error: "Unauthorized" });
      expect(refused.status()).toBe(401);
    });
  }
});

test.describe("AI Settings - vectorization config is forbidden in every portal state", () => {
  // The role matrix above proves 403 per ROLE; nothing proved it per PORTAL
  // STATE, although the header comment claims it. Each state's premise is read
  // back first (an unasserted switch flip would fake every 403 below it), and
  // the portal flags are compared afterwards so a "refused" PUT that still
  // changed something would show.
  test("GET/PUT /api/2.0/ai/config/vectorization - Owner gets 403 whether AI is switched on or off, paid for or not", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const expectState = async (switchOn: boolean, paid: boolean) => {
      const { data, status } = await ownerApi.aiSettings.aiSettingsGet();
      expect(status).toBe(200);
      expect(data.response?.aiReady, "wallet service state").toBe(
        paid && switchOn,
      );
      const { data: access, status: accessStatus } =
        await ownerApi.commonSettings.getTenantAiAccessSettings();
      expect(accessStatus).toBe(200);
      expect(access.response?.enabled, "portal AI switch").toBe(switchOn);
    };

    const expectForbiddenWithoutSideEffect = async () => {
      const { data: before } = await ownerApi.aiSettings.aiSettingsGet();
      const get = await aiSettings.getVectorizationSettings("owner");
      const put = await aiSettings.setVectorizationSettings("owner", {
        key: null,
      });
      const { data: after } = await ownerApi.aiSettings.aiSettingsGet();

      expect(after.response).toEqual(before.response);
      expect(get.error).toBe("Forbidden");
      expect(get.status).toBe(403);
      expect(put.error).toBe("Forbidden");
      expect(put.status).toBe(403);
    };

    await test.step("unpaid, AI switch on", async () => {
      await expectState(true, false);
      await expectForbiddenWithoutSideEffect();
    });

    await test.step("unpaid, AI switch off", async () => {
      const off = await setPortalAiAccess(ownerApi, false);
      expect(off.writeStatus).toBe(200);
      await expectState(false, false);
      await expectForbiddenWithoutSideEffect();
    });

    await test.step("paid, AI switch on", async () => {
      const on = await setPortalAiAccess(ownerApi, true);
      expect(on.writeStatus).toBe(200);
      await enableAiGateway(paymentsApi, ownerApi.payment);
      await expectState(true, true);
      await expectForbiddenWithoutSideEffect();
    });

    await test.step("paid, AI switch off", async () => {
      const off = await setPortalAiAccess(ownerApi, false);
      expect(off.writeStatus).toBe(200);
      await expectState(false, true);
      await expectForbiddenWithoutSideEffect();
      // Leave the switch as found.
      const on = await setPortalAiAccess(ownerApi, true);
      expect(on.enabled).toBe(true);
    });
  });
});

test.describe("AI Settings - PUT vectorization is refused before the body is looked at", () => {
  // A well-formed JSON body is never inspected: the permission check answers
  // first, so every shape gets the same 403 and nothing about a "valid" body can
  // be learned. A body that is not an object at all is rejected earlier still,
  // by the binder, with 400 — measured 2026-10-09. That is the order being
  // pinned, not a statement about what the route accepts: no account can reach a
  // successful write, so the real request shape is unknowable from here.
  test("PUT /api/2.0/ai/config/vectorization - Owner gets 403 for every well-formed body and 400 for an unparseable one, with no side effect", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: before, status: beforeStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(beforeStatus).toBe(200);

    const forbidden: Array<[string, unknown]> = [
      ["an empty object", {}],
      ["a null value", { key: null }],
      ["an unknown field", { unknownField: 1 }],
      ["a nested object", { provider: { name: "x", options: { a: 1 } } }],
      ["JSON null", "null"],
      ["no body", undefined],
    ];
    for (const [label, body] of forbidden) {
      await test.step(`${label} -> 403`, async () => {
        const { status, error } = await aiSettings.setVectorizationSettings(
          "owner",
          body as Record<string, unknown>,
        );
        expect(error).toBe("Forbidden");
        expect(status).toBe(403);
      });
    }

    const unparseable: Array<[string, unknown]> = [
      ["a JSON array", [1]],
      ["malformed JSON", "{bad"],
    ];
    for (const [label, body] of unparseable) {
      await test.step(`${label} -> 400`, async () => {
        const { status, error } = await aiSettings.setVectorizationSettings(
          "owner",
          body as Record<string, unknown>,
        );
        expect(error).toBe("Bad Request");
        expect(status).toBe(400);
      });
    }

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(afterStatus).toBe(200);
    expect(after.response).toEqual(before.response);
  });
});
