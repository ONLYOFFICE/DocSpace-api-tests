import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiProfiles, AI_CAPS, AI_CAP_BITS } from "@/src/helpers/ai-profiles";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";

// Model assignments — section 5. One profile is bound to each action type, and
// the binding is validated against the profile's capabilities.
//
//   GET    /ai/assignments/get-all-assignments[?entityId=]
//   GET    /ai/assignments/get-assignment?actionType=
//   GET    /ai/assignments/resolve-for-action?actionType=[&entityId=]
//   GET    /ai/assignments/try-resolve-for-action?actionType=[&entityId=]
//   PUT    /ai/assignments/assign            { actionType, profileId }
//   PUT    /ai/assignments/bulk-assign       flat { [actionType]: profileId }
//   DELETE /ai/assignments/unassign          { actionType }
//   DELETE /ai/assignments/cascade-profile-delete { profileId }
//
// Two rules make or break every assertion here:
//
//   * A *refused* assignment is HTTP 200 with `{success:false, error:{...}}`.
//     Asserting the status alone passes on a rejected capability mismatch, so
//     every write below checks `success` and then reads the assignment back.
//   * `actionType` is bound as an enum. An unknown one is a hard 400 whose
//     message is the misleading "actionType required" — the status is the signal,
//     not the text.
//
// The action types are Default, Chat, Code, Summarization, Translation,
// TextAnalyze, ImageGeneration, OCR and Vision. `Default` is the fallback that
// `resolve-for-action` uses for anything unassigned.

test.describe("AI Assignments - reading assignments", () => {
  test("GET /api/2.0/ai/assignments/get-all-assignments - a fresh portal ships a text default and an image-generation binding", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    const { status, data } = await profiles.getAllAssignments("owner");
    expect(status).toBe(200);

    // Section 5.1: after the first profile exists the default binding is formed
    // by contract rather than left empty.
    expect(Object.keys(data!)).toContain("Default");
    expect(Object.keys(data!)).toContain("ImageGeneration");

    const byId = new Map(catalogue.map((profile) => [profile.id, profile]));
    const fallback = byId.get(data!.Default);
    const imaging = byId.get(data!.ImageGeneration);

    // The bindings point at real catalogue entries, and at ones that can do the
    // job — a dangling id here is exactly the "broken assignment" of section 4.3.
    expect(
      fallback,
      "the Default binding resolves to a catalogue profile",
    ).toBeDefined();
    expect(
      imaging,
      "the ImageGeneration binding resolves to a catalogue profile",
    ).toBeDefined();
    expect(fallback!.canUseTool).toBe(true);
    expect(imaging!.capabilities).toBe(AI_CAPS.imageOnly);

    // No assignment payload carries a credential.
    expect(JSON.stringify(data)).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
  });

  test("GET /api/2.0/ai/assignments/get-assignment - an unassigned action reads back as null", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    const { status, data } = await profiles.getAssignment("owner", "Chat");
    expect(status).toBe(200);
    expect(data).toBeNull();
  });

  test("GET /api/2.0/ai/assignments/resolve-for-action - an unassigned action falls back to Default", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const { data: all } = await profiles.getAllAssignments("owner");
    const fallbackId = all!.Default;

    // Chat has no binding of its own on a fresh portal...
    const direct = await profiles.getAssignment("owner", "Chat");
    expect(direct.data).toBeNull();

    // ...so resolution has to produce the Default profile, fully expanded.
    for (const actionType of ["Chat", "Summarization", "Vision"]) {
      const { status, data } = await profiles.resolveForAction(
        "owner",
        actionType,
      );
      expect(status, `resolve ${actionType}`).toBe(200);
      expect(data?.profileId, `resolved profile for ${actionType}`).toBe(
        fallbackId,
      );
      expect(data?.profile?.id).toBe(fallbackId);
      expect(data?.profile?.modelId, `${actionType} model`).toBeTruthy();
    }

    const tryResolved = await profiles.tryResolveForAction("owner", "Chat");
    expect(tryResolved.status).toBe(200);
    expect(tryResolved.data?.profileId).toBe(fallbackId);
  });

  test("GET /api/2.0/ai/assignments/* - an unknown action type is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    const get = await profiles.getAssignment("owner", "NotAnAction");
    expect(get.status).toBe(400);

    const resolve = await profiles.resolveForAction("owner", "NotAnAction");
    expect(resolve.status).toBe(400);

    const tryResolve = await profiles.tryResolveForAction(
      "owner",
      "NotAnAction",
    );
    expect(tryResolve.status).toBe(400);
  });
});

test.describe("AI Assignments - assigning a profile", () => {
  test("PUT /api/2.0/ai/assignments/assign - Owner assigns a text profile to a text action and reads it back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    for (const actionType of [
      "Chat",
      "Summarization",
      "Translation",
      "TextAnalyze",
      "Code",
    ]) {
      const { status, data } = await profiles.assign("owner", {
        actionType,
        profileId: text.id,
      });
      expect(status, `assign ${actionType}`).toBe(200);
      expect(
        data?.success,
        `assign ${actionType}: ${data?.error?.message}`,
      ).toBe(true);

      // Section 5.2: one profile may back several actions.
      const read = await profiles.getAssignment("owner", actionType);
      expect(read.status).toBe(200);
      expect(read.data, `${actionType} reads back`).toBe(text.id);

      const resolved = await profiles.resolveForAction("owner", actionType);
      expect(resolved.data?.profileId).toBe(text.id);
    }

    const { data: all } = await profiles.getAllAssignments("owner");
    expect(all!.Chat).toBe(text.id);
    expect(all!.Summarization).toBe(text.id);
    expect(all!.Translation).toBe(text.id);
  });

  test("PUT /api/2.0/ai/assignments/assign - changing one action leaves the others alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const first = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);
    const second = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    for (const actionType of ["Chat", "Summarization"]) {
      const { data } = await profiles.assign("owner", {
        actionType,
        profileId: first.id,
      });
      expect(data?.success).toBe(true);
    }

    const { data: changed } = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: second.id,
    });
    expect(changed?.success).toBe(true);

    const chat = await profiles.getAssignment("owner", "Chat");
    expect(chat.data).toBe(second.id);

    const summarization = await profiles.getAssignment(
      "owner",
      "Summarization",
    );
    expect(summarization.data, "Summarization is untouched").toBe(first.id);
  });

  // Section 5.2 head-on: *every* task named in the requirement — chat,
  // summarization, translation, text analysis, OCR, vision, image generation —
  // gets a model of its own, all seven at the same time. The tests above only
  // ever showed one profile backing several actions and one pair staying
  // independent, which is also what a backend storing a single global model
  // would produce.
  //
  // Each action is given a *different* profile so that a read-back naming the
  // right id cannot be a coincidence: with seven distinct models, one shared
  // slot behind the scenes would collapse them all onto the last write.
  test("PUT /api/2.0/ai/assignments/assign - each of the seven tasks holds a model of its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    // The eligible pool differs per task, so the profiles are handed out
    // capability-first: the two tasks that need eyes take vision models, image
    // generation takes a drawing one, and the four text tasks take whatever text
    // models are left over.
    const [drawing] = AiProfiles.distinctWithBit(
      catalogue,
      AI_CAP_BITS.imageGeneration,
      1,
    );
    const [vision, ocr] = AiProfiles.distinctWithBit(
      catalogue,
      AI_CAP_BITS.vision,
      2,
    );

    // The test-portal catalogue was trimmed to 7 models on 2026-08-24 (DeepSeek
    // V4 Flash/Pro, Gemini 3.7 Flash, GPT 5.6 Luna, Qwen3.5 122B A10B, Nano
    // Banana 2, Nano Banana 2 Lite). Only 2 of those carry the vision bit, and
    // both are already spent above on Vision + OCR, leaving just 3 text-only
    // models for the 4 remaining text tasks — one short of the 7 mutually
    // distinct profiles this test needs. Skip rather than delete: do not remove
    // this test or loosen its "seven distinct models" premise, just skip it
    // until the fuller catalogue is back, then drop this guard.
    const spentIds = new Set([drawing.id, vision.id, ocr.id]);
    const remainingTextPool = catalogue.filter(
      (profile) =>
        ((profile.capabilities ?? 0) & AI_CAP_BITS.text) === AI_CAP_BITS.text &&
        !spentIds.has(profile.id),
    );
    test.skip(
      remainingTextPool.length < 4,
      `catalogue only offers ${remainingTextPool.length} unused text profiles after Vision/OCR/ImageGeneration are assigned (needs 4) — see the comment above`,
    );

    const [chat, summarization, translation, textAnalyze] =
      AiProfiles.distinctWithBit(catalogue, AI_CAP_BITS.text, 4, [
        drawing,
        vision,
        ocr,
      ]);

    const plan = [
      { actionType: "Chat", profile: chat },
      { actionType: "Summarization", profile: summarization },
      { actionType: "Translation", profile: translation },
      { actionType: "TextAnalyze", profile: textAnalyze },
      { actionType: "OCR", profile: ocr },
      { actionType: "Vision", profile: vision },
      { actionType: "ImageGeneration", profile: drawing },
    ];

    // The premise the whole test rests on: seven different models.
    expect(new Set(plan.map((entry) => entry.profile.id)).size).toBe(7);

    for (const { actionType, profile } of plan) {
      const { status, data } = await profiles.assign("owner", {
        actionType,
        profileId: profile.id,
      });
      expect(status, `assign ${actionType}`).toBe(200);
      expect(
        data?.success,
        `assign ${actionType} to ${profile.modelId}: ${data?.error?.message}`,
      ).toBe(true);
    }

    // Read every binding back only after all seven writes, so a later write
    // overwriting an earlier one is caught rather than hidden by an
    // assign-then-read-immediately loop.
    const { data: all } = await profiles.getAllAssignments("owner");
    for (const { actionType, profile } of plan) {
      const read = await profiles.getAssignment("owner", actionType);
      expect(read.data, `${actionType} reads back its own model`).toBe(
        profile.id,
      );
      expect(all?.[actionType], `${actionType} in get-all-assignments`).toBe(
        profile.id,
      );

      // And the model the task will actually run on is the one that was bound —
      // not the Default fallback that answers for anything unassigned.
      const resolved = await profiles.resolveForAction("owner", actionType);
      expect(resolved.status).toBe(200);
      expect(resolved.data?.profileId, `${actionType} resolves`).toBe(
        profile.id,
      );
      expect(resolved.data?.profile?.modelId).toBe(profile.modelId);
    }

    // Moving one task must leave the other six where they were. The pairwise
    // check above does this for two text actions; the tasks that differ in
    // capability class are the ones that could plausibly share storage.
    const { data: moved } = await profiles.assign("owner", {
      actionType: "OCR",
      profileId: vision.id,
    });
    expect(moved?.success, moved?.error?.message).toBe(true);

    expect((await profiles.getAssignment("owner", "OCR")).data).toBe(vision.id);
    for (const { actionType, profile } of plan.filter(
      (entry) => entry.actionType !== "OCR",
    )) {
      expect(
        (await profiles.getAssignment("owner", actionType)).data,
        `${actionType} is untouched by the OCR change`,
      ).toBe(profile.id);
    }
  });

  test("PUT /api/2.0/ai/assignments/assign - a non-existent profile id is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);

    const { status, data } = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: "019fcc1d-2c4d-7557-b8d2-6b4f1be1b212",
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe("Profile not found");

    // Nothing was recorded, so no dangling binding is left behind.
    const read = await profiles.getAssignment("owner", "Chat");
    expect(read.data).toBeNull();
  });

  test("PUT /api/2.0/ai/assignments/assign - a request missing actionType or profileId is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const noAction = await profiles.assign("owner", { profileId: text.id });
    expect(noAction.status).toBe(400);

    const noProfile = await profiles.assign("owner", { actionType: "Chat" });
    expect(noProfile.status).toBe(400);

    const unknownAction = await profiles.assign("owner", {
      actionType: "NotAnAction",
      profileId: text.id,
    });
    expect(unknownAction.status).toBe(400);

    const empty = await profiles.assign("owner", {});
    expect(empty.status).toBe(400);
  });
});

test.describe("AI Assignments - capability validation", () => {
  // Section 5.2 in full: the profile has to be able to do the job. Each case is
  // (action, capability class, accepted?) and every one of them is checked
  // against the persisted assignment, not just against `success`.
  const CASES: Array<{
    actionType: string;
    caps: number;
    label: string;
    accepted: boolean;
  }> = [
    {
      actionType: "Chat",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: false,
    },
    {
      actionType: "Vision",
      caps: AI_CAPS.textVisionTools,
      label: "a vision model",
      accepted: true,
    },
    {
      actionType: "Vision",
      caps: AI_CAPS.textTools,
      label: "a model without vision",
      accepted: false,
    },
    {
      actionType: "Vision",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: false,
    },
    {
      actionType: "OCR",
      caps: AI_CAPS.textVisionTools,
      label: "a vision model",
      accepted: true,
    },
    {
      actionType: "OCR",
      caps: AI_CAPS.textTools,
      label: "a model without vision",
      accepted: false,
    },
    {
      actionType: "OCR",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: false,
    },
    {
      actionType: "ImageGeneration",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: true,
    },
    {
      actionType: "ImageGeneration",
      caps: AI_CAPS.textVisionTools,
      label: "a text model",
      accepted: false,
    },
    {
      actionType: "ImageGeneration",
      caps: AI_CAPS.textTools,
      label: "a text model that cannot see either",
      accepted: false,
    },
    {
      actionType: "Summarization",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: false,
    },
    {
      actionType: "Translation",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: false,
    },
    {
      actionType: "Code",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: false,
    },
    {
      actionType: "TextAnalyze",
      caps: AI_CAPS.textTools,
      label: "a text model",
      accepted: true,
    },
    // FormAnalysis is seeded on a fresh portal, so a refusal here is checked
    // against a real binding, not against an empty slot. Only the two accepted
    // masks and the refused one are measured: whether the tools bit is required
    // cannot be told apart, the catalogue has no text model without tools.
    {
      actionType: "FormAnalysis",
      caps: AI_CAPS.textTools,
      label: "a text model without vision",
      accepted: true,
    },
    {
      actionType: "FormAnalysis",
      caps: AI_CAPS.textVisionTools,
      label: "a vision model",
      accepted: true,
    },
    {
      actionType: "FormAnalysis",
      caps: AI_CAPS.imageOnly,
      label: "an image-generation model",
      accepted: false,
    },
  ];

  for (const { actionType, caps, label, accepted } of CASES) {
    test(`PUT /api/2.0/ai/assignments/assign - ${actionType} ${accepted ? "accepts" : "refuses"} ${label}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const catalogue = await profiles.catalogue("owner");
      const profile = AiProfiles.byCapabilities(catalogue, caps);
      const before = await profiles.getAssignment("owner", actionType);

      const { status, data } = await profiles.assign("owner", {
        actionType,
        profileId: profile.id,
      });
      expect(status).toBe(200);

      if (accepted) {
        expect(data?.success, data?.error?.message).toBe(true);
        const read = await profiles.getAssignment("owner", actionType);
        expect(read.data).toBe(profile.id);
        return;
      }

      expect(data?.success).toBe(false);
      expect(data?.error?.message).toBe(
        `Profile lacks capabilities required for ActionType.${actionType}`,
      );

      // A refusal must not have written anything either.
      const read = await profiles.getAssignment("owner", actionType);
      expect(read.data, `${actionType} is unchanged`).toBe(before.data ?? null);
    });
  }

  test("BUG 82830: PUT /api/2.0/ai/assignments/assign - an image-generation profile is accepted as the Default fallback", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const image = AiProfiles.byCapabilities(catalogue, AI_CAPS.imageOnly);

    // Every named text action refuses this profile...
    const summarization = await profiles.assign("owner", {
      actionType: "Summarization",
      profileId: image.id,
    });
    expect(summarization.data?.success, "Summarization refuses it").toBe(false);

    // ...but `Default` — the fallback every unassigned text action resolves
    // through — takes it, and then hands an image-only model to Chat.
    const { status, data } = await profiles.assign("owner", {
      actionType: "Default",
      profileId: image.id,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const resolved = await profiles.resolveForAction("owner", "Chat");
    expect(
      resolved.data?.profileId,
      "Chat now resolves to the image model",
    ).toBe(image.id);
    expect(resolved.data?.profile?.canUseTool).toBe(false);

    test.fail();
    expect(
      data?.success,
      "Default must require the capabilities of the actions it backs",
    ).toBe(false);
  });
});

test.describe("AI Assignments - bulk assignment", () => {
  test("PUT /api/2.0/ai/assignments/bulk-assign - a flat action-to-profile map is applied", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const vision = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const { status, data } = await profiles.bulkAssign("owner", {
      Summarization: vision.id,
      Translation: text.id,
      Vision: vision.id,
    });

    expect(status).toBe(200);
    expect(data?.success, JSON.stringify(data?.errors)).toBe(true);

    const { data: all } = await profiles.getAllAssignments("owner");
    expect(all!.Summarization).toBe(vision.id);
    expect(all!.Translation).toBe(text.id);
    expect(all!.Vision).toBe(vision.id);
  });

  test("PUT /api/2.0/ai/assignments/bulk-assign - one invalid entry rejects the whole batch", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const vision = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    // A known-good starting point, so "unchanged" below means something.
    const seed = await profiles.bulkAssign("owner", {
      Translation: text.id,
    });
    expect(seed.data?.success).toBe(true);

    // ImageGeneration cannot take a text profile; Translation could.
    const { status, data } = await profiles.bulkAssign("owner", {
      ImageGeneration: vision.id,
      Translation: vision.id,
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.errors?.length).toBe(1);
    expect(data?.errors?.[0]?.actionType).toBe("ImageGeneration");
    expect(data?.errors?.[0]?.error?.message).toBe(
      "Profile lacks capabilities required for ActionType.ImageGeneration",
    );

    // The valid half was not applied either: the batch is atomic, so section
    // 5.2's "no partially saved state" holds.
    const translation = await profiles.getAssignment("owner", "Translation");
    expect(translation.data, "the valid entry was not applied").toBe(text.id);
  });

  test("PUT /api/2.0/ai/assignments/bulk-assign - an empty map is accepted and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const before = await profiles.getAllAssignments("owner");

    // "Nothing asked for, nothing done" is a legitimate success. What is not is a
    // *non-empty* payload whose keys are all unrecognised — see the unknown-key
    // test below.
    const { status, data } = await profiles.bulkAssign("owner", {});
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const after = await profiles.getAllAssignments("owner");
    expect(after.data).toEqual(before.data);
  });

  test("PUT /api/2.0/ai/assignments/bulk-assign - a malformed profile id is rejected and an empty one is a per-item error", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const { data: seeded } = await profiles.bulkAssign("owner", {
      Translation: text.id,
    });
    expect(seeded?.success).toBe(true);

    // The value is parsed as a GUID, so a malformed one never reaches the
    // per-item validation and is a hard 400...
    const malformed = await profiles.bulkAssign("owner", {
      Translation: "not-a-guid",
    });
    expect(malformed.status).toBe(400);

    // ...while an empty string parses and then fails the lookup, as a per-item
    // error inside a 200.
    const empty = await profiles.bulkAssign("owner", { Translation: "" });
    expect(empty.status).toBe(200);
    expect(empty.data?.success).toBe(false);
    expect(empty.data?.errors?.[0]?.actionType).toBe("Translation");

    expect(
      (await profiles.getAssignment("owner", "Translation")).data,
      "neither attempt changed the binding",
    ).toBe(text.id);
  });

  test("BUG 82831: PUT /api/2.0/ai/assignments/bulk-assign - an unknown action key is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);
    const other = AiProfiles.byCapabilities(catalogue, AI_CAPS.textVisionTools);

    // The reference: on the single-assignment route the very same unknown action
    // type is a hard 400, so an unknown key is not a thing the API tolerates by
    // design. The batch route used to answer it with `success:true` and store
    // nothing.
    const single = await profiles.assign("owner", {
      actionType: "NotAnAction",
      profileId: text.id,
    });
    expect(single.status).toBe(400);

    const unknownOnly = await profiles.bulkAssign("owner", {
      NotAnAction: text.id,
    });
    expect(unknownOnly.status, "an unknown key in a batch").toBe(400);

    // The enum is case-sensitive, and a wrong-cased action name is an unknown
    // key like any other rather than a silent miss.
    const wrongCase = await profiles.bulkAssign("owner", { chat: other.id });
    expect(wrongCase.status, "a wrong-cased action name").toBe(400);

    const afterUnknown = await profiles.getAllAssignments("owner");
    expect(Object.keys(afterUnknown.data!), "nothing was stored").not.toContain(
      "NotAnAction",
    );
    expect(afterUnknown.data!.Chat).toBeUndefined();

    // A mixed batch is refused whole — the valid half must not be applied on its
    // way past the unknown key.
    const mixed = await profiles.bulkAssign("owner", {
      Chat: text.id,
      NotAnAction: other.id,
    });
    expect(mixed.status, "a batch carrying one unknown key").toBe(400);
    expect(
      (await profiles.getAssignment("owner", "Chat")).data,
      "the valid half of the refused batch was not applied",
    ).toBeFalsy();
  });

  test("BUG 82831: PUT /api/2.0/ai/assignments/bulk-assign - a null value is rejected and leaves the binding alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const { data: seeded } = await profiles.bulkAssign("owner", {
      Translation: text.id,
    });
    expect(seeded?.success).toBe(true);
    expect((await profiles.getAssignment("owner", "Translation")).data).toBe(
      text.id,
    );

    // Section 5.2 allows either reading of a null: clear the binding, or refuse
    // it. It used to do neither — report success and leave the binding in place.
    const { status } = await profiles.bulkAssign("owner", {
      Translation: null,
    });
    expect(status, "a null value must be rejected").toBe(400);

    const read = await profiles.getAssignment("owner", "Translation");
    expect(read.data, "the binding the refused write did not touch").toBe(
      text.id,
    );
  });
});

test.describe("AI Assignments - removing assignments", () => {
  test("DELETE /api/2.0/ai/assignments/unassign - removes one binding and leaves the rest", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    for (const actionType of ["Chat", "Summarization"]) {
      const { data } = await profiles.assign("owner", {
        actionType,
        profileId: text.id,
      });
      expect(data?.success).toBe(true);
    }

    const { status, data } = await profiles.unassign("owner", {
      actionType: "Chat",
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const chat = await profiles.getAssignment("owner", "Chat");
    expect(chat.data).toBeNull();

    const summarization = await profiles.getAssignment(
      "owner",
      "Summarization",
    );
    expect(summarization.data, "Summarization survives").toBe(text.id);

    // Section 5.2's "null clears the binding" half: after the unassign the action
    // resolves through Default again rather than failing.
    const resolved = await profiles.resolveForAction("owner", "Chat");
    expect(resolved.status).toBe(200);
    expect(resolved.data?.profileId).toBeTruthy();
    expect(resolved.data?.profileId).not.toBe(text.id);
  });

  test("DELETE /api/2.0/ai/assignments/unassign - unassigning twice is accepted, an unknown action is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const { data: assigned } = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: text.id,
    });
    expect(assigned?.success).toBe(true);

    const first = await profiles.unassign("owner", { actionType: "Chat" });
    expect(first.status).toBe(200);
    expect(first.data?.success).toBe(true);

    const second = await profiles.unassign("owner", { actionType: "Chat" });
    expect(second.status).toBe(200);
    expect(second.data?.success).toBe(true);
    expect((await profiles.getAssignment("owner", "Chat")).data).toBeNull();

    const unknown = await profiles.unassign("owner", {
      actionType: "NotAnAction",
    });
    expect(unknown.status).toBe(400);
  });

  test("DELETE /api/2.0/ai/assignments/cascade-profile-delete - drops every binding of one profile", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const doomed = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);
    const keeper = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    // The profile backs several actions (section 4.3: "a profile assigned to
    // several tasks"), and a second profile backs one more so the cascade can be
    // shown to be targeted.
    const seeded = await profiles.bulkAssign("owner", {
      Chat: doomed.id,
      Summarization: doomed.id,
      FormAnalysis: doomed.id,
      Vision: keeper.id,
    });
    expect(seeded.data?.success, JSON.stringify(seeded.data?.errors)).toBe(
      true,
    );

    const { status, data } = await profiles.cascadeProfileDelete("owner", {
      profileId: doomed.id,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const after = await profiles.getAllAssignments("owner");
    expect(after.status).toBe(200);
    expect(
      Object.values(after.data!),
      "no binding still points at the cascaded profile",
    ).not.toContain(doomed.id);
    expect(
      after.data!.FormAnalysis,
      "the seeded FormAnalysis slot is cleared like any other",
    ).toBeUndefined();
    expect(after.data!.Vision, "the other profile's binding survives").toBe(
      keeper.id,
    );
  });

  test("DELETE /api/2.0/ai/assignments/cascade-profile-delete - the profile id must be sent as an object field", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const bare = await profiles.cascadeProfileDelete("owner", profile.id);
    expect(bare.status).toBe(400);
    expect(bare.error).toBe("profileId required");

    const empty = await profiles.cascadeProfileDelete("owner", {});
    expect(empty.status).toBe(400);
  });
});

test.describe("AI Assignments - entity scope", () => {
  test("GET /api/2.0/ai/assignments/get-all-assignments - an agent carries its own Chat binding", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const agentProfile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );
    const other = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Assignment Agent",
      profileId: agentProfile.id,
    });

    // The agent's own scope reports the profile it was built on...
    const scoped = await profiles.getAllAssignments("owner", agentId);
    expect(scoped.status).toBe(200);
    expect(scoped.data?.Chat).toBe(agentProfile.id);

    // ...while the portal-wide scope has no Chat binding at all, so the two are
    // stored separately rather than one shadowing the other.
    const global = await profiles.getAssignment("owner", "Chat");
    expect(global.data).toBeNull();

    // A portal-wide assignment does not reach into the agent.
    const { data: assigned } = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: other.id,
    });
    expect(assigned?.success).toBe(true);

    const scopedAgain = await profiles.getAllAssignments("owner", agentId);
    expect(scopedAgain.data?.Chat, "the agent keeps its own binding").toBe(
      agentProfile.id,
    );

    const resolvedForAgent = await profiles.resolveForAction(
      "owner",
      "Chat",
      agentId,
    );
    expect(resolvedForAgent.data?.profileId).toBe(agentProfile.id);
  });

  test("BUG 82832: GET /api/2.0/ai/assignments/get-all-assignments - an unknown entityId is a 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const text = AiProfiles.byCapabilities(catalogue, AI_CAPS.textTools);

    const { data: assigned } = await profiles.assign("owner", {
      actionType: "Summarization",
      profileId: text.id,
    });
    expect(assigned?.success).toBe(true);

    // The scope used to be dropped silently, so a caller could not tell "this
    // entity has no overrides" from "this entity is not a thing" — the
    // portal-wide binding came back either way.
    const { status, data } = await profiles.getAllAssignments("owner", 999999);
    expect(status, "an unknown entity id").toBe(404);
    expect(
      data?.Summarization,
      "and it does not answer with the portal-wide assignments",
    ).toBeUndefined();
  });
});

// Which profile a task actually runs on: the agent's own Chat binding, then the
// portal binding of the action, then Default. resolve-for-action and
// try-resolve-for-action are the same lookup (measured 2026-10-02 on every state
// below) and differ only when nothing resolves at all: resolve answers 500,
// try answers 200 with a null body. Each `expectResolved` therefore asks both,
// so a divergence between them shows up in whichever test hits it first.
test.describe("AI Assignments - resolution precedence", () => {
  const expectResolved = async (
    profiles: AiProfiles,
    expectedId: string,
    actionType: string,
    entityId?: number | string,
  ) => {
    const label = `${actionType}${entityId === undefined ? "" : ` @${entityId}`}`;
    const resolved = await profiles.resolveForAction(
      "owner",
      actionType,
      entityId,
    );
    const tried = await profiles.tryResolveForAction(
      "owner",
      actionType,
      entityId,
    );
    expect(resolved.status, `resolve ${label}`).toBe(200);
    expect(resolved.data?.profileId, `resolve ${label}`).toBe(expectedId);
    expect(resolved.data?.profile?.id, `resolve ${label} expanded`).toBe(
      expectedId,
    );
    expect(tried.status, `try-resolve ${label}`).toBe(200);
    expect(tried.data, `try-resolve ${label} matches resolve`).toEqual(
      resolved.data,
    );
  };

  const assignOk = async (
    profiles: AiProfiles,
    actionType: string,
    profileId: string,
  ) => {
    const { status, data } = await profiles.assign("owner", {
      actionType,
      profileId,
    });
    expect(status, `assign ${actionType}`).toBe(200);
    expect(data?.success, `assign ${actionType}: ${data?.error?.message}`).toBe(
      true,
    );
  };

  /** Chat and Default both empty — the only state where resolve and try differ. */
  const emptyChatAndDefault = async (profiles: AiProfiles) => {
    for (const actionType of ["Chat", "Default"]) {
      const { status, data } = await profiles.unassign("owner", {
        actionType,
      });
      expect(status, `unassign ${actionType}`).toBe(200);
      expect(data?.success, `unassign ${actionType}`).toBe(true);
      const read = await profiles.getAssignment("owner", actionType);
      expect(read.data, `${actionType} is empty`).toBeNull();
    }
  };

  test("GET /api/2.0/ai/assignments/resolve-for-action - a direct Chat binding wins over Default, and unassigning it falls back to Default", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [a, b] = AiProfiles.distinctWithBit(catalogue, AI_CAPS.textTools, 2);

    await assignOk(profiles, "Chat", a.id!);
    await assignOk(profiles, "Default", b.id!);

    await test.step("Chat=A, Default=B -> Chat resolves to A", async () => {
      await expectResolved(profiles, a.id!, "Chat");
    });

    await test.step("an action with no binding of its own still gets Default", async () => {
      await expectResolved(profiles, b.id!, "Summarization");
    });

    await test.step("unassigning Chat -> Chat resolves to Default", async () => {
      const { data } = await profiles.unassign("owner", {
        actionType: "Chat",
      });
      expect(data?.success).toBe(true);
      const read = await profiles.getAssignment("owner", "Chat");
      expect(read.data, "Chat is empty").toBeNull();
      await expectResolved(profiles, b.id!, "Chat");
      const fallback = await profiles.getAssignment("owner", "Default");
      expect(fallback.data, "Default itself is untouched").toBe(b.id);
    });
  });

  test("DELETE /api/2.0/ai/assignments/cascade-profile-delete - cascading the Chat profile makes Chat resolve to Default", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [a, b] = AiProfiles.distinctWithBit(catalogue, AI_CAPS.textTools, 2);

    await assignOk(profiles, "Chat", a.id!);
    await assignOk(profiles, "Default", b.id!);
    await expectResolved(profiles, a.id!, "Chat");

    const { status, data } = await profiles.cascadeProfileDelete("owner", {
      profileId: a.id,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const read = await profiles.getAssignment("owner", "Chat");
    expect(read.data, "Chat lost its binding").toBeNull();
    await expectResolved(profiles, b.id!, "Chat");
  });

  test("GET /api/2.0/ai/assignments/resolve-for-action - an agent's own model wins over the portal Chat and Default", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [agentModel, portalChat, portalDefault] = AiProfiles.distinctWithBit(
      catalogue,
      AI_CAPS.textTools,
      3,
    );

    await assignOk(profiles, "Chat", portalChat.id!);
    await assignOk(profiles, "Default", portalDefault.id!);
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Precedence Agent",
      profileId: agentModel.id,
    });

    await test.step("with the agent's entityId -> the agent's model", async () => {
      await expectResolved(profiles, agentModel.id!, "Chat", agentId);
    });

    await test.step("without entityId -> the portal Chat, the agent's binding is not consulted", async () => {
      await expectResolved(profiles, portalChat.id!, "Chat");
    });

    await test.step("the agent keeps its model when the portal Chat is cleared", async () => {
      const { data } = await profiles.unassign("owner", {
        actionType: "Chat",
      });
      expect(data?.success).toBe(true);
      const read = await profiles.getAssignment("owner", "Chat");
      expect(read.data, "portal Chat is empty").toBeNull();

      await expectResolved(profiles, agentModel.id!, "Chat", agentId);
      await expectResolved(profiles, portalDefault.id!, "Chat");
    });
  });

  test("GET /api/2.0/ai/assignments/resolve-for-action - two agents each resolve their own model and leave the portal map alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [first, second, portalChat] = AiProfiles.distinctWithBit(
      catalogue,
      AI_CAPS.textTools,
      3,
    );

    await assignOk(profiles, "Chat", portalChat.id!);
    const before = await profiles.getAllAssignments("owner");
    expect(before.status).toBe(200);

    const firstAgent = await aiChat.createAgentId("owner", {
      title: "Autotest Precedence Agent 1",
      profileId: first.id,
    });
    const secondAgent = await aiChat.createAgentId("owner", {
      title: "Autotest Precedence Agent 2",
      profileId: second.id,
    });

    await test.step("each agent resolves the model it was built on", async () => {
      await expectResolved(profiles, first.id!, "Chat", firstAgent);
      await expectResolved(profiles, second.id!, "Chat", secondAgent);
    });

    await test.step("each agent's scope lists only its own Chat", async () => {
      const one = await profiles.getAllAssignments("owner", firstAgent);
      const two = await profiles.getAllAssignments("owner", secondAgent);
      expect(one.data).toEqual({ Chat: first.id });
      expect(two.data).toEqual({ Chat: second.id });
    });

    await test.step("the portal map is exactly what it was before the agents existed", async () => {
      const after = await profiles.getAllAssignments("owner");
      expect(after.status).toBe(200);
      expect(after.data).toEqual(before.data);
      await expectResolved(profiles, portalChat.id!, "Chat");
    });
  });

  test("GET /api/2.0/ai/assignments/resolve-for-action - FormAnalysis is an independent action type with its own slot and the Default fallback", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [a, b] = AiProfiles.distinctWithBit(catalogue, AI_CAPS.textTools, 2);

    // A fresh portal already ships a FormAnalysis binding; a different Default
    // keeps "falls back to Default" distinguishable from "kept its own".
    const seeded = await profiles.getAssignment("owner", "FormAnalysis");
    expect(
      seeded.data,
      "FormAnalysis is seeded on a fresh portal",
    ).toBeTruthy();
    await assignOk(profiles, "Default", b.id!);

    await test.step("assign -> every read names the new profile", async () => {
      await assignOk(profiles, "FormAnalysis", a.id!);
      const read = await profiles.getAssignment("owner", "FormAnalysis");
      expect(read.data).toBe(a.id);
      await expectResolved(profiles, a.id!, "FormAnalysis");
      const all = await profiles.getAllAssignments("owner");
      expect(all.data?.FormAnalysis).toBe(a.id);
    });

    await test.step("unassign -> the slot is empty and both resolves fall back to Default", async () => {
      const { data } = await profiles.unassign("owner", {
        actionType: "FormAnalysis",
      });
      expect(data?.success).toBe(true);
      const read = await profiles.getAssignment("owner", "FormAnalysis");
      expect(read.data, "FormAnalysis is empty").toBeNull();
      await expectResolved(profiles, b.id!, "FormAnalysis");
      const fallback = await profiles.getAssignment("owner", "Default");
      expect(fallback.data, "Default itself is untouched").toBe(b.id);
    });
  });

  test("GET /api/2.0/ai/assignments/resolve-for-action - an agent's model does not override FormAnalysis, only Chat", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [agentModel, formModel] = AiProfiles.distinctWithBit(
      catalogue,
      AI_CAPS.textTools,
      2,
    );

    await assignOk(profiles, "FormAnalysis", formModel.id!);
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest FormAnalysis Agent",
      profileId: agentModel.id,
    });

    // Control: the agent really carries a model of its own for Chat.
    await expectResolved(profiles, agentModel.id!, "Chat", agentId);

    await expectResolved(profiles, formModel.id!, "FormAnalysis", agentId);
    await expectResolved(profiles, formModel.id!, "FormAnalysis");
  });

  test("GET /api/2.0/ai/assignments/try-resolve-for-action - with nothing to resolve it answers 200 with a null body", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    await emptyChatAndDefault(profiles);

    const { status, data } = await profiles.tryResolveForAction(
      "owner",
      "Chat",
    );
    expect(status).toBe(200);
    expect(data).toBeNull();

    const direct = await profiles.tryResolveForAction("owner", "Default");
    expect(direct.status).toBe(200);
    expect(direct.data).toBeNull();
  });

  test("BUG 84278: GET /api/2.0/ai/assignments/resolve-for-action - returns 500 Internal Server Error when no profile can be resolved", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    await emptyChatAndDefault(profiles);

    // The same state try-resolve reports as a clean null: "no model is bound" is
    // a state of the portal, not a server fault. What the right answer is (404,
    // 204, a soft error...) is not decided — only that a 500 is wrong — so the
    // expected status stays TBD and is pinned once the owners say.
    const { status } = await profiles.resolveForAction("owner", "Chat");
    expect(status, "resolve with no profile to resolve").not.toBe(500);
  });

  test("BUG 84279: GET /api/2.0/ai/assignments/resolve-for-action - an unknown entityId is a 404 instead of the portal-wide model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [chat] = AiProfiles.distinctWithBit(catalogue, AI_CAPS.textTools, 1);
    await assignOk(profiles, "Chat", chat.id!);

    // get-all-assignments already answers 404 here (BUG 82832); the lookup the
    // chat surface actually calls still drops the scope in silence.
    const resolved = await profiles.resolveForAction("owner", "Chat", 999999);
    const tried = await profiles.tryResolveForAction("owner", "Chat", 999999);
    expect(resolved.status, "resolve with an unknown entity").toBe(404);
    expect(tried.status, "try-resolve with an unknown entity").toBe(404);
  });

  test("BUG 82830: GET /api/2.0/ai/assignments/resolve-for-action - Chat never resolves to a profile that cannot chat", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const imageOnly = AiProfiles.byCapabilities(catalogue, AI_CAPS.imageOnly);

    const unassigned = await profiles.unassign("owner", {
      actionType: "Chat",
    });
    expect(unassigned.data?.success).toBe(true);
    const direct = await profiles.getAssignment("owner", "Chat");
    expect(direct.data, "Chat falls through to Default").toBeNull();

    const { data: assigned } = await profiles.assign("owner", {
      actionType: "Default",
      profileId: imageOnly.id,
    });
    // Refusing the profile at assign time is a valid fix too: then there is
    // nothing left to resolve wrongly, and this test should lose test.fail.
    if (assigned?.success !== true) {
      return;
    }

    // Where validation lives is up to the backend; what Chat runs on is not.
    const { status, data } = await profiles.resolveForAction("owner", "Chat");
    expect(status).toBe(200);
    const capabilities = data?.profile?.capabilities ?? 0;
    expect(
      capabilities & AI_CAP_BITS.text,
      `Chat resolved to ${data?.profile?.modelId} (capabilities ${capabilities})`,
    ).toBe(AI_CAP_BITS.text);
  });
});

// PUT /api/2.0/portal/payment/ai-model/restrictions (see payment.spec.ts) hides
// a model from the catalogue entirely — this is the one place in the whole AI
// stack that reacts to a restricted profile the *right* way: a documented soft
// refusal, not a silent erase or a hard block. Contrast the agent-update path
// in agents.spec.ts ("restricting the agent's current model"), which does both.
test.describe("PUT /api/2.0/ai/assignments/assign - a restricted profile", () => {
  test("PUT /api/2.0/ai/assignments/assign - assigning a restricted profile is refused exactly like an unknown one", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const target = AiAgentChat.pickTextProfile(catalogue);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([target.modelId!]) },
    });

    const { status, data } = await profiles.assign("owner", {
      actionType: "Summarization",
      profileId: target.id,
    });

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    expect(status).toBe(200);
    expect(data?.success, "the assignment is refused").toBe(false);
    expect(data?.error?.message).toBe("Profile not found");
  });

  test("PUT /api/2.0/ai/assignments/assign - an unrelated restriction does not block assigning a different profile", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const usable = catalogue.filter(
      (p) => p.canUseTool !== false && !!p.modelId,
    );
    if (usable.length < 2) {
      throw new Error(`Need 2 usable profiles, catalogue has ${usable.length}`);
    }
    const [restricted, target] = usable;

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: {
        models: new Set([restricted.modelId!]),
      },
    });

    const { status, data } = await profiles.assign("owner", {
      actionType: "Summarization",
      profileId: target.id,
    });

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const { data: assignment } = await profiles.getAssignment(
      "owner",
      "Summarization",
    );
    expect(assignment).toBe(target.id);
  });
});
