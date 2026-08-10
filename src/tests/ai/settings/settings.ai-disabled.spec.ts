import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiSettings } from "@/src/helpers/ai-settings";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  enableAiGateway,
  enableWalletService,
} from "@/src/helpers/wallet-services";

// There are two independent ways AI can be off on a portal, and this file covers
// both: the portal AI switch (`PUT /settings/ai-access`) and the unpaid "AI
// Tools" wallet service, which is the state every fresh portal starts in.
//
// Each test proves a transition rather than an end state: the endpoint answers
// first, the state is changed and read back, and only then is the 403 (or the
// flipped flag) asserted. A test that just asserts 403 after the flip would also
// pass if the endpoint were permanently forbidden or if flipping the switch had
// silently failed.
//
// That is why `/ai/config/vectorization` is NOT in this file: it answers 403 to
// everyone in every portal state, so "403 with AI disabled" says nothing about
// the switch. Its permanent 403 is covered in settings.permission.spec.ts.
//
// Two routes are deliberately pinned as NOT gated by the switch:
// `GET /ai/config` (keeps answering 200, but its flags flip to false) and
// `/ai/config/user` (a per-user UI preference).

test.describe("AI Settings - AI Disabled", () => {
  test("GET /api/2.0/ai/web-search/is-configured - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const before = await aiSettings.webSearchIsConfigured("owner");
    expect(before.status).toBe(200);

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const { status, error } = await aiSettings.webSearchIsConfigured("owner");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/web-search/get-active-config - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const before = await aiSettings.webSearchActiveConfig("owner");
    expect(before.status).toBe(200);

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const { status, error } = await aiSettings.webSearchActiveConfig("owner");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  // `POST /ai/text-to-docx` is gated by the switch too, but it lives in the
  // messages suite (it replaced the removed message export), and its off-state
  // needs the target folder checked for a document that must not appear — see
  // messages.ai-disabled.spec.ts.

  test("POST /api/2.0/ai/vectorization/tasks - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // A missing file id is accepted (see vectorization.spec.ts) — enough to show
    // the route is reachable before the switch is flipped.
    const before = await aiSettings.startVectorizationTask("owner", {
      files: [999999999],
    });
    expect(before.status).toBe(200);

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const { status, error } = await aiSettings.startVectorizationTask("owner", {
      files: [999999999],
    });

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/config - stays readable when AI access is disabled and reports AI as off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Run on a paid portal, otherwise the flags are already false and flipping
    // the switch would prove nothing.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: before, status: beforeStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(beforeStatus).toBe(200);
    expect(before.response?.aiReady).toBe(true);
    expect(before.response?.vectorizationEnabled).toBe(true);
    expect(before.response?.systemAiEnabled).toBe(true);

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const { data: after, status } = await ownerApi.aiSettings.aiSettingsGet();

    expect(status).toBe(200);
    expect(after.response?.aiReady).toBe(false);
    expect(after.response?.vectorizationEnabled).toBe(false);
    expect(after.response?.systemAiEnabled).toBe(false);
  });

  test("GET/PUT /api/2.0/ai/config/user - stays usable when AI access is disabled", async ({
    apiSdk,
  }) => {
    // Deliberately pinned: this is a per-user UI preference, not an AI call,
    // and it is NOT gated by the portal AI switch.
    const ownerApi = apiSdk.forRole("owner");

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const { data: before, status } =
      await ownerApi.aiSettings.aiSettingsGetUser();
    expect(status).toBe(200);
    const target = !before.response?.chatRecommendedModelVisible;

    const { status: writeStatus } = await ownerApi.aiSettings.aiSettingsSetUser(
      {
        requestBody: { chatRecommendedModelVisible: target },
      },
    );
    expect(writeStatus).toBe(200);

    const { data: after, status: afterStatus } =
      await ownerApi.aiSettings.aiSettingsGetUser();
    expect(afterStatus).toBe(200);
    expect(after.response?.chatRecommendedModelVisible).toBe(target);
  });
});

// The second off-state: AI runs through the paid "AI Tools" wallet service, and a
// portal that has not paid for it reports AI as off without blocking a single
// route:
//
//   * `GET /ai/config` answers 200 with aiReady / vectorizationEnabled /
//     systemAiEnabled all false.
//   * the AI management routes all keep working — the profiles catalog, agent
//     CRUD and quota, threads and the MCP tools surface behave exactly as on a
//     paid portal (pinned in chat.ai-disabled.spec.ts).
//   * inference itself is refused, and only asynchronously: see
//     chat.ai-disabled.spec.ts.
//
// A fresh test portal starts in exactly that state, which is why the assertions
// below are paired with the paid state — otherwise they would not show that the
// wallet is what makes the difference.

test.describe("AI Settings - AI Tools wallet service not paid for", () => {
  test("GET /api/2.0/ai/config - AI is reported off until the AI Tools wallet service is paid for", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    // Only the flags `/ai/config` actually returns. The whole body is
    //
    //   { vectorizationEnabled, vectorizationNeedReset, aiReady, embeddingModel,
    //     systemAiEnabled, recommendedModelForForms }
    //
    // so `aiReadyNeedReset` and `webSearchEnabled` are not part of the contract
    // any more (SDK 3.7.0 dropped them), and asserting `toBe(false)` on them
    // would be inventing one: a missing field and an explicit `false` are not
    // the same answer, even though both are falsy. See settings.spec.ts, which
    // pins the body's shape.
    const { data: unpaid, status: unpaidStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(unpaidStatus).toBe(200);
    expect(unpaid.response?.aiReady).toBe(false);
    expect(unpaid.response?.vectorizationEnabled).toBe(false);
    expect(unpaid.response?.systemAiEnabled).toBe(false);

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: paid, status } = await ownerApi.aiSettings.aiSettingsGet();

    expect(status).toBe(200);
    expect(paid.response?.aiReady).toBe(true);
    expect(paid.response?.vectorizationEnabled).toBe(true);
    expect(paid.response?.systemAiEnabled).toBe(true);
  });

  test("PUT /api/2.0/portal/payment/walletservices - AI Tools cannot be enabled on a portal with no payment", async ({
    apiSdk,
  }) => {
    // Turning AI on requires a billing customer, so there is no way to reach the
    // paid state without paying first.
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await enableWalletService(
      ownerApi.payment,
      "aiTools",
    );

    expect(status).toBe(404);
    expect(
      (data as unknown as { error?: { message?: string } }).error?.message,
    ).toBe("Customer could not be found");

    const { data: config, status: configStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(configStatus).toBe(200);
    expect(config.response?.aiReady).toBe(false);
  });

  test("GET /api/2.0/ai/web-search/is-configured - paying for AI Tools does not configure a web-search provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Whether web search is *available* now follows the wallet service, but the
    // web-search provider itself is separate portal configuration and stays
    // unconfigured either way. (`/ai/config` carries no `webSearchEnabled` flag,
    // so this route is the only signal.)
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const unpaid = await aiSettings.webSearchIsConfigured("owner");
    expect(unpaid.status).toBe(200);
    expect(unpaid.data).toBe(false);

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { status, data } = await aiSettings.webSearchIsConfigured("owner");

    expect(status).toBe(200);
    expect(data).toBe(false);
  });

  // `POST /ai/text-to-docx` works on an unpaid portal as well — pinned in
  // messages.ai-disabled.spec.ts together with the rest of that endpoint's
  // off-state behaviour.

  test("POST /api/2.0/ai/vectorization/tasks - is accepted without a paid AI Tools service", async ({
    apiSdk,
  }) => {
    // Pinned as NOT wallet-gated at the API level: the task is queued and the
    // portal answers 200 even though nothing can embed. Whether the queued work
    // ever runs is not observable through the API (see vectorization.spec.ts).
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { status } = await aiSettings.startVectorizationTask("owner", {
      files: [999999999],
    });

    expect(status).toBe(200);
  });
});
