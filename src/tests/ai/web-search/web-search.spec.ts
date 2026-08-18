import { expect } from "@playwright/test";
import { RoomType, TenantWalletService } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import {
  enableAiGateway,
  isWalletServiceEnabled,
  setAiSearchAddon,
} from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiWebSearch,
  WEB_SEARCH_PROVIDER_CANDIDATES,
  WEB_SEARCH_MESSAGES,
  WEB_SEARCH_BASE_URL_ERRORS,
  webSearchCalls,
  expectWebSearchSources,
} from "@/src/helpers/ai-web-search";
import {
  forbiddenSpecialUrls,
  RESOLVABLE_NON_PROVIDER_URL,
} from "@/src/helpers/ssrf-payloads";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import {
  AiAgentChat,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";
import { Role } from "@/src/services/token-store";
import config from "@/config";

/**
 * Needs information the model cannot have in its weights and asks for links, so
 * a reply produced without the tool is visibly different from one produced with
 * it. Both halves of the on/off test ask exactly this.
 */
const WEB_SEARCH_QUESTION =
  "Search the web: what is the latest stable version of ONLYOFFICE Docs? Cite your sources with links.";

const ADDON_ROLES: Array<{
  label: string;
  type: UserType;
  /** `Role`, not `AgentRole`: these also drive `apiSdk.forRole` for the billing call. */
  role: Role;
}> = [
  { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
  { label: "User", type: "User", role: "user" },
  { label: "Guest", type: "Guest", role: "guest" },
];

// Web Search configuration — section 17.1.
//
//   GET    /ai/web-search/is-configured[?entityId=]
//   GET    /ai/web-search/get-active-config[?entityId=]
//   PUT    /ai/web-search/configure         { config, entityId? }
//   PUT    /ai/web-search/set-active-config { config, entityId? }
//   POST   /ai/web-search/test-connection   { provider, key?, baseUrl? }
//   DELETE /ai/web-search/clear             { entityId? }
//
// READ THIS FIRST — THE SWITCH IS NOT ON THESE ROUTES
//
// The requirement has four parts: a provider is connected on the Web Search page;
// the model can then search the web and the answer shows a clickable list of
// sources; search can be switched on and off; and switching it off takes its
// tools out of the list.
//
// All four are testable, but not through `configure`. Web search is switched on
// in Billing → Add-ons: the **AI search** wallet service
// (`TenantWalletService.AISearch`, via `setAiSearchAddon`). Enabling it
// configures the portal's own ONLYOFFICE provider and bills searches to the
// wallet; no Exa key is involved. That is the "AI Web Search - the AI search
// add-on" block below, and it is where the requirement is actually covered:
//
//   * the add-on flips `is-configured` to `true` and `get-active-config` to
//     `{provider:"onlyoffice", baseUrl:<the portal itself>}`, portal-wide and in
//     every entity scope;
//   * with it on, the model calls `web_search` and the reply carries the sources
//     as `{title,url,favicon,text,author}` — the clickable list;
//   * with it off, the tool is gone from the model's toolset. `list-system-tools`
//     cannot show this (it answers `{}` for every role and scope since
//     2026-08-18, see mcp/mcp.spec.ts), so the tool's *absence from the reply* is
//     what the off-case asserts, against the on-case as its control.
//
// The six routes above are the older manual-configuration surface, and the
// product has retired it: a key is not entered on the Web Search page or anywhere
// else. They are still reachable, so what is below them is regression and
// security coverage of live routes — not coverage of a feature:
//
//   * `test-connection` still works (`exa`/`onlyoffice` recognised, a key goes to
//     the provider, the ONLYOFFICE `baseUrl` is dialled behind an egress guard),
//     and is worth keeping mainly because anyone — including a Guest, and with the
//     portal AI switch off — can make the portal send that outbound request;
//   * `configure` / `set-active-config` answer 500 for every body (BUG 82812,
//     seven spellings). Since no manual provider exists any more, the expected
//     behaviour is the 403 `clear` already gives on the same billing-owned state,
//     and that is what the `test.fail` tests ask for — not a working save.
//
// If these routes are removed with the rest of the manual path, delete those
// tests rather than fixing them.
//
// Two mirrored authorization defects, both `test.fail` below. `configure`'s 500
// lands *before* the role check and the portal AI switch (a Guest and an
// AI-disabled portal both get 500 where the read side answers 403), while
// `test-connection` is gated by neither: a Guest who is refused the configuration
// can still spend the portal's egress validating keys through it.

// The add-on path — the requirement, end to end.
//
// A fresh portal has the add-on off, so each test here starts from the negative
// state and flips it, which makes the "before" its own control: `false` → `true`
// on the same portal cannot be a portal that was configured all along.
test.describe("AI Web Search - the AI search add-on", () => {
  test("POST /api/2.0/portal/payment/servicestate - enabling the AI search add-on configures the portal's web-search provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    expect(
      (await webSearch.isConfigured("owner")).data,
      "the add-on is off on a fresh portal",
    ).toBe(false);

    await setAiSearchAddon(ownerApi.payment, true);

    const configured = await webSearch.isConfigured("owner");
    expect(configured.status).toBe(200);
    expect(configured.data, "the add-on configures web search").toBe(true);

    const active = await webSearch.getActiveConfig("owner");
    expect(active.status).toBe(200);
    // The provider is the portal itself: the add-on routes searches through
    // ONLYOFFICE and bills them, so there is no caller-supplied key to store.
    expect(active.data?.provider).toBe("onlyoffice");
    expect(active.data?.baseUrl).toBe(apiSdk.tokenStore.portalBaseUrl);
    expect(
      active.data?.key,
      "no key is part of an add-on config",
    ).toBeUndefined();
    expect(
      active.text,
      "nothing secret is returned with the configuration",
    ).not.toMatch(/"(key|apiKey|token|secret)"\s*:\s*"[^"]+"/);

    // Turning it back off is the other half of "switches on and off".
    await setAiSearchAddon(ownerApi.payment, false);
    expect((await webSearch.isConfigured("owner")).data).toBe(false);
    expect((await webSearch.getActiveConfig("owner")).data).toBeNull();
  });

  test("GET /api/2.0/ai/web-search/is-configured - the add-on configuration is reported in every entity scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Web Search Agent",
      profileId,
    });
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Web Search Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    // A chat is opened in an agent, a room or a folder, and the client asks about
    // that scope — so the portal-wide add-on has to be visible from all of them.
    for (const [label, entityId] of [
      ["an agent", agentId],
      ["a room", roomId],
    ] as const) {
      expect(
        (await webSearch.isConfigured("owner", entityId)).data,
        `${label} before the add-on`,
      ).toBe(false);
    }

    await setAiSearchAddon(ownerApi.payment, true);

    for (const [label, entityId] of [
      ["an agent", agentId],
      ["a room", roomId],
    ] as const) {
      const configured = await webSearch.isConfigured("owner", entityId);
      expect(configured.status, `is-configured in ${label}`).toBe(200);
      expect(configured.data, `is-configured in ${label}`).toBe(true);

      const active = await webSearch.getActiveConfig("owner", entityId);
      expect(active.data?.provider, `get-active-config in ${label}`).toBe(
        "onlyoffice",
      );
    }
  });

  test("POST /api/2.0/ai/ai/send-with-stream - with the add-on on the model searches the web and the reply carries its sources", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await setAiSearchAddon(ownerApi.payment, true);
    expect(
      (await webSearch.isConfigured("owner")).data,
      "the premise of the whole test",
    ).toBe(true);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Web Search Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Web search",
      profileId,
      agentId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId,
      profileId,
      message: WEB_SEARCH_QUESTION,
      timeoutMs: 240000,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    const reply = AiAgentChat.assistantMessages(messages).at(-1)!;
    // The tool ran, on a real query, and came back with linkable sources.
    expectWebSearchSources(reply);

    // The search is server-executed: nothing pauses for the user, unlike a host
    // tool. If that ever changes the stream stops at `tool-call-pending` and the
    // reply above would never arrive.
    expect(
      sent.frames.map((frame) => frame.type),
      "a web search does not ask for confirmation",
    ).not.toContain("tool-call-pending");

    // The phrase the composer shows while it searches travels as args.aiChatIntent.
    const [call] = webSearchCalls(reply);
    expect(call.intent?.length, "the pre-call intent phrase").toBeGreaterThan(
      0,
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - turning the add-on off takes the web_search tool away from the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Web Search Agent",
      profileId,
    });

    const ask = async (title: string) => {
      const threadId = await aiChat.createThreadId("owner", {
        title,
        profileId,
        agentId,
      });
      await aiChat.sendMessage("owner", {
        threadId,
        agentId,
        profileId,
        message: WEB_SEARCH_QUESTION,
        timeoutMs: 240000,
      });
      const messages = await aiChat.waitForAssistantReply("owner", threadId);
      expectHealthyAssistantReply(messages);
      return AiAgentChat.assistantMessages(messages).at(-1)!;
    };

    // The on-case is the positive control this test needs: "no web_search call"
    // is also what a portal with broken inference, a model that ignores tools or
    // a wrong question produces. Both halves ask the same question of the same
    // agent, so the add-on is the only difference between them.
    await setAiSearchAddon(ownerApi.payment, true);
    expectWebSearchSources(await ask("search on"));

    await setAiSearchAddon(ownerApi.payment, false);
    expect(
      (await webSearch.isConfigured("owner")).data,
      "web search is off before the second question",
    ).toBe(false);

    const withoutSearch = await ask("search off");
    expect(
      webSearchCalls(withoutSearch),
      "the web_search tool must not be offered to the model any more",
    ).toEqual([]);
    // Nothing else is taken away with it: the model still answers, from its own
    // weights, so this is the tool being gone and not inference being broken.
    expect(
      AiAgentChat.messageText(withoutSearch).length,
      "the model still answers without the tool",
    ).toBeGreaterThan(0);
  });

  test("DELETE /api/2.0/ai/web-search/clear - an add-on-provided configuration cannot be cleared, by anyone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Control: while nothing is configured, `clear` is a plain 200 — so the 403
    // below is about the configuration being billing-owned and not about the
    // route being closed on this portal.
    expect((await webSearch.clear("owner", {})).status).toBe(200);

    await setAiSearchAddon(ownerApi.payment, true);

    const cleared = await webSearch.clear("owner", {});
    expect(cleared.status, "the owner cannot clear an add-on config").toBe(403);

    // The state is what matters: a refusal that still wiped the provider would be
    // worse than a 200.
    expect((await webSearch.isConfigured("owner")).data).toBe(true);
    expect((await webSearch.getActiveConfig("owner")).data?.provider).toBe(
      "onlyoffice",
    );
    expect(
      await isWalletServiceEnabled(ownerApi.payment, "aiSearch"),
      "the add-on itself is untouched",
    ).toBe(true);

    // A member cannot do what the owner cannot: web search stays on for the
    // portal whoever asks. (In the unconfigured state these same roles get 200 —
    // see the permissions block.)
    const { data: member } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    await webSearch.expectActingAs(
      "docSpaceAdmin",
      member.response!.id!,
      "DocSpaceAdmin",
    );
    expect((await webSearch.clear("docSpaceAdmin", {})).status).toBe(403);

    await apiSdk.authenticateOwner();
    expect((await webSearch.isConfigured("owner")).data).toBe(true);
  });

  test("POST /api/2.0/portal/payment/servicestate - only the owner and a DocSpaceAdmin may switch web search on", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    await setAiSearchAddon(ownerApi.payment, true);

    // Plain members first, then one authentication at a time.
    const members = [];
    for (const { label, type, role } of ADDON_ROLES) {
      const { data, userData } = await apiSdk.addMember("owner", type);
      expect(data.response?.id, `${label} was created`).toBeTruthy();
      members.push({ label, type, role, userData, id: data.response!.id! });
    }

    for (const { label, type, role, userData, id } of members) {
      await apiSdk.authenticateMember(userData, type);
      await webSearch.expectActingAs(role, id, label);

      const { status } = await apiSdk
        .forRole(role)
        .payment.changeTenantWalletServiceState({
          changeWalletServiceStateRequestDto: {
            service: TenantWalletService.AISearch,
            enabled: false,
          },
        });
      const mayFlip = label === "DocSpaceAdmin";
      expect(status, `${label} flips the AI search add-on`).toBe(
        mayFlip ? 200 : 403,
      );

      await apiSdk.authenticateOwner();
      expect(
        await isWalletServiceEnabled(ownerApi.payment, "aiSearch"),
        `the add-on after ${label} tried to switch it off`,
      ).toBe(!mayFlip);
      await setAiSearchAddon(ownerApi.payment, true);
    }
  });

  test("GET /api/2.0/ai/web-search/is-configured - a User sees that search is available, a Guest is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    await setAiSearchAddon(ownerApi.payment, true);

    const members = [];
    for (const type of ["User", "Guest"] as const) {
      const { data, userData } = await apiSdk.addMember("owner", type);
      expect(data.response?.id, `${type} was created`).toBeTruthy();
      members.push({ type, userData, id: data.response!.id! });
    }

    for (const { type, userData, id } of members) {
      const role = type === "User" ? "user" : "guest";
      await apiSdk.authenticateMember(userData, type);
      await webSearch.expectActingAs(role, id, type);

      const configured = await webSearch.isConfigured(role);
      const active = await webSearch.getActiveConfig(role);

      if (type === "Guest") {
        expect(configured.status, "Guest").toBe(403);
        expect(active.status, "Guest").toBe(403);
      } else {
        // The chat UI needs this to know whether to offer search at all.
        expect(configured.status, type).toBe(200);
        expect(configured.data, type).toBe(true);
        expect(active.data?.provider, type).toBe("onlyoffice");
        expect(
          active.text,
          "a User is not shown anything secret either",
        ).not.toMatch(/"(key|apiKey|token|secret)"\s*:\s*"[^"]+"/);
      }
      await apiSdk.authenticateOwner();
    }
  });

  test("GET /api/2.0/ai/web-search/* - the portal AI switch hides the add-on configuration", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    await setAiSearchAddon(ownerApi.payment, true);
    expect((await webSearch.isConfigured("owner")).data).toBe(true);

    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    // Paid-for and configured, but AI is off portal-wide: the read side is
    // refused rather than answering `false`, which is the switch talking.
    expect((await webSearch.isConfigured("owner")).status).toBe(403);
    expect((await webSearch.getActiveConfig("owner")).status).toBe(403);

    // The add-on is still paid for, and switching AI back on restores it — the
    // switch hides the configuration, it does not cancel it.
    expect(await isWalletServiceEnabled(ownerApi.payment, "aiSearch")).toBe(
      true,
    );
    await setPortalAiAccess(ownerApi, true);
    expect((await webSearch.isConfigured("owner")).data).toBe(true);
  });
});

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
    // (BUG 82858) now do, both answering 403. Here there is no check at all: the
    // scope of a room the user cannot see is answered like any other.
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

// Retired surface — see the file header. Kept as regression coverage of routes
// that are still reachable, not as coverage of a way to configure a provider.
test.describe("AI Web Search - test-connection (retired manual path)", () => {
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
    expect(onlyoffice.data?.message).toBe(WEB_SEARCH_MESSAGES.baseUrlRequired);
  });

  test("POST /api/2.0/ai/web-search/test-connection - a key is validated by the provider and never stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // The valid key is the control: without it a "wrong key is refused" pass
    // could just as well mean the route refuses every key. It is also the only
    // reason this test still uses `EXA_API_KEY` — if the route is removed with
    // the rest of the manual path, this test goes with it.
    const valid = await webSearch.testConnection("owner", {
      provider: "exa",
      key: config.EXA_API_KEY,
    });
    expect(valid.status).toBe(200);
    expect(valid.data, "a valid Exa key answers with a bare true").toBe(true);

    // A key is only ever answered on by Exa itself, so all three of these are
    // round trips to the provider rather than local validation.
    for (const [label, body] of [
      ["a wrong key", { provider: "exa", key: "not-a-real-exa-key" }],
      ["an empty key", { provider: "exa", key: "" }],
      ["no key at all", { provider: "exa" }],
    ] as const) {
      const { status, data } = await webSearch.testConnection("owner", body);
      expect(status, `test-connection with ${label}`).toBe(200);
      expect(data?.field, label).toBe("key");
      expect(data?.message, label).toBe(WEB_SEARCH_MESSAGES.invalidKey);
    }

    // The name match is tolerant, and a `baseUrl` Exa has no use for is ignored
    // rather than refused — the egress guard in the next block never runs for it.
    for (const [label, body] of [
      ["uppercase", { provider: "EXA", key: config.EXA_API_KEY }],
      ["padded", { provider: " exa ", key: config.EXA_API_KEY }],
      [
        "with a pointless baseUrl",
        {
          provider: "exa",
          key: config.EXA_API_KEY,
          baseUrl: RESOLVABLE_NON_PROVIDER_URL,
        },
      ],
    ] as const) {
      const { status, data } = await webSearch.testConnection("owner", body);
      expect(status, `test-connection ${label}`).toBe(200);
      expect(data, `test-connection ${label}`).toBe(true);
    }

    // The important part: a probe is not a save. Nothing here configures the
    // portal — which is consistent with a product where no key is entered at all.
    expect((await webSearch.isConfigured("owner")).data).toBe(false);
    expect((await webSearch.getActiveConfig("owner")).data).toBeNull();
  });
});

// The `baseUrl` on `test-connection` is a caller-supplied URL that the portal
// really dials, which makes this the one place on the whole web-search surface
// with an SSRF shape — and the reason to keep testing a retired path: the route
// stays reachable by every role while it exists. It is guarded the same way
// `/ai/profiles` is since BUG 83005 — refused with 400 before any socket opens.
//
// Every payload below points at a loopback / private / metadata address or at a
// reserved `.invalid` name, so an unguarded build would fail DNS or hit its own
// loopback rather than reach anything real. See the header of ssrf-payloads.ts
// for why canary-listener verification cannot run in this suite.
test.describe("AI Web Search - test-connection baseUrl egress guard", () => {
  test("POST /api/2.0/ai/web-search/test-connection - ONLYOFFICE needs a base URL and a key, and the URL is really dialled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    const noUrl = await webSearch.testConnection("owner", {
      provider: "onlyoffice",
      key: config.EXA_API_KEY,
    });
    expect(noUrl.status).toBe(200);
    expect(noUrl.data?.field).toBe("url");
    expect(noUrl.data?.message).toBe(WEB_SEARCH_MESSAGES.baseUrlRequired);

    const noKey = await webSearch.testConnection("owner", {
      provider: "onlyoffice",
      baseUrl: RESOLVABLE_NON_PROVIDER_URL,
    });
    expect(noKey.status).toBe(200);
    expect(noKey.data?.field).toBe("key");
    expect(noKey.data?.message).toBe(WEB_SEARCH_MESSAGES.emptyKey);

    // With both fields present the portal goes to the host. example.com is not a
    // web-search service, so what comes back is the host's own answer relayed
    // through the `{field:"key"}` envelope — which is the evidence that the
    // request left the portal at all, rather than being validated locally.
    const dialled = await webSearch.testConnection("owner", {
      provider: "onlyoffice",
      key: config.EXA_API_KEY,
      baseUrl: RESOLVABLE_NON_PROVIDER_URL,
    });
    expect(dialled.status).toBe(200);
    expect(
      dialled.data?.message,
      `a resolvable host is contacted and its answer relayed: ${dialled.text}`,
    ).toMatch(/^Request failed with status \d+$/);
  });

  test("POST /api/2.0/ai/web-search/test-connection - a private, unresolvable or malformed base URL is refused before any request", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    for (const { name, url } of forbiddenSpecialUrls) {
      const { status, error, text } = await webSearch.testConnection("owner", {
        provider: "onlyoffice",
        key: config.EXA_API_KEY,
        baseUrl: url,
      });
      expect(status, `${name} must be refused: ${text}`).toBe(400);
      expect(error, name).toBe(WEB_SEARCH_BASE_URL_ERRORS.notAllowed);
    }

    const unresolvable = await webSearch.testConnection("owner", {
      provider: "onlyoffice",
      key: config.EXA_API_KEY,
      baseUrl: "https://web-search-attacker.invalid",
    });
    expect(unresolvable.status).toBe(400);
    expect(unresolvable.error).toBe(WEB_SEARCH_BASE_URL_ERRORS.unresolvable);

    const malformed = await webSearch.testConnection("owner", {
      provider: "onlyoffice",
      key: config.EXA_API_KEY,
      baseUrl: "not-a-url",
    });
    expect(malformed.status).toBe(400);
    expect(malformed.error).toBe(WEB_SEARCH_BASE_URL_ERRORS.invalid);

    // Control: the guard is a host check and not a blanket refusal of every
    // `baseUrl` — a public host passes it and reaches the provider probe.
    const allowed = await webSearch.testConnection("owner", {
      provider: "onlyoffice",
      key: config.EXA_API_KEY,
      baseUrl: RESOLVABLE_NON_PROVIDER_URL,
    });
    expect(allowed.status, "a public host is not refused by the guard").toBe(
      200,
    );
  });
});

// `entityId` names the scope the chat is opened in — an agent, a room or a
// folder. The read side answers whatever it is given: none of these are
// validated, and none of them 500 the way an unresolvable entity does on
// /ai/threads (BUG 82715). Pinned because it is the graceful half of the
// entity-scope story, next to the missing access check in BUG 82901 above.
test.describe("AI Web Search - entity scope robustness", () => {
  test("GET /api/2.0/ai/web-search/is-configured, get-active-config - an unknown or malformed entityId is answered as unconfigured", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    for (const entityId of ["", "0", "-1", "999999999", "abc"]) {
      const configured = await webSearch.isConfigured("owner", entityId);
      expect(configured.status, `is-configured ?entityId=${entityId}`).toBe(
        200,
      );
      expect(configured.data, `is-configured ?entityId=${entityId}`).toBe(
        false,
      );

      const active = await webSearch.getActiveConfig("owner", entityId);
      expect(active.status, `get-active-config ?entityId=${entityId}`).toBe(
        200,
      );
      expect(active.data, `get-active-config ?entityId=${entityId}`).toBeNull();
    }
  });

  test("DELETE /api/2.0/ai/web-search/clear - an unknown or malformed entityId is accepted as a no-op", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    for (const body of [{ entityId: "999999999" }, { entityId: "abc" }]) {
      const { status, data } = await webSearch.clear("owner", body);
      expect(status, `clear ${JSON.stringify(body)}`).toBe(200);
      expect(data?.success, JSON.stringify(body)).toBe(true);
    }

    // `{success:true}` on a scope that cannot exist is a soft answer, so the
    // portal scope is read back to show nothing was collaterally cleared.
    expect((await webSearch.isConfigured("owner")).data).toBe(false);
    expect((await webSearch.getActiveConfig("owner")).data).toBeNull();
  });
});

// `configure` / `set-active-config` are the manual path, and the product no
// longer has one: a key is not entered on the Web Search page or anywhere else,
// the provider comes from the add-on. So the expected behaviour of these two is a
// deterministic refusal, not a save — 403, the way `clear` refuses the same
// billing-owned state and the way `/ai/profiles` CRUD refuses on a gateway
// portal. Both tests below are `test.fail` on that 403; neither asks for a
// working save any more.
test.describe("AI Web Search - configure crashes instead of refusing", () => {
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
      "a manual provider is not a product feature any more, so this must be refused with 403, not crash with 500",
    ).toBe(403);
  });

  test("BUG 82812: PUT /api/2.0/ai/web-search/configure - a manual config is refused, not crashed, while the add-on owns the provider", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    await setAiSearchAddon(ownerApi.payment, true);

    // With the add-on on, the provider is billing-owned and manual writes have a
    // contract already: `clear` refuses cleanly with 403. That is the control and
    // the expectation — `configure` is the same kind of write against the same
    // kind of state, so a 500 is the odd one out rather than a missing feature.
    expect(
      (await webSearch.clear("owner", {})).status,
      "the sibling write refuses cleanly",
    ).toBe(403);

    const attempt = await webSearch.configure("owner", {
      config: { provider: "exa", key: config.EXA_API_KEY },
    });

    // Whatever the status, the add-on config must survive an attempted overwrite.
    expect((await webSearch.isConfigured("owner")).data).toBe(true);
    expect((await webSearch.getActiveConfig("owner")).data?.provider).toBe(
      "onlyoffice",
    );

    test.fail();
    expect(
      attempt.status,
      `configure answered ${attempt.status} ${attempt.text}`,
    ).toBe(403);
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
      [
        "set-active-config",
        webSearch.setActiveConfig("anonymous", {
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

  test("POST /api/2.0/ai/web-search/test-connection, DELETE clear - DocSpaceAdmin, RoomAdmin and User are all allowed while nothing is configured", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);

    // Every member is created while the shared context is still the owner's,
    // then authenticated one at a time — creating a member from a member's
    // session answers 403, and two authentications back to back flake with 401.
    const members = [];
    for (const { label, type, role } of READ_ROLES.filter(
      ({ canRead }) => canRead,
    )) {
      const { data, userData } = await apiSdk.addMember("owner", type);
      expect(data.response?.id, `${label} was created`).toBeTruthy();
      members.push({ label, type, role, userData, id: data.response!.id! });
    }

    for (const { label, type, role, userData, id } of members) {
      await apiSdk.authenticateMember(userData, type);
      await webSearch.expectActingAs(role, id, label);

      // A key probe is an outbound request on the portal's behalf, so who may
      // make one is a real permission question and not only a UI one. Today
      // every role that can read the configuration can also probe with it.
      const probe = await webSearch.testConnection(role, {
        provider: "exa",
        key: config.EXA_API_KEY,
      });
      expect(probe.status, `test-connection as ${label}`).toBe(200);
      expect(probe.data, `test-connection as ${label}`).toBe(true);

      // `clear` is only this permissive on an unconfigured portal — nothing can
      // be destroyed by it here. As soon as the add-on provides a configuration
      // it answers 403 for every role including the owner, which is the add-on
      // block's clear test.
      const cleared = await webSearch.clear(role, {});
      expect(cleared.status, `clear as ${label}`).toBe(200);
      expect(cleared.data?.success, `clear as ${label}`).toBe(true);
    }

    await apiSdk.authenticateOwner();
    expect(
      (await webSearch.isConfigured("owner")).status,
      "the owner's own scope still answers after the members' calls",
    ).toBe(200);
  });

  test("BUG XXXXX: POST /api/2.0/ai/web-search/test-connection - a Guest cannot read the configuration but may still validate a key through the portal", async ({
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

    // Controls: this route family does authorize a Guest — both the read side and
    // `clear` refuse them — so a 200 on `test-connection` is a missing check on
    // that one route, not a portal where Guests are unrestricted.
    expect((await webSearch.getActiveConfig("guest")).status).toBe(403);
    expect((await webSearch.isConfigured("guest")).status).toBe(403);
    expect((await webSearch.clear("guest", {})).status).toBe(403);

    const probe = await webSearch.testConnection("guest", {
      provider: "exa",
      key: config.EXA_API_KEY,
    });

    test.fail();
    expect(
      probe.status,
      `a Guest must not reach the web-search provider; got ${probe.status} ${probe.text}`,
    ).toBe(403);
  });

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

  test("BUG XXXXX: POST /api/2.0/ai/web-search/test-connection - the portal AI switch does not gate the provider probe", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const webSearch = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const { enabled } = await setPortalAiAccess(ownerApi, false);
    expect(enabled).toBe(false);

    // Control: the switch took effect — the read side of the same feature is
    // refused, so a 200 below is about this route and not about a switch that
    // never applied.
    expect((await webSearch.isConfigured("owner")).status).toBe(403);
    expect((await webSearch.getActiveConfig("owner")).status).toBe(403);

    // Unlike `configure`, which crashes before the switch (82812), this route
    // reaches the provider and completes: an outbound call is still made on a
    // portal where AI is turned off.
    const probe = await webSearch.testConnection("owner", {
      provider: "exa",
      key: config.EXA_API_KEY,
    });

    test.fail();
    expect(
      probe.status,
      `test-connection answered ${probe.status} ${probe.text} with AI access disabled`,
    ).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Deliberately not covered.
//
// "Save a provider", "switch the active provider", "a room keeps its own
// provider", "the stored key comes back masked" — none of these are product
// behaviour any anymore: a key is not entered anywhere, and the only provider a
// portal can have is the add-on's, which is portal-wide and carries no key. They
// were placeholders here until that was confirmed; writing them would be pinning
// a feature that does not exist. The add-on block covers what replaced them,
// including the absence of any key in the configuration it returns.
//
// Per-entity isolation of web-search settings and the missing access check on
// `entityId` (BUG 82901) stay uncovered as a consequence: with one portal-wide
// configuration there is nothing scoped to leak. If a room-level override ever
// ships, that is when those tests get written.
// ---------------------------------------------------------------------------
