import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiSettings } from "@/src/helpers/ai-settings";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";

// The old `/ai/config/web-search` pair is gone (404) — manual web-search
// provider config is not exposed any more. What remains readable is
// `/ai/web-search/is-configured` and `/ai/web-search/get-active-config`.
//
// `/ai/config/vectorization` still exists but answers 403 to everyone, Owner
// included: the AI gateway owns embedding configuration.
//
// Error bodies are `{"error":"Forbidden"}` / `{"error":"Unauthorized"}` — the
// old `data.error.message` ("Access denied") no longer exists.

const NON_OWNER_ROLES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
  { type: "Guest", role: "guest" },
];

test.describe("AI Settings - getAiSettings permissions", () => {
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
  for (const { type, role } of [
    { type: undefined, role: "owner" as AgentRole },
    ...NON_OWNER_ROLES,
  ]) {
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
  // Everyone but a Guest may read whether web search is wired up.
  for (const { type, role } of NON_OWNER_ROLES) {
    test(`GET /api/2.0/ai/web-search/is-configured - ${role} read access`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      await apiSdk.addAuthenticatedMember("owner", type);

      const { status, data, error } =
        await aiSettings.webSearchIsConfigured(role);

      if (role === "guest") {
        expect(error).toBe("Forbidden");
        expect(status).toBe(403);
      } else {
        expect(data).toBe(false);
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

test.describe("AI Settings - per-user chat config", () => {
  test("GET/PUT /api/2.0/ai/config/user - Owner reads and updates the preference", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: before, status: readStatus } =
      await aiSettings.getUserConfig("owner");
    expect(readStatus).toBe(200);
    expect(before?.response?.chatRecommendedModelVisible).toBe(true);

    const { status } = await aiSettings.setUserConfig("owner", {
      chatRecommendedModelVisible: false,
    });

    const { data: after } = await aiSettings.getUserConfig("owner");

    expect(after?.response?.chatRecommendedModelVisible).toBe(false);
    expect(status).toBe(200);
  });

  // The preference is per-user and not gated by role — every type may set it.
  for (const { type, role } of NON_OWNER_ROLES) {
    test(`PUT /api/2.0/ai/config/user - ${role} updates their own preference`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      await apiSdk.addAuthenticatedMember("owner", type);

      const { data, status } = await aiSettings.setUserConfig(role, {
        chatRecommendedModelVisible: false,
      });

      expect(status).toBe(200);
      expect(data?.response?.chatRecommendedModelVisible).toBe(false);
    });
  }

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
