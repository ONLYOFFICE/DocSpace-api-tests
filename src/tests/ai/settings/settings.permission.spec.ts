import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiSettings } from "@/src/helpers/ai-settings";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";

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
// Guest column of this surface, measured 2026-08-19:
//
//   GET  /ai/config                    200  <- defect
//   GET  /ai/config/user               200  <- defect
//   PUT  /ai/config/user               200, and it persists  <- defect
//   GET  /ai/config/vectorization      403 (403 for the Owner too)
//   PUT  /ai/config/vectorization      403 (403 for the Owner too)
//   GET  /ai/web-search/is-configured  403
//   GET  /ai/web-search/get-active-config 403
//   POST /ai/vectorization/tasks       200  <- defect, vectorization.permission.spec.ts
//   POST /ai/text-to-docx              202  <- defect, messages.permission.spec.ts

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

/**
 * A Guest has no access to the AI stack — that is how BUG 83237 was resolved, and
 * every other route on this surface honours it (`/ai/config/vectorization` and
 * both web-search reads are 403 for a Guest here, and so is the whole of
 * `/ai/prompts/*`, `/ai/preferences/*`, `/ai/threads/*` and `/ai/attachments/*`).
 * The two `/ai/config*` reads and the per-user write are the exceptions, so they
 * are measured as Guest defects below instead of inside the role matrices.
 */
const ROLES_WITHOUT_GUEST = ALL_ROLES.filter((entry) => entry.role !== "guest");

test.describe("AI Settings - getAiSettings permissions", () => {
  // Every member type except a Guest gets 200 — see settings.spec.ts for the
  // response contract.
  test("GET /api/2.0/ai/config - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiSettings.getAiConfig("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });

  test("BUG XXXXX: GET /api/2.0/ai/config - a Guest reads the portal's AI settings", async ({
    apiSdk,
  }) => {
    // What comes back is the portal's whole AI configuration — `aiReady`,
    // `systemAiEnabled`, `vectorizationEnabled`, the embedding model and the
    // recommended model for forms — to a user type that may not use a single AI
    // feature. Measured 2026-08-19.
    //
    // Both assertions state the contract a fix has to produce, so a fix turns this
    // into an unexpected pass. The neighbouring 403 read below is the control: the
    // Guest is refused on `/ai/config/vectorization` in the very same session, so
    // this 200 is not a portal whose AI gate is simply open.
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await aiSettings.expectActingAs("guest", guestData.response!.id!, "Guest");

    const blocked = await aiSettings.getVectorizationSettings("guest");
    expect(blocked.status, "the Guest really is refused elsewhere").toBe(403);

    const { status, data } = await aiSettings.getAiConfig("guest");

    test.fail();
    expect(
      data?.response,
      "a Guest must not be handed the portal's AI settings",
    ).toBeUndefined();
    expect(status).toBe(403);
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
  // The preference is per-user and not gated by role — every type but a Guest may
  // read and set their own. Isolation between users is proven in settings.spec.ts,
  // and the Guest case is the defect at the end of this block.
  for (const { type, role } of ROLES_WITHOUT_GUEST) {
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

  test("BUG XXXXX: GET|PUT /api/2.0/ai/config/user - a Guest reads and changes their AI chat preference", async ({
    apiSdk,
  }) => {
    // The one AI write a Guest can make. `chatRecommendedModelVisible` is a
    // preference of the AI chat — a surface a Guest is refused on entirely
    // (`/ai/threads/*` is 403 in every scope, chat.permission.spec.ts) — and the
    // PUT does not merely answer 200, it persists: measured 2026-08-19 the value
    // flipped from `true` to `false` and the Guest's own re-read confirmed it.
    //
    // The stored-state assertion comes first and is written as the contract a fix
    // produces: after a fix the read is 403 and `chatRecommendedModelVisible` is
    // undefined, which is `not.toBe(target)` too.
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await aiSettings.expectActingAs("guest", guestData.response!.id!, "Guest");

    const before = await aiSettings.getUserConfig("guest");
    const target = !before.data?.response?.chatRecommendedModelVisible;
    const written = await aiSettings.setUserConfig("guest", {
      chatRecommendedModelVisible: target,
    });
    const after = await aiSettings.getUserConfig("guest");

    test.fail();
    expect(
      after.data?.response?.chatRecommendedModelVisible,
      "a Guest's write must not have been stored",
    ).not.toBe(target);
    expect(before.status, "a Guest must not read the preference").toBe(403);
    expect(written.status, "a Guest must not write the preference").toBe(403);
  });
});
