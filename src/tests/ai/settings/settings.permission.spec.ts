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
  // Every member type gets 200 — see settings.spec.ts for the response contract.
  test("GET /api/2.0/ai/config - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiSettings.getAiConfig("anonymous");

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
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
  // The preference is per-user and not gated by role — every type may read and
  // set their own. Isolation between users is proven in settings.spec.ts.
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
});
