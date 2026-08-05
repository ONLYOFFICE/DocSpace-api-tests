import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiPreferences } from "@/src/helpers/ai-preferences";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";

// Deep mode is a per-user preference, so unlike the assignments it is writable by
// every member — the interesting parts are the Guest refusal, the anonymous 401,
// and the fact that one user's choice is invisible to another.

const MEMBER_ROLES: Array<{ label: string; type: UserType; role: AgentRole }> =
  [
    { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
    { label: "User", type: "User", role: "user" },
  ];

test.describe("AI Preferences - anonymous access", () => {
  test("GET|PUT|DELETE /api/2.0/ai/preferences/* - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["get-deep-mode", preferences.getDeepMode("anonymous")],
      ["is-deep-mode-set", preferences.isDeepModeSet("anonymous")],
      ["set-deep-mode", preferences.setDeepMode("anonymous", { value: true })],
      ["clear-deep-mode", preferences.clearDeepMode("anonymous", {})],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} as anonymous`).toBe(401);
    }

    // The refused write left the owner's own preference untouched.
    await apiSdk.authenticateOwner();
    expect((await preferences.isDeepModeSet("owner")).data).toBe(false);
  });
});

test.describe("AI Preferences - role access", () => {
  for (const { label, type, role } of MEMBER_ROLES) {
    test(`GET|PUT /api/2.0/ai/preferences/set-deep-mode - ${label} manages their own deep mode`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await preferences.expectActingAs(role, memberData.response!.id!, label);

      expect((await preferences.getDeepMode(role)).status).toBe(200);

      const { status, data } = await preferences.setDeepMode(role, {
        value: true,
      });
      expect(status).toBe(200);
      expect(data?.success).toBe(true);

      expect((await preferences.getDeepMode(role)).data).toBe(true);
      expect((await preferences.clearDeepMode(role, {})).status).toBe(200);
      expect((await preferences.getDeepMode(role)).data).toBe(false);
    });
  }

  test("GET|PUT|DELETE /api/2.0/ai/preferences/* - a Guest cannot read or change deep mode", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await preferences.expectActingAs("guest", guestData.response!.id!, "Guest");

    expect((await preferences.getDeepMode("guest")).status).toBe(403);
    expect((await preferences.isDeepModeSet("guest")).status).toBe(403);
    expect(
      (await preferences.setDeepMode("guest", { value: true })).status,
    ).toBe(403);
    expect((await preferences.clearDeepMode("guest", {})).status).toBe(403);
  });
});

test.describe("AI Preferences - per-user isolation", () => {
  test("GET /api/2.0/ai/preferences/get-deep-mode - one user's deep mode is invisible to another", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const catalogue = await profiles.catalogue("owner");
    const profileId = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    ).id;
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning Agent",
      profileId,
    });

    // All of the owner's setup happens before the member exists, so the shared
    // context's session cookie cannot make the member's reads run as the owner.
    for (const body of [
      { value: true },
      { value: true, entityId: String(agentId) },
    ]) {
      const { data } = await preferences.setDeepMode("owner", body);
      expect(data?.success).toBe(true);
    }
    expect((await preferences.getDeepMode("owner")).data).toBe(true);
    expect((await preferences.getDeepMode("owner", agentId)).data).toBe(true);

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await preferences.expectActingAs("user", memberData.response!.id!, "User");

    expect(
      (await preferences.getDeepMode("user")).data,
      "the member's portal-wide value",
    ).toBe(false);
    expect((await preferences.isDeepModeSet("user")).data).toBe(false);

    // The member's own write does not reach the owner's value either.
    const { data: memberWrite } = await preferences.setDeepMode("user", {
      value: false,
    });
    expect(memberWrite?.success).toBe(true);

    await apiSdk.authenticateOwner();
    expect(
      (await preferences.getDeepMode("owner")).data,
      "the owner's value survives the member's write",
    ).toBe(true);
  });

  test("BUG 82816: GET /api/2.0/ai/preferences/get-deep-mode - reading an entity the caller has no access to returns 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const catalogue = await profiles.catalogue("owner");
    const profileId = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    ).id;
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning Agent",
      profileId,
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await preferences.expectActingAs("user", memberData.response!.id!, "User");

    // The member is not in the agent's room. The portal-wide scope answers them
    // normally, so this is not a blanket refusal of the route.
    expect((await preferences.getDeepMode("user")).status).toBe(200);

    const { status, error } = await preferences.getDeepMode("user", agentId);
    expect(error).toBe("Internal server error");

    test.fail();
    expect(
      status,
      "an entity the caller cannot see must be refused, not crash",
    ).toBe(403);
  });
});

test.describe("AI Preferences - AI Disabled", () => {
  test("GET|PUT|DELETE /api/2.0/ai/preferences/* - the whole surface returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const { data: seeded } = await preferences.setDeepMode("owner", {
      value: true,
    });
    expect(seeded?.success).toBe(true);

    const { writeStatus, readStatus, enabled } = await setPortalAiAccess(
      ownerApi,
      false,
    );
    expect(writeStatus).toBe(200);
    expect(readStatus).toBe(200);
    expect(enabled).toBe(false);

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["get-deep-mode", preferences.getDeepMode("owner")],
      ["is-deep-mode-set", preferences.isDeepModeSet("owner")],
      ["set-deep-mode", preferences.setDeepMode("owner", { value: false })],
      ["clear-deep-mode", preferences.clearDeepMode("owner", {})],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} with AI access disabled`).toBe(403);
    }

    // Switching AI back on shows the refused write really was refused.
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled).toBe(true);
    expect((await preferences.getDeepMode("owner")).data).toBe(true);
  });
});
