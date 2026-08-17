import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  configureAiToolsAsUnpaid,
  enableAiGateway,
} from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiProfiles, AI_CAPS, AI_CAP_BITS } from "@/src/helpers/ai-profiles";

// Model assignments with the portal AI switch off. Section 3.2 asks for two
// things and this file checks both: the write side is refused, and the read side
// answers a single documented status instead of an assortment of 500s.
//
// The second describe block takes the *other* off-state — the unpaid AI Tools
// wallet service — where the answer is the opposite one.

test.describe("AI Assignments - AI Disabled", () => {
  test("GET|PUT|DELETE /api/2.0/ai/assignments/* - the whole surface returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const { data: seeded } = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: text.id,
    });
    expect(seeded?.success, "the seeded assignment").toBe(true);

    const { writeStatus, readStatus, enabled } = await setPortalAiAccess(
      ownerApi,
      false,
    );
    expect(writeStatus).toBe(200);
    expect(readStatus).toBe(200);
    expect(enabled).toBe(false);

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["get-all-assignments", profiles.getAllAssignments("owner")],
      ["get-assignment", profiles.getAssignment("owner", "Chat")],
      ["resolve-for-action", profiles.resolveForAction("owner", "Chat")],
      ["try-resolve-for-action", profiles.tryResolveForAction("owner", "Chat")],
      [
        "assign",
        profiles.assign("owner", { actionType: "Chat", profileId: text.id }),
      ],
      ["bulk-assign", profiles.bulkAssign("owner", { Summarization: text.id })],
      ["unassign", profiles.unassign("owner", { actionType: "Chat" })],
      [
        "cascade-profile-delete",
        profiles.cascadeProfileDelete("owner", { profileId: text.id }),
      ],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} with AI access disabled`).toBe(403);
    }
  });

  test("PUT|DELETE /api/2.0/ai/assignments/* - nothing was changed while AI access was disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const seed = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);
    const attempt = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const { data: seeded } = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: seed.id,
    });
    expect(seeded?.success).toBe(true);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    expect(
      (
        await profiles.assign("owner", {
          actionType: "Chat",
          profileId: attempt.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (await profiles.unassign("owner", { actionType: "Chat" })).status,
    ).toBe(403);
    expect(
      (await profiles.cascadeProfileDelete("owner", { profileId: seed.id }))
        .status,
    ).toBe(403);

    // Turning AI back on is the only way to see what the refused writes did — a
    // 403 that silently applied would otherwise be invisible.
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled).toBe(true);

    const read = await profiles.getAssignment("owner", "Chat");
    expect(read.status).toBe(200);
    expect(read.data, "the assignment survived the refused writes").toBe(
      seed.id,
    );
  });
});

// The other off-state: AI Tools is not paid for, so `/ai/config` reports
// `aiReady:false` — the flag the client turns into the "Connect AI model" screen.
// The assignment surface is pinned here as NOT following that flag, in both
// directions: it reads back a fully resolved model and it accepts writes.
//
// Which also settles what "until a profile is added the assignments tab is
// unavailable" can mean on this build: nothing, because the precondition never
// holds. The gateway ships a fixed 15-model catalogue that cannot be emptied
// (create/update/delete are 403 — see profiles.spec.ts), and `Default` /
// `ImageGeneration` are already bound on a portal that has never paid for AI at
// all. So an empty catalogue is not the signal a test can wait for, and
// `aiReady` is the only state that distinguishes "AI is not usable yet" — which
// is why these two tests are written against it.
//
// Both are written as the 200 they answer rather than as a 403, on purpose: an
// assignment is portal configuration, and letting the admin pick models before
// the wallet is topped up is a defensible product decision. What must not pass
// silently is the *reverse* change — a 403 appearing here would mean the client
// can no longer read the bindings it renders, and that is a regression this file
// would then catch.
test.describe("AI Assignments - AI Tools wallet service not paid for", () => {
  test("GET /api/2.0/ai/assignments/* - a model resolves even though AI is reported not ready", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Turns the portal AI switch ON and proves AI Tools is absent from the
    // enabled wallet services, so the `aiReady:false` below can only come from
    // the wallet — not from the switch the block above covers.
    await configureAiToolsAsUnpaid(ownerApi);

    const { data: config, status: configStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(configStatus).toBe(200);
    expect(config.response?.aiReady, "the premise of this test").toBe(false);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    // The catalogue is not what goes empty in this state, so a client keying the
    // "Connect AI model" screen off `profiles/list` would never show it.
    const catalogue = await profiles.catalogue("owner");
    expect(catalogue.length).toBeGreaterThan(0);

    const { status, data } = await profiles.getAllAssignments("owner");
    expect(status).toBe(200);
    expect(Object.keys(data!), "the shipped default binding").toContain(
      "Default",
    );
    expect(Object.keys(data!)).toContain("ImageGeneration");

    // The bindings are real catalogue entries and not leftovers: a dangling id
    // would make the rest of this test pass on nothing.
    const byId = new Map(catalogue.map((profile) => [profile.id, profile]));
    const fallback = byId.get(data!.Default);
    expect(fallback, "Default resolves to a catalogue profile").toBeDefined();
    expect(byId.get(data!.ImageGeneration)).toBeDefined();

    // Chat has no binding of its own, and resolution still hands back the
    // Default profile fully expanded — the same answer as on a paid portal.
    const direct = await profiles.getAssignment("owner", "Chat");
    expect(direct.status).toBe(200);
    expect(direct.data).toBeNull();

    for (const route of ["resolve", "tryResolve"] as const) {
      const { status: resolveStatus, data: resolved } =
        route === "resolve"
          ? await profiles.resolveForAction("owner", "Chat")
          : await profiles.tryResolveForAction("owner", "Chat");
      expect(resolveStatus, `${route}-for-action Chat`).toBe(200);
      expect(resolved?.profileId, `${route}-for-action profileId`).toBe(
        data!.Default,
      );
      expect(resolved?.profile?.modelId, `${route}-for-action model`).toBe(
        fallback!.modelId,
      );
    }

    // No credential rides along on an unpaid portal either.
    expect(JSON.stringify(data)).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("PUT|DELETE /api/2.0/ai/assignments/* - the write side is not gated by the AI Tools wallet service", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await configureAiToolsAsUnpaid(ownerApi);

    const { data: config } = await ownerApi.aiSettings.aiSettingsGet();
    expect(config.response?.aiReady, "the premise of this test").toBe(false);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    // Two different models, and neither of them the one `Default` already points
    // at: a cascade delete of the fallback profile would otherwise take the
    // shipped binding with it and muddle the last assertion.
    const { data: shipped } = await profiles.getAllAssignments("owner");
    const shippedDefault = catalogue.find(
      (profile) => profile.id === shipped!.Default,
    );
    expect(shippedDefault, "the shipped Default binding").toBeDefined();
    const [chat, summarization] = AiProfiles.distinctWithBit(
      catalogue,
      AI_CAP_BITS.text,
      2,
      [shippedDefault!],
    );

    // Every write on this surface answers 200 even when it refuses, so each one
    // is checked for `success` and then read back.
    const assigned = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: chat.id,
    });
    expect(assigned.status).toBe(200);
    expect(assigned.data?.success, "assign Chat").toBe(true);
    expect((await profiles.getAssignment("owner", "Chat")).data).toBe(chat.id);

    const bulk = await profiles.bulkAssign("owner", {
      Summarization: summarization.id,
    });
    expect(bulk.status).toBe(200);
    expect(bulk.data?.success, "bulk-assign Summarization").toBe(true);
    expect((await profiles.getAssignment("owner", "Summarization")).data).toBe(
      summarization.id,
    );

    // A capability mismatch is still refused, so the writes above are being
    // validated rather than waved through in this state.
    const image = AiProfiles.byCapabilities(catalogue, AI_CAPS.imageOnly);
    const mismatch = await profiles.assign("owner", {
      actionType: "Summarization",
      profileId: image.id,
    });
    expect(mismatch.status).toBe(200);
    expect(mismatch.data?.success, "an image model on Summarization").toBe(
      false,
    );
    expect(
      (await profiles.getAssignment("owner", "Summarization")).data,
      "the refused write changed nothing",
    ).toBe(summarization.id);

    const unassigned = await profiles.unassign("owner", { actionType: "Chat" });
    expect(unassigned.status).toBe(200);
    expect(unassigned.data?.success, "unassign Chat").toBe(true);
    expect((await profiles.getAssignment("owner", "Chat")).data).toBeNull();

    const cascaded = await profiles.cascadeProfileDelete("owner", {
      profileId: summarization.id,
    });
    expect(cascaded.status).toBe(200);
    expect(cascaded.data?.success, "cascade-profile-delete").toBe(true);
    expect(
      (await profiles.getAssignment("owner", "Summarization")).data,
    ).toBeNull();

    // The shipped fallback is untouched by all of the above, which is what the
    // client needs to keep rendering a model in the picker.
    const { data: after } = await profiles.getAllAssignments("owner");
    expect(after!.Default).toBe(shipped!.Default);
  });
});
