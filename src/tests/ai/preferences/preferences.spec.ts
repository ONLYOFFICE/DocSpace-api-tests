import { expect, type APIRequestContext } from "@playwright/test";
import type { TokenStore } from "@/src/services/token-store";
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

  // BUG 82815 was a bare `entityId` body (`"<id>"` instead of `{entityId}`) that
  // answered 200 and cleared nothing. Re-measured 2026-10-06: the bare form now
  // clears that scope — and only that scope — so the test is a plain one.
  test("BUG 82815: DELETE /api/2.0/ai/preferences/clear-deep-mode - a bare entityId body clears that scope and leaves the others", async ({
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
    const otherId = await aiChat.createAgentId("owner", {
      title: "Autotest Reasoning Other Agent",
      profileId,
    });

    // The portal-wide value and a second agent are set too, so a clear that
    // reaches past its own scope cannot go unnoticed.
    for (const entityId of [undefined, agentId, otherId]) {
      const { data: enabled } = await preferences.setDeepMode("owner", {
        value: true,
        ...(entityId === undefined ? {} : { entityId: String(entityId) }),
      });
      expect(enabled?.success).toBe(true);
    }
    expect((await preferences.getDeepMode("owner", agentId)).data).toBe(true);

    // The `{entityId}` object form works (covered above), so this is a body-shape
    // question rather than a broken route.
    const { status, data } = await preferences.clearDeepMode(
      "owner",
      String(agentId),
    );
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    expect(
      (await preferences.getDeepMode("owner", agentId)).data,
      "a clear that reports success must actually clear the value",
    ).toBe(false);
    expect((await preferences.isDeepModeSet("owner", agentId)).data).toBe(
      false,
    );
    expect(
      (await preferences.getDeepMode("owner", otherId)).data,
      "another agent keeps its value",
    ).toBe(true);
    expect(
      (await preferences.getDeepMode("owner")).data,
      "the portal-wide value is untouched",
    ).toBe(true);
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
    // sending on one is refused as "not a chat model" — and it does not reason
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
//   * a read with one is answered 200 with the portal-wide fallback instead of
//     being refused, the same shape as the unknown-entity read above — still
//     the behaviour the requirement wants, asserted as a green check below.
//   * a write with a thread id is a 400 (the scope has to be a positive integer
//     entity). It was a 200 `{success:true}` that changed nothing for a while
//     (BUG 84026); re-measured 2026-10-06 it is refused again and no scope
//     moves.
test.describe("AI Preferences - deep mode is not per thread", () => {
  test("BUG 84026: GET|PUT /api/2.0/ai/preferences/set-deep-mode - a thread is not a scope of its own", async ({
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

    // No scope moves — checked before the status assertion below.
    expect(
      (await preferences.getDeepMode("owner", agentId)).data,
      "the agent's value survives a write aimed at one of its threads",
    ).toBe(true);
    expect((await preferences.isDeepModeSet("owner", agentId)).data).toBe(true);
    expect(
      (await preferences.getDeepMode("owner", second)).data,
      "the other thread of the same agent reads the same fallback",
    ).toBe(false);

    // BUG 84026: the refusal had regressed to a silent 200; it is a 400 again.
    expect(
      threadWrite.status,
      "a thread id is not a valid scope to write to",
    ).toBe(400);
  });
});

// The reasoning level (SDK 4.0.0) is the depth behind the deep-mode switch. Both
// route families read and write ONE stored value per scope — measured
// 2026-10-06:
//
//   * unset reads `off`, and `is-deep-mode-set` says false;
//   * `set-reasoning-level` takes exactly off|low|medium|high|max (lower-case);
//     anything else is a 400 that names the allowed values and changes nothing;
//   * a depth turns deep mode on, `off` turns it off — and the old
//     `set-deep-mode` writes into the same value: `false` stores `off`, `true`
//     keeps a stored depth and falls back to `medium` when the stored one is `off`;
//   * an entity does NOT inherit the portal-wide value — an agent with nothing of
//     its own reads `off`, whatever the portal holds.
//
// The level is the stored setting, not what the provider is asked for: a model
// clamps the depth it does not offer. That clamp is not observable from outside,
// so it is not asserted here.
async function createReasoningAgent(
  apiSdk: { request: APIRequestContext; tokenStore: TokenStore },
  title: string,
) {
  const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const catalogue = await profiles.catalogue("owner");
  return aiChat.createAgentId("owner", {
    title,
    profileId: AiProfiles.byCapabilities(catalogue, AI_CAPS.textVisionTools).id,
  });
}

const REASONING_LEVELS = ["off", "low", "medium", "high", "max"] as const;

test.describe("AI Preferences - reasoning level state", () => {
  test("GET /api/2.0/ai/preferences/get-reasoning-level - an unset scope reads off and unset", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const level = await preferences.getReasoningLevel("owner");
    expect(level.status).toBe(200);
    expect(level.data).toBe("off");
    expect((await preferences.getDeepMode("owner")).data).toBe(false);
    expect((await preferences.isDeepModeSet("owner")).data).toBe(false);
  });

  test("PUT /api/2.0/ai/preferences/set-reasoning-level - every level is stored and read back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    // Walked off -> max -> off so that each step is a change from the previous
    // value, never a repeat of it.
    for (const value of [...REASONING_LEVELS, "off"] as const) {
      await test.step(`level ${value}`, async () => {
        const write = await preferences.setReasoningLevel("owner", { value });
        expect(write.status).toBe(200);
        expect(write.data?.success).toBe(true);

        expect((await preferences.getReasoningLevel("owner")).data).toBe(value);
        expect(
          (await preferences.getDeepMode("owner")).data,
          "a depth turns deep mode on, off turns it off",
        ).toBe(value !== "off");
        expect(
          (await preferences.isDeepModeSet("owner")).data,
          "an explicit off is a stored choice too",
        ).toBe(true);
      });
    }
  });

  test("PUT /api/2.0/ai/preferences/set-reasoning-level - writing the same level twice is idempotent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    for (const attempt of [1, 2]) {
      const write = await preferences.setReasoningLevel("owner", {
        value: "high",
      });
      expect(write.status, `write ${attempt}`).toBe(200);
      expect(write.data?.success).toBe(true);
      expect((await preferences.getReasoningLevel("owner")).data).toBe("high");
      expect((await preferences.getDeepMode("owner")).data).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/preferences/set-reasoning-level - a value outside the five levels is refused and changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    // Positive control: a stored `high` is what an accepted bad write would
    // overwrite. On an unset scope a refusal and a silent no-op both read `off`.
    const seed = await preferences.setReasoningLevel("owner", {
      value: "high",
    });
    expect(seed.status).toBe(200);

    const bodies: Array<[string, Record<string, unknown>]> = [
      ["an unknown name", { value: "ultra" }],
      ["a capitalised name", { value: "High" }],
      ["an upper-case name", { value: "LOW" }],
      ["an empty string", { value: "" }],
      ["a number", { value: 3 }],
      ["a boolean", { value: true }],
      ["null", { value: null }],
      ["a missing value", {}],
    ];
    for (const [label, body] of bodies) {
      await test.step(label, async () => {
        const write = await preferences.setReasoningLevel("owner", body);
        expect(write.status, label).toBe(400);
        expect((await preferences.getReasoningLevel("owner")).data).toBe(
          "high",
        );
        expect((await preferences.getDeepMode("owner")).data).toBe(true);
      });
    }
  });
});

test.describe("AI Preferences - reasoning level and the deep-mode switch", () => {
  test("PUT /api/2.0/ai/preferences/set-deep-mode - turning it off stores off and a stored depth is replaced", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    await preferences.setReasoningLevel("owner", { value: "high" });
    const off = await preferences.setDeepMode("owner", { value: false });
    expect(off.status).toBe(200);

    expect((await preferences.getReasoningLevel("owner")).data).toBe("off");
    expect((await preferences.getDeepMode("owner")).data).toBe(false);
    expect((await preferences.isDeepModeSet("owner")).data).toBe(true);
  });

  test("PUT /api/2.0/ai/preferences/set-deep-mode - turning it on keeps the depth that is already stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    await preferences.setReasoningLevel("owner", { value: "high" });
    const on = await preferences.setDeepMode("owner", { value: true });
    expect(on.status).toBe(200);

    expect(
      (await preferences.getReasoningLevel("owner")).data,
      "an on that names no depth must not reset a chosen one",
    ).toBe("high");
    expect((await preferences.getDeepMode("owner")).data).toBe(true);
  });

  test("PUT /api/2.0/ai/preferences/set-deep-mode - turning it on after an off lands on medium, not on the earlier depth", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    await preferences.setReasoningLevel("owner", { value: "high" });
    await preferences.setReasoningLevel("owner", { value: "off" });
    // Control: the off really replaced `high`, so what follows cannot be a
    // surviving depth.
    expect((await preferences.getReasoningLevel("owner")).data).toBe("off");

    const on = await preferences.setDeepMode("owner", { value: true });
    expect(on.status).toBe(200);

    expect((await preferences.getReasoningLevel("owner")).data).toBe("medium");
    expect((await preferences.getDeepMode("owner")).data).toBe(true);
  });

  test("PUT /api/2.0/ai/preferences/set-deep-mode - turning it on for a scope that never chose a depth lands on medium", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    expect((await preferences.getReasoningLevel("owner")).data).toBe("off");
    const on = await preferences.setDeepMode("owner", { value: true });
    expect(on.status).toBe(200);
    expect((await preferences.getReasoningLevel("owner")).data).toBe("medium");
  });
});

test.describe("AI Preferences - reasoning level is per entity", () => {
  test("PUT /api/2.0/ai/preferences/set-reasoning-level - the portal and two agents each keep their own level", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const agentA = await createReasoningAgent(apiSdk, "Autotest Level Agent A");
    const agentB = await createReasoningAgent(apiSdk, "Autotest Level Agent B");

    // Control: with nothing written the agent reads off and unset, and does not
    // pick up a portal-wide value that is set later.
    await preferences.setReasoningLevel("owner", { value: "low" });
    expect((await preferences.getReasoningLevel("owner", agentA)).data).toBe(
      "off",
    );
    expect((await preferences.isDeepModeSet("owner", agentA)).data).toBe(false);

    for (const [entityId, value] of [
      [agentA, "high"],
      [agentB, "max"],
    ] as const) {
      const write = await preferences.setReasoningLevel("owner", {
        value,
        entityId: String(entityId),
      });
      expect(write.status).toBe(200);
      expect(write.data?.success).toBe(true);
    }

    expect((await preferences.getReasoningLevel("owner")).data).toBe("low");
    expect((await preferences.getReasoningLevel("owner", agentA)).data).toBe(
      "high",
    );
    expect((await preferences.getReasoningLevel("owner", agentB)).data).toBe(
      "max",
    );
    // The old reads see the same per-entity state.
    expect((await preferences.getDeepMode("owner", agentB)).data).toBe(true);
    expect((await preferences.isDeepModeSet("owner", agentA)).data).toBe(true);
  });

  test("DELETE /api/2.0/ai/preferences/clear-deep-mode - clearing an agent drops its level and leaves the others", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    const agentA = await createReasoningAgent(apiSdk, "Autotest Clear Agent A");
    const agentB = await createReasoningAgent(apiSdk, "Autotest Clear Agent B");
    await preferences.setReasoningLevel("owner", { value: "low" });
    await preferences.setReasoningLevel("owner", {
      value: "high",
      entityId: String(agentA),
    });
    await preferences.setReasoningLevel("owner", {
      value: "max",
      entityId: String(agentB),
    });

    const cleared = await preferences.clearDeepMode("owner", {
      entityId: String(agentA),
    });
    expect(cleared.status).toBe(200);
    expect(cleared.data?.success).toBe(true);

    expect(
      (await preferences.getReasoningLevel("owner", agentA)).data,
      "the cleared agent reads the unset default, not the old depth",
    ).toBe("off");
    expect((await preferences.getDeepMode("owner", agentA)).data).toBe(false);
    expect((await preferences.isDeepModeSet("owner", agentA)).data).toBe(false);

    expect((await preferences.getReasoningLevel("owner", agentB)).data).toBe(
      "max",
    );
    expect((await preferences.getReasoningLevel("owner")).data).toBe("low");
  });

  test("PUT /api/2.0/ai/preferences/set-reasoning-level - a malformed entityId is refused and writes nowhere", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    await preferences.setReasoningLevel("owner", { value: "low" });
    for (const entityId of ["abc", "-5", "1.5", " "]) {
      await test.step(`entityId ${JSON.stringify(entityId)}`, async () => {
        const write = await preferences.setReasoningLevel("owner", {
          value: "max",
          entityId,
        });
        expect(write.status).toBe(400);
        expect(
          (await preferences.getReasoningLevel("owner")).data,
          "the portal-wide value is untouched",
        ).toBe("low");
      });
    }
  });

  // A room, a folder and an id that exists nowhere are not scopes of their own.
  // Related to BUG 82900 (set-deep-mode: room = dropped, folder = 403) but a
  // different defect: measured 2026-10-06 the reasoning-level route answers 200
  // for all three and writes the value into the PORTAL-WIDE scope, and every read
  // of any non-agent id serves that value back. So the write "reads back", which
  // hides it from a check that only looks at the location — the portal value is
  // what gives it away. The request looks successful and overwrites another
  // scope's setting.
  for (const kind of ["room", "folder", "nonexistent id"] as const) {
    test(`BUG XXXXX: PUT /api/2.0/ai/preferences/set-reasoning-level - a ${kind} scope is stored separately from the portal-wide level`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);
      const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

      let entityId: number;
      if (kind === "room") {
        const { data: room } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Autotest Level Room",
            roomType: RoomType.CustomRoom,
          },
        });
        entityId = room.response!.id!;
      } else if (kind === "folder") {
        const { data: myFolder } = await ownerApi.folders.getMyFolder();
        const { data: folder } = await ownerApi.folders.createFolder({
          folderId: myFolder.response!.current!.id!,
          createFolder: { title: "Autotest Level Folder" },
        });
        entityId = folder.response!.id!;
      } else {
        entityId = 999_999_999;
      }

      // Control: the agent scope is real, so the route and the body shape work.
      const agentId = await createReasoningAgent(apiSdk, "Autotest Control");
      await preferences.setReasoningLevel("owner", { value: "low" });
      await preferences.setReasoningLevel("owner", {
        value: "high",
        entityId: String(agentId),
      });
      expect((await preferences.getReasoningLevel("owner")).data).toBe("low");

      const written = await preferences.setReasoningLevel("owner", {
        value: "max",
        entityId: String(entityId),
      });
      const portal = await preferences.getReasoningLevel("owner");
      const readBack = await preferences.getReasoningLevel("owner", entityId);

      test.fail();
      expect(written.status).toBe(200);
      expect(portal.data, "the portal-wide level is not the location's").toBe(
        "low",
      );
      expect(readBack.data, `the ${kind} keeps what was written`).toBe("max");
    });
  }
});
