import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiPreferences } from "@/src/helpers/ai-preferences";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";

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
// events, no reasoning block on a stored assistant message, and no per-thread
// value — so "the API returns a separate reasoning part", "reasoning is not mixed
// into the answer" and the per-thread restore cases have no field to assert on and
// are listed as gaps rather than guessed at. The state machine below is what is
// actually testable.
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
    test(`BUG XXXXX: PUT /api/2.0/ai/preferences/set-deep-mode - a ${kind} scope ${symptom}`, async ({
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
  test("BUG 82813: PUT /api/2.0/ai/preferences/set-deep-mode - a string value is coerced instead of rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);

    // Start from an explicitly chosen "off", so a coercion to true is visible as a
    // change rather than as the default.
    const { data: chosen } = await preferences.setDeepMode("owner", {
      value: false,
    });
    expect(chosen?.success).toBe(true);
    expect((await preferences.getDeepMode("owner")).data).toBe(false);

    const { status, data } = await preferences.setDeepMode("owner", {
      value: "yes",
    });
    expect(status).toBe(200);
    expect(data?.success, "the call reports success").toBe(true);

    // The string was taken as truthy and written through, so a client sending the
    // wrong type silently turns reasoning on for the user.
    expect(
      (await preferences.getDeepMode("owner")).data,
      "the stored value after a string was sent",
    ).toBe(true);

    test.fail();
    expect(status, "a non-boolean value must be rejected with 400").toBe(400);
  });

  test("BUG 82814: PUT /api/2.0/ai/preferences/set-deep-mode - an empty body wipes the stored value", async ({
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

    // The same shape as BUG 82725 on PUT /ai/config/user: a body with no `value`
    // is treated as "set it to false" rather than as a bad request.
    const { status, data } = await preferences.setDeepMode("owner", {});
    expect(status).toBe(200);
    expect(data?.success).toBe(true);
    expect((await preferences.getDeepMode("owner")).data).toBe(false);

    test.fail();
    expect(status, "an empty body must be rejected with 400").toBe(400);
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
