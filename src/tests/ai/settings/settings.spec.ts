import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { UserType } from "@/src/services/api-sdk";
import { AiSettings } from "@/src/helpers/ai-settings";

// Only getAiSettings and the per-user chat config are exercised: the AI gateway
// disables manual configuration of vectorization / web-search providers (those
// endpoints return 403 for everyone, Owner included — see
// settings.permission.spec.ts).
//
// `GET /api/2.0/ai/config` mixes two very different kinds of field:
//
//   * portal STATE — webSearchEnabled / vectorizationEnabled / aiReady /
//     systemAiEnabled and their *NeedReset twins. These follow the paid AI Tools
//     wallet service and the portal AI switch, so a fresh portal reports them
//     all false. Their values are pinned in settings.ai-disabled.spec.ts, which
//     covers both off-states (unpaid -> paid transition and switch off) and so
//     establishes the cause. Here we only assert the contract.
//   * product CONSTANTS — the MCP tool names and the embedding model, which the
//     clients depend on by name. Those are pinned exactly, once.

const ROLES: Array<{ label: string; type?: UserType }> = [
  { label: "Owner" },
  { label: "DocSpaceAdmin", type: "DocSpaceAdmin" },
  { label: "RoomAdmin", type: "RoomAdmin" },
  { label: "User", type: "User" },
  { label: "Guest", type: "Guest" },
];

const STATE_FLAGS = [
  "webSearchEnabled",
  "webSearchNeedReset",
  "vectorizationEnabled",
  "vectorizationNeedReset",
  "aiReady",
  "aiReadyNeedReset",
  "systemAiEnabled",
] as const;

test.describe("AI Settings - getAiSettings", () => {
  for (const { label, type } of ROLES) {
    test(`GET /api/2.0/ai/config - ${label} gets AI settings`, async ({
      apiSdk,
    }) => {
      const api = type
        ? (await apiSdk.addAuthenticatedMember("owner", type)).api
        : apiSdk.forRole("owner");

      const { data, status } = await api.aiSettings.getAiSettings();

      expect(status).toBe(200);

      const response = data.response;
      expect(response).toBeDefined();
      for (const flag of STATE_FLAGS) {
        expect(typeof response?.[flag]).toBe("boolean");
      }
      expect(typeof response?.portalMcpServerId).toBe("string");
      expect(response?.portalMcpServerId).not.toBe("");
      expect(typeof response?.embeddingModel).toBe("string");
      expect(Object.keys(response?.modelAliases ?? {}).length).toBeGreaterThan(
        0,
      );
      expect(typeof response?.knowledgeSearchToolName).toBe("string");
      expect(typeof response?.webSearchToolName).toBe("string");
      expect(typeof response?.webCrawlingToolName).toBe("string");
      expect(typeof response?.generateDocxToolName).toBe("string");
      expect(typeof response?.generateFormToolName).toBe("string");
      expect(typeof response?.generatePresentationToolName).toBe("string");
    });
  }

  test("GET /api/2.0/ai/config - the tool names and embedding model match the published contract", async ({
    apiSdk,
  }) => {
    // These are the names the web client and the MCP server address the tools
    // by; a rename here breaks integrations, so pin them exactly.
    const { data, status } = await apiSdk
      .forRole("owner")
      .aiSettings.getAiSettings();

    expect(status).toBe(200);

    const response = data.response;
    expect(response?.knowledgeSearchToolName).toBe("docspace_knowledge_search");
    expect(response?.webSearchToolName).toBe("docspace_web_search");
    expect(response?.webCrawlingToolName).toBe("docspace_web_crawling");
    expect(response?.generateDocxToolName).toBe("docspace_generate_docx");
    expect(response?.generateFormToolName).toBe("docspace_generate_form");
    expect(response?.generatePresentationToolName).toBe(
      "docspace_generate_presentation",
    );
    expect(response?.embeddingModel).toBe("text-embedding-3-small");
  });
});

test.describe("AI Settings - per-user chat config", () => {
  test("GET /api/2.0/ai/config/user - a new user sees the recommended-model banner", async ({
    apiSdk,
  }) => {
    // The shipped default, kept as its own test so the update tests below can
    // stay default-agnostic.
    const { data, status } = await apiSdk
      .forRole("owner")
      .aiSettings.getAiUserSettings();

    expect(status).toBe(200);
    expect(data.response?.chatRecommendedModelVisible).toBe(true);
  });

  test("PUT /api/2.0/ai/config/user - Owner's update is persisted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: before, status: readStatus } =
      await ownerApi.aiSettings.getAiUserSettings();
    expect(readStatus).toBe(200);
    const initial = before.response?.chatRecommendedModelVisible;
    expect(typeof initial).toBe("boolean");
    const updated = !initial;

    const { data: written, status: writeStatus } =
      await ownerApi.aiSettings.setAiUserSettings({
        setAiUserSettingsRequestDto: { chatRecommendedModelVisible: updated },
      });
    expect(writeStatus).toBe(200);
    expect(written.response?.chatRecommendedModelVisible).toBe(updated);

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.getAiUserSettings();
    expect(afterStatus).toBe(200);
    expect(after.response?.chatRecommendedModelVisible).toBe(updated);
  });

  test("PUT /api/2.0/ai/config/user - one user's preference does not change anybody else's", async ({
    apiSdk,
  }) => {
    // Both members are created before either is authenticated: authenticating a
    // member puts their session cookie on the shared request context, and a
    // second addMember/authentication after that fails. The SDK clients handed
    // back below carry their own bearer token, so they can be used in any order.
    const user = await apiSdk.addMember("owner", "User");
    const roomAdmin = await apiSdk.addMember("owner", "RoomAdmin");
    const userApi = await apiSdk.authenticateMember(user.userData, "User");
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdmin.userData,
      "RoomAdmin",
    );
    const ownerApi = apiSdk.forRole("owner");

    const { data: userBefore, status: userBeforeStatus } =
      await userApi.aiSettings.getAiUserSettings();
    expect(userBeforeStatus).toBe(200);
    const target = !userBefore.response?.chatRecommendedModelVisible;

    const { status } = await userApi.aiSettings.setAiUserSettings({
      setAiUserSettingsRequestDto: { chatRecommendedModelVisible: target },
    });
    expect(status).toBe(200);

    const { data: userAfter, status: userAfterStatus } =
      await userApi.aiSettings.getAiUserSettings();
    expect(userAfterStatus).toBe(200);
    expect(userAfter.response?.chatRecommendedModelVisible).toBe(target);

    const { data: roomAdminAfter, status: roomAdminStatus } =
      await roomAdminApi.aiSettings.getAiUserSettings();
    expect(roomAdminStatus).toBe(200);
    expect(roomAdminAfter.response?.chatRecommendedModelVisible).toBe(!target);

    const { data: ownerAfter, status: ownerStatus } =
      await ownerApi.aiSettings.getAiUserSettings();
    expect(ownerStatus).toBe(200);
    expect(ownerAfter.response?.chatRecommendedModelVisible).toBe(!target);
  });

  test("PUT /api/2.0/ai/config/user - a non-boolean value is rejected and changes nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: before, status: beforeStatus } =
      await ownerApi.aiSettings.getAiUserSettings();
    expect(beforeStatus).toBe(200);
    const initial = before.response?.chatRecommendedModelVisible;

    // Sent raw: the SDK's DTO is typed boolean, so the bad value cannot be
    // expressed through it.
    const { status, error } = await aiSettings.setUserConfig("owner", {
      chatRecommendedModelVisible: "yes" as unknown as boolean,
    });

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.getAiUserSettings();
    expect(afterStatus).toBe(200);
    expect(after.response?.chatRecommendedModelVisible).toBe(initial);
    expect(error).toBe("Bad Request");
    expect(status).toBe(400);
  });

  test("BUG 82725: PUT /api/2.0/ai/config/user - an empty body wipes the stored preference", async ({
    apiSdk,
  }) => {
    // The DTO carries a single optional flag, so `{}` says "change nothing".
    // Instead the missing field is bound as false and overwrites the user's
    // stored preference, which is silent data loss on a partial update.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: before, status: beforeStatus } =
      await ownerApi.aiSettings.getAiUserSettings();
    expect(beforeStatus).toBe(200);
    const initial = before.response?.chatRecommendedModelVisible;
    expect(initial).toBe(true);

    const { status } = await aiSettings.setUserConfig("owner", {});

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.getAiUserSettings();
    // Checked before test.fail() is armed: a broken read must surface as a real
    // failure, not as the expected one.
    expect(afterStatus).toBe(200);

    test.fail();
    expect(after.response?.chatRecommendedModelVisible).toBe(initial);
    expect(status).toBe(200);
  });
});
