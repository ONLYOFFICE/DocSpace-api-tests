import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { UserType } from "@/src/services/api-sdk";
import { AiSettings } from "@/src/helpers/ai-settings";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  creditAiBalance,
  enableWalletService,
  isWalletServiceEnabled,
} from "@/src/helpers/wallet-services";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { Role } from "@/src/services/token-store";

// Only getAiSettings and the per-user chat config are exercised: the AI gateway
// disables manual configuration of vectorization / web-search providers (those
// endpoints return 403 for everyone, Owner included — see
// settings.permission.spec.ts).
//
// `GET /api/2.0/ai/config` returns six fields:
//
//   { vectorizationEnabled, vectorizationNeedReset, aiReady, embeddingModel,
//     systemAiEnabled, recommendedModelForForms }
//
// which are two very different kinds of field:
//
//   * portal STATE — vectorizationEnabled / aiReady / systemAiEnabled and
//     vectorizationNeedReset. These follow the paid AI Tools wallet service and
//     the portal AI switch, so a fresh portal reports them all false. Their
//     values are pinned in settings.ai-disabled.spec.ts, which covers both
//     off-states (unpaid -> paid transition and switch off) and so establishes
//     the cause. Here we only assert the contract.
//   * a product CONSTANT — the embedding model, which the clients depend on by
//     name. It is pinned exactly, once.
//
// An earlier, longer body also carried the MCP tool names, portalMcpServerId,
// modelAliases and the webSearchEnabled / webSearchNeedReset / aiReadyNeedReset
// flags. They were dropped deliberately, not lost: SDK 3.7.0 renamed the model
// (AiSettingsDto -> AiAiSettingsDto) and declares exactly the six fields above,
// so the shorter body is the contract.

const ROLES: Array<{ label: string; type?: UserType }> = [
  { label: "Owner" },
  { label: "DocSpaceAdmin", type: "DocSpaceAdmin" },
  { label: "RoomAdmin", type: "RoomAdmin" },
  { label: "User", type: "User" },
  { label: "Guest", type: "Guest" },
];

const STATE_FLAGS = [
  "vectorizationEnabled",
  "vectorizationNeedReset",
  "aiReady",
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

      const { data, status } = await api.aiSettings.aiSettingsGet();

      expect(status).toBe(200);

      const response = data.response;
      expect(response).toBeDefined();
      for (const flag of STATE_FLAGS) {
        expect(typeof response?.[flag]).toBe("boolean");
      }
      expect(typeof response?.embeddingModel).toBe("string");
      expect(typeof response?.recommendedModelForForms).toBe("string");
    });
  }

  test("GET /api/2.0/ai/config - the embedding model matches the published contract", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .aiSettings.aiSettingsGet();

    expect(status).toBe(200);
    expect(data.response?.embeddingModel).toBe("text-embedding-3-small");
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
      .aiSettings.aiSettingsGetUser();

    expect(status).toBe(200);
    expect(data.response?.chatRecommendedModelVisible).toBe(true);
  });

  test("PUT /api/2.0/ai/config/user - Owner's update is persisted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: before, status: readStatus } =
      await ownerApi.aiSettings.aiSettingsGetUser();
    expect(readStatus).toBe(200);
    const initial = before.response?.chatRecommendedModelVisible;
    expect(typeof initial).toBe("boolean");
    const updated = !initial;

    const { data: written, status: writeStatus } =
      await ownerApi.aiSettings.aiSettingsSetUser({
        requestBody: { chatRecommendedModelVisible: updated },
      });
    expect(writeStatus).toBe(200);
    expect(written.response?.chatRecommendedModelVisible).toBe(updated);

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.aiSettingsGetUser();
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
      await userApi.aiSettings.aiSettingsGetUser();
    expect(userBeforeStatus).toBe(200);
    const target = !userBefore.response?.chatRecommendedModelVisible;

    const { status } = await userApi.aiSettings.aiSettingsSetUser({
      requestBody: { chatRecommendedModelVisible: target },
    });
    expect(status).toBe(200);

    const { data: userAfter, status: userAfterStatus } =
      await userApi.aiSettings.aiSettingsGetUser();
    expect(userAfterStatus).toBe(200);
    expect(userAfter.response?.chatRecommendedModelVisible).toBe(target);

    const { data: roomAdminAfter, status: roomAdminStatus } =
      await roomAdminApi.aiSettings.aiSettingsGetUser();
    expect(roomAdminStatus).toBe(200);
    expect(roomAdminAfter.response?.chatRecommendedModelVisible).toBe(!target);

    const { data: ownerAfter, status: ownerStatus } =
      await ownerApi.aiSettings.aiSettingsGetUser();
    expect(ownerStatus).toBe(200);
    expect(ownerAfter.response?.chatRecommendedModelVisible).toBe(!target);
  });

  test("PUT /api/2.0/ai/config/user - a non-boolean value is rejected and changes nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: before, status: beforeStatus } =
      await ownerApi.aiSettings.aiSettingsGetUser();
    expect(beforeStatus).toBe(200);
    const initial = before.response?.chatRecommendedModelVisible;

    // Sent raw: the SDK's DTO is typed boolean, so the bad value cannot be
    // expressed through it.
    const { status, error } = await aiSettings.setUserConfig("owner", {
      chatRecommendedModelVisible: "yes" as unknown as boolean,
    });

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.aiSettingsGetUser();
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
      await ownerApi.aiSettings.aiSettingsGetUser();
    expect(beforeStatus).toBe(200);
    const initial = before.response?.chatRecommendedModelVisible;
    expect(initial).toBe(true);

    const { status } = await aiSettings.setUserConfig("owner", {});

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.aiSettingsGetUser();
    // Checked before test.fail() is armed: a broken read must surface as a real
    // failure, not as the expected one.
    expect(afterStatus).toBe(200);
    expect(after.response?.chatRecommendedModelVisible).toBe(initial);
    expect(status).toBe(200);
  });
});

// "Managing the AI services is a portal administrator's job, not only the
// payer's." The blocks below measure that one requirement across the four routes
// it actually spans, and draw the line where administration stops and paying
// begins.
//
// Who may manage what, measured 2026-08-19:
//
//                                        owner  DSAdmin  RoomAdmin  User  Guest  anon
//   PUT  /settings/ai-access               200    200      403      403    403   401
//   POST /portal/payment/servicestate      200    200      403      403    403   401
//   PUT  /ai/assignments/assign            200    200      403      403    403   401
//   POST /ai/agents                        200    200      200      403    403   401
//   POST /portal/payment/deposit           200    403      403      403    403   401
//   PUT  /portal/payment/update            200    403      403      403    403   401
//   POST /portal/payment/topupsettings     200    403      403      403    403   401
//   GET  /portal/payment/checkoutsetupurl  200    403      403      403    403   401
//
// So an administrator manages the AI services and does not touch the wallet
// behind them: they switch AI on portal-wide, pay-enable the AI add-ons out of a
// wallet somebody else funded, bind models to tasks and create agents — but the
// top-up, the subscription and the payment method stay with the payer. The last
// block asserts both halves of that in one session, which is the only form in
// which "manage AI ≠ manage payment" is actually measurable: a standalone 403 on
// `/payment/deposit` would also pass on a portal where the admin can do nothing
// at all.
//
// The 403 rows of the first four routes are covered per area elsewhere
// (assignments.permission.spec.ts, agents.permission.spec.ts,
// payments.permissions.spec.ts) — what was missing, and is here, is the write
// side of the portal AI switch, which had no role coverage at all, plus the
// admin's positive path end to end.
//
// Deliberately out of scope, because no build exposes an owner/admin difference
// on it: `/ai/profiles` create/update/delete answers 403 to the Owner as well
// (the gateway catalogue is read-only, BUG 82971) and so does
// `/ai/config/vectorization`. "Connect an AI model" therefore has no manageable
// API surface at all today — the closest measurable thing is the assignment of a
// catalogue model to a task, which is step 3 of the provisioning test below.

/** The gate the AI switch closes. 200 for every member type but a Guest. */
const GATED_ROUTE = "GET /ai/web-search/is-configured";

const MANAGER_ROLES: Array<{ label: string; type?: UserType; role: Role }> = [
  { label: "Owner", role: "owner" },
  { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
];

const REFUSED_ROLES: Array<{ label: string; type: UserType; role: Role }> = [
  { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
  { label: "User", type: "User", role: "user" },
  { label: "Guest", type: "Guest", role: "guest" },
];

test.describe("AI services management - the portal AI switch", () => {
  for (const { label, type, role } of MANAGER_ROLES) {
    test(`PUT /api/2.0/settings/ai-access - ${label} turns the portal AI switch off and back on`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
      if (type) {
        const { data: member } = await apiSdk.addAuthenticatedMember(
          "owner",
          type,
        );
        // The conclusion is "an administrator, not the owner, flipped it", so
        // who the calls are made as has to be pinned rather than assumed.
        await aiSettings.expectActingAs(role, member.response!.id!, label);
      }
      const managerApi = apiSdk.forRole(role);

      // The premise: a fresh portal ships the switch on, so "off" is a real
      // change and the gated route is reachable to begin with.
      const open = await aiSettings.webSearchIsConfigured(role);
      expect(open.status, `${GATED_ROUTE} before the flip`).toBe(200);

      const off = await setPortalAiAccess(managerApi, false);
      expect(off.writeStatus).toBe(200);
      expect(off.readStatus).toBe(200);
      expect(off.enabled, "the switch reads back as off").toBe(false);

      // A 200 on the PUT is not the same answer as AI being off: the flip has
      // to reach the routes the switch gates.
      const gated = await aiSettings.webSearchIsConfigured(role);
      expect(gated.error).toBe("Forbidden");
      expect(gated.status, `${GATED_ROUTE} with AI switched off`).toBe(403);

      const on = await setPortalAiAccess(managerApi, true);
      expect(on.writeStatus).toBe(200);
      expect(on.enabled, "the switch reads back as on again").toBe(true);
      const reopened = await aiSettings.webSearchIsConfigured(role);
      expect(reopened.status, `${GATED_ROUTE} with AI switched back on`).toBe(
        200,
      );
    });
  }

  for (const { label, type, role } of REFUSED_ROLES) {
    test(`PUT /api/2.0/settings/ai-access - ${label} cannot change the portal AI switch`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      // `forRole` clients send `Cookie: ""`, so this read stays the owner's even
      // after the member below logs in on the shared request context.
      const before = await ownerApi.commonSettings.getTenantAiAccessSettings();
      expect(before.status).toBe(200);
      expect(
        before.data.response?.enabled,
        "the switch is on before the attempt",
      ).toBe(true);

      const { data: member } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await aiSettings.expectActingAs(role, member.response!.id!, label);

      const attempt = await setPortalAiAccess(apiSdk.forRole(role), false);

      // Stored state first: a refusal that still wrote is the worse defect, and
      // it is invisible if the status is asserted before the read-back.
      const after = await ownerApi.commonSettings.getTenantAiAccessSettings();
      expect(
        after.data.response?.enabled,
        `${label} must not have changed the switch`,
      ).toBe(true);
      expect(attempt.writeStatus).toBe(403);

      // Positive control: the route works in this very session, so the 403 is
      // this role being refused and not a switch nobody can move.
      const asOwner = await setPortalAiAccess(ownerApi, false);
      expect(asOwner.writeStatus, "the owner can still flip the switch").toBe(
        200,
      );
      expect(asOwner.enabled).toBe(false);
    });
  }

  test("PUT /api/2.0/settings/ai-access - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await apiSdk
      .forAnonymous()
      .commonSettings.setTenantAiAccessSettings({
        tenantAiAccessSettingsDto: { enabled: false },
      });

    const after = await ownerApi.commonSettings.getTenantAiAccessSettings();
    expect(
      after.data.response?.enabled,
      "an unauthenticated call must not have changed the switch",
    ).toBe(true);
    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/ai-access - a DocSpaceAdmin's flip gates AI for the other members too", async ({
    apiSdk,
  }) => {
    // The switch is portal-wide, and an admin who could only gate themselves
    // would satisfy every per-role assertion above while the requirement went
    // unmet. So the flip is made by the admin and measured in a User's session.
    //
    // Plain members first, then authenticate serially: `addMember` after an
    // `addAuthenticatedMember` is refused with a 403, and two
    // `addAuthenticatedMember` calls in one test flake with a 401.
    const { userData: adminCreds } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: userMember, userData: userCreds } = await apiSdk.addMember(
      "owner",
      "User",
    );
    await apiSdk.authenticateMember(adminCreds, "DocSpaceAdmin");
    // The User logs in last on purpose: `AiSettings` runs on the shared request
    // context, whose session cookie beats the bearer token, so the gate is only
    // really read as the User if the User is the last one authenticated. The
    // admin's PUT goes through a `forRole` client and is unaffected.
    await apiSdk.authenticateMember(userCreds, "User");

    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
    await aiSettings.expectActingAs("user", userMember.response!.id!, "User");

    const open = await aiSettings.webSearchIsConfigured("user");
    expect(open.status, `${GATED_ROUTE} as the User before the flip`).toBe(200);

    const off = await setPortalAiAccess(apiSdk.forRole("docSpaceAdmin"), false);
    expect(off.writeStatus).toBe(200);
    expect(off.enabled, "the admin's flip is stored").toBe(false);

    const gated = await aiSettings.webSearchIsConfigured("user");
    expect(gated.error).toBe("Forbidden");
    expect(
      gated.status,
      "the admin's flip reaches another member's session",
    ).toBe(403);

    const on = await setPortalAiAccess(apiSdk.forRole("docSpaceAdmin"), true);
    expect(on.enabled).toBe(true);
    const reopened = await aiSettings.webSearchIsConfigured("user");
    expect(reopened.status, `${GATED_ROUTE} as the User after the flip`).toBe(
      200,
    );
  });
});

test.describe("AI services management - an administrator provisions AI", () => {
  test("POST /portal/payment/servicestate, PUT /settings/ai-access, PUT /ai/assignments/assign, POST /ai/agents - a DocSpaceAdmin provisions the portal's AI services", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Every other AI test provisions the portal as the owner, so the admin path
    // is only ever exercised one route at a time. This is the sequence: the
    // owner pays, the administrator does all four management steps, and the
    // portal ends up reporting itself AI-ready.
    const ownerApi = apiSdk.forRole("owner");
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(1000);
    // Funding is the payer's half — `creditAiBalance` is one of the routes the
    // admin is refused (403, see the payer-boundary block below).
    await creditAiBalance(ownerApi.payment, 1000);

    const { data: adminMember } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminApi = apiSdk.forRole("docSpaceAdmin");
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    await profiles.expectActingAs(
      "docSpaceAdmin",
      adminMember.response!.id!,
      "DocSpaceAdmin",
    );

    await test.step("the admin pay-enables the AI Tools add-on", async () => {
      const { status } = await enableWalletService(adminApi.payment, "aiTools");
      expect(status).toBe(200);
      expect(
        await isWalletServiceEnabled(adminApi.payment, "aiTools"),
        "AI Tools is in the portal's enabled wallet services",
      ).toBe(true);
    });

    await test.step("the admin switches AI on portal-wide", async () => {
      const { writeStatus, enabled } = await setPortalAiAccess(adminApi, true);
      expect(writeStatus).toBe(200);
      expect(enabled).toBe(true);
    });

    const catalogue = await profiles.catalogue("docSpaceAdmin");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    await test.step("the admin binds a model to the Chat task", async () => {
      const assigned = await profiles.assign("docSpaceAdmin", {
        actionType: "Chat",
        profileId: text.id,
      });
      expect(assigned.status).toBe(200);
      // This surface reports business failures as 200 + `success:false`, so the
      // status alone would pass on a refused assignment.
      expect(assigned.data?.success).toBe(true);

      const readBack = await profiles.getAssignment("docSpaceAdmin", "Chat");
      expect(readBack.data, "the binding was stored").toBe(text.id);
    });

    await test.step("the admin creates an agent on that model", async () => {
      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const agent = await aiChat.createAgent("docSpaceAdmin", {
        title: "Admin provisioned agent",
        profileId: text.id,
        prompt: "You are a test assistant",
      });
      expect(agent.status).toBe(200);
      expect(agent.data?.response?.id).toBeDefined();
    });

    // The payoff: the portal the owner only ever paid for is AI-ready.
    const { data: config, status } = await adminApi.aiSettings.aiSettingsGet();
    expect(status).toBe(200);
    expect(config.response?.aiReady).toBe(true);
    expect(config.response?.systemAiEnabled).toBe(true);
  });
});

test.describe("AI services management - the payer boundary", () => {
  test("POST /portal/payment/servicestate vs /portal/payment/{deposit,update,topupsettings,checkoutsetupurl} - a DocSpaceAdmin manages the AI add-ons but not the wallet", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    // The administration half. AI Search has to follow AI Tools — it is refused
    // with a 403 on its own (see ai_search_addon_billing_contract).
    for (const service of ["aiTools", "aiSearch"] as const) {
      const { status } = await enableWalletService(adminApi.payment, service);
      expect(status, `enabling ${service} as DocSpaceAdmin`).toBe(200);
      expect(
        await isWalletServiceEnabled(adminApi.payment, service),
        `${service} in the portal's enabled wallet services`,
      ).toBe(true);
    }

    // The payer half, in the same session as the 200s above — which is what
    // makes each 403 a boundary rather than a portal that is simply broken for
    // this administrator.
    const payerOnly: Array<[string, Promise<{ status: number }>]> = [
      [
        "POST /portal/payment/deposit",
        adminApi.payment.topUpDeposit({
          topUpDepositRequestDto: { amount: 100, currency: "USD" },
        }),
      ],
      [
        "PUT /portal/payment/update",
        adminApi.payment.updatePayment({
          quantityRequestDto: { quantity: { admin: 1 } },
        }),
      ],
      [
        "POST /portal/payment/topupsettings",
        adminApi.payment.setTenantWalletSettings({
          tenantWalletSettingsWrapper: {
            settings: { enabled: true, minBalance: 100, upToBalance: 1000 },
          },
        }),
      ],
      [
        "GET /portal/payment/checkoutsetupurl",
        adminApi.payment.getCheckoutSetupUrl({
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          successUrl: apiSdk.tokenStore.portalBaseUrl,
        }),
      ],
    ];

    for (const [label, call] of payerOnly) {
      const { status } = await call;
      expect(
        status,
        `${label} as DocSpaceAdmin while the owner is the payer`,
      ).toBe(403);
    }
  });
});
