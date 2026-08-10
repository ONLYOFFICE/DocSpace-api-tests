import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";

// Model assignments with the portal AI switch off. Section 3.2 asks for two
// things and this file checks both: the write side is refused, and the read side
// answers a single documented status instead of an assortment of 500s.

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
