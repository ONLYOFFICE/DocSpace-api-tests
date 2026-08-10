import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiWebSearch,
  WEB_SEARCH_PROVIDER_CANDIDATES,
} from "@/src/helpers/ai-web-search";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";
import config from "@/config";

// Web Search configuration — section 17.1.
//
//   GET    /ai/web-search/is-configured[?entityId=]
//   GET    /ai/web-search/get-active-config[?entityId=]
//   PUT    /ai/web-search/configure         { config, entityId? }
//   PUT    /ai/web-search/set-active-config { config, entityId? }
//   POST   /ai/web-search/test-connection   { provider, key?, baseUrl? }
//   DELETE /ai/web-search/clear             { entityId? }
//
// READ THIS BEFORE ADDING THE HAPPY-PATH CASES OF 17.1
//
// The portal recognises no web-search provider at all. `test-connection` answers
// "Unknown web-search provider: X" for every name the spec and the client use —
// Exa and ONLYOFFICE included — and `configure` / `set-active-config` answer 500
// for every body. So there is no way to save a valid configuration, which means
// "save a valid Exa config", "switch the active provider", "the key is not
// returned in the clear", "settings are stored per entity", "enabling search
// without a configured provider is refused" and the whole of 17.2/17.3 cannot be
// written yet. They are listed as gaps.
//
// What is testable is the unconfigured state, the provider-name contract, the
// clear operation — and the 500 itself, which lands *before* both the role check
// and the portal AI switch. That is why the permission and AI-disabled cases for
// `configure` live in this file next to the bug rather than in a separate matrix:
// a Guest and a caller on an AI-disabled portal both get 500 where the rest of the
// AI surface answers 403.

test.describe("AI Web Search - unconfigured state", () => {
  test("GET /api/2.0/ai/web-search/is-configured, get-active-config - a fresh portal has no provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const configured = await webSearch.isConfigured("owner");
    expect(configured.status).toBe(200);
    expect(configured.data).toBe(false);

    const active = await webSearch.getActiveConfig("owner");
    expect(active.status).toBe(200);
    expect(active.data).toBeNull();
  });

  test("GET /api/2.0/ai/web-search/is-configured - an agent scope is unconfigured too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const catalogue = await profiles.catalogue("owner");
    const profileId = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    ).id;
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Web Search Agent",
      profileId,
    });

    const configured = await webSearch.isConfigured("owner", agentId);
    expect(configured.status).toBe(200);
    expect(configured.data).toBe(false);

    const active = await webSearch.getActiveConfig("owner", agentId);
    expect(active.status).toBe(200);
    expect(active.data).toBeNull();
  });

  test("DELETE /api/2.0/ai/web-search/clear - clearing an unconfigured provider is accepted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { status, data } = await webSearch.clear("owner", {});
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    expect((await webSearch.isConfigured("owner")).data).toBe(false);
    expect((await webSearch.getActiveConfig("owner")).data).toBeNull();
  });
});

// The chat context is no longer an agent: a chat can be opened in any room or in
// any folder, and the client resolves the Web Search settings from whatever the
// user is currently looking at. `entityId` on these routes is therefore a room or
// a folder id far more often than an agent one.
//
// Only the read side and `clear` can be pinned here. "A room keeps its own
// provider while the portal keeps another" needs a configuration to exist, and
// `configure` answers 500 for every body (BUG 82812) — that half stays a gap.
//
// The scope is not access-checked either: see the last test. That is written as
// the 403 it should be rather than the 200 it is, so the day `configure` starts
// working the suite does not already bless reading another room's settings.
test.describe("AI Web Search - room and folder scope", () => {
  test("GET /api/2.0/ai/web-search/is-configured, get-active-config - a room and a folder scope are unconfigured too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Web Search Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: myFolder.response!.current!.id!,
      createFolder: { title: "Autotest Web Search Folder" },
    });
    const folderId = folder.response!.id!;

    for (const [label, entityId] of [
      ["a room", roomId],
      ["a folder", folderId],
    ] as const) {
      const configured = await webSearch.isConfigured("owner", entityId);
      expect(configured.status, `is-configured in ${label}`).toBe(200);
      expect(configured.data).toBe(false);

      const active = await webSearch.getActiveConfig("owner", entityId);
      expect(active.status, `get-active-config in ${label}`).toBe(200);
      expect(active.data).toBeNull();
    }
  });

  test("DELETE /api/2.0/ai/web-search/clear - a room scope is accepted and leaves the portal scope alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Web Search Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const cleared = await webSearch.clear("owner", {
      entityId: String(roomId),
    });
    expect(cleared.status).toBe(200);
    expect(cleared.data?.success).toBe(true);

    expect((await webSearch.isConfigured("owner", roomId)).data).toBe(false);
    expect(
      (await webSearch.isConfigured("owner")).data,
      "the portal-wide scope is untouched",
    ).toBe(false);
    expect((await webSearch.getActiveConfig("owner")).data).toBeNull();
  });

  test("BUG 82901: GET /api/2.0/ai/web-search/is-configured - a room the caller cannot open is not access-checked", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Private Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await webSearch.expectActingAs(
      "user",
      memberData.response!.id!,
      "the non-member",
    );

    // `entityId` is a location the caller names, so it has to be checked against
    // what they can open — the way `get-deep-mode` (BUG 82816) and `threads/list`
    // (BUG 82858) try to, even though both crash doing it. Here there is no check
    // at all: the scope of a room the user cannot see is answered like any other.
    //
    // Nothing leaks today only because no provider can be saved (BUG 82812). Once
    // `configure` works, this same read hands out another room's search
    // configuration, so the 200 is not the contract to pin — 403 is.
    const configured = await webSearch.isConfigured("user", roomId);
    const active = await webSearch.getActiveConfig("user", roomId);

    // Control: the caller's own portal-wide scope is answered, so a 403 below
    // would be about the room and not about the route refusing this role.
    const own = await webSearch.isConfigured("user");
    expect(own.status, "the caller's own scope is readable").toBe(200);

    test.fail();
    expect(configured.status).toBe(403);
    expect(active.status).toBe(403);
  });
});

test.describe("AI Web Search - provider names", () => {
  test("POST /api/2.0/ai/web-search/test-connection - a missing provider is reported as required", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    for (const body of [{ provider: "" }, { key: config.EXA_API_KEY }, {}]) {
      const { status, data } = await webSearch.testConnection("owner", body);
      // The result is a bare `{field, message}` pair, not a `success` envelope.
      expect(status, JSON.stringify(body)).toBe(200);
      expect(data?.message).toBe("Provider is required");
    }
  });

  test("BUG 82811: POST /api/2.0/ai/web-search/test-connection - Exa and ONLYOFFICE are recognised", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const rejected: string[] = [];
    for (const provider of WEB_SEARCH_PROVIDER_CANDIDATES) {
      const { status, data } = await webSearch.testConnection("owner", {
        provider,
        key: config.EXA_API_KEY,
      });
      expect(status, `test-connection ${provider}`).toBe(200);
      if (data?.message === `Unknown web-search provider: ${provider}`) {
        rejected.push(provider);
      }
    }

    // Every candidate the product documents or the client sends used to be
    // unknown, so there was no name a caller could configure. The two the
    // product ships with are now understood; the rest are still not names this
    // portal knows, which is the intended answer for them.
    expect(rejected, "providers the portal refuses to recognise").toEqual(
      WEB_SEARCH_PROVIDER_CANDIDATES.filter(
        (provider) => provider !== "exa" && provider !== "onlyoffice",
      ),
    );

    // Exa is not merely a known name: the key is really taken to the provider
    // and comes back validated.
    const exa = await webSearch.testConnection("owner", {
      provider: "exa",
      key: config.EXA_API_KEY,
    });
    expect(exa.data, "a valid Exa key validates").toBe(true);

    // ONLYOFFICE is recognised too, and asks for the field it still needs.
    const onlyoffice = await webSearch.testConnection("owner", {
      provider: "onlyoffice",
      key: config.EXA_API_KEY,
    });
    expect(onlyoffice.data?.message).toBe(
      "Base URL is required for cloud provider",
    );
  });
});

test.describe("AI Web Search - configure is broken", () => {
  test("BUG 82812: PUT /api/2.0/ai/web-search/configure - every body returns 500 and nothing is stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const bodies: Array<[string, Record<string, unknown>]> = [
      [
        "a well-formed Exa config",
        {
          config: {
            provider: "exa",
            key: config.EXA_API_KEY,
            isCloudProvider: true,
          },
        },
      ],
      ["the ONLYOFFICE provider", { config: { provider: "onlyoffice" } }],
      ["an unwrapped config", { provider: "onlyoffice", key: "k" }],
      ["an empty config", { config: {} }],
      ["an empty body", {}],
    ];

    for (const [label, body] of bodies) {
      const { status, error } = await webSearch.configure("owner", body);
      expect(status, `configure with ${label}`).toBe(500);
      expect(error).toBe("Internal server error");
    }

    const active = await webSearch.setActiveConfig("owner", {
      config: { provider: "onlyoffice" },
    });
    expect(active.status).toBe(500);

    // Nothing was saved, so the read side stays consistent at least.
    expect((await webSearch.isConfigured("owner")).data).toBe(false);
    expect((await webSearch.getActiveConfig("owner")).data).toBeNull();

    test.fail();
    expect(
      (
        await webSearch.configure("owner", {
          config: { provider: "exa", key: config.EXA_API_KEY },
        })
      ).status,
      "configuring a web-search provider must not be 500",
    ).toBe(200);
  });
});

test.describe("AI Web Search - permissions", () => {
  const READ_ROLES: Array<{
    label: string;
    type: UserType;
    role: AgentRole;
    canRead: boolean;
  }> = [
    {
      label: "DocSpaceAdmin",
      type: "DocSpaceAdmin",
      role: "docSpaceAdmin",
      canRead: true,
    },
    { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin", canRead: true },
    { label: "User", type: "User", role: "user", canRead: true },
    { label: "Guest", type: "Guest", role: "guest", canRead: false },
  ];

  test("GET|PUT|DELETE /api/2.0/ai/web-search/* - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["is-configured", webSearch.isConfigured("anonymous")],
      ["get-active-config", webSearch.getActiveConfig("anonymous")],
      [
        "test-connection",
        webSearch.testConnection("anonymous", { provider: "exa" }),
      ],
      [
        "configure",
        webSearch.configure("anonymous", {
          config: { provider: "onlyoffice" },
        }),
      ],
      ["clear", webSearch.clear("anonymous", {})],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, `${label} as anonymous`).toBe(401);
    }
  });

  for (const { label, type, role, canRead } of READ_ROLES) {
    test(`GET /api/2.0/ai/web-search/is-configured, get-active-config - ${label} ${canRead ? "reads" : "cannot read"} the configuration`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await webSearch.expectActingAs(role, memberData.response!.id!, label);

      const configured = await webSearch.isConfigured(role);
      const active = await webSearch.getActiveConfig(role);

      if (!canRead) {
        expect(configured.status).toBe(403);
        expect(active.status).toBe(403);
        return;
      }

      expect(configured.status).toBe(200);
      expect(configured.data).toBe(false);
      expect(active.status).toBe(200);
      expect(active.data).toBeNull();
    });
  }

  test("BUG 82812: PUT /api/2.0/ai/web-search/configure - a Guest gets 500 instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    await webSearch.expectActingAs("guest", guestData.response!.id!, "Guest");

    // The Guest is properly refused on the read side, so the authorization rule
    // exists — the write side just crashes before reaching it.
    expect((await webSearch.getActiveConfig("guest")).status).toBe(403);

    const { status } = await webSearch.configure("guest", {
      config: { provider: "onlyoffice", key: config.EXA_API_KEY },
    });

    test.fail();
    expect(status, "a Guest must be refused with 403, not 500").toBe(403);
  });
});

test.describe("AI Web Search - AI Disabled", () => {
  test("GET|DELETE /api/2.0/ai/web-search/* - the read side and clear return 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const { writeStatus, readStatus, enabled } = await setPortalAiAccess(
      ownerApi,
      false,
    );
    expect(writeStatus).toBe(200);
    expect(readStatus).toBe(200);
    expect(enabled).toBe(false);

    expect((await webSearch.isConfigured("owner")).status).toBe(403);
    expect((await webSearch.getActiveConfig("owner")).status).toBe(403);
    expect((await webSearch.clear("owner", {})).status).toBe(403);
  });

  test("BUG 82812: PUT /api/2.0/ai/web-search/configure - the 500 also bypasses the portal AI switch", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    // The neighbouring routes are gated, so the switch did take effect.
    expect((await webSearch.getActiveConfig("owner")).status).toBe(403);

    const { status } = await webSearch.configure("owner", {
      config: { provider: "onlyoffice", key: config.EXA_API_KEY },
    });

    test.fail();
    expect(
      status,
      "configure must be refused with 403 when AI access is disabled",
    ).toBe(403);
  });
});
