import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiPreferences } from "@/src/helpers/ai-preferences";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import {
  AiAgentChat,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";

// "Deep mode" is the reasoning / extended-thinking switch of section 10, and the
// only reasoning surface the API exposes.
//
//   GET    /ai/preferences/get-deep-mode[?entityId=]     -> bare true/false
//   GET    /ai/preferences/is-deep-mode-set[?entityId=]  -> bare true/false
//   PUT    /ai/preferences/set-deep-mode   { value, entityId? }
//   DELETE /ai/preferences/clear-deep-mode { entityId? }
//
// What section 10 asks for and what exists differ in one important way: the
// setting is stored per user and per entity, but nothing in the message or thread
// payloads exposes a reasoning *result*. There are no separate reasoning stream
// events and no reasoning block on a stored assistant message — measured again
// 2026-08-11 on two reasoning-capable models with the switch on, see the "deep
// mode and the answer" block. So "the answer carries a separate reasoning part"
// is one `test.fail` test rather than a gap, and its mirror image — "reasoning is
// not mixed into the answer" — is assertable in the negative: the answer text
// must not carry a leaked `<think>` trace.
//
// `get-deep-mode` answers a bare JSON boolean, so `data` is `false` for a real
// "off" and `undefined` for a refusal — assert the status first.

test.describe("AI Preferences - deep mode state", () => {
  test("GET|PUT /api/2.0/ai/preferences/set-deep-mode - defaults to off and unset, then stores the value", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const initial = await preferences.getDeepMode("owner");
    expect(initial.status).toBe(200);
    expect(initial.data).toBe(false);

    // `is-deep-mode-set` is the "has the user ever chosen" flag, which is what
    // tells a default-off apart from an explicit off.
    const initialSet = await preferences.isDeepModeSet("owner");
    expect(initialSet.status).toBe(200);
    expect(initialSet.data).toBe(false);

    const enable = await preferences.setDeepMode("owner", { value: true });
    expect(enable.status).toBe(200);
    expect(enable.data?.success).toBe(true);

    const enabled = await preferences.getDeepMode("owner");
    expect(enabled.status).toBe(200);
    expect(enabled.data).toBe(true);
    expect((await preferences.isDeepModeSet("owner")).data).toBe(true);
  });

  test("PUT /api/2.0/ai/preferences/set-deep-mode - an explicit off is remembered as a choice", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
    });
    expect(enabled?.success).toBe(true);

    const disable = await preferences.setDeepMode("owner", { value: false });
    expect(disable.status).toBe(200);
    expect(disable.data?.success).toBe(true);

    // Off, but chosen — the pair (value=false, isSet=true) is the state a client
    // needs to leave the switch alone instead of re-applying its own default.
    expect((await preferences.getDeepMode("owner")).data).toBe(false);
    expect((await preferences.isDeepModeSet("owner")).data).toBe(true);
  });

  test("DELETE /api/2.0/ai/preferences/clear-deep-mode - clearing returns the setting to unset", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
    });
    expect(enabled?.success).toBe(true);
    expect((await preferences.getDeepMode("owner")).data).toBe(true);

    const cleared = await preferences.clearDeepMode("owner", {});
    expect(cleared.status).toBe(200);
    expect(cleared.data?.success).toBe(true);

    expect((await preferences.getDeepMode("owner")).data).toBe(false);
    expect((await preferences.isDeepModeSet("owner")).data).toBe(false);

    // Clearing an already-clear setting is accepted rather than 404.
    const again = await preferences.clearDeepMode("owner", {});
    expect(again.status).toBe(200);
    expect(again.data?.success).toBe(true);
  });
});

test.describe("AI Preferences - deep mode is per entity", () => {
  test("PUT /api/2.0/ai/preferences/set-deep-mode - an agent's value is independent of the portal-wide one", async ({
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

    const { data: scoped } = await preferences.setDeepMode("owner", {
      value: true,
      entityId: String(agentId),
    });
    expect(scoped?.success).toBe(true);

    // Section 10: switching it on for one entity must not switch it on elsewhere.
    expect((await preferences.getDeepMode("owner", agentId)).data).toBe(true);
    expect(
      (await preferences.getDeepMode("owner")).data,
      "the portal-wide value stays off",
    ).toBe(false);
    expect((await preferences.isDeepModeSet("owner", agentId)).data).toBe(true);
    expect((await preferences.isDeepModeSet("owner")).data).toBe(false);
  });

  test("PUT /api/2.0/ai/preferences/set-deep-mode - two agents keep separate values", async ({
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

    const first = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning A",
      profileId,
    });
    const second = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning B",
      profileId,
    });

    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
      entityId: String(first),
    });
    expect(enabled?.success).toBe(true);

    expect((await preferences.getDeepMode("owner", first)).data).toBe(true);
    expect(
      (await preferences.getDeepMode("owner", second)).data,
      "the second agent is unaffected",
    ).toBe(false);
    expect((await preferences.isDeepModeSet("owner", second)).data).toBe(false);
  });

  test("DELETE /api/2.0/ai/preferences/clear-deep-mode - clearing one entity leaves the other entities set", async ({
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

    const first = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning A",
      profileId,
    });
    const second = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning B",
      profileId,
    });

    // The portal-wide value is deliberately left unset here: `get-deep-mode`
    // falls back to it for an entity that has none of its own (see the next
    // test), so setting it would make "cleared" and "inherited" indistinguishable.
    for (const entityId of [first, second]) {
      const { data } = await preferences.setDeepMode("owner", {
        value: true,
        entityId: String(entityId),
      });
      expect(data?.success).toBe(true);
    }

    const cleared = await preferences.clearDeepMode("owner", {
      entityId: String(first),
    });
    expect(cleared.status).toBe(200);
    expect(cleared.data?.success).toBe(true);

    expect((await preferences.getDeepMode("owner", first)).data).toBe(false);
    expect((await preferences.isDeepModeSet("owner", first)).data).toBe(false);
    expect(
      (await preferences.getDeepMode("owner", second)).data,
      "the other agent keeps its value",
    ).toBe(true);
    expect(
      (await preferences.isDeepModeSet("owner", second)).data,
      "and keeps it as an explicit choice",
    ).toBe(true);
  });

  test("GET /api/2.0/ai/preferences/get-deep-mode - an entity with no value of its own inherits the portal-wide one", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const { data: portalWide } = await preferences.setDeepMode("owner", {
      value: true,
    });
    expect(portalWide?.success).toBe(true);

    // BOTH reads fall back to the portal-wide scope, so an entity that has never
    // been configured — including one that does not exist — reports the
    // portal-wide value and reports it as *set*. Two consequences worth knowing:
    // an unknown entityId is answered rather than 404'd, and through these routes
    // a client cannot tell an inherited value from a per-entity choice.
    const unknown = await preferences.getDeepMode("owner", 999999);
    expect(unknown.status).toBe(200);
    expect(unknown.data, "the effective value for an unknown entity").toBe(
      true,
    );

    const isSet = await preferences.isDeepModeSet("owner", 999999);
    expect(isSet.status).toBe(200);
    expect(isSet.data, "and it is reported as set").toBe(true);
  });
});

// A chat is no longer something only an agent has: it opens in any room and in
// any folder, and the switches around it are resolved from the location the user
// is in. An agent id is therefore not the only entity these routes have to key
// on — a room or a folder id is what the client sends most of the time.
//
// Measured 2026-08-06: an agent id is still the only scope that works, and the
// two location kinds fail differently.
//
//   * A ROOM id is accepted, answered `{success:true}` — and dropped. Both reads
//     then serve the portal-wide fallback, so the client sees the value it just
//     wrote only when the portal-wide one happens to match.
//   * A FOLDER id is refused outright with 403, on the caller's own folder.
//
// Either way the reasoning switch cannot be turned on for a location, which is
// what the widened chat context needs it to do. The same-shaped defect on the
// thread surface is BUG 82855 (every non-agent entity collapses into one bucket).
test.describe("AI Preferences - deep mode of a room or a folder", () => {
  const LOCATIONS = [
    { kind: "room", symptom: "reports success and stores nothing" },
    { kind: "folder", symptom: "is refused with 403" },
  ] as const;

  for (const { kind, symptom } of LOCATIONS) {
    test(`BUG 82900: PUT /api/2.0/ai/preferences/set-deep-mode - a ${kind} scope ${symptom}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

      let entityId: number;
      if (kind === "room") {
        const { data: room } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Reasoning Room",
            roomType: RoomType.CustomRoom,
          },
        });
        entityId = room.response!.id!;
      } else {
        const { data: myFolder } = await ownerApi.folders.getMyFolder();
        const { data: folder } = await ownerApi.folders.createFolder({
          folderId: myFolder.response!.current!.id!,
          createFolder: { title: "Autotest Reasoning Folder" },
        });
        entityId = folder.response!.id!;
      }

      // The portal-wide value is left unset on purpose: both reads fall back to
      // it, so a portal-wide `true` would make "the location kept the value" and
      // "the location inherited it" indistinguishable.
      expect((await preferences.getDeepMode("owner")).data).toBe(false);
      expect((await preferences.isDeepModeSet("owner")).data).toBe(false);

      // Every call is made up front and asserted afterwards: the two locations
      // break at different points, and a test.fail test stops at its first
      // failed assertion — collecting the state first keeps both variants
      // asserting the same, complete contract.
      const written = await preferences.setDeepMode("owner", {
        value: true,
        entityId: String(entityId),
      });
      const readBack = await preferences.getDeepMode("owner", entityId);
      const readBackIsSet = await preferences.isDeepModeSet("owner", entityId);

      // Control: the identical call against an agent does store. So the route
      // works and the body shape is right — it is the location scope that is
      // being thrown away, not the request.
      const catalogue = await profiles.catalogue("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Reasoning Agent",
        profileId: AiProfiles.byCapabilities(catalogue, AI_CAPS.textVisionTools)
          .id,
      });
      const agentWrite = await preferences.setDeepMode("owner", {
        value: true,
        entityId: String(agentId),
      });
      expect(agentWrite.data?.success).toBe(true);
      expect(
        (await preferences.getDeepMode("owner", agentId)).data,
        "an agent scope stores the value",
      ).toBe(true);
      expect((await preferences.isDeepModeSet("owner", agentId)).data).toBe(
        true,
      );

      test.fail();
      expect(written.status, `set-deep-mode on a ${kind}`).toBe(200);
      expect(written.data?.success).toBe(true);
      expect(readBack.status).toBe(200);
      expect(readBack.data, `the ${kind} keeps what was written to it`).toBe(
        true,
      );
      expect(readBackIsSet.data, `and reports the ${kind} as set`).toBe(true);
    });
  }

  // Gaps that only open once the bug above is fixed, and that would pass for
  // the wrong reason today (everything reads back as the portal-wide default):
  //   * two locations holding different values at the same time;
  //   * clearing one location leaving the others alone;
  //   * two members of one room keeping separate values in it.
});

test.describe("AI Preferences - deep mode validation", () => {
  test("BUG 82813: PUT /api/2.0/ai/preferences/set-deep-mode - a non-boolean value is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    // Start from an explicitly chosen "off", so a coercion to true would be
    // visible as a change rather than as the default.
    const { data: chosen } = await preferences.setDeepMode("owner", {
      value: false,
    });
    expect(chosen?.success).toBe(true);
    expect((await preferences.getDeepMode("owner")).data).toBe(false);

    const { status } = await preferences.setDeepMode("owner", {
      value: "yes",
    });
    expect(status, "a non-boolean value must be rejected with 400").toBe(400);

    // The refusal leaves the chosen value alone rather than half-writing it.
    expect(
      (await preferences.getDeepMode("owner")).data,
      "the stored value after a string was refused",
    ).toBe(false);
  });

  test("BUG 82814: PUT /api/2.0/ai/preferences/set-deep-mode - an empty body is rejected and keeps the stored value", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
    });
    expect(enabled?.success).toBe(true);

    // A body with no `value` used to be taken as "set it to false" — the same
    // shape as BUG 82725 on PUT /ai/config/user. It is now a bad request.
    const { status } = await preferences.setDeepMode("owner", {});
    expect(status, "an empty body must be rejected with 400").toBe(400);

    expect(
      (await preferences.getDeepMode("owner")).data,
      "the value chosen before the refused write",
    ).toBe(true);
  });

  test("BUG 82815: DELETE /api/2.0/ai/preferences/clear-deep-mode - a bare entityId body reports success and clears nothing", async ({
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

    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
      entityId: String(agentId),
    });
    expect(enabled?.success).toBe(true);
    expect((await preferences.getDeepMode("owner", agentId)).data).toBe(true);

    // The `{entityId}` object form works (covered above), so this is a body-shape
    // bug rather than a broken route.
    const { status, data } = await preferences.clearDeepMode(
      "owner",
      String(agentId),
    );
    expect(status).toBe(200);
    expect(data?.success, "the call reports success").toBe(true);

    const still = await preferences.getDeepMode("owner", agentId);

    test.fail();
    expect(
      still.data,
      "a clear that reports success must actually clear the value",
    ).toBe(false);
  });
});

// The switch is only meant to be offered for a model that supports reasoning, so
// the composer needs a per-model flag to key on. That flag is `reasoning` on the
// profile, and on this gateway it splits exactly along "can this model chat at
// all": every text model advertises reasoning, and only the image-generation
// profiles — which cannot be used in a chat anyway — say false.
test.describe("AI Preferences - deep mode and model support", () => {
  test("GET /api/2.0/ai/profiles/list - the reasoning flag the switch keys on is set on every chat-capable model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    for (const profile of catalogue) {
      expect(typeof profile.reasoning, `${profile.modelId} reasoning`).toBe(
        "boolean",
      );
    }

    // An image-generation profile is not a chat model — `canUseTool` is false and
    // sending on one comes back as model_not_found — and it does not reason
    // either, so the switch has nothing to attach to there.
    for (const image of catalogue.filter(
      (profile) => profile.capabilities === AI_CAPS.imageOnly,
    )) {
      expect(image.reasoning, `${image.modelId} is not a reasoning model`).toBe(
        false,
      );
      expect(image.canUseTool, `${image.modelId} cannot call tools`).toBe(
        false,
      );
    }

    const chatModels = catalogue.filter(
      (profile) => profile.capabilities !== AI_CAPS.imageOnly,
    );
    expect(
      chatModels.length,
      "the catalogue offers chat models",
    ).toBeGreaterThan(0);

    // A red line here is not a defect: it means the gateway has started offering
    // a chat model that does not reason, and the case this suite cannot write
    // today — the switch on against a model that does not support it — becomes
    // writable. Every chat model reporting `true` is why there is no such test.
    expect(
      chatModels
        .filter((profile) => profile.reasoning !== true)
        .map((profile) => profile.modelId),
      "chat models that do not advertise reasoning",
    ).toEqual([]);
  });
});

// The half of section 10 the state tests above cannot reach: what the switch
// actually does to an answer.
//
// Measured 2026-08-11 with the switch on for the agent, on gpt-5.6-sol,
// claude-opus-5 and deepseek-v4-pro — all three report `reasoning: true` — and
// against a question that a reasoning model does think about:
//
//   * the stream carries the same four frames as with the switch off
//     (`user-message-stored`, `message-start`, `message-delta`, `message-end`),
//   * every frame and the stored reply carry `text` parts only,
//   * the answer, the frame vocabulary and the stored message are byte-identical
//     in shape to a send made with the switch off, and
//   * a per-request `deepMode` / `reasoning` field on send-with-stream (top level
//     and inside `actionArgs`) is accepted and changes nothing.
//
// So there is no reasoning payload to collapse into a "Thinking" block. The one
// thing that is verifiable in the positive is the mirror-image requirement —
// the trace must not be mixed into the answer — and it holds.
test.describe("AI Preferences - deep mode and the answer", () => {
  const REASONING_QUESTION =
    "A bat and a ball cost $1.10 together. The bat costs $1.00 more than the " +
    "ball. How much does the ball cost? Reply with the amount only.";

  /** What a leaked provider-level reasoning trace is wrapped in. */
  const THINK_MARKERS = ["<think", "</think", "<thinking", "</thinking"];

  test("POST /api/2.0/ai/ai/send-with-stream - a reply produced with deep mode on is a healthy answer with no reasoning mixed into it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );
    // Premise of the whole test: a model that cannot reason would make "no
    // reasoning came back" true for the wrong reason.
    expect(profile.reasoning, `${profile.modelId} supports reasoning`).toBe(
      true,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning Agent",
      profileId: profile.id!,
    });

    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
      entityId: String(agentId),
    });
    expect(enabled?.success).toBe(true);
    expect(
      (await preferences.getDeepMode("owner", agentId)).data,
      "the switch is on for this agent before the send",
    ).toBe(true);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest deep mode thread",
      profileId: profile.id!,
      agentId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: profile.id!,
      agentId,
      message: REASONING_QUESTION,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    // The switch does not turn the answer into a transcript of the model's own
    // deliberation: neither the stream nor the stored reply carries a `<think>`
    // trace. If a gateway ever starts forwarding one inline, this is where it
    // surfaces — and the client would render it as part of the answer.
    const answer = AiAgentChat.assistantText(messages);
    for (const marker of THINK_MARKERS) {
      expect(
        answer.toLowerCase(),
        `the stored answer must not carry a raw ${marker}> trace`,
      ).not.toContain(marker);
      expect(
        sent.text.toLowerCase(),
        `the stream must not carry a raw ${marker}> trace`,
      ).not.toContain(marker);
    }
  });

  test("BUG 83050: POST /api/2.0/ai/ai/send-with-stream - a reply produced with deep mode on carries its reasoning as a part of its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );
    expect(profile.reasoning, `${profile.modelId} supports reasoning`).toBe(
      true,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning Agent",
      profileId: profile.id!,
    });
    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
      entityId: String(agentId),
    });
    expect(enabled?.success).toBe(true);
    expect(
      (await preferences.getDeepMode("owner", agentId)).data,
      "the switch is on for this agent before the send",
    ).toBe(true);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest deep mode thread",
      profileId: profile.id!,
      agentId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: profile.id!,
      agentId,
      message: REASONING_QUESTION,
    });

    const messages = await aiChat.waitForAssistantReply("owner", threadId);

    // Control first: the model really answered. Without this the assertion below
    // would also be red on a portal where inference is dead — a refused reply
    // carries no reasoning either, and that is not the defect under test.
    expect(sent.status).toBe(200);
    expectHealthyAssistantReply(messages);

    const partTypes = (content: unknown) =>
      Array.isArray(content)
        ? (content as Array<{ type?: string }>).map((part) => part.type ?? "")
        : [];

    const reply = AiAgentChat.assistantMessages(messages).at(-1)!;
    const signals = [
      // A separate block on the stored reply, the way `tool-call` is a part of
      // its own next to the text ones.
      ...partTypes(reply.content).filter((type) => type !== "text"),
      // Or a part / frame in the stream that is not the answer growing.
      ...AiAgentChat.streamFrames(sent.text).flatMap((frame) =>
        partTypes(frame.message?.content).filter((type) => type !== "text"),
      ),
      // Or a field on the message the client could hang the block off.
      ...Object.keys(reply).filter((key) => /reason|think/i.test(key)),
    ];

    test.fail();
    expect(
      signals,
      "with deep mode on, the reasoning has to reach the client somewhere: " +
        `stored parts ${JSON.stringify(partTypes(reply.content))}, ` +
        `frames ${JSON.stringify(AiAgentChat.frameTypes(sent.text))}, ` +
        `message fields ${JSON.stringify(Object.keys(reply))}`,
    ).not.toEqual([]);
  });
});

// "Remembered separately for each room / section" is about a *place*, not about a
// conversation: reopening a chat in the same place must find the switch as it was
// left, and a second chat there starts with the same value rather than its own.
// The API keys the value on entityId, and a thread id is not one of those:
//
//   * a write with a thread id is a 400 — the scope has to be a numeric entity,
//   * a read with one is answered 200 with the portal-wide fallback instead of
//     being refused, the same shape as the unknown-entity read above.
//
// Which is the behaviour the requirement wants, so this is a green test — but it
// is worth pinning, because the fallback on read is exactly what would make a
// broken per-thread scope look like it worked.
test.describe("AI Preferences - deep mode is not per thread", () => {
  test("GET|PUT /api/2.0/ai/preferences/set-deep-mode - a thread is not a scope of its own", async ({
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
    ).id!;
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning Agent",
      profileId,
    });
    const first = await aiChat.createThreadId("owner", {
      title: "Autotest first thread",
      profileId,
      agentId,
    });
    const second = await aiChat.createThreadId("owner", {
      title: "Autotest second thread",
      profileId,
      agentId,
    });

    // The portal-wide value stays unset: both reads fall back to it, so a
    // portal-wide `true` would make "the thread kept the agent's value" and "the
    // thread inherited the fallback" indistinguishable.
    expect((await preferences.getDeepMode("owner")).data).toBe(false);

    const { data: enabled } = await preferences.setDeepMode("owner", {
      value: true,
      entityId: String(agentId),
    });
    expect(enabled?.success).toBe(true);

    // A thread of that agent does not read as the agent — it reads as the
    // portal-wide fallback, so the client has to ask for the *section*.
    const threadRead = await preferences.getDeepMode("owner", first);
    expect(threadRead.status).toBe(200);
    expect(
      threadRead.data,
      "a thread id resolves to the portal-wide value, not the agent's",
    ).toBe(false);

    const threadWrite = await preferences.setDeepMode("owner", {
      value: false,
      entityId: first,
    });
    expect(
      threadWrite.status,
      "a thread id is not a valid scope to write to",
    ).toBe(400);

    // And the refused write left the section's value alone, so the second chat
    // opened in the same place still finds the switch on.
    expect(
      (await preferences.getDeepMode("owner", agentId)).data,
      "the agent's value survives a write aimed at one of its threads",
    ).toBe(true);
    expect((await preferences.isDeepModeSet("owner", agentId)).data).toBe(true);
    expect(
      (await preferences.getDeepMode("owner", second)).data,
      "the other thread of the same agent reads the same fallback",
    ).toBe(false);
  });
});
