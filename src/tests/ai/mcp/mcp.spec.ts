import { expect } from "@playwright/test";
import { RoomType, FileShare, FolderType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AgentRole,
  AiAgentChat,
  AiMessageContentPart,
  AiThreadMessage,
  HostTool,
  expectHealthyAssistantReply,
  inviteToAgent,
} from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import {
  agentStorageFolderId,
  downloadFile,
} from "@/src/helpers/device-upload";
import { extractDocxText, listDocxEntries } from "@/src/helpers/docx";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { ApiSDK } from "@/src/services/api-sdk";
import { Role } from "@/src/services/token-store";
import {
  CALCULATOR_MCP_SERVER,
  isMcpServerConfigured,
  mcpToolNames,
} from "@/src/helpers/mcp-servers";

// MCP was reshaped. `/ai/servers*` and `/ai/rooms/{roomId}/servers*` are 404;
// custom servers now live under `/ai/tools/*`, keyed by name and scoped either
// to one agent (`entityId`) or portal-wide. Per-tool enable/disable replaced the
// old "set tools on a room server" call. See src/helpers/ai-tools.ts.
//
// The file runs from the routes outwards:
//
//   1. the system catalogue, custom-server CRUD, disable and allow-always as
//      stored state, and what the two confirmation routes accept;
//   2. "the tool-call pause", "the tool call announces itself" and "always-allow
//      drives the pause" — the same surface driven through a real conversation,
//      where the model decides to call a tool and the stream stops until
//      approve/deny resumes it;
//   3. entity scopes that are not an agent (a room, a folder) and the bulk
//      replace-all route;
//   4. the per-entity model itself: that /ai/agents is not where servers are
//      stored and cannot damage the map, what a deleted agent's scope answers,
//      how a portal-level server is copied into one agent, and what the map's
//      keys and values accept.
//
// Still an open gap: the server-executed DocSpace tools, where the engine runs
// the tool itself (BUG 81131's upload_file case). The pause tests below use
// client-supplied tools, which is what makes them deterministic — nothing has to
// be registered and no MCP server has to answer.

const SERVER_CONFIG = { url: "https://mcp.example.invalid/sse" };

/**
 * A real built-in tool, spelled out rather than read from the API.
 *
 * `list-system-tools` published 20+ `docspace` entries until the tools were
 * hidden on 2026-08-18 and several tests took their names from it. It now
 * publishes nothing, so the name lives here — `docspace` + `generate_docx` is
 * the pair the engine really offers, which the conversation block further down
 * drives end to end.
 */
const BUILT_IN_DOC_TOOL = "generate_docx";

test.describe("MCP - System tools catalogue", () => {
  test("GET /api/2.0/ai/tools/list-system-tools - the catalogue publishes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The route answers 200 with an empty object in every scope. That is
    // deliberate as of 2026-08-18 — the built-in tools were hidden on purpose,
    // and until then the unscoped read returned 20+ `docspace` entries while
    // the scoped one was already `{}` (the old BUG 82991 asymmetry, now gone
    // because both ends are empty).
    //
    // The consequence is worth pinning rather than deleting: there is no other
    // listing route (`list-tools`, `list-all-tools`, `list-custom-tools`,
    // `list-server-tools`, `get-server-tools` are all 404), so no API tells a
    // client what tools an entity actually has — while the model still gets a
    // real toolset, see the conversation block below.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Catalogue Agent",
      profileId,
    });

    const unscoped = await aiTools.listSystemTools("owner");
    expect(unscoped.status).toBe(200);
    expect(unscoped.data).toEqual({});

    const scoped = await aiTools.listSystemTools("owner", agentId);
    expect(scoped.status).toBe(200);
    expect(scoped.data).toEqual({});
  });
});

test.describe("MCP - Custom server lifecycle", () => {
  test("POST/GET/PUT/DELETE /api/2.0/ai/tools/*-custom-server - Owner round-trips a server", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    await test.step("add", async () => {
      const { data, status } = await aiTools.addCustomServer("owner", {
        name: "autotest-server",
        config: SERVER_CONFIG,
        agentId,
      });

      expect(status).toBe(200);
      expect(data?.success).toBe(true);
    });

    await test.step("list and get", async () => {
      const { data: list } = await aiTools.listCustomServers("owner", agentId);
      expect(Object.keys(list)).toContain("autotest-server");
      expect(list["autotest-server"]).toEqual(SERVER_CONFIG);

      const { data: single, status } = await aiTools.getCustomServer(
        "owner",
        "autotest-server",
        agentId,
      );
      expect(status).toBe(200);
      expect(single).toEqual(SERVER_CONFIG);
    });

    await test.step("update", async () => {
      const updated = { url: "https://mcp-updated.example.invalid/sse" };

      const { data, status } = await aiTools.updateCustomServer("owner", {
        name: "autotest-server",
        config: updated,
        agentId,
      });

      const { data: after } = await aiTools.getCustomServer(
        "owner",
        "autotest-server",
        agentId,
      );

      expect(after).toEqual(updated);
      expect(data?.success).toBe(true);
      expect(status).toBe(200);
    });

    await test.step("remove", async () => {
      const { data, status } = await aiTools.removeCustomServer("owner", {
        name: "autotest-server",
        agentId,
      });

      const { data: list } = await aiTools.listCustomServers("owner", agentId);

      expect(Object.keys(list)).not.toContain("autotest-server");
      expect(data?.success).toBe(true);
      expect(status).toBe(200);
    });
  });

  test("GET /api/2.0/ai/tools/list-custom-servers - a server registered for one agent is invisible to another", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstAgent = await aiChat.createAgentId("owner", {
      title: "MCP Agent One",
      profileId,
    });
    const secondAgent = await aiChat.createAgentId("owner", {
      title: "MCP Agent Two",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "scoped-server",
      config: SERVER_CONFIG,
      agentId: firstAgent,
    });

    const { data: forFirst } = await aiTools.listCustomServers(
      "owner",
      firstAgent,
    );
    const { data: forSecond } = await aiTools.listCustomServers(
      "owner",
      secondAgent,
    );

    expect(Object.keys(forFirst)).toContain("scoped-server");
    expect(Object.keys(forSecond)).not.toContain("scoped-server");
  });

  test("GET /api/2.0/ai/tools/list-custom-servers - a portal-level server is not listed for an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Without entityId the registration is portal-wide, and the two scopes are
    // reported separately.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "portal-server",
      config: SERVER_CONFIG,
    });
    await aiTools.addCustomServer("owner", {
      name: "agent-server",
      config: SERVER_CONFIG,
      agentId,
    });

    const { data: portalScope } = await aiTools.listCustomServers("owner");
    const { data: agentScope } = await aiTools.listCustomServers(
      "owner",
      agentId,
    );

    expect(Object.keys(portalScope)).toContain("portal-server");
    expect(Object.keys(portalScope)).not.toContain("agent-server");
    expect(Object.keys(agentScope)).toContain("agent-server");
  });
});

// The built-in `docspace` server is the one serverType that cannot be disabled:
// hiding its tools on 2026-08-18 took the switch with them, and a write naming
// it is accepted and dropped. Everything else — a registered server, an invented
// type — still round-trips, so the two cases are tested apart.
const DISABLE_TARGET_SERVER = "autotest-disable-target";

test.describe("MCP - Disabling individual tools", () => {
  test("PUT /api/2.0/ai/tools/set-disabled - the built-in DocSpace tools cannot be switched off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Worth a test of its own rather than a deletion: the route still answers
    // `{success:true}`, so nothing in the response tells a client that its write
    // was thrown away. The registered server at the end is the positive control
    // — without it, an empty read would equally describe a broken write path.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    const { data: before } = await aiTools.getDisabledTools("owner", agentId);
    expect(before).toEqual({});

    const { data, status } = await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: ["delete_file"],
      agentId,
    });
    expect(status).toBe(200);
    expect(data?.success, "the write reports success").toBe(true);

    const { data: after } = await aiTools.getDisabledTools("owner", agentId);
    const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });

    expect(after, "and stores nothing").toEqual({});
    expect(isDisabled).toBe(false);

    // The same call against a registered server does store — so the empty read
    // above is the `docspace` rule, not a dead route.
    expect(
      (
        await aiTools.addCustomServer("owner", {
          name: DISABLE_TARGET_SERVER,
          config: SERVER_CONFIG,
          agentId,
        })
      ).data?.success,
    ).toBe(true);
    await aiTools.setDisabledTools("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolNames: ["calculate"],
      agentId,
    });
    expect((await aiTools.getDisabledTools("owner", agentId)).data).toEqual({
      [DISABLE_TARGET_SERVER]: ["calculate"],
    });
  });

  test("PUT /api/2.0/ai/tools/set-disabled - Owner disables and re-enables a tool of a registered server", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });
    await aiTools.addCustomServer("owner", {
      name: DISABLE_TARGET_SERVER,
      config: SERVER_CONFIG,
      agentId,
    });

    const { data, status } = await aiTools.setDisabledTools("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolNames: ["calculate"],
      agentId,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const { data: after } = await aiTools.getDisabledTools("owner", agentId);
    const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolName: "calculate",
      agentId,
    });

    expect(after?.[DISABLE_TARGET_SERVER]).toEqual(["calculate"]);
    expect(isDisabled).toBe(true);

    // Re-enable by writing an empty list back.
    await aiTools.setDisabledTools("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolNames: [],
      agentId,
    });

    const { data: cleared } = await aiTools.isToolDisabled("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolName: "calculate",
      agentId,
    });

    expect(cleared).toBe(false);
  });

  test("PUT /api/2.0/ai/tools/set-disabled - the disabled list is scoped per agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstAgent = await aiChat.createAgentId("owner", {
      title: "MCP Agent One",
      profileId,
    });
    const secondAgent = await aiChat.createAgentId("owner", {
      title: "MCP Agent Two",
      profileId,
    });

    await aiTools.setDisabledTools("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolNames: ["calculate"],
      agentId: firstAgent,
    });

    const { data: other } = await aiTools.isToolDisabled("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolName: "calculate",
      agentId: secondAgent,
    });

    // The write landed in the first agent's scope and nowhere else. Both halves
    // are asserted: an unstored write would leave the second agent `false` too.
    expect(
      (
        await aiTools.isToolDisabled("owner", {
          serverType: DISABLE_TARGET_SERVER,
          toolName: "calculate",
          agentId: firstAgent,
        })
      ).data,
      "the agent it was written for",
    ).toBe(true);
    expect(other).toBe(false);
  });
});

test.describe("MCP - Allow-always for tool approval", () => {
  test("PUT /api/2.0/ai/tools/set-allow-always - Owner marks a tool as pre-approved", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    const { data: before } = await aiTools.getAllowAlways("owner", agentId);
    expect(before).toEqual([]);

    const { data, status } = await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
      agentId,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const { data: after } = await aiTools.getAllowAlways("owner", agentId);
    const { data: isAllowed } = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });

    expect(after).toContain("delete_file");
    expect(isAllowed).toBe(true);
  });

  test("PUT /api/2.0/ai/tools/set-allow-always - Owner revokes pre-approval", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
      agentId,
    });

    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: false,
      agentId,
    });

    const { data: isAllowed } = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });
    const { data: list } = await aiTools.getAllowAlways("owner", agentId);

    expect(list).not.toContain("delete_file");
    expect(isAllowed).toBe(false);
  });

  test("PUT /api/2.0/ai/tools/set-allow-always - the pre-approval is scoped per agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstAgent = await aiChat.createAgentId("owner", {
      title: "MCP Agent One",
      profileId,
    });
    const secondAgent = await aiChat.createAgentId("owner", {
      title: "MCP Agent Two",
      profileId,
    });

    const set = await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
      agentId: firstAgent,
    });
    expect(set.data?.success).toBe(true);

    // Disarming the dialog is a decision about one agent. The other agent's
    // dialog has to stay armed, or one pre-approval silently covers tools the
    // user was never asked about.
    const { data: other } = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId: secondAgent,
    });
    const { data: otherList } = await aiTools.getAllowAlways(
      "owner",
      secondAgent,
    );
    expect(other).toBe(false);
    expect(otherList ?? []).toEqual([]);

    // Positive control: an empty second scope means nothing unless the write
    // demonstrably landed in the first one.
    const { data: own } = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId: firstAgent,
    });
    expect(own).toBe(true);
  });

  test("PUT /api/2.0/ai/tools/set-allow-always - a portal-wide pre-approval and an agent's own one are separate", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    // No entityId — the scope a chat that is not attached to any entity writes
    // to. Custom servers keep the two apart (a portal server is not listed for
    // an agent), and a pre-approval granted in one context must not answer for
    // another.
    const set = await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
    });
    expect(set.data?.success).toBe(true);

    const portal = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
    });
    expect(portal.data, "the portal scope kept it").toBe(true);

    const scoped = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });
    const scopedList = await aiTools.getAllowAlways("owner", agentId);
    expect(scoped.data).toBe(false);
    expect(scopedList.data ?? []).toEqual([]);
  });

  test("BUG 83161: GET /api/2.0/ai/tools/is-allow-always - a pre-approval granted for one server type answers for every other type", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    // Both routes take `serverType` next to `toolName`, and the engine addresses
    // a tool as `{serverType}_{toolName}` — so two same-named tools from two
    // servers are two tools. Here the write says `host`, the reads say something
    // else, and the tool name is the destructive DocSpace one: a client tool
    // called `delete_file`, which any editor may offer and a user would approve
    // without much thought, must not pre-approve `docspace_delete_file`.
    const set = await aiTools.setAllowAlways("owner", {
      serverType: "host",
      toolName: "delete_file",
      value: true,
      agentId,
    });
    expect(set.data?.success).toBe(true);

    const sameType = await aiTools.isAllowAlways("owner", {
      serverType: "host",
      toolName: "delete_file",
      agentId,
    });
    expect(sameType.data, "the type it was written under").toBe(true);

    // What the store keeps is a bare tool name — no server type anywhere in it,
    // which is where the two tools stop being distinguishable.
    const list = await aiTools.getAllowAlways("owner", agentId);
    expect(list.data ?? []).toContain("delete_file");

    const otherType = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });
    // Not a real server type at all — if this answers `true` as well, the key is
    // the name alone and `serverType` is decoration on both routes.
    const madeUpType = await aiTools.isAllowAlways("owner", {
      serverType: "not-a-server-type",
      toolName: "delete_file",
      agentId,
    });

    test.fail();
    expect(
      otherType.data,
      "a host tool's pre-approval must not cover the DocSpace tool of that name",
    ).toBe(false);
    expect(madeUpType.data, "an unknown server type has nothing").toBe(false);
  });
});

// Tool-call confirmation — section 16.
//
//   POST /ai/ai/approve-tool-call { threadId, messageId, idx, result, message,
//                                   allowAlways?, entityId?, profileId? }
//   POST /ai/ai/deny-tool-call    same body
//
// WHAT THIS BLOCK COVERS
//
// What these two routes do with a confirmation that refers to nothing. The answer
// is "accept it silently", which is worth a test of its own — a decision endpoint
// that cannot tell a real pending call from a fabricated one has no way to
// enforce the "Allow of an unknown request id" and "Allow of someone else's
// request id" rules of 16.1.
//
// The positive half of 16.1 — Allow runs the tool, Deny returns a controlled
// result, the dialogue continues — and 16.2's always-allow propagation need a
// real pending call, which for a long time looked unreachable: there is no "list
// pending tool calls" route, and making a model emit one seemed to require a
// registered MCP server that answers. It does not. A tool passed in
// `actionArgs.tools` is offered for that one request, so the pause can be
// produced on demand; that is what the two describes after this one do.

const TOOL_CALL_BODY = {
  result: {},
  idx: 0,
  message: {
    role: "assistant",
    content: [{ type: "text", text: "" }],
  },
};

test.describe("MCP - tool-call confirmation validation", () => {
  test("POST /api/2.0/ai/ai/approve-tool-call, deny-tool-call - a confirmation for a message that has no tool call is accepted with an empty body", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Confirmation Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });

    // A real message in a real thread — it just never asked to call anything.
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId: profile.id,
      text: "Autotest question",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    const approve = await aiChat.approveToolCall("owner", {
      ...TOOL_CALL_BODY,
      threadId,
      messageId,
      entityId: String(agentId),
      profileId: profile.id,
    });
    expect(approve.status).toBe(200);
    expect(approve.text.trim(), "approve answers with an empty body").toBe("");

    const deny = await aiChat.denyToolCall("owner", {
      ...TOOL_CALL_BODY,
      threadId,
      messageId,
      entityId: String(agentId),
      profileId: profile.id,
    });
    expect(deny.status).toBe(200);
    expect(deny.text.trim(), "deny answers with an empty body").toBe("");

    // Neither decision invented a tool result or a reply in the thread.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data.map((message) => message.id)).toEqual([messageId]);
    expect(AiAgentChat.assistantMessages(messages.data)).toEqual([]);
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - an unknown message id and an out-of-range index are accepted too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Confirmation Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });

    // Section 16.1's "Allow of a non-existent request id": there is no request id
    // in this API — the (messageId, idx) pair is the identity — and neither half
    // of it is checked.
    const cases: Array<[string, Record<string, unknown>]> = [
      [
        "an unknown message id",
        { messageId: "019fcc1d-478e-749f-85df-7427ca64566b", idx: 0 },
      ],
      [
        "an out-of-range index",
        { messageId: "019fcc1d-478e-749f-85df-7427ca64566b", idx: 999 },
      ],
      [
        "a negative index",
        { messageId: "019fcc1d-478e-749f-85df-7427ca64566b", idx: -1 },
      ],
    ];

    for (const [label, override] of cases) {
      const { status } = await aiChat.approveToolCall("owner", {
        ...TOOL_CALL_BODY,
        threadId,
        entityId: String(agentId),
        profileId: profile.id,
        ...override,
      });
      expect(status, `approve with ${label}`).toBe(200);
    }

    // Nothing was created for any of them.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data).toEqual([]);
  });

  test("POST /api/2.0/ai/ai/approve-tool-call, deny-tool-call - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Confirmation Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });

    const body = {
      ...TOOL_CALL_BODY,
      threadId,
      messageId: "019fcc1d-478e-749f-85df-7427ca64566b",
      entityId: String(agentId),
      profileId: profile.id,
    };

    expect((await aiChat.approveToolCall("anonymous", body)).status).toBe(401);
    expect((await aiChat.denyToolCall("anonymous", body)).status).toBe(401);
  });

  test("POST /api/2.0/ai/ai/approve-tool-call, deny-tool-call - a non-member of the agent cannot decide on another user's tool call", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Confirmation Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId: profile.id,
      text: "Autotest question",
    });
    const messageId = (appended.data?.messageId as { id: string }).id;

    // Created after all owner setup, so the shared context's session cookie
    // cannot make the calls below run as the owner.
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await aiChat.expectActingAs("user", memberData.response!.id!, "User");

    const body = {
      ...TOOL_CALL_BODY,
      threadId,
      messageId,
      entityId: String(agentId),
      profileId: profile.id,
    };

    // The confirmation routes carry the same membership check as every neighbouring
    // route, which is section 16.1's "Allow of someone else's request id": a user
    // outside the agent cannot answer the model's permission prompt in a thread they
    // cannot even read. They used to answer 200 here (BUG 82837).
    expect(
      (await aiChat.getThread("user", threadId)).status,
      "the thread itself is closed to them",
    ).toBe(403);
    expect((await aiChat.getMessageById("user", messageId)).status).toBe(403);

    const approve = await aiChat.approveToolCall("user", body);
    const deny = await aiChat.denyToolCall("user", body);

    await apiSdk.authenticateOwner();
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data.map((message) => message.id)).toEqual([messageId]);

    expect(approve.status, "approve").toBe(403);
    expect(deny.status, "deny").toBe(403);
  });
});

test.describe("MCP - tool-call confirmation with AI Disabled", () => {
  test("POST /api/2.0/ai/ai/approve-tool-call, deny-tool-call - both are refused when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Confirmation Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: profile.id,
      agentId,
    });

    const { writeStatus, readStatus, enabled } = await setPortalAiAccess(
      ownerApi,
      false,
    );
    expect(writeStatus).toBe(200);
    expect(readStatus).toBe(200);
    expect(enabled).toBe(false);

    const body = {
      ...TOOL_CALL_BODY,
      threadId,
      messageId: "019fcc1d-478e-749f-85df-7427ca64566b",
      entityId: String(agentId),
      profileId: profile.id,
    };

    // The rest of the thread surface is gated, so the switch did take effect.
    expect(
      (await aiChat.getThread("owner", threadId)).status,
      "reading the thread is gated",
    ).toBe(403);

    // Section 3.2 lists "an MCP tool cannot be invoked" among the things the switch
    // has to stop. These two routes are the decision half of that flow and both now
    // honour it — they used to be accepted with the switch off (BUG 82838).
    const approve = await aiChat.approveToolCall("owner", body);
    const deny = await aiChat.denyToolCall("owner", body);

    expect(approve.status, "approve").toBe(403);
    expect(deny.status, "deny").toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Client-supplied ("host") tools and the pause they cause — the end-to-end half
// of tool execution, driven through a real conversation rather than through the
// routes alone.
//
// A request may carry its own tools in `actionArgs.tools`; that is how the
// editor offers insert_text/replace_selection and how any other host surface
// exposes what it can do. They are not registered anywhere: they live for one
// request and are gone.
//
//   POST /ai/ai/send-with-stream   { …, actionArgs: { tools: [TMCPItem] } }
//   POST /ai/ai/approve-tool-call  { threadId, messageId, idx, message, result }
//   POST /ai/ai/deny-tool-call     { threadId, messageId, idx, message }
//
// `tool-call-pending` is the engine's ONLY pause point. The stream stops there
// mid-reply and nothing resumes it but approve/deny — there is no stop, cancel
// or abort route on the portal (all of /ai/ai/stop, /stop-stream, /cancel,
// /abort and /threads/stop answer 404).
//
// Three things shape the assertions:
//
//   * The pause is in the stream, not in the HTTP status: the call is 200 and
//     the last frame is `tool-call-pending`. A test that only checks the status
//     cannot tell a pause from a finished reply.
//   * `autoAllow` on that frame is the decision the UI acts on — false means
//     "show the approve dialog". It is computed per request from the persisted
//     allow-always list, so it is the observable side-effect of set-allow-always.
//   * The tool result is written into the assistant message's `tool-call` part.
//     That is where "the tool ran" is proved; the stream frames are transient.
//
// Whether the model calls the tool at all is the model's decision, so every test
// here asserts the pause arrived before it asserts anything about it — a missing
// pause is a failed test, never a silently skipped one.

const WEATHER_TOOL: HostTool = {
  name: "get_weather",
  description: "Get the current weather for a city.",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string", description: "City name" } },
    required: ["city"],
    additionalProperties: false,
  },
  enabled: true,
  requireApproval: true,
};

const ASK_FOR_TOOL = "What is the weather in Paris? Call the get_weather tool.";

/** Fresh agent + thread on a text profile, ready to be sent a message. */
async function setupChat(
  aiChat: AiAgentChat,
  title = "Autotest Host Tools Agent",
) {
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", { title, profileId });
  const threadId = await aiChat.createThreadId("owner", {
    title: "Autotest host tool thread",
    profileId,
    agentId,
  });
  return { profileId, agentId, threadId };
}

test.describe("MCP - the tool-call pause", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - a client-supplied tool pauses the stream at tool-call-pending", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    // The pause is the end of the stream: nothing follows it, and in particular
    // no message-end — the reply is deliberately unfinished.
    const frameTypes = AiAgentChat.frameTypes(sent.text);
    expect(frameTypes[0]).toBe("user-message-stored");
    expect(frameTypes[frameTypes.length - 1]).toBe("tool-call-pending");
    expect(frameTypes).not.toContain("message-end");

    // Everything the UI needs to resume, and the decision it has to make.
    expect(pending!.threadId).toBe(threadId);
    expect(pending!.messageId).toBeTruthy();
    expect(typeof pending!.idx).toBe("number");
    expect(pending!.autoAllow, "a requireApproval tool prompts").toBe(false);

    // The half-finished reply is already persisted, tool call included, and the
    // call carries the arguments the model chose but no result yet.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.status).toBe(200);
    const reply = AiAgentChat.assistantMessages(messages.data)[0];
    expect(reply, "the paused reply is stored").toBeDefined();
    expect(reply.id).toBe(pending!.messageId);

    const toolCalls = AiAgentChat.toolCalls(reply);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolName).toBe("get_weather");
    // `toMatchObject`, not `toEqual`: the engine adds an `aiChatIntent` string
    // of its own to the arguments the model chose, and it is prose — pinning it
    // would make this test depend on the model's wording.
    expect(toolCalls[0].args).toMatchObject({ city: "Paris" });
    expect(toolCalls[0].toolCallId).toBeTruthy();
    expect(
      toolCalls[0].result,
      "no result until it is approved",
    ).toBeUndefined();
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - a string result resumes the paused reply", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(pending, "the stream paused for the tool").toBeDefined();

    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: "21C and sunny",
    });

    expect(approve.status).toBe(200);

    // Resuming continues the SAME message rather than starting a new one, and
    // this time it runs to completion.
    const frameTypes = AiAgentChat.frameTypes(approve.text);
    expect(frameTypes).toContain("message-end");
    expect(frameTypes).not.toContain("message-incomplete");

    const messages = await aiChat.readMessages("owner", threadId);
    const replies = AiAgentChat.assistantMessages(messages.data);
    expect(replies).toHaveLength(1);
    expect(replies[0].id).toBe(pending!.messageId);
    expect(replies[0].status?.error).toBeUndefined();

    // The result reached the model: it is stored on the tool call and the model
    // wrote an answer after it.
    const toolCalls = AiAgentChat.toolCalls(replies[0]);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].result).toBe("21C and sunny");
    expect(AiAgentChat.messageText(replies[0])).toContain("21");
  });

  test("BUG 82862: POST /api/2.0/ai/ai/approve-tool-call - a structured tool result resumes the reply", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(pending, "the stream paused for the tool").toBeDefined();

    // An MCP tool answers with JSON, so an object is the ordinary result shape —
    // `result` is typed `any` in the SDK and nothing says it must be a string.
    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: { temperature: "21C", conditions: "sunny" },
    });
    expect(approve.status).toBe(200);

    const messages = await aiChat.readMessages("owner", threadId);
    const reply = AiAgentChat.assistantMessages(messages.data)[0];

    // The object is serialised on the way in, which is what makes the
    // continuation request bindable — it used to be forwarded as an object and
    // the gateway refused it with
    //   400 invalid request: bind "messages.content" from body: json: cannot
    //   unmarshal object into Go struct field ChatMessage.messages.content
    // leaving the reply abandoned half-written.
    expect(AiAgentChat.toolCalls(reply)[0].result).toBe(
      JSON.stringify({ temperature: "21C", conditions: "sunny" }),
    );

    expect(reply.status?.error).toBeUndefined();
    expect(AiAgentChat.frameTypes(approve.text)).toContain("message-end");
  });

  test("POST /api/2.0/ai/ai/deny-tool-call - the refusal is passed to the model and the reply finishes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(pending, "the stream paused for the tool").toBeDefined();

    const deny = await aiChat.denyPendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
    });

    expect(deny.status).toBe(200);
    expect(AiAgentChat.frameTypes(deny.text)).toContain("message-end");

    // A denial is not a dropped conversation: the refusal is written into the
    // tool call as its result and the model answers around it.
    const messages = await aiChat.readMessages("owner", threadId);
    const replies = AiAgentChat.assistantMessages(messages.data);
    expect(replies).toHaveLength(1);
    expect(replies[0].status?.error).toBeUndefined();
    expect(AiAgentChat.toolCalls(replies[0])[0].result).toBe(
      "User deny tool call",
    );
    expect(AiAgentChat.messageText(replies[0]).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The announcement that comes with a tool call — the API-side half of "before
// calling a tool the model writes a short phrase about what it is about to do,
// and the technical call card is hidden so the two do not duplicate each other".
//
// Only the first half is an API contract, and it is not chat text: the engine
// injects an `aiChatIntent` parameter into every tool's schema, so the phrase
// arrives as one of the arguments the model chose. That is what lets a client
// render a sentence and suppress the call card — the sentence is attached to the
// call rather than written next to it.
//
// The second half is rendering and is deliberately not tested here. Nothing in
// the payload marks the card as hidden: the `tool-call` part is always delivered
// whole (toolName, args, toolCallId, result), and neither `autoAllow` nor
// `serverExecuted` is a display flag. Only a UI test can see the card.
//
// So the assertions are:
//
//   * the phrase exists and is the model's own prose, not the tool name;
//   * it is already on the `tool-call-pending` frame, so a client has something
//     to show at the exact moment it must stop and draw the pause;
//   * it is persisted, so re-opening the thread still shows it;
//   * it survives approval, so the phrase does not vanish once the call gets a
//     result;
//   * a tool that needs no dialog is announced too — the phrase belongs to the
//     call, not to the confirmation prompt.
//
// Whether the model calls the tool at all is the model's decision, so every test
// asserts the pause arrived first — a missing pause fails, it is never skipped.

/** The phrase the engine asks the model to supply with every tool call. */
function toolCallIntent(message: AiThreadMessage): unknown {
  return AiAgentChat.toolCalls(message)[0]?.args?.aiChatIntent;
}

/**
 * The announcement is prose the model wrote for this call, so the assertions are
 * on its shape rather than on its wording: a non-blank string that is not just
 * the tool's own name echoed back, and not the arguments serialised.
 */
function expectAnnouncementPhrase(intent: unknown, label: string) {
  expect(typeof intent, `${label}: aiChatIntent is a string`).toBe("string");
  const phrase = (intent as string).trim();
  expect(phrase.length, `${label}: the phrase is not blank`).toBeGreaterThan(0);
  expect(phrase, `${label}: the phrase is not the bare tool name`).not.toBe(
    WEATHER_TOOL.name,
  );
  expect(
    phrase,
    `${label}: the phrase is not serialised arguments`,
  ).not.toMatch(/^[[{]/);
}

test.describe("MCP - the tool call announces itself", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the pending tool call carries the model's aiChatIntent phrase and keeps it in the thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    // On the frame, not only in the thread: the client draws the pause from what
    // the stream just handed it, so a phrase that needed a follow-up read would
    // arrive too late to be shown instead of the call card.
    expect(pending!.message, "the pause frame carries the reply").toBeDefined();
    const streamed = toolCallIntent(pending!.message!);
    expectAnnouncementPhrase(streamed, "on the tool-call-pending frame");

    // And it is stored, so reopening the thread shows the same sentence rather
    // than a bare call with no explanation.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.status).toBe(200);
    const reply = AiAgentChat.assistantMessages(messages.data)[0];
    expect(reply, "the paused reply is stored").toBeDefined();
    expect(reply.id).toBe(pending!.messageId);

    const stored = toolCallIntent(reply);
    expectAnnouncementPhrase(stored, "in the stored reply");
    expect(stored, "the stored phrase is the streamed one").toBe(streamed);

    // The phrase rides along with the real arguments — it does not replace them.
    expect(AiAgentChat.toolCalls(reply)[0].args).toMatchObject({
      city: "Paris",
    });
  });

  test("POST /api/2.0/ai/ai/send-with-stream - the announcement is not duplicated as chat text next to the call", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    const messages = await aiChat.readMessages("owner", threadId);
    const reply = AiAgentChat.assistantMessages(messages.data)[0];
    expect(reply, "the paused reply is stored").toBeDefined();

    // Measured on 2026-08-12, the paused reply's content is exactly one part:
    //
    //   [{ type: "tool-call", toolName: "get_weather", toolCallId: "9v68pjt3",
    //      args: { city: "Paris",
    //              aiChatIntent: "Checking the current weather in Paris..." },
    //      argsText: "{\"aiChatIntent\":\"…\",\"city\":\"Paris\"}" }]
    //
    // No text block at all — which is the non-duplication half of the contract
    // seen from the API: the sentence is a property of the call, so there is
    // nothing for a hidden call card to be redundant with.
    expect(
      Array.isArray(reply.content),
      "a paused reply has content blocks, not the failed reply's empty string",
    ).toBe(true);
    const parts = reply.content as AiMessageContentPart[];
    const callIndex = parts.findIndex((part) => part.type === "tool-call");
    expect(callIndex, "the reply has a tool-call part").toBeGreaterThan(-1);
    const intent = String(toolCallIntent(reply));
    expectAnnouncementPhrase(intent, "at the pause");

    // Written as "no text part repeats the phrase" rather than "content has
    // length 1" on purpose: whether the model adds prose of its own is its
    // decision, and a reply that both explains itself in text AND carries the
    // same sentence in the call is the duplication the requirement rules out.
    // This holds either way, and only fails on an actual double.
    const texts = parts
      .filter((part) => part.type !== "tool-call")
      .map((part) => part.text?.trim() ?? "")
      .filter((text) => text.length > 0);
    expect(
      texts.filter((text) => text.includes(intent)),
      "the announcement is carried once, by the tool call",
    ).toEqual([]);

    // Content order is render order, and the pause is the end of the reply: a
    // client walking the array top to bottom must not find text trailing the call
    // it is about to draw a pause for.
    const after = parts
      .slice(callIndex + 1)
      .filter((part) => part.text?.trim())
      .map((part) => part.type);
    expect(after, "no text trails the paused call").toEqual([]);
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - the announcement survives the approval that fills in the result", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(pending, "the stream paused for the tool").toBeDefined();
    const announced = toolCallIntent(pending!.message!);
    expectAnnouncementPhrase(announced, "at the pause");

    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: "21C and sunny",
    });
    expect(approve.status).toBe(200);

    // Resuming rewrites the tool call to add the result. The phrase is part of
    // the same `args` object, so this is where it would be lost — a finished call
    // whose announcement is gone leaves the transcript showing a result with no
    // statement of what was being done.
    const messages = await aiChat.readMessages("owner", threadId);
    const reply = AiAgentChat.assistantMessages(messages.data)[0];
    const call = AiAgentChat.toolCalls(reply)[0];
    expect(call.result, "the approval landed").toBe("21C and sunny");
    expect(call.args?.aiChatIntent, "the phrase is still there").toBe(
      announced,
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a tool that needs no approval dialog is announced too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    // `requireApproval: false` is the case with no dialog to put a sentence in,
    // which is exactly why it is worth pinning: the phrase belongs to the call
    // itself, so an auto-allowed tool must still say what it is about to do.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [{ ...WEATHER_TOOL, requireApproval: false }],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();
    expect(pending!.autoAllow, "no dialog for this one").toBe(true);

    expectAnnouncementPhrase(
      toolCallIntent(pending!.message!),
      "on an auto-allowed call",
    );
  });
});

test.describe("MCP - always-allow drives the pause", () => {
  test("PUT /api/2.0/ai/tools/set-allow-always - a listed tool comes back autoAllow and delisting it prompts again", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(aiChat);

    // Asking for the pause flag three times, around the two writes: this is the
    // only place the persisted list is observable in the engine's behaviour
    // rather than in its own read route.
    const askAndGetAutoAllow = async (title: string) => {
      const threadId = await aiChat.createThreadId("owner", {
        title,
        profileId,
        agentId,
      });
      const sent = await aiChat.sendMessage("owner", {
        threadId,
        profileId,
        agentId,
        message: ASK_FOR_TOOL,
        tools: [WEATHER_TOOL],
      });
      const pending = AiAgentChat.pendingToolCall(sent.text);
      expect(
        pending,
        `${title}: the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
      ).toBeDefined();
      return pending!.autoAllow;
    };

    expect(await askAndGetAutoAllow("before"), "before allow-always").toBe(
      false,
    );

    const set = await aiTools.setAllowAlways("owner", {
      serverType: "host",
      toolName: WEATHER_TOOL.name,
      value: true,
      agentId,
    });
    expect(set.status).toBe(200);
    expect(set.data?.success).toBe(true);
    const isSet = await aiTools.isAllowAlways("owner", {
      serverType: "host",
      toolName: WEATHER_TOOL.name,
      agentId,
    });
    expect(isSet.status).toBe(200);
    expect(isSet.data).toBe(true);

    expect(await askAndGetAutoAllow("after"), "after allow-always").toBe(true);

    const unset = await aiTools.setAllowAlways("owner", {
      serverType: "host",
      toolName: WEATHER_TOOL.name,
      value: false,
      agentId,
    });
    expect(unset.status).toBe(200);
    expect(unset.data?.success).toBe(true);

    expect(await askAndGetAutoAllow("revoked"), "after revoking it").toBe(
      false,
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a tool that opts out of approval is auto-allowed without any stored setting", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [{ ...WEATHER_TOOL, requireApproval: false }],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    // The tool itself opted in, so no dialog — and nothing was persisted to make
    // that happen, which is what tells this apart from the allow-always case.
    expect(pending!.autoAllow).toBe(true);

    const stored = await aiTools.getAllowAlways("owner", agentId);
    expect(stored.status).toBe(200);
    expect(stored.data ?? []).toEqual([]);
  });

  // The dialog's own transport. `set-allow-always` is the settings-screen route;
  // the checkbox in the Allow/Deny dialog rides along with the decision itself as
  // `allowAlways` on approve-tool-call, so it is a second write path to the same
  // state and the one the user actually reaches.
  test("POST /api/2.0/ai/ai/approve-tool-call - Allow with allowAlways pre-approves the tool for the next call", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();
    expect(pending!.autoAllow, "the first call prompts").toBe(false);

    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: "21C and sunny",
      allowAlways: true,
    });
    expect(approve.status).toBe(200);
    expect(
      AiAgentChat.frameTypes(approve.text),
      "the decision still resumes the reply",
    ).toContain("message-end");

    // Persisted where the settings route keeps it, or the box was decoration.
    const stored = await aiTools.getAllowAlways("owner", agentId);
    expect(stored.status).toBe(200);
    expect(stored.data ?? []).toContain(WEATHER_TOOL.name);
    const isSet = await aiTools.isAllowAlways("owner", {
      serverType: "host",
      toolName: WEATHER_TOOL.name,
      agentId,
    });
    expect(isSet.data).toBe(true);

    // The requirement itself: next time the model reaches for the tool there is
    // no dialog left to show. A fresh thread, so nothing but the stored decision
    // can carry it over.
    const nextThread = await aiChat.createThreadId("owner", {
      title: "Autotest after always-allow",
      profileId,
      agentId,
    });
    const again = await aiChat.sendMessage("owner", {
      threadId: nextThread,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const nextPending = AiAgentChat.pendingToolCall(again.text);
    expect(
      nextPending,
      `the model did not ask for the tool again; frames were ${AiAgentChat.frameTypes(again.text).join(", ")}`,
    ).toBeDefined();
    expect(
      nextPending!.autoAllow,
      "the tool was pre-approved from the dialog",
    ).toBe(true);
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - a one-time Allow pre-approves nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(aiChat);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    // Allow with the box left unticked — the case that must NOT become
    // permanent. This is the control for the test above: without it, an engine
    // that pre-approves on every Allow would pass that one.
    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: "21C and sunny",
    });
    expect(approve.status).toBe(200);

    const stored = await aiTools.getAllowAlways("owner", agentId);
    expect(stored.status).toBe(200);
    expect(stored.data ?? []).toEqual([]);

    const nextThread = await aiChat.createThreadId("owner", {
      title: "Autotest after a one-time allow",
      profileId,
      agentId,
    });
    const again = await aiChat.sendMessage("owner", {
      threadId: nextThread,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const nextPending = AiAgentChat.pendingToolCall(again.text);
    expect(
      nextPending,
      `the model did not ask for the tool again; frames were ${AiAgentChat.frameTypes(again.text).join(", ")}`,
    ).toBeDefined();
    expect(
      nextPending!.autoAllow,
      "one Allow is one Allow — the dialog comes back",
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Whose decision the pre-approval is. Every non-guest member of an agent may
// write it (see mcp.permission.spec.ts), so if the state were shared, a plain
// User could disarm the owner's confirmation dialog for a tool as destructive as
// delete_file — and the owner has no route that would show them it happened.
//
// Both directions are measured, and each user's own read is the positive control
// for the other's absent one: a member who is refused the read would produce the
// same "does not see it" answer as a member for whom it was never set.

const OWNERS_PRE_APPROVED = "delete_file";
const MEMBERS_PRE_APPROVED = "create_room";

test.describe("MCP - whose always-allow decision it is", () => {
  test("PUT /api/2.0/ai/tools/set-allow-always - one user's pre-approval does not disarm another user's dialog", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });

    // Every owner-side AiTools call goes first: it runs on the shared request
    // context, whose session cookie beats the bearer header once the member has
    // authenticated.
    const ownersWrite = await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: OWNERS_PRE_APPROVED,
      value: true,
      agentId,
    });
    expect(ownersWrite.data?.success).toBe(true);

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    await inviteToAgent(ownerApi.rooms, agentId, memberId);
    await aiChat.expectActingAs("user", memberId, "User");

    // The member's own write proves the read surface works for them, so the
    // owner's tool being absent below is a real absence.
    const membersWrite = await aiTools.setAllowAlways("user", {
      serverType: "docspace",
      toolName: MEMBERS_PRE_APPROVED,
      value: true,
      agentId,
    });
    expect(membersWrite.status).toBe(200);
    expect(membersWrite.data?.success).toBe(true);

    const membersView = await aiTools.getAllowAlways("user", agentId);
    expect(membersView.status).toBe(200);
    expect(membersView.data ?? []).toContain(MEMBERS_PRE_APPROVED);
    const membersReadOfOwners = await aiTools.isAllowAlways("user", {
      serverType: "docspace",
      toolName: OWNERS_PRE_APPROVED,
      agentId,
    });

    await apiSdk.authenticateOwner();
    await aiChat.expectNotActingAs("user", memberId, "the member");

    const ownersView = await aiTools.getAllowAlways("owner", agentId);
    expect(ownersView.status).toBe(200);
    expect(ownersView.data ?? []).toContain(OWNERS_PRE_APPROVED);
    const ownersReadOfMembers = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: MEMBERS_PRE_APPROVED,
      agentId,
    });

    expect(
      membersReadOfOwners.data,
      "the owner's pre-approval must not answer for the member",
    ).toBe(false);
    expect(membersView.data ?? []).not.toContain(OWNERS_PRE_APPROVED);
    expect(
      ownersReadOfMembers.data,
      "a User must not be able to pre-approve a tool for the owner",
    ).toBe(false);
    expect(ownersView.data ?? []).not.toContain(MEMBERS_PRE_APPROVED);
  });
});

// ---------------------------------------------------------------------------
// `entityId` on the tools routes, for entities that are not agents, plus the
// bulk write the CRUD block above does not touch:
//
//   PUT /ai/tools/replace-all-custom-servers  { map, entityId? }
//
// The scope token is the same one the chat routes take, so an ordinary room is a
// legal value — the client sends whatever the user is looking at. What the
// portal does with it, measured on 2026-08-05:
//
//   * A ROOM id is accepted for writes and for get-custom-server, but
//     list-custom-servers never reports what was written there. A server
//     registered for a room therefore exists and is unreachable through the only
//     route that enumerates them.
//   * Any room the caller does not administer is refused with 403 — including a
//     member invited into it, who may read the room's servers but not write any.
//   * A FOLDER id is refused with 403 as well, for its own owner. Chat works in
//     a folder, so it is an open question whether the tools scope is meant to;
//     that case is a `test.fixme` below rather than a passing negative test.
//   * replace-all takes `map`, not `servers`, and a body without `map` is not
//     rejected: it clears the scope.

const OTHER_CONFIG = { url: "https://mcp-other.example.invalid/sse" };

test.describe("MCP - custom servers scoped to a room", () => {
  test("BUG 82863: POST /api/2.0/ai/tools/add-custom-server - a server registered for a room is listed for it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MCP Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const added = await aiTools.addCustomServer("owner", {
      name: "autotest-room-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });
    expect(added.status).toBe(200);
    expect(added.data?.success).toBe(true);

    // The write really happened — the server is there when asked for by name.
    const single = await aiTools.getCustomServer(
      "owner",
      "autotest-room-server",
      roomId,
    );
    expect(single.status).toBe(200);
    expect(single.data).toEqual(SERVER_CONFIG);

    // It used to be reachable by name and absent from every listing.
    const listed = await aiTools.listCustomServers("owner", roomId);
    expect(listed.status).toBe(200);
    expect(Object.keys(listed.data)).toContain("autotest-room-server");
  });

  test("BUG 82975: POST /api/2.0/ai/tools/add-custom-server - a server registered for a room is also served portal-wide", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The other half of what a room id does to the scope. An AGENT id keeps its
    // servers to itself — "the portal-wide scope is untouched" in the CRUD block
    // above is a passing test. A ROOM id does not: the entry comes back for the
    // room AND for every caller who lists the portal-wide scope, so naming a room
    // is indistinguishable from registering the server for the whole portal.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MCP Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const added = await aiTools.addCustomServer("owner", {
      name: "autotest-room-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });
    expect(added.status).toBe(200);
    expect(added.data?.success).toBe(true);

    const scoped = await aiTools.listCustomServers("owner", roomId);
    expect(
      Object.keys(scoped.data),
      "the write reached the room scope",
    ).toContain("autotest-room-server");

    const portalWide = await aiTools.listCustomServers("owner");
    expect(portalWide.status).toBe(200);

    test.fail();
    expect(
      Object.keys(portalWide.data),
      "a room's server must not appear in the portal-wide scope",
    ).not.toContain("autotest-room-server");
  });

  test("PUT|DELETE /api/2.0/ai/tools/*-custom-server - a room-scoped server can be updated and removed by name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // list-custom-servers is useless for a room scope (see above), so the whole
    // round-trip is verified through get-custom-server.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MCP Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    await aiTools.addCustomServer("owner", {
      name: "autotest-room-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });

    const updated = await aiTools.updateCustomServer("owner", {
      name: "autotest-room-server",
      config: OTHER_CONFIG,
      agentId: roomId,
    });
    expect(updated.status).toBe(200);
    expect(updated.data?.success).toBe(true);
    const afterUpdate = await aiTools.getCustomServer(
      "owner",
      "autotest-room-server",
      roomId,
    );
    expect(afterUpdate.data).toEqual(OTHER_CONFIG);

    const removed = await aiTools.removeCustomServer("owner", {
      name: "autotest-room-server",
      agentId: roomId,
    });
    expect(removed.status).toBe(200);
    expect(removed.data?.success).toBe(true);

    const afterRemove = await aiTools.getCustomServer(
      "owner",
      "autotest-room-server",
      roomId,
    );
    expect(afterRemove.status).toBe(200);
    expect(afterRemove.data ?? {}).toEqual({});
  });

  // A folder is a legitimate tools scope: chat itself IS available in a folder —
  // threads/create takes a folder id and the conversation works
  // (chat/chat.spec.ts) — and the tools scope is meant to follow the entity the
  // user is looking at. So a user who chats in a folder has no way to give that
  // conversation their own MCP servers.
  //
  // Measured 2026-08-05: `entityId` = a folder the Owner owns is refused with
  // 403 on add-custom-server AND on get-custom-server, while the same call for a
  // room succeeds and an id that resolves to nothing at all is silently served
  // the portal-wide scope (BUG 82975 above).
  test("BUG 83007: POST /api/2.0/ai/tools/add-custom-server - a folder cannot carry its own tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const myDocsId = myFolder.response!.current!.id!;
    const { data: folder, status: created } =
      await ownerApi.folders.createFolder({
        folderId: myDocsId,
        createFolder: { title: "Autotest MCP Folder" },
      });
    // Asserted before test.fail() is armed: a folder that was never created
    // must surface as a real failure, not as the expected 403.
    expect(created, "creating the folder to scope the server to").toBe(200);
    const folderId = folder.response!.id!;

    test.fail();

    // The Owner owns the folder, so this is about what kind of entity may
    // carry tools, not about access.
    const added = await aiTools.addCustomServer("owner", {
      name: "autotest-folder-server",
      config: SERVER_CONFIG,
      agentId: folderId,
    });
    expect(added.status).toBe(200);
    expect(added.data?.success).toBe(true);

    const read = await aiTools.getCustomServer(
      "owner",
      "autotest-folder-server",
      folderId,
    );
    expect(read.status).toBe(200);
    expect(read.data).toEqual(SERVER_CONFIG);

    // Scoped to the folder rather than to the whole portal.
    const portalWide = await aiTools.listCustomServers("owner");
    expect(Object.keys(portalWide.data)).not.toContain(
      "autotest-folder-server",
    );
  });

  test("POST|GET /api/2.0/ai/tools/*-custom-server - a room member reads the room's tools but cannot register any", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MCP Shared Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    // Both plain members first: adding one after another has been authenticated
    // answers 403.
    const member = await apiSdk.addMember("owner", "RoomAdmin");
    const memberId = member.data.response!.id!;
    const outsider = await apiSdk.addMember("owner", "User");
    const outsiderId = outsider.data.response!.id!;

    const invited = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });
    expect(invited.status, "inviting the member into the room").toBe(200);

    await aiTools.addCustomServer("owner", {
      name: "autotest-owner-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });

    await apiSdk.authenticateMember(member.userData, "RoomAdmin");
    await aiChat.expectActingAs("roomAdmin", memberId, "the invited member");

    // Registering tools for the room is for whoever administers it.
    const added = await aiTools.addCustomServer("roomAdmin", {
      name: "autotest-member-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });
    expect(added.status).toBe(403);
    const removed = await aiTools.removeCustomServer("roomAdmin", {
      name: "autotest-owner-server",
      agentId: roomId,
    });
    expect(removed.status).toBe(403);

    // Reading is not: a member sees which tools the room offers.
    const read = await aiTools.getCustomServer(
      "roomAdmin",
      "autotest-owner-server",
      roomId,
    );
    expect(read.status).toBe(200);
    expect(read.data).toEqual(SERVER_CONFIG);

    await apiSdk.authenticateMember(outsider.userData, "User");
    await aiChat.expectActingAs("user", outsiderId, "the non-member");

    // Outside the room even the read is refused, which is what tells the 200
    // above apart from "this route ignores access altogether".
    const outsiderRead = await aiTools.getCustomServer(
      "user",
      "autotest-owner-server",
      roomId,
    );
    expect(outsiderRead.status).toBe(403);
    const outsiderAdd = await aiTools.addCustomServer("user", {
      name: "autotest-outsider-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });
    expect(outsiderAdd.status).toBe(403);

    // The room's registration survived every refused write.
    await apiSdk.authenticateOwner();
    const survivor = await aiTools.getCustomServer(
      "owner",
      "autotest-owner-server",
      roomId,
    );
    expect(survivor.status).toBe(200);
    expect(survivor.data).toEqual(SERVER_CONFIG);
  });
});

test.describe("MCP - replace-all-custom-servers", () => {
  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - the scoped map replaces exactly one scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-old",
      config: SERVER_CONFIG,
      agentId,
    });
    await aiTools.addCustomServer("owner", {
      name: "autotest-portal",
      config: SERVER_CONFIG,
    });

    const replaced = await aiTools.replaceAllCustomServers("owner", {
      map: { "autotest-new": OTHER_CONFIG },
      agentId,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.data?.success).toBe(true);

    // Replace means replace: the previous entry of that scope is gone.
    const scoped = await aiTools.listCustomServers("owner", agentId);
    expect(Object.keys(scoped.data)).toEqual(["autotest-new"]);
    expect(scoped.data["autotest-new"]).toEqual(OTHER_CONFIG);

    // And only that scope was touched.
    const portalWide = await aiTools.listCustomServers("owner");
    expect(Object.keys(portalWide.data)).toEqual(["autotest-portal"]);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - an empty map clears the scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-old",
      config: SERVER_CONFIG,
      agentId,
    });

    const cleared = await aiTools.replaceAllCustomServers("owner", {
      map: {},
      agentId,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.data?.success).toBe(true);

    const scoped = await aiTools.listCustomServers("owner", agentId);
    expect(scoped.data).toEqual({});
  });

  test("BUG 82864: PUT /api/2.0/ai/tools/replace-all-custom-servers - a body without `map` is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `map` is required by the contract, and the field name is easy to get wrong
    // — the SDK's own model for the neighbouring routes calls this kind of
    // payload `servers`. Sending anything but `map` used to empty the scope
    // silently, with `{success:true}`.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-keep-me",
      config: SERVER_CONFIG,
      agentId,
    });
    const before = await aiTools.listCustomServers("owner", agentId);
    expect(Object.keys(before.data)).toEqual(["autotest-keep-me"]);

    const { status } = await aiTools.replaceAllCustomServers("owner", {
      agentId,
    });

    const after = await aiTools.listCustomServers("owner", agentId);

    expect(status).toBe(400);
    expect(
      Object.keys(after.data),
      "the registered server survives a rejected write",
    ).toEqual(["autotest-keep-me"]);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - one invalid config rejects the whole map", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The bulk route is all-or-nothing, and it reports per entry: `errors` names
    // each offending server, the valid entries in the same map are not written,
    // and the scope is left exactly as it was. Note the error shape differs from
    // the single-server routes — `errors[]`, not `error`.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-keep-me",
      config: SERVER_CONFIG,
      agentId,
    });

    const { data, status } = await aiTools.replaceAllCustomServers("owner", {
      map: {
        "autotest-valid": OTHER_CONFIG,
        "autotest-no-transport": { foo: 1 },
        "autotest-not-an-object": "https://mcp.example.invalid/sse",
      },
      agentId,
    });

    const after = await aiTools.listCustomServers("owner", agentId);
    expect(
      after.data,
      "neither the valid entry nor the wipe went through",
    ).toEqual({ "autotest-keep-me": SERVER_CONFIG });

    expect(data?.success).toBe(false);
    expect(
      (data as { errors?: Array<{ name?: string }> })?.errors?.map(
        (entry) => entry.name,
      ),
    ).toEqual(["autotest-no-transport", "autotest-not-an-object"]);
    expect(status).toBe(200);
  });

  test("BUG 82864: PUT /api/2.0/ai/tools/replace-all-custom-servers - a null map is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The same case as the missing-`map` one above, through the spelling a
    // client is most likely to produce by accident: a state variable that has not
    // been populated yet serialises to `null`. It used to empty the scope with
    // `{success:true}`.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-keep-me",
      config: SERVER_CONFIG,
      agentId,
    });

    const { status } = await aiTools.replaceAllCustomServers("owner", {
      map: null,
      agentId,
    });
    const after = await aiTools.listCustomServers("owner", agentId);

    expect(status).toBe(400);
    expect(
      Object.keys(after.data),
      "the registered server survives a rejected write",
    ).toEqual(["autotest-keep-me"]);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - the SDK-shaped array payload is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The SDK-shaped `[{name, config}]` payload used to be bound as a map whose
    // keys were "0", "1", … so the per-entry error named an index. It is now
    // rejected as the wrong type. Either way nothing is written and the previous
    // state survives, which is the part that matters to a caller.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-keep-me",
      config: SERVER_CONFIG,
      agentId,
    });

    const { status } = await aiTools.replaceAllCustomServers("owner", {
      map: [{ name: "autotest-array", config: SERVER_CONFIG }],
      agentId,
    });

    const after = await aiTools.listCustomServers("owner", agentId);
    expect(after.data).toEqual({ "autotest-keep-me": SERVER_CONFIG });
    expect(status).toBe(400);
  });

  test("BUG 82984: PUT /api/2.0/ai/tools/replace-all-custom-servers - two names differing only in case are both stored and one becomes unreachable", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // add-custom-server refuses a case-variant of an existing name ("Server
    // already registered"), but the bulk route does not apply that rule: both keys
    // land in the map, and because the by-name lookup is case-insensitive both
    // `Dup` and `dup` resolve to the same entry. One of the two configurations is
    // then stored but unaddressable — it cannot be read, edited or removed by
    // name, only wiped with another replace-all.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    const { data } = await aiTools.replaceAllCustomServers("owner", {
      map: { "Autotest-Dup": SERVER_CONFIG, "autotest-dup": OTHER_CONFIG },
      agentId,
    });

    const listed = await aiTools.listCustomServers("owner", agentId);
    const upper = await aiTools.getCustomServer(
      "owner",
      "Autotest-Dup",
      agentId,
    );
    const lower = await aiTools.getCustomServer(
      "owner",
      "autotest-dup",
      agentId,
    );

    test.fail();
    // The single-server route's rule, applied to the bulk one.
    expect(data?.success).toBe(false);
    expect(Object.keys(listed.data)).toHaveLength(1);
    expect(
      upper.data,
      "whatever is stored under a name is what that name reads back",
    ).not.toEqual(lower.data);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - a large map is stored whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // No cap on how many servers one scope may hold: 120 in a single call all land
    // and all read back. Worth pinning as the counterweight to the atomicity tests
    // — a silent per-call limit would otherwise look like a partial write.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    const map: Record<string, unknown> = {};
    for (let index = 0; index < 120; index++) {
      map[`autotest-bulk-${index}`] = {
        url: `https://mcp-${index}.example.invalid/sse`,
      };
    }

    const { data, status } = await aiTools.replaceAllCustomServers("owner", {
      map,
      agentId,
    });

    const listed = await aiTools.listCustomServers("owner", agentId);
    expect(Object.keys(listed.data)).toHaveLength(120);
    expect(listed.data["autotest-bulk-119"]).toEqual({
      url: "https://mcp-119.example.invalid/sse",
    });
    expect(
      (await aiTools.getCustomServer("owner", "autotest-bulk-0", agentId)).data,
    ).toEqual({ url: "https://mcp-0.example.invalid/sse" });
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - one over-long name is a hard 400 and the scope survives", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The name length cap is enforced by model binding, before the per-entry
    // validation that produces `errors[]` — so a single 129-character key answers
    // a bare 400 and the map is not even looked at.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-keep-me",
      config: SERVER_CONFIG,
      agentId,
    });

    const { status, error } = await aiTools.replaceAllCustomServers("owner", {
      map: {
        "autotest-valid": OTHER_CONFIG,
        ["n".repeat(129)]: SERVER_CONFIG,
      },
      agentId,
    });

    const after = await aiTools.listCustomServers("owner", agentId);
    expect(
      after.data,
      "neither the valid entry nor the wipe went through",
    ).toEqual({ "autotest-keep-me": SERVER_CONFIG });

    expect(error).toBe("Bad Request");
    expect(status).toBe(400);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - replacing one agent's map leaves another agent's alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The portal scope is already covered above; this is the entity-to-entity half,
    // and the one that matters for a composer that keeps several agents open.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstAgent = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent One",
      profileId,
    });
    const secondAgent = await aiChat.createAgentId("owner", {
      title: "Autotest Replace Agent Two",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-second",
      config: OTHER_CONFIG,
      agentId: secondAgent,
    });

    const { data } = await aiTools.replaceAllCustomServers("owner", {
      map: { "autotest-first": SERVER_CONFIG },
      agentId: firstAgent,
    });

    expect(await serverMap(aiTools, firstAgent)).toEqual({
      "autotest-first": SERVER_CONFIG,
    });
    expect(await serverMap(aiTools, secondAgent)).toEqual({
      "autotest-second": OTHER_CONFIG,
    });
    expect(data?.success).toBe(true);
  });
});

test.describe("MCP - concurrent writes to one scope", () => {
  test("POST /api/2.0/ai/tools/add-custom-server - five concurrent registrations all land", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The scope is one stored map, so every add is a read-modify-write of the same
    // document — the shape that loses writes when it is not serialised. Five at
    // once, and all five survive.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Concurrency Agent",
      profileId,
    });

    const indexes = [1, 2, 3, 4, 5];
    const results = await Promise.all(
      indexes.map((index) =>
        aiTools.addCustomServer("owner", {
          name: `autotest-parallel-${index}`,
          config: { url: `https://mcp-${index}.example.invalid/sse` },
          agentId,
        }),
      ),
    );

    const listed = await serverMap(aiTools, agentId);
    expect(Object.keys(listed).sort()).toEqual(
      indexes.map((index) => `autotest-parallel-${index}`),
    );
    for (const index of indexes) {
      expect(listed[`autotest-parallel-${index}`], `entry ${index}`).toEqual({
        url: `https://mcp-${index}.example.invalid/sse`,
      });
    }
    for (const result of results) {
      expect(result.data?.success).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/agents/{id} - an agent edit concurrent with a server registration loses neither", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Both writes touch the agent room: /ai/agents rewrites its settings, the tools
    // route rewrites its server map. Fired together, the rename, the new prompt and
    // the new server all have to be there afterwards.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Concurrency Agent",
      profileId,
    });

    const [edited, registered] = await Promise.all([
      aiChat.updateAgent("owner", agentId, {
        title: "Autotest Concurrently Renamed",
        prompt: "You are a concurrently written assistant",
      }),
      aiTools.addCustomServer("owner", {
        name: "autotest-raced-server",
        config: SERVER_CONFIG,
        agentId,
      }),
    ]);

    const info = await aiChat.getAgentInfo("owner", agentId);
    expect(info.data?.response?.title).toBe("Autotest Concurrently Renamed");
    expect(info.data?.response?.chatSettings?.prompt).toBe(
      "You are a concurrently written assistant",
    );
    expect(await serverMap(aiTools, agentId)).toEqual({
      "autotest-raced-server": SERVER_CONFIG,
    });
    expect(edited.status).toBe(200);
    expect(registered.data?.success).toBe(true);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - a concurrent add never leaves a partial map", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Which of the two wins is a race and not a contract, so this asserts what must
    // hold either way: the pre-existing entry the replace removed is gone, the
    // surviving keys are only ones a writer actually sent, and every value is the
    // whole config its writer sent — never a merged or truncated one.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Concurrency Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-pre-existing",
      config: { url: "https://mcp-pre.example.invalid/sse" },
      agentId,
    });

    const [replaced, added] = await Promise.all([
      aiTools.replaceAllCustomServers("owner", {
        map: { "autotest-from-replace": OTHER_CONFIG },
        agentId,
      }),
      aiTools.addCustomServer("owner", {
        name: "autotest-from-add",
        config: SERVER_CONFIG,
        agentId,
      }),
    ]);

    const listed = await serverMap(aiTools, agentId);
    const expectedValues: Record<string, unknown> = {
      "autotest-from-replace": OTHER_CONFIG,
      "autotest-from-add": SERVER_CONFIG,
    };

    expect(
      Object.keys(listed),
      "the replaced entry is gone whichever call landed last",
    ).not.toContain("autotest-pre-existing");
    expect(Object.keys(listed).length).toBeGreaterThan(0);
    for (const [name, config] of Object.entries(listed)) {
      expect(
        Object.keys(expectedValues),
        `an unexpected key survived: ${name}`,
      ).toContain(name);
      expect(config, `${name} is stored whole`).toEqual(expectedValues[name]);
    }
    expect(replaced.data?.success).toBe(true);
    expect(added.data?.success).toBe(true);
  });
});

test.describe("MCP - server types", () => {
  test("PUT /api/2.0/ai/tools/set-disabled - the server type is an open vocabulary", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // There is no enum behind `serverType`: `docspace` (the built-in server) and
    // `host` (tools the client supplies per request, see the pause block above) are
    // the two that mean something to the engine, but the store takes any string
    // and reports it back. A test that assumed the editor's tool groups —
    // `editor`, `document`, `form`, `presentation` — were validated names would
    // pass for the wrong reason; they are simply stored.
    //
    // `docspace` is deliberately not in the list: it is the one name the store
    // drops instead of keeping, which the disabling block at the top of this
    // file pins. Every other string, known or invented, behaves alike.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Server Types Agent",
      profileId,
    });

    const serverTypes = [
      "editor",
      "document",
      "form",
      "presentation",
      "autotest-not-a-server-type",
    ];

    for (const serverType of serverTypes) {
      const set = await aiTools.setDisabledTools("owner", {
        serverType,
        toolNames: ["autotest_tool"],
        agentId,
      });
      expect(set.status, `set-disabled for ${serverType}`).toBe(200);
      expect(set.data?.success, `set-disabled for ${serverType}`).toBe(true);
    }

    const disabled = await aiTools.getDisabledTools("owner", agentId);
    expect(disabled.status).toBe(200);
    expect(Object.keys(disabled.data ?? {}).sort()).toEqual(
      [...serverTypes].sort(),
    );

    for (const serverType of serverTypes) {
      const isDisabled = await aiTools.isToolDisabled("owner", {
        serverType,
        toolName: "autotest_tool",
        agentId,
      });
      expect(isDisabled.status, serverType).toBe(200);
      expect(isDisabled.data, serverType).toBe(true);
    }

    // Invented server types are stored as disabled-tool keys and nothing more:
    // the catalogue is unaffected by any of it (it publishes nothing at all —
    // see the system tools block at the top of this file).
    const system = await aiTools.listSystemTools("owner");
    expect(system.status).toBe(200);
    expect(system.data).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// The agent body vs the per-entity map.
//
// Creating or editing an agent goes through /ai/agents, and the composer's MCP
// panel lives on the same screen — which makes "the servers are part of the
// agent" the obvious reading. It is not: the agent body has no servers field at
// all. `attachDefaultTools` (the one MCP-shaped field the SDK's
// AiAgentsCreateRequest declares) writes nothing observable, an `mcpServers` map
// in the body is dropped like any unknown field, and the only place a server
// ever appears is /ai/tools/* under that agent's `entityId`.
//
// The other half of the same contract is that /ai/agents cannot damage the map:
// every update the composer sends — rename, retag, rebind the model, rewrite the
// AI Instructions — leaves it alone. That is what the third test pins, one
// update shape at a time, because a wipe-on-update would look exactly like a
// successful save.

/** The agent-scoped custom servers, keyed by name. */
async function serverMap(aiTools: AiTools, agentId: number | string) {
  const { status, data } = await aiTools.listCustomServers("owner", agentId);
  expect(status, "reading the agent's server map").toBe(200);
  return data;
}

test.describe("MCP - the agent body and the per-entity server map", () => {
  test("POST /api/2.0/ai/agents - attachDefaultTools writes nothing into the agent's tool scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The SDK documents the flag as "whether to attach the default DocSpace MCP
    // tool server". Whichever way it is sent, the agent ends up with the same
    // state: no custom server, nothing disabled, every built-in tool live. The
    // built-in server is portal-level and needs no attaching, so there is no
    // per-entity trace of the flag to read back — pin that rather than assume
    // the flag toggles something invisible.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    for (const attachDefaultTools of [true, false, undefined]) {
      const label = `attachDefaultTools=${attachDefaultTools}`;

      const created = await aiChat.createAgent("owner", {
        title: `Autotest Attach Tools ${attachDefaultTools}`,
        profileId,
        prompt: "You are a test assistant",
        attachDefaultTools,
      });
      expect(created.status, label).toBe(200);
      const agentId = created.data?.response?.id;
      expect(agentId, label).toBeDefined();

      const servers = await serverMap(aiTools, agentId!);
      const disabled = await aiTools.getDisabledTools("owner", agentId!);
      const isDisabled = await aiTools.isToolDisabled("owner", {
        serverType: "docspace",
        toolName: BUILT_IN_DOC_TOOL,
        agentId: agentId!,
      });

      expect(servers, label).toEqual({});
      expect(disabled.data, label).toEqual({});
      expect(isDisabled.data, label).toBe(false);

      // Positive control: the empty map above is a real empty scope, not a read
      // that quietly failed.
      const added = await aiTools.addCustomServer("owner", {
        name: "autotest-control",
        config: SERVER_CONFIG,
        agentId: agentId!,
      });
      expect(added.data?.success, label).toBe(true);
      expect(Object.keys(await serverMap(aiTools, agentId!)), label).toEqual([
        "autotest-control",
      ]);
    }
  });

  test("POST /api/2.0/ai/agents - an mcpServers map in the agent body is ignored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Neither spelling of "store the servers with the agent" is honoured: the
    // agent is created, the prompt lands, and the map is simply dropped. A
    // client that posted its servers this way would show a configured agent with
    // an empty tool scope.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const created = await aiChat.createAgent("owner", {
      title: "Autotest Body Map Agent",
      profileId,
      prompt: "You are a test assistant",
      extra: {
        mcpServers: { "body-server": SERVER_CONFIG },
        chatSettings: { mcpServers: { "nested-server": SERVER_CONFIG } },
      },
    });

    expect(created.status).toBe(200);
    const agentId = created.data?.response?.id;
    expect(agentId).toBeDefined();
    // The flat `prompt` still won: chatSettings carries it and nothing else.
    expect(created.data?.response?.chatSettings).toEqual({
      prompt: "You are a test assistant",
    });

    expect(await serverMap(aiTools, agentId!)).toEqual({});
    expect(
      (await aiTools.getCustomServer("owner", "body-server", agentId!)).data,
    ).toBeNull();

    // Positive control: the same server does register through the tools route.
    const added = await aiTools.addCustomServer("owner", {
      name: "body-server",
      config: SERVER_CONFIG,
      agentId: agentId!,
    });
    expect(added.data?.success).toBe(true);
    expect(await serverMap(aiTools, agentId!)).toEqual({
      "body-server": SERVER_CONFIG,
    });
  });

  test("PUT /api/2.0/ai/agents/{id} - the agent's server map survives every edit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Edit Agent",
      profileId,
    });

    const registered = await aiTools.addCustomServer("owner", {
      name: "autotest-survivor",
      config: SERVER_CONFIG,
      agentId,
    });
    expect(
      registered.data?.success,
      "the server whose survival every edit below is measured against",
    ).toBe(true);

    // Each edit is checked for having actually changed the agent, so a wipe
    // cannot hide behind an update that did nothing.
    const edits: Array<{
      label: string;
      body: Parameters<AiAgentChat["updateAgent"]>[2];
      verify?: () => Promise<void>;
    }> = [
      {
        label: "rename",
        body: { title: "Autotest Renamed Agent" },
        verify: async () => {
          const { data } = await aiChat.getAgentInfo("owner", agentId);
          expect(data?.response?.title).toBe("Autotest Renamed Agent");
        },
      },
      {
        label: "retag",
        body: { tags: ["autotest-tag"] },
      },
      {
        label: "rebind the model",
        body: { profileId },
      },
      {
        label: "rewrite the AI Instructions",
        body: { prompt: "You are a renamed test assistant" },
        verify: async () => {
          expect(await aiChat.getAgentInstructions("owner", agentId)).toBe(
            "You are a renamed test assistant",
          );
        },
      },
      {
        label: "an empty chatSettings",
        body: { extra: { chatSettings: {} } },
      },
      {
        label: "an mcpServers map in the body",
        body: { extra: { mcpServers: { intruder: OTHER_CONFIG } } },
      },
    ];

    for (const { label, body, verify } of edits) {
      const updated = await aiChat.updateAgent("owner", agentId, body);
      expect(updated.status, label).toBe(200);
      await verify?.();

      expect(await serverMap(aiTools, agentId), label).toEqual({
        "autotest-survivor": SERVER_CONFIG,
      });
    }
  });
});

test.describe("MCP - a deleted agent's server map", () => {
  test("DELETE /api/2.0/ai/agents/{id} - the agent's servers go with it and the scoped read falls back to the portal", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Worth knowing for what it does to a client holding a stale id: the read is
    // not an error and not empty — it silently answers with the portal-wide map,
    // so a composer still showing the deleted agent would list servers that were
    // never registered on it.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Doomed Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-agent-server",
      config: SERVER_CONFIG,
      agentId,
    });
    await aiTools.addCustomServer("owner", {
      name: "autotest-portal-server",
      config: OTHER_CONFIG,
    });
    expect(
      Object.keys(await serverMap(aiTools, agentId)),
      "the agent's own server is registered before the delete",
    ).toEqual(["autotest-agent-server"]);

    const deleted = await aiChat.deleteAgent("owner", agentId);
    expect(deleted.status).toBe(200);
    expect(await aiChat.waitForAgentDeleted("owner", agentId)).toBe(404);

    const scoped = await aiTools.listCustomServers("owner", agentId);
    const portal = await aiTools.listCustomServers("owner");
    const byName = await aiTools.getCustomServer(
      "owner",
      "autotest-agent-server",
      agentId,
    );

    // The agent's own entry is unreachable, and what comes back instead is
    // exactly the portal scope.
    expect(scoped.data).toEqual(portal.data);
    expect(Object.keys(scoped.data)).toEqual(["autotest-portal-server"]);
    expect(byName.data).toBeNull();
    expect(byName.status).toBe(200);
    expect(scoped.status).toBe(200);
  });

  test("BUG 82975: POST|DELETE /api/2.0/ai/tools/*-custom-server - a write against a deleted agent lands portal-wide", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Reads fall back to the portal scope (above), and writes now follow them
    // there. `add` and `replace-all` used to refuse an entity that no longer
    // exists, which is what kept the fallback from turning into "the client
    // wrote portal-wide by accident"; they no longer do. `remove` has always
    // been the hole in that: it validates nothing and reports success.
    //
    // Same defect as the unknown-agent case in mcp.permission.spec.ts and the
    // room-scoped write above: an entityId the tools routes cannot resolve to an
    // agent is treated as "no scope" instead of being refused.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Doomed Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-portal-server",
      config: SERVER_CONFIG,
    });

    await aiChat.deleteAgent("owner", agentId);
    expect(await aiChat.waitForAgentDeleted("owner", agentId)).toBe(404);

    const added = await aiTools.addCustomServer("owner", {
      name: "autotest-after-death",
      config: OTHER_CONFIG,
      agentId,
    });
    const replaced = await aiTools.replaceAllCustomServers("owner", {
      map: { "autotest-after-death": OTHER_CONFIG },
      agentId,
    });
    const removed = await aiTools.removeCustomServer("owner", {
      name: "autotest-portal-server",
      agentId,
    });

    const portal = await aiTools.listCustomServers("owner");

    expect(removed.data?.success, "remove does not check the entity").toBe(
      true,
    );
    expect(removed.status).toBe(200);

    test.fail();
    // Nothing the three calls did may show up portal-wide.
    expect(portal.data).toEqual({ "autotest-portal-server": SERVER_CONFIG });
    expect(added.status).toBe(404);
    expect(replaced.status).toBe(404);
  });
});

test.describe("MCP - a portal server copied into an agent scope", () => {
  test("POST /api/2.0/ai/tools/add-custom-server - a name with no config copies the portal server into the agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // This is how a portal-wide server is switched on for one agent: post the
    // name alone. Without a portal server of that name the same call is the 400
    // in mcp.permission.spec.ts ("No config provided and no portal-level server
    // named …") — the error message is the contract this test measures from the
    // other side.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Copy Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-shared",
      config: SERVER_CONFIG,
    });
    expect(
      Object.keys(await serverMap(aiTools, agentId)),
      "the agent scope starts empty",
    ).toEqual([]);

    const { data, status } = await aiTools.addCustomServer("owner", {
      name: "autotest-shared",
      agentId,
    });

    expect(await serverMap(aiTools, agentId)).toEqual({
      "autotest-shared": SERVER_CONFIG,
    });
    expect(
      (await aiTools.getCustomServer("owner", "autotest-shared", agentId)).data,
    ).toEqual(SERVER_CONFIG);
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - the copy and the portal original are independent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Copy Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-shared",
      config: SERVER_CONFIG,
    });
    await aiTools.addCustomServer("owner", {
      name: "autotest-shared",
      agentId,
    });

    await test.step("editing the agent's copy leaves the portal server alone", async () => {
      const agentConfig = { url: "https://mcp-agent.example.invalid/sse" };
      const { data, status } = await aiTools.updateCustomServer("owner", {
        name: "autotest-shared",
        config: agentConfig,
        agentId,
      });

      expect(
        (await aiTools.getCustomServer("owner", "autotest-shared", agentId))
          .data,
      ).toEqual(agentConfig);
      expect(
        (await aiTools.getCustomServer("owner", "autotest-shared")).data,
      ).toEqual(SERVER_CONFIG);
      expect(data?.success).toBe(true);
      expect(status).toBe(200);
    });

    await test.step("editing the portal server does not reach the copy", async () => {
      const portalConfig = { url: "https://mcp-portal.example.invalid/sse" };
      const { data, status } = await aiTools.updateCustomServer("owner", {
        name: "autotest-shared",
        config: portalConfig,
      });

      expect(
        (await aiTools.getCustomServer("owner", "autotest-shared")).data,
      ).toEqual(portalConfig);
      expect(
        (await aiTools.getCustomServer("owner", "autotest-shared", agentId))
          .data,
        "the agent keeps the snapshot it was given",
      ).toEqual({ url: "https://mcp-agent.example.invalid/sse" });
      expect(data?.success).toBe(true);
      expect(status).toBe(200);
    });
  });

  test("DELETE /api/2.0/ai/tools/remove-custom-server - removing the agent's copy leaves the portal server registered", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Copy Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-shared",
      config: SERVER_CONFIG,
    });
    await aiTools.addCustomServer("owner", {
      name: "autotest-shared",
      agentId,
    });

    const { data, status } = await aiTools.removeCustomServer("owner", {
      name: "autotest-shared",
      agentId,
    });

    expect(await serverMap(aiTools, agentId)).toEqual({});
    expect(
      (await aiTools.getCustomServer("owner", "autotest-shared", agentId)).data,
    ).toBeNull();
    expect(
      (await aiTools.getCustomServer("owner", "autotest-shared")).data,
      "the portal registration is untouched",
    ).toEqual(SERVER_CONFIG);
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });
});

test.describe("MCP - the stored config", () => {
  test("POST /api/2.0/ai/tools/add-custom-server - an stdio and an HTTP config round-trip verbatim", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The store is transport-agnostic by design: MCP allows `command`/`args`/`env`
    // for stdio and `url`/`headers` for HTTP, and whatever else a server needs
    // rides along untouched. Only the presence of `url` or `command` is checked
    // (see the config block of mcp.permission.spec.ts).
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Config Agent",
      profileId,
    });

    const configs: Array<{ name: string; config: Record<string, unknown> }> = [
      {
        name: "autotest-stdio",
        config: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          env: { NODE_ENV: "production" },
        },
      },
      {
        name: "autotest-http",
        config: {
          type: "http",
          url: "https://mcp.example.invalid/mcp",
          headers: { Authorization: "Bearer autotest-token" },
        },
      },
      {
        name: "autotest-extras",
        config: {
          url: "https://mcp.example.invalid/sse",
          timeout: 30,
          disabled: false,
          nested: { retries: [1, 2, { backoff: "exponential" }] },
        },
      },
    ];

    for (const { name, config } of configs) {
      const added = await aiTools.addCustomServer("owner", {
        name,
        config,
        agentId,
      });
      expect(added.data?.success, name).toBe(true);
      expect(added.status, name).toBe(200);
    }

    const listed = await serverMap(aiTools, agentId);
    for (const { name, config } of configs) {
      expect(listed[name], name).toEqual(config);
      expect(
        (await aiTools.getCustomServer("owner", name, agentId)).data,
        name,
      ).toEqual(config);
    }
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - the config is replaced, not merged", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Matters for the credential case: re-saving a server without its `headers`
    // drops them rather than keeping the stored ones.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Config Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "autotest-merge",
      config: {
        url: "https://mcp.example.invalid/mcp",
        headers: { Authorization: "Bearer autotest-token" },
      },
      agentId,
    });

    const { data, status } = await aiTools.updateCustomServer("owner", {
      name: "autotest-merge",
      config: { url: "https://mcp-updated.example.invalid/mcp" },
      agentId,
    });

    expect(
      (await aiTools.getCustomServer("owner", "autotest-merge", agentId)).data,
    ).toEqual({ url: "https://mcp-updated.example.invalid/mcp" });
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });
});

test.describe("MCP - server names as map keys", () => {
  test("POST /api/2.0/ai/tools/add-custom-server - names are case-insensitive and keep the casing they were registered with", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Same rule as room tags: the duplicate check ignores case, the map key keeps
    // the original spelling, and a lookup in any casing finds it. A client that
    // re-saved "My-Server" as "my-server" therefore neither creates a second
    // entry nor renames the first — it gets a soft duplicate error.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Names Agent",
      profileId,
    });

    await aiTools.addCustomServer("owner", {
      name: "Autotest-Mixed-Case",
      config: SERVER_CONFIG,
      agentId,
    });

    const duplicate = await aiTools.addCustomServer("owner", {
      name: "autotest-mixed-case",
      config: OTHER_CONFIG,
      agentId,
    });

    expect(
      Object.keys(await serverMap(aiTools, agentId)),
      "one entry, in the casing it was created with",
    ).toEqual(["Autotest-Mixed-Case"]);
    expect(
      (await aiTools.getCustomServer("owner", "autotest-mixed-case", agentId))
        .data,
      "a lower-case lookup finds the mixed-case entry",
    ).toEqual(SERVER_CONFIG);
    expect(duplicate.data?.success).toBe(false);
    expect(duplicate.data?.error?.field).toBe("name");
    expect(duplicate.data?.error?.message).toBe(
      "Server already registered: autotest-mixed-case",
    );
    expect(duplicate.status).toBe(200);
  });

  test("POST /api/2.0/ai/tools/add-custom-server - surrounding whitespace is part of the name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Not trimmed: "  autotest  " and "autotest" are two different servers. A
    // name that is only whitespace is a hard 400 instead — see
    // mcp.permission.spec.ts.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Names Agent",
      profileId,
    });

    const padded = await aiTools.addCustomServer("owner", {
      name: "  autotest-padded  ",
      config: SERVER_CONFIG,
      agentId,
    });
    const trimmed = await aiTools.addCustomServer("owner", {
      name: "autotest-padded",
      config: OTHER_CONFIG,
      agentId,
    });

    expect(Object.keys(await serverMap(aiTools, agentId)).sort()).toEqual([
      "  autotest-padded  ",
      "autotest-padded",
    ]);
    expect(
      (await aiTools.getCustomServer("owner", "  autotest-padded  ", agentId))
        .data,
    ).toEqual(SERVER_CONFIG);
    expect(padded.data?.success).toBe(true);
    expect(trimmed.data?.success).toBe(true);
  });

  // `.`, `..`, either slash and any control character are refused up front with a
  // 400 naming the rule, on all three routes that write a name: add, update and the
  // bulk replace-all. A refused replace-all is atomic — the scope it would have
  // overwritten is left alone.
  //
  // `remove-custom-server` is the exception, as it is for every other bad input:
  // it validates nothing and reports `{success:true}` for a name that could never
  // have been stored. `.` is the one name it cannot even reach — the router answers
  // 405 Method Not Allowed before the handler sees it.
  //
  // This closed BUG 82985. These names used to register and list, then be
  // unaddressable: get answered null, update reported "Server not registered", and
  // the entry survived every delete, so one mistyped name left a permanent entry in
  // an agent's tool configuration.
  for (const { label, name, removeStatus } of [
    { label: "a slash", name: "autotest/nested-name", removeStatus: 200 },
    { label: "a backslash", name: "autotest\\backslash", removeStatus: 200 },
    {
      label: "a control character",
      name: "autotest\u0001ctl",
      removeStatus: 200,
    },
    { label: "a single dot", name: ".", removeStatus: 405 },
    { label: "two dots", name: "..", removeStatus: 200 },
  ]) {
    test(`POST /api/2.0/ai/tools/add-custom-server - a name containing ${label} is refused`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Names Agent",
        profileId,
      });

      const message =
        'name must not be ".", "..", or contain a path separator or control character';

      // A legal neighbour, so "the scope holds exactly this one server" afterwards
      // proves the list can see keys at all — and that the refused replace-all did
      // not wipe what was already there.
      const legal = await aiTools.addCustomServer("owner", {
        name: "autotest-legal",
        config: SERVER_CONFIG,
        agentId,
      });
      expect(legal.data?.success, "the legal name is stored").toBe(true);

      const added = await aiTools.addCustomServer("owner", {
        name,
        config: SERVER_CONFIG,
        agentId,
      });
      const updated = await aiTools.updateCustomServer("owner", {
        name,
        config: OTHER_CONFIG,
        agentId,
      });
      const replaced = await aiTools.replaceAllCustomServers("owner", {
        map: { [name]: SERVER_CONFIG },
        agentId,
      });
      const removed = await aiTools.removeCustomServer("owner", {
        name,
        agentId,
      });

      expect(
        Object.keys(await serverMap(aiTools, agentId)),
        "the refused name was never stored and the legal one survived",
      ).toEqual(["autotest-legal"]);

      expect(added.error, "add").toBe(message);
      expect(added.status, "add").toBe(400);
      expect(updated.error, "update").toBe(message);
      expect(updated.status, "update").toBe(400);
      expect(replaced.error, "replace-all").toBe(message);
      expect(replaced.status, "replace-all").toBe(400);
      expect(removed.status, "remove validates nothing").toBe(removeStatus);
    });
  }

  test("POST /api/2.0/ai/tools/add-custom-server - URL and shell punctuation in a name round-trips", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The counterweight to the refusals above: "a name that looks like it could be
    // interpolated somewhere" is not rejected in general. An already-encoded slash,
    // a fragment, a query separator and a bare percent all survive the full
    // add/get/update/remove cycle unchanged, and so does a dot that is only *part*
    // of a name — leading, trailing or in the middle. Only a bare `.`/`..`, a real
    // separator and control characters are refused.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Names Agent",
      profileId,
    });

    const names = [
      "%2F",
      "autotest#fragment",
      "autotest?query=1",
      "autotest%percent",
      "autotest server",
      "autotest.dotted",
      ".autotest",
      "autotest.",
    ];

    for (const name of names) {
      const added = await aiTools.addCustomServer("owner", {
        name,
        config: SERVER_CONFIG,
        agentId,
      });
      expect(added.data?.success, name).toBe(true);
      expect(
        (await aiTools.getCustomServer("owner", name, agentId)).data,
        name,
      ).toEqual(SERVER_CONFIG);

      const updated = await aiTools.updateCustomServer("owner", {
        name,
        config: OTHER_CONFIG,
        agentId,
      });
      expect(updated.data?.success, name).toBe(true);
      expect(
        (await aiTools.getCustomServer("owner", name, agentId)).data,
        name,
      ).toEqual(OTHER_CONFIG);

      const removed = await aiTools.removeCustomServer("owner", {
        name,
        agentId,
      });
      expect(removed.data?.success, name).toBe(true);
      expect(Object.keys(await serverMap(aiTools, agentId)), name).toEqual([]);
    }
  });

  test("POST /api/2.0/ai/tools/add-custom-server - an underscore in the name is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Undocumented and easy to trip over — `my_server` is the most natural name a
    // user would type. The engine addresses a tool as `server_tool`, so `_` is
    // reserved and rejected anywhere in the name. The bulk route applies the same
    // rule, reporting it per entry.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Names Agent",
      profileId,
    });

    const message =
      "Server name cannot contain '_' — reserved for tool-token format";

    for (const name of ["my_server", "_leading", "trailing_", "a_b_c"]) {
      const added = await aiTools.addCustomServer("owner", {
        name,
        config: SERVER_CONFIG,
        agentId,
      });
      expect(added.data?.success, name).toBe(false);
      expect(added.data?.error?.field, name).toBe("name");
      expect(added.data?.error?.message, name).toBe(message);
      expect(added.status, name).toBe(200);
    }

    const replaced = await aiTools.replaceAllCustomServers("owner", {
      map: { my_server: SERVER_CONFIG },
      agentId,
    });

    expect(await serverMap(aiTools, agentId), "nothing was stored").toEqual({});
    expect(replaced.data?.success).toBe(false);
    expect(
      (
        replaced.data as {
          errors?: Array<{ name?: string; error?: Record<string, string> }>;
        }
      )?.errors,
    ).toEqual([{ name: "my_server", error: { field: "name", message } }]);
  });

  test("BUG 82986: POST /api/2.0/ai/tools/add-custom-server - a server named after an Object.prototype member is rejected as if its config were broken", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `constructor` and `toString` are legal names by every rule the API states —
    // no underscore, under 128 characters, not blank — and the config sent with
    // them is the same valid `{url}` every other test uses. They come back
    // `{success:false, error:{field:"url", message:"Server config must be an
    // object"}}`: the store looks the name up on a plain JS object, walks into
    // Object.prototype, finds a function and calls it a bad config.
    //
    // So the "name → config" map is a bare object rather than a Map or a
    // null-prototype object. `__proto__` is only saved from the same fate by the
    // unrelated underscore rule, and `prototype` — which is *not* on
    // Object.prototype — works fine and is the control here. Nothing is written,
    // so this is a denial of one name rather than pollution, but it is the same
    // defect class.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Names Agent",
      profileId,
    });

    // Control: an ordinary-but-suspicious name that is not an Object member.
    const control = await aiTools.addCustomServer("owner", {
      name: "prototype",
      config: SERVER_CONFIG,
      agentId,
    });
    expect(control.data?.success, "`prototype` is stored normally").toBe(true);
    expect(
      (await aiTools.getCustomServer("owner", "prototype", agentId)).data,
    ).toEqual(SERVER_CONFIG);

    const constructorServer = await aiTools.addCustomServer("owner", {
      name: "constructor",
      config: SERVER_CONFIG,
      agentId,
    });
    const toStringServer = await aiTools.addCustomServer("owner", {
      name: "toString",
      config: SERVER_CONFIG,
      agentId,
    });

    test.fail();
    expect(
      constructorServer.data?.error?.message,
      "the config is a valid object — the name is what the API dislikes",
    ).not.toBe("Server config must be an object");
    expect(toStringServer.data?.error?.message).not.toBe(
      "Server config must be an object",
    );
  });

  test("POST /api/2.0/ai/tools/add-custom-server - the two Unicode spellings of one name are two servers", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Names are compared as code-point sequences, not normalised: "café" typed as
    // NFC (U+00E9) and as NFD (e + U+0301) look identical in the UI, pass the
    // case-insensitive duplicate check as different names, and end up as two
    // entries a user cannot tell apart.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Names Agent",
      profileId,
    });

    const nfc = "autotest-café";
    const nfd = "autotest-café";
    expect(nfc.normalize("NFD")).toBe(nfd);

    const first = await aiTools.addCustomServer("owner", {
      name: nfc,
      config: SERVER_CONFIG,
      agentId,
    });
    const second = await aiTools.addCustomServer("owner", {
      name: nfd,
      config: OTHER_CONFIG,
      agentId,
    });

    const listed = await serverMap(aiTools, agentId);
    expect(Object.keys(listed).sort()).toEqual([nfc, nfd].sort());
    expect(listed[nfc]).toEqual(SERVER_CONFIG);
    expect(listed[nfd]).toEqual(OTHER_CONFIG);
    expect(first.data?.success).toBe(true);
    expect(second.data?.success).toBe(true);
  });

  test("POST /api/2.0/ai/tools/add-custom-server - an emoji in the server name round-trips", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // A non-BMP name is stored and addressable like any other. It used to be the one
    // input on this route that answered an unhandled 500 — on the add and on every
    // later read of that name (BUG 82987) — while every other rejected name was
    // either a soft `{success:false}` or a 400.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Names Agent",
      profileId,
    });

    const name = "autotest-🙂";
    const added = await aiTools.addCustomServer("owner", {
      name,
      config: SERVER_CONFIG,
      agentId,
    });
    expect(added.data?.success, "an emoji name is accepted").toBe(true);
    expect(added.status).toBe(200);

    expect(
      Object.keys(await serverMap(aiTools, agentId)),
      "and listed under the key as sent",
    ).toEqual([name]);
    expect(
      (await aiTools.getCustomServer("owner", name, agentId)).data,
      "and readable by name",
    ).toEqual(SERVER_CONFIG);

    const updated = await aiTools.updateCustomServer("owner", {
      name,
      config: OTHER_CONFIG,
      agentId,
    });
    expect(updated.data?.success, "and editable by name").toBe(true);
    expect(
      (await aiTools.getCustomServer("owner", name, agentId)).data,
    ).toEqual(OTHER_CONFIG);

    const removed = await aiTools.removeCustomServer("owner", {
      name,
      agentId,
    });
    expect(removed.data?.success, "and removable by name").toBe(true);
    expect(Object.keys(await serverMap(aiTools, agentId))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Registered servers and inference — the half of the per-entity model that is
// supposed to make registering a server mean something.
//
// It does not, and the tests below are ordered to prove that rather than to
// suggest it. Two things had to be separated first:
//
//   * A prompt that asks the model to "call one of your tools" can hang the
//     stream for reasons that have nothing to do with MCP: the model picks the
//     built-in `generate_image`, which never finishes (see the image-generation
//     block of chat/chat.spec.ts). Measured with no custom server registered at
//     all, so a hang here must not be read as "the MCP server broke the chat".
//   * The tools the model reports are the built-in ones, named `docspace_<tool>`
//     — which is also where the underscore ban on server names comes from.
//
// With that out of the way, a real, reachable, credentialed MCP server registered
// on the agent changes nothing: the model says it has no such tool. So the
// unreachable-server test is only worth what its title claims, and the bug is the
// test after it.

/**
 * "Call the tool, or say this exact phrase" — the only way to read the model's
 * tool inventory without depending on how it phrases a refusal.
 */
const NO_TOOL_SENTINEL = "NO SUCH TOOL";

const ASK_CALCULATOR = `Call the tool named calculator_calculate (or any tool whose name starts with 'calculator') with the operation multiply, a=8231 and b=7, then report the result. If you truly have no such tool, reply exactly: ${NO_TOOL_SENTINEL}`;

/** A tool the calculator server itself advertises, cross-checked against its own tools/list. */
const CALCULATOR_TOOL = "calculate";

test.describe("MCP - a registered server and the conversation", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - registering an unreachable server leaves an ordinary reply unaffected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Deliberately narrow: this says a dead endpoint sitting in an agent's map
    // costs the next ordinary message nothing — no stall, no stream error, no
    // failed reply. It does NOT say the server was consulted and found dead; the
    // test below shows a *working* server is not consulted either.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Dead Server Agent",
    );

    const registered = await aiTools.addCustomServer("owner", {
      name: "autotest-dead-server",
      config: { type: "http", url: "https://mcp.example.invalid/mcp" },
      agentId,
    });
    expect(
      registered.data?.success,
      "the unreachable server is registered on the agent",
    ).toBe(true);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word: pong",
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expect(AiAgentChat.frameTypes(sent.text)).toContain("message-end");

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);
  });

  test("BUG 82989: POST /api/2.0/ai/ai/send-with-stream - a registered MCP server's tools never reach the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The point of the per-entity model, and it is not wired up.
    //
    // Three things make this a product finding rather than a flaky external
    // dependency: the test speaks MCP to the server itself first and reads its
    // real tool list, the registration is read back with its credentials intact,
    // and the model is asked in a way that forces an unambiguous answer — call the
    // tool, or reply with a fixed sentinel. It replies with the sentinel.
    //
    // The sentinel is what the assertion reads, not the answer: asked for
    // 8231 × 7 the model returns 57617 by itself, correctly, so a test that
    // checked the number would pass without a tool ever being called.
    //
    // Everything else was tried too, all with the same result, so nobody needs to
    // repeat it: registering portal-wide instead (the test below), the same server
    // in both scopes at once, `type: "http" | "sse" | "streamable-http"`,
    // `transport: "http"`, and a third-party endpoint (GitHub Copilot MCP). The
    // tool machinery itself is fine — the same agent calls its built-in
    // `docspace_*` tools, which is what the pause block above exercises.
    test.skip(
      !isMcpServerConfigured(CALCULATOR_MCP_SERVER),
      "needs MCP_CALCULATOR_URL and MCP_CALCULATOR_TOKEN",
    );
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    // Control 1: the server is up and advertises the tool, right now.
    const advertised = await mcpToolNames(
      apiSdk.request,
      CALCULATOR_MCP_SERVER,
    );
    test.skip(
      advertised.length === 0,
      "the calculator MCP server did not answer initialize/tools-list — nothing to conclude about the portal",
    );
    expect(
      advertised,
      "the server advertises the tool this test asks for",
    ).toContain(CALCULATOR_TOOL);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Calculator MCP Agent",
    );

    // Control 2: it really is registered on this agent, credentials included.
    const registered = await aiTools.addCustomServer("owner", {
      name: "calculator",
      config: CALCULATOR_MCP_SERVER,
      agentId,
    });
    expect(registered.data?.success, "the server is registered").toBe(true);
    expect(
      (await aiTools.getCustomServer("owner", "calculator", agentId)).data,
    ).toEqual(CALCULATOR_MCP_SERVER);

    const asked = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_CALCULATOR,
    });
    expect(asked.status).toBe(200);
    expect(asked.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const calledTools = AiAgentChat.assistantMessages(messages)
      .flatMap((message) => AiAgentChat.toolCalls(message))
      .map((call) => call.toolName ?? "");
    const reply = AiAgentChat.assistantText(messages);

    test.fail();
    expect(
      calledTools.length > 0 || !reply.includes(NO_TOOL_SENTINEL),
      `the agent was offered no tool from its registered server: it called [${calledTools.join(", ") || "nothing"}] and answered "${reply.slice(0, 120)}"`,
    ).toBe(true);
  });

  test("BUG 82990: POST /api/2.0/ai/ai/send-with-stream - a portal-wide MCP server does not reach the model either", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Rules out the obvious explanation for the tests above — that a per-agent
    // registration is the wrong place to look. Registered with no `entityId` at
    // all, so it applies to every entity on the portal, and the model still has
    // no such tool.
    test.skip(
      !isMcpServerConfigured(CALCULATOR_MCP_SERVER),
      "needs MCP_CALCULATOR_URL and MCP_CALCULATOR_TOKEN",
    );
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const advertised = await mcpToolNames(
      apiSdk.request,
      CALCULATOR_MCP_SERVER,
    );
    test.skip(
      advertised.length === 0,
      "the calculator MCP server did not answer initialize/tools-list",
    );

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const registered = await aiTools.addCustomServer("owner", {
      name: "calculator",
      config: CALCULATOR_MCP_SERVER,
    });
    expect(registered.data?.success, "registered portal-wide").toBe(true);
    expect(
      Object.keys((await aiTools.listCustomServers("owner")).data),
      "and visible in the portal scope",
    ).toEqual(["calculator"]);

    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Portal MCP Agent",
    );

    const asked = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_CALCULATOR,
    });
    expect(asked.status).toBe(200);

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const calledTools = AiAgentChat.assistantMessages(messages)
      .flatMap((message) => AiAgentChat.toolCalls(message))
      .map((call) => call.toolName ?? "");
    const reply = AiAgentChat.assistantText(messages);

    test.fail();
    expect(
      calledTools.length > 0 || !reply.includes(NO_TOOL_SENTINEL),
      `portal-wide registration offered no tool either; called [${calledTools.join(", ") || "nothing"}]`,
    ).toBe(true);
  });

  // BUG 82991 ("the catalogue is empty when scoped to an entity") lived here.
  // It was the asymmetry between a full unscoped read and an empty scoped one;
  // since the tools were hidden on 2026-08-18 both ends answer `{}`, so there is
  // no asymmetry left to pin and the empty catalogue itself is covered by the
  // system tools block at the top of this file.
});

// ---------------------------------------------------------------------------
// The other half of set-disabled: "Disabled tools are hidden from the AI model".
//
// The block near the top of this file pins set-disabled as stored state — the
// map, the per-agent scoping, is-tool-disabled. None of that says the model is
// told anything, and the model is the whole point of the setting.
//
// The subject is a built-in tool the agent demonstrably has. That is not the
// same list as `list-system-tools`, which publishes `create_room`,
// `delete_file`, `get_all_people` and 20 more that the model does not have —
// asked to create a room it answers "I do not have a create_room tool". Asked
// what it can call, it answers:
//
//   docspace_generate_docx, docspace_generate_presentation,
//   docspace_generate_form, generate_image
//
// so `docspace_generate_docx` is the one tool that is both really offered and
// really named after a `serverType`/`toolName` pair — the `server_tool` token
// the engine builds from them. Whether the catalogue route should publish these
// is BUG 82991's business, not this block's.
//
// Image generation is deliberately not the subject: asking for one hangs
// (BUG 82861), so a test built on it could not tell "the tool was withheld"
// apart from "the tool ran and never came back".

/** What the model sees, and what set-disabled's two fields spell out together. */
const BUILT_IN_DOC_TOOL_TOKEN = `docspace_${BUILT_IN_DOC_TOOL}`;

// The last clause is a safety rail rather than part of the question. Since the
// REST family started being offered in the agent scope too (BUG 83172, the
// cross-tenant block at the bottom of this file), a bare "create a document"
// request can make the model pick `upload_file` — which executes against a portal
// that is not this one, so a run of these tests would create a file in a
// stranger's My Documents. Steering it to the generator does not weaken what the
// tests below assert: they are about whether `docspace_generate_docx` is offered
// and called at all.
const ASK_FOR_DOCX =
  "Generate a .docx document titled ProbeDoc containing the single sentence 'hello probe'. " +
  "Use only your built-in document generator — do not call any DocSpace file, folder, room or people API tool. " +
  `If you have no tool for that, reply with exactly: ${NO_TOOL_SENTINEL}`;

/**
 * Asks one question in a thread of its own and reports which tools the model
 * reached for. A fresh thread per turn keeps each answer independent of the
 * refusal or the tool call in the one before it.
 *
 * `tools` are the client-supplied ones of that single request — the editor block
 * further down is what needs them; a chat with nothing open sends none.
 */
async function askInNewThread(
  aiChat: AiAgentChat,
  chat: {
    profileId: string;
    agentId: number;
    title: string;
    message: string;
    tools?: HostTool[];
  },
) {
  const threadId = await aiChat.createThreadId("owner", {
    title: chat.title,
    profileId: chat.profileId,
    agentId: chat.agentId,
  });

  const sent = await aiChat.sendMessage("owner", {
    threadId,
    profileId: chat.profileId,
    agentId: chat.agentId,
    message: chat.message,
    ...(chat.tools ? { tools: chat.tools } : {}),
  });
  expect(sent.status).toBe(200);
  expect(sent.streamError).toBeUndefined();

  const { data: messages } = await aiChat.readMessages("owner", threadId);
  const calledTools = AiAgentChat.assistantMessages(messages)
    .flatMap((message) => AiAgentChat.toolCalls(message))
    .map((call) => call.toolName ?? "");

  return {
    threadId,
    calledTools,
    reply: AiAgentChat.assistantText(messages),
    frames: AiAgentChat.frameTypes(sent.text),
  };
}

test.describe("MCP - disabling a tool the model really has", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - a built-in tool is offered to the model and called", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The positive control the two tests below rest on, kept separate so that a
    // day when the model stops being offered its built-in tools at all shows up
    // as a red test rather than as an expected failure inside the bug test.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Built-in Tool Agent",
    );

    const asked = await askInNewThread(aiChat, {
      profileId,
      agentId,
      title: "Built-in tool enabled",
      message: ASK_FOR_DOCX,
    });

    expect(
      asked.calledTools,
      `the model answered "${asked.reply.slice(0, 120)}"; frames were ${asked.frames.join(", ")}`,
    ).toContain(BUILT_IN_DOC_TOOL_TOKEN);
    // A server-executed tool pauses the stream the same way a host tool does.
    expect(asked.frames).toContain("tool-call-pending");
  });

  test("PUT /api/2.0/ai/tools/set-disabled - the built-in tool stays offered to the model whatever is written", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // This was BUG 83013: the setting was stored, read back as disabled, and
    // never reached the model. Since the built-in tools were hidden on
    // 2026-08-18 there is nothing to store either — `docspace` writes are
    // dropped — and the tools are not meant to be switchable at all, so the
    // model keeping them is now the requirement rather than the defect.
    //
    // Both spellings are written, in both scopes, so "nothing happened" does
    // not rest on guessing which name the engine would have matched — the bare
    // `generate_docx` and the full `docspace_generate_docx` token the model
    // sees, in the agent scope and portal-wide.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Disabled Tool Agent",
    );

    const toolNames = [BUILT_IN_DOC_TOOL, BUILT_IN_DOC_TOOL_TOKEN];
    for (const scope of [{ agentId }, {}]) {
      const { data } = await aiTools.setDisabledTools("owner", {
        serverType: "docspace",
        toolNames,
        ...scope,
      });
      expect(data?.success, "the write is accepted").toBe(true);
    }

    // Accepted and dropped: neither read shows it.
    const { data: stored } = await aiTools.getDisabledTools("owner", agentId);
    expect(stored).toEqual({});
    for (const toolName of toolNames) {
      const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
        serverType: "docspace",
        toolName,
        agentId,
      });
      expect(isDisabled, `${toolName} is not disabled`).toBe(false);
    }

    const asked = await askInNewThread(aiChat, {
      profileId,
      agentId,
      title: "Built-in tool disabled",
      message: ASK_FOR_DOCX,
    });

    expect(
      asked.calledTools,
      `the model answered "${asked.reply.slice(0, 120)}"; frames were ${asked.frames.join(", ")}`,
    ).toContain(BUILT_IN_DOC_TOOL_TOKEN);
  });

  // "a tool disabled and enabled again is callable" stood here: the closing leg
  // of a disable/enable cycle that no longer exists for the built-in server.
  // Both of its halves are covered above — the tool is callable, and clearing a
  // list that was never written changes nothing.
});

// ---------------------------------------------------------------------------
// "Whole servers can be switched on and off" — the half of the requirement that
// has no route of its own.
//
// There is no server-level switch on the tools surface: `set-disabled` addresses
// a `(serverType, toolNames)` pair and nothing else, so switching a server off
// means listing every tool it has, and the list is a full replacement rather
// than a set of flags. `disabled` inside a stored config looks like such a
// switch and is not one — the config is opaque storage. The only way to make a
// server really stop existing is `remove-custom-server`, which the lifecycle
// block covers.
//
// These tests pin that shape so that a real server switch, if one is ever added,
// shows up as a change here rather than as an untested feature.

/**
 * The tools this block switches off.
 *
 * A registered server's rather than the built-in ones: `docspace` writes are
 * dropped since the built-in tools were hidden on 2026-08-18 (see the disabling
 * block at the top of this file), so that serverType can no longer carry a
 * storage test. The names are arbitrary on purpose — `set-disabled` never
 * validates them, and what is measured here is the list semantics.
 */
const WHOLE_SERVER_TOOLS = ["calculate", "get_time", "convert_units"];

test.describe("MCP - switching a whole server off", () => {
  test("PUT /api/2.0/ai/tools/set-disabled - a whole server goes off in one call and the list is a full replacement", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Switching a server off is not an operation the API has; it is this call
    // with every one of the server's tools in `toolNames`. Two consequences
    // worth pinning, because a client that models the UI switch as "add this
    // tool to the disabled list" gets them wrong: the whole list fits in one
    // call, and writing a shorter one afterwards re-enables everything it omits
    // instead of merging.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Whole Server Agent",
      profileId,
    });
    expect(
      (
        await aiTools.addCustomServer("owner", {
          name: DISABLE_TARGET_SERVER,
          config: SERVER_CONFIG,
          agentId,
        })
      ).data?.success,
    ).toBe(true);

    const allNames = WHOLE_SERVER_TOOLS;

    const off = await aiTools.setDisabledTools("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolNames: allNames,
      agentId,
    });
    expect(off.status).toBe(200);
    expect(off.data?.success, "the whole server is disabled at once").toBe(
      true,
    );

    const { data: stored } = await aiTools.getDisabledTools("owner", agentId);
    expect(
      stored?.[DISABLE_TARGET_SERVER],
      "every name is stored, in order",
    ).toEqual(allNames);
    for (const toolName of [allNames[0], allNames[allNames.length - 1]]) {
      const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
        serverType: DISABLE_TARGET_SERVER,
        toolName,
        agentId,
      });
      expect(isDisabled, `${toolName} reads back as disabled`).toBe(true);
    }

    // A full replacement, not a merge: one name back in the list means every
    // other tool of that server is on again.
    const survivor = allNames[0];
    const narrowed = await aiTools.setDisabledTools("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolNames: [survivor],
      agentId,
    });
    expect(narrowed.data?.success).toBe(true);

    const { data: after } = await aiTools.getDisabledTools("owner", agentId);
    expect(after?.[DISABLE_TARGET_SERVER]).toEqual([survivor]);
    const { data: stillDisabled } = await aiTools.isToolDisabled("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolName: survivor,
      agentId,
    });
    const { data: reEnabled } = await aiTools.isToolDisabled("owner", {
      serverType: DISABLE_TARGET_SERVER,
      toolName: allNames[1],
      agentId,
    });
    expect(stillDisabled, `${survivor} stayed off`).toBe(true);
    expect(reEnabled, `${allNames[1]} came back on`).toBe(false);
  });

  test("PUT /api/2.0/ai/tools/set-disabled - every tool a registered server advertises can be switched off without unregistering it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The custom-server case of the test above, with the tool names the server
    // itself advertises rather than strings of the test's choosing — `set-disabled`
    // accepts any `serverType`/`toolName` (see the server-types block), so a
    // `{success:true}` on invented names would prove nothing about the real ones.
    //
    // The second half is the point: a server with all of its tools off is still a
    // registered server with its config intact. "Off" and "removed" are different
    // states, and only the second one is `remove-custom-server`.
    test.skip(
      !isMcpServerConfigured(CALCULATOR_MCP_SERVER),
      "needs MCP_CALCULATOR_URL and MCP_CALCULATOR_TOKEN",
    );
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const advertised = await mcpToolNames(
      apiSdk.request,
      CALCULATOR_MCP_SERVER,
    );
    test.skip(
      advertised.length === 0,
      "the calculator MCP server did not answer initialize/tools-list",
    );

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Server Switch Agent",
      profileId,
    });

    const serverName = "calculator";
    const registered = await aiTools.addCustomServer("owner", {
      name: serverName,
      config: CALCULATOR_MCP_SERVER,
      agentId,
    });
    expect(registered.data?.success, "the server is registered").toBe(true);

    const off = await aiTools.setDisabledTools("owner", {
      serverType: serverName,
      toolNames: advertised,
      agentId,
    });
    expect(off.status).toBe(200);
    expect(off.data?.success).toBe(true);

    const { data: stored } = await aiTools.getDisabledTools("owner", agentId);
    expect(
      stored?.[serverName],
      "the server's own tool names are stored",
    ).toEqual(advertised);
    for (const toolName of advertised) {
      const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
        serverType: serverName,
        toolName,
        agentId,
      });
      expect(isDisabled, `${serverName}_${toolName} is off`).toBe(true);
    }

    // Off, not gone.
    expect(Object.keys(await serverMap(aiTools, agentId))).toEqual([
      serverName,
    ]);
    expect(
      (await aiTools.getCustomServer("owner", serverName, agentId)).data,
      "the config survives switching the tools off",
    ).toEqual(CALCULATOR_MCP_SERVER);
  });

  test("POST /api/2.0/ai/tools/add-custom-server - `disabled` in the config is stored verbatim and switches nothing off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `disabled` is a field MCP client configs carry (VS Code, Claude Desktop and
    // the like use it as exactly the switch this requirement asks for), so a
    // client may well send it. DocSpace stores the config as an opaque blob: the
    // flag round-trips, and nothing on the tools surface derives from it — the
    // server is listed like any other and none of its tools reads back disabled.
    //
    // If `disabled` is ever meant to be honoured, this test is where that shows
    // up: the last two assertions flip.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Disabled Config Agent",
      profileId,
    });

    const name = "autotest-switched-off";
    const config = { ...SERVER_CONFIG, disabled: true };
    const added = await aiTools.addCustomServer("owner", {
      name,
      config,
      agentId,
    });
    expect(added.status).toBe(200);
    expect(added.data?.success, "a server marked disabled is accepted").toBe(
      true,
    );

    expect(
      (await aiTools.getCustomServer("owner", name, agentId)).data,
    ).toEqual(config);
    expect(
      Object.keys(await serverMap(aiTools, agentId)),
      "and it is listed like an enabled one",
    ).toEqual([name]);

    const { data: disabledTools } = await aiTools.getDisabledTools(
      "owner",
      agentId,
    );
    expect(disabledTools, "the flag is not a disabled-tools entry").toEqual({});
    const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
      serverType: name,
      toolName: "calculate",
      agentId,
    });
    expect(isDisabled, "and no tool of it reads back as off").toBe(false);
  });

  // The whole-server case of BUG 83013 stood here: `docspace` switched off tool
  // by tool, both name spellings, both scopes, and the model still calling every
  // one of them. It cannot be staged any more — a `docspace` write is dropped
  // rather than stored since the built-in tools were hidden on 2026-08-18, and
  // they are not meant to be switchable at all. What is left of the subject is
  // in "MCP - disabling a tool the model really has": the write is accepted, the
  // reads stay empty, and the model keeps the tool.
});

// ---------------------------------------------------------------------------
// The per-request half of the same switch. `AiTMCPItem.enabled` is documented as
// "Disabled tools are hidden from the AI model", and it is the only switch a host
// surface has: client-supplied tools are not registered anywhere, so there is no
// stored disabled-list to put them on.
//
// The positive control is the first test of "MCP - the tool-call pause":
// `WEATHER_TOOL` carries `enabled: true` and the same prompt pauses the stream at
// `tool-call-pending` with the call stored on the reply.

const SWITCHED_OFF_WEATHER_TOOL: HostTool = {
  ...WEATHER_TOOL,
  enabled: false,
};

test.describe("MCP - the per-request tool switch", () => {
  test("BUG 83162: POST /api/2.0/ai/ai/send-with-stream - a tool sent with enabled:false is still offered to the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Same tool, same prompt, same agent as the control — only `enabled` differs,
    // so nothing but the flag can explain the outcome. The flag is ignored: the
    // model is offered the tool, calls it, and the stream stops for an approval
    // the client never wanted to be asked for.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Switched Off Tool Agent",
    );

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [SWITCHED_OFF_WEATHER_TOOL],
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const { data: messages } = await aiChat.readMessages("owner", threadId);
    const calledTools = AiAgentChat.assistantMessages(messages)
      .flatMap((message) => AiAgentChat.toolCalls(message))
      .map((call) => call.toolName ?? "");
    const frames = AiAgentChat.frameTypes(sent.text);

    test.fail();
    // The stored transcript first: it is what the user is left with, and it
    // outlives the stream.
    expect(
      calledTools,
      `a tool sent with enabled:false was called; frames were ${frames.join(", ")}`,
    ).toEqual([]);
    expect(AiAgentChat.pendingToolCall(sent.text)).toBeUndefined();
    expect(frames, "the reply runs to completion instead").toContain(
      "message-end",
    );
  });
});

// ---------------------------------------------------------------------------
// "If a document is open in the editor while the chat is active, the chat's
// toolset is replaced by the editor's tools."
//
// Most of that requirement cannot be tested here, and the reason is worth stating
// once: the API has no notion of "a document is open". Nothing on
// send-with-stream describes the surface the chat is being shown on — the toolset
// of one request is `actionArgs.tools` (whatever the CLIENT chose to send, which
// is how the editor hands over insert_text/replace_selection) plus the built-in
// `docspace_*` generators the engine adds from `entityId`. So the decision to
// swap is the client's alone, and no request can confirm it was made.
//
// What IS testable is the one thing the word "replaced" claims about the engine:
// whether a request that carries the editor's tools still carries the chat's. It
// does — the two families are merged, not substituted — which is what the first
// test pins, and it is the fact a client has to implement the swap around.
//
// The second test is the one way a client can still take a chat tool away, found
// while probing for the opposite: `actionArgs.tools` has no field for switching a
// built-in off — `set-disabled` under `serverType: "docspace"` is dropped rather
// than stored ("MCP - disabling a tool the model really has") — but an entry that
// REUSES the built-in's name displaces it. The engine's `docspace_generate_docx`
// then never runs, so a swap is implementable; what the model does instead is not
// deterministic, and the test states both shapes rather than one run's.
//
// Both tests use the agent scope, where the toolset is the generators only — a
// folder or room `entityId` adds the REST family and those tools execute against
// a foreign portal (BUG 83172), which would put a stranger's data in the way of a
// question about tool visibility.

/**
 * What an editor offers while a document is open, in the shape
 * `actionArgs.tools` takes. Names are unprefixed on purpose: a host tool is
 * stored in the transcript under exactly the name the client sent, unlike the
 * `docspace_`-prefixed built-ins, so the two families are told apart by name
 * alone in the assertions below.
 */
const EDITOR_TOOLS: HostTool[] = [
  {
    name: "insert_text",
    description:
      "Insert text at the cursor position of the document currently open in the editor.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text to insert" } },
      required: ["text"],
      additionalProperties: false,
    },
    enabled: true,
    requireApproval: true,
  },
  {
    name: "replace_selection",
    description:
      "Replace the current selection in the document currently open in the editor.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Replacement text" },
      },
      required: ["text"],
      additionalProperties: false,
    },
    enabled: true,
    requireApproval: true,
  },
];

const ASK_FOR_EDITOR_EDIT =
  "Insert the sentence 'hello editor' into the document I have open. Call the insert_text tool. " +
  `If you truly have no such tool, reply with exactly: ${NO_TOOL_SENTINEL}`;

/**
 * The built-in document generator's own name, sent as a client tool — both
 * spellings, because `actionArgs.tools` is keyed by a bare name while the model
 * sees the prefixed token, and a client has no documentation saying which one
 * would be matched.
 *
 * `enabled: false` is what a client would set to mean "off for this turn". It is
 * not what makes the built-in go away: the name is. The flag's own defect is BUG
 * 83162 in the block above, measured on a tool of the client's own.
 */
const SHADOWED_BUILT_IN_TOOLS: HostTool[] = [
  BUILT_IN_DOC_TOOL,
  BUILT_IN_DOC_TOOL_TOKEN,
].map((name) => ({
  name,
  description: "Generate a .docx document. Disabled while the editor is open.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string", description: "Document title" } },
    required: ["title"],
    additionalProperties: false,
  },
  enabled: false,
  requireApproval: true,
}));

test.describe("MCP - the editor's toolset and the chat's", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the editor's tools are added to the chat's, not substituted for them", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Two turns of the same configuration — the editor's tools attached to both —
    // asked for the two things only one family can do. Both are served, so a
    // request that carries the editor's toolset still carries the chat's.
    //
    // Separate threads rather than two turns of one, so the second answer cannot
    // be shaped by the tool call in the first. The control for the document half
    // is the first test of "MCP - disabling a tool the model really has": the same
    // prompt, the same agent, no client tools attached.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Editor Toolset Agent",
    );

    // The editor's own tool: proves the set really reached the model in this
    // configuration, which is what makes the second half meaningful.
    const editorTurn = await askInNewThread(aiChat, {
      profileId,
      agentId,
      title: "Editor tools attached - an editor edit",
      message: ASK_FOR_EDITOR_EDIT,
      tools: EDITOR_TOOLS,
    });

    expect(
      editorTurn.calledTools,
      `the model answered "${editorTurn.reply.slice(0, 120)}"; frames were ${editorTurn.frames.join(", ")}`,
    ).toContain("insert_text");
    expect(
      editorTurn.frames,
      "a client tool pauses for the approval",
    ).toContain("tool-call-pending");

    // The chat's own tool, with the editor's set attached to the very same
    // request: if the toolset had been replaced, this could only be answered with
    // the sentinel.
    const chatTurn = await askInNewThread(aiChat, {
      profileId,
      agentId,
      title: "Editor tools attached - a document",
      message: ASK_FOR_DOCX,
      tools: EDITOR_TOOLS,
    });

    expect(
      chatTurn.calledTools,
      `the model answered "${chatTurn.reply.slice(0, 120)}"; frames were ${chatTurn.frames.join(", ")}`,
    ).toContain(BUILT_IN_DOC_TOOL_TOKEN);
    expect(
      chatTurn.reply,
      "the built-in tool was not reported as missing",
    ).not.toContain(NO_TOOL_SENTINEL);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a client tool that reuses a built-in tool's name displaces it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The same request as the second half of the test above — the editor's tools
    // and a request for a document — with two entries added that carry the
    // built-in generator's own name under both spellings. That is the whole
    // difference between the two tests, and it is enough: the engine's
    // `docspace_generate_docx` is never the tool that answers.
    //
    // The positive control is therefore the test above rather than a turn of its
    // own, and it is kept separate deliberately: a day when the built-in stops
    // being offered at all has to show up as that test going red, not as this one
    // passing for a reason it cannot see.
    //
    // What answers instead is not deterministic. Measured 2026-08-19, two runs,
    // two shapes: the client's own `generate_docx` was called — despite
    // `enabled: false`, which is BUG 83162 — and, on the repeat, no tool at all
    // with the model reporting it has none. Both are the displacement; a test
    // written around either one alone would flake, so both are accepted and
    // anything else fails.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Shadowed Built-in Tool Agent",
    );

    const asked = await askInNewThread(aiChat, {
      profileId,
      agentId,
      title: "A client tool named after the built-in one",
      message: ASK_FOR_DOCX,
      tools: [...EDITOR_TOOLS, ...SHADOWED_BUILT_IN_TOOLS],
    });

    const diagnostics = `called [${asked.calledTools.join(", ")}]; the model answered "${asked.reply.slice(0, 200)}"; frames were ${asked.frames.join(", ")}`;

    expect(
      asked.calledTools,
      `the engine's own generator answered anyway: ${diagnostics}`,
    ).not.toContain(BUILT_IN_DOC_TOOL_TOKEN);

    // Named rather than left implicit, so that "no built-in call" cannot be
    // satisfied by the model wandering off into an editor tool or into prose of
    // its own: the turn has to end in one of the two measured shapes.
    const shadowCalled = asked.calledTools.includes(BUILT_IN_DOC_TOOL);
    const reportedMissing = asked.reply.includes(NO_TOOL_SENTINEL);
    expect(
      shadowCalled || reportedMissing,
      `neither the client's same-named tool nor a "no such tool" answer: ${diagnostics}`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// "Their tools appear in the common list" — the clause with no route behind it.
//
// `list-system-tools` is the only listing route on the surface (every spelling of
// list-tools / list-server-tools / list-custom-server-tools answers 404) and it
// only ever answers a `docspace` key. BUG 82991 is the scoped read of it coming
// back empty; the test below is the other half — a live, credentialed, registered
// server adds nothing to the unscoped catalogue either, in either scope, so there
// is no way for a client to show a common list of tools at all.

test.describe("MCP - a registered server in the tool list", () => {
  test("BUG 83163: GET /api/2.0/ai/tools/list-system-tools - a registered server's tools never appear in the catalogue", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.skip(
      !isMcpServerConfigured(CALCULATOR_MCP_SERVER),
      "needs MCP_CALCULATOR_URL and MCP_CALCULATOR_TOKEN",
    );
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    // Control 1: the server is up and advertises its tools right now.
    const advertised = await mcpToolNames(
      apiSdk.request,
      CALCULATOR_MCP_SERVER,
    );
    test.skip(
      advertised.length === 0,
      "the calculator MCP server did not answer initialize/tools-list — nothing to conclude about the portal",
    );
    expect(advertised).toContain(CALCULATOR_TOOL);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Catalogue Agent",
      profileId,
    });

    // Control 2: registered in both scopes, so neither can be blamed.
    const serverName = "calculator";
    for (const scope of [{ agentId }, {}]) {
      const { data } = await aiTools.addCustomServer("owner", {
        name: serverName,
        config: CALCULATOR_MCP_SERVER,
        ...scope,
      });
      expect(data?.success, "the server is registered").toBe(true);
    }
    expect(
      (await aiTools.getCustomServer("owner", serverName, agentId)).data,
      "credentials included",
    ).toEqual(CALCULATOR_MCP_SERVER);

    // Control 3: the route itself answers. It cannot be a stronger control than
    // that any more — since the tools were hidden on 2026-08-18 the catalogue is
    // empty for everyone, so "the registered server is missing from it" no
    // longer says anything specific about custom servers. Kept because the
    // registration controls above still do: the server is stored, readable and
    // credentialed, and the model is never offered it.
    const catalogue = await aiTools.listSystemTools("owner");
    expect(catalogue.status).toBe(200);

    const listed = Object.entries(catalogue.data ?? {}).flatMap(
      ([serverType, tools]) =>
        (tools ?? []).map((tool) => `${serverType}_${tool.name ?? ""}`),
    );

    test.fail();
    expect(
      listed,
      `the catalogue published only [${Object.keys(catalogue.data ?? {}).join(", ")}]`,
    ).toContain(`${serverName}_${CALCULATOR_TOOL}`);
  });
});

// ---------------------------------------------------------------------------
// The server-executed DocSpace tools — the gap the header of this file names: a
// tool the ENGINE runs against the portal's own REST API, rather than one the
// client offers and answers itself.
//
// Measured on 2026-08-14 with gemini-3.5-flash, and the toolset turned out to be
// two families with nothing in common but the word "docspace":
//
//   * in-process generators, addressed with a `docspace_` prefix —
//     `docspace_generate_docx`, `_generate_presentation`, `_generate_form`,
//     `docspace_knowledge_search`, plus `generate_image`. These work. The stream
//     pauses on `tool-call-pending` with `serverExecuted: true`, and the engine
//     runs the call itself once approve-tool-call arrives — so the approval
//     carries NO `result` of the client's own, unlike a host tool's.
//   * the 23 REST tools of `list-system-tools` — `get_my_folder`,
//     `get_rooms_folder`, `create_folder`, `upload_file`, … — addressed with no
//     prefix at all. Every one of them makes an outbound HTTPS call, and every
//     one of those calls goes to a portal that is not the caller's and comes
//     back 401. That is the bug test at the bottom.
//
// Which family the model gets is decided by `entityId`, and NOT by "agent room
// versus ordinary room":
//
//   entityId = the agent room id      -> generators only; the model states it
//                                        has no folder tools, and "create a file
//                                        in Files" is served by generate_docx
//                                        into Result Storage
//   entityId = any folder or room id  -> the REST family is offered as well, and
//                                        that includes the agent's OWN Knowledge
//                                        and Result Storage folders
//
// So a chat that looks like it is "inside the agent room" reaches the 401 as
// soon as the client scopes it to a folder of that room instead of to the room.

/**
 * The reported request, verbatim and in the language it was made in. Naming a
 * section the agent does not own is what makes it interesting: the answer has to
 * come from whatever tools the scope really has.
 */
const ASK_FOR_FILE_IN_FILES = 'Создай файл в разделе Files, назови "тест"';

/** Forces the REST family if the model has it, and says so if it does not. */
const ASK_FOR_MY_FOLDER =
  "Call the get_my_folder tool and report the id and title of my My Documents folder. " +
  `Do not generate any document. If you truly have no such tool, reply exactly: ${NO_TOOL_SENTINEL}`;

/**
 * The in-process generators — the whole of what an agent scope is given. Any
 * other tool the model calls belongs to the REST family.
 *
 * Deliberately a list of its own rather than a read of `list-system-tools`: that
 * catalogue is not the toolset the model gets (BUG 83013's disagreement) and it
 * is not even stable — it published 23 tools on 2026-08-14 and answered `{}` on a
 * fresh portal on 2026-08-17 while the model still had, and still called, every
 * REST tool. A test keyed on it would have gone red for the catalogue's reasons
 * instead of its own.
 */
const GENERATOR_TOOL_NAMES = [
  BUILT_IN_DOC_TOOL_TOKEN,
  "docspace_generate_presentation",
  "docspace_generate_form",
  "docspace_knowledge_search",
  "generate_image",
];

function isGeneratorTool(toolName: string | undefined): boolean {
  return GENERATOR_TOOL_NAMES.includes(toolName ?? "");
}

/**
 * Where a server-executed tool actually sent its request, as the result reports
 * it. Three spellings have been seen in one afternoon, and a test that reads only
 * one of them goes red for the wrong reason or, worse, green:
 *
 *   * REFUSED — the engine's own trace:
 *     `GET https://<portal>/api/2.0/files/@my?…: 401 Unauthorized`;
 *   * SUCCEEDED — the DocSpace payload, which echoes the request in `links[].href`:
 *     `"href": "https://<portal>/api/2.0/files/rooms?…"`;
 *   * NEVER SENT — a DNS failure, which names no URL at all:
 *     `fetch failed\n\tgetaddrinfo ENOTFOUND integration-test-portal-…`. This one
 *     is the signature of a bad `Origin` on our side rather than of a broken
 *     engine — that host is the portal's registration name, see `AiHttp.headers()`.
 *
 * `host` is therefore the only field always present, and the assertions are all
 * on it. Matching the URL on the `/api/2.0/` path drops what is not a portal call
 * (`get_room_types` answers with a JSON Schema that cites json-schema.org).
 */
type ToolHttpCall = { host: string; url?: string; status?: number };

function toolHttpCalls(result: unknown): ToolHttpCall[] {
  if (typeof result !== "string") return [];
  const calls: ToolHttpCall[] = [];

  for (const match of result.matchAll(
    /(https?:\/\/[^\s"\\]+\/api\/2\.0\/[^\s"\\]*?)(?:\\?["\s]|:\s*(\d{3})|$)/g,
  )) {
    calls.push({
      url: match[1],
      host: new URL(match[1]).host,
      ...(match[2] === undefined ? {} : { status: Number(match[2]) }),
    });
  }
  for (const match of result.matchAll(/ENOTFOUND\s+([A-Za-z0-9._-]+)/g)) {
    calls.push({ host: match[1] });
  }

  return calls;
}

function toolIsError(result: unknown): boolean {
  if (typeof result !== "string") return false;
  try {
    return (JSON.parse(result) as { isError?: boolean }).isError === true;
  } catch {
    return false;
  }
}

/**
 * Sends one message and approves every pause until the reply finishes, which is
 * what a composer does with a server-executed call: the engine runs the tool, so
 * the approval carries no `result` — see the note above. Returns every tool call
 * stored in the thread, results included.
 *
 * The round cap is a safety net, not a contract: a chain of REST calls that all
 * fail can otherwise go on for as long as the model keeps trying another one.
 */
async function driveToolCalls(
  aiChat: AiAgentChat,
  body: {
    threadId: string;
    profileId: string;
    entityId: number | string;
    message: string;
    rounds?: number;
    /** Whose chat it is; the owner's unless a test says otherwise. */
    role?: AgentRole;
  },
) {
  const role = body.role ?? "owner";
  let stream: { status: number; text: string } = await aiChat.sendMessage(
    role,
    {
      threadId: body.threadId,
      profileId: body.profileId,
      agentId: body.entityId,
      message: body.message,
      timeoutMs: 180000,
    },
  );
  const sendFrames = AiAgentChat.frameTypes(stream.text);
  const firstPending = AiAgentChat.pendingToolCall(stream.text);

  for (let round = 0; round < (body.rounds ?? 5); round += 1) {
    const pending = AiAgentChat.pendingToolCall(stream.text);
    if (!pending) break;
    stream = await aiChat.approveToolCall(role, {
      threadId: body.threadId,
      messageId: pending.messageId,
      idx: pending.idx ?? 0,
      message: pending.message,
      entityId: String(body.entityId),
      profileId: body.profileId,
    });
  }

  const { data: messages } = await aiChat.readMessages(role, body.threadId);
  const calls = AiAgentChat.assistantMessages(messages).flatMap((message) =>
    AiAgentChat.toolCalls(message),
  );
  return {
    sendFrames,
    firstPending,
    calls,
    reply: AiAgentChat.assistantText(messages),
  };
}

/**
 * The three generators the requirement names — "tools for creating docx, forms
 * and presentations: confirming the call opens the finished file".
 *
 * One row per tool: the flow is identical, and everything that differs is what
 * the client is finally handed — which is the half of the requirement a file id
 * does not prove. `generate_image` is the fourth of the family and deliberately
 * absent: it never resolves (BUG 82861) and has tests of its own in chat.spec.ts.
 *
 * `promised` is what each tool's NAME commits it to, not what it does. Measured
 * on 2026-08-18, all three answer with the same thing — one blank 6942-byte
 * `.docx`, `documentType: "word"`, `isForm: false`, identical byte length across
 * the three, and `word/document.xml` with no text in it at all. So the shared
 * flow is asserted in the green test below (a file is created, filed and opens),
 * and each `promised` field is asserted in a `test.fail` test of its own, where
 * the correct value is stated rather than the current one.
 */
type GeneratorSpec = {
  label: string;
  toolName: string;
  /**
   * The request. Steered onto the built-in generator for the reason
   * `ASK_FOR_DOCX` spells out — the REST family is offered in an agent scope
   * too, and `upload_file` must not be what answers a "make me a document".
   */
  ask: string;
  promised: {
    extension: string;
    /** `documentType` of the editor config, i.e. which editor opens it. */
    documentType: string;
    /** `document.isForm` — whether it opens in form-filling mode. */
    isForm: boolean;
    /** An OOXML member every valid file of this kind carries. */
    zipEntry: string;
  };
};

const GENERATORS: GeneratorSpec[] = [
  {
    label: "a document",
    toolName: BUILT_IN_DOC_TOOL_TOKEN,
    ask: ASK_FOR_DOCX,
    promised: {
      extension: ".docx",
      documentType: "word",
      isForm: false,
      zipEntry: "word/document.xml",
    },
  },
  {
    label: "a presentation",
    toolName: "docspace_generate_presentation",
    ask:
      "Generate a presentation titled ProbeDeck with three slides about the water cycle. " +
      "Use only your built-in presentation generator — do not call any DocSpace file, folder, room or people API tool. " +
      `If you have no tool for that, reply with exactly: ${NO_TOOL_SENTINEL}`,
    promised: {
      extension: ".pptx",
      documentType: "slide",
      isForm: false,
      zipEntry: "ppt/presentation.xml",
    },
  },
  {
    label: "a form",
    toolName: "docspace_generate_form",
    ask:
      "Generate a fillable form titled ProbeForm with a field for a full name and a field for an email address. " +
      "Use only your built-in form generator — do not call any DocSpace file, folder, room or people API tool. " +
      `If you have no tool for that, reply with exactly: ${NO_TOOL_SENTINEL}`,
    promised: {
      // A DocSpace form is a PDF; the flag below is the format-independent half
      // of the claim and the one the test asserts.
      extension: ".pdf",
      documentType: "pdf",
      isForm: true,
      zipEntry: "",
    },
  },
];

/** The `{"data":{"id":…,"title":"….docx","parentId":…}}` a generator reports. */
function generatedFile(result: unknown): {
  id?: number;
  title?: string;
  parentId?: number;
} {
  try {
    return (
      (
        JSON.parse(String(result)) as {
          data?: { id?: number; title?: string; parentId?: number };
        }
      ).data ?? {}
    );
  } catch {
    return {};
  }
}

/**
 * "Confirming the call opens the finished file" — the clause a stored file id
 * says nothing about, in the three readings a client goes through:
 *
 *   * `getFileInfo` — DocSpace has an entry, with bytes and a URL to open;
 *   * `openEditFile` — the editor configuration the "open the file" step is
 *     built from really resolves: a document key, an editor url, no
 *     `errorMessage`. This is the call the client makes on confirmation, so it
 *     is the requirement stated directly;
 *   * the bytes — a package something could actually parse. Neither read above
 *     looks inside the file, and DocSpace serves an editor config for a `.docx`
 *     that is not a zip at all just as happily.
 *
 * Format-independent on purpose. What KIND of file each tool owes the user is
 * asserted per generator in the `promised` tests below, where today's answer is
 * the wrong one — pinning it here would bake it into every caller of this
 * helper.
 */
async function expectGeneratedFileOpens(
  apiSdk: ApiSDK,
  role: Role,
  fileId: number,
) {
  const api = apiSdk.forRole(role);

  const info = await api.files.getFileInfo({ fileId });
  expect(info.status, `${role} reads the generated file`).toBe(200);
  expect(
    info.data.response?.pureContentLength ?? 0,
    "the generated file is not empty",
  ).toBeGreaterThan(0);
  expect(
    info.data.response?.webUrl,
    "the client is given a URL to open it with",
  ).toBeTruthy();

  const opened = await api.files.openEditFile({ fileId });
  expect(opened.status, "the editor configuration is served").toBe(200);
  const config = opened.data.response;
  expect(
    config?.errorMessage ?? null,
    "the editor config reports no error",
  ).toBeNull();
  expect(config?.document?.key, "the document has an editor key").toBeTruthy();
  expect(config?.editorUrl, "the config names an editor").toBeTruthy();
  expect(
    config?.document?.title,
    "the editor opens the file that was generated",
  ).toBe(info.data.response?.title);

  const bytes = await downloadFile(apiSdk, role, fileId);
  expect(bytes.length, "the stored file has bytes").toBeGreaterThan(0);
  expect(
    bytes.subarray(0, 2).toString("latin1"),
    "the generated file is a zip package",
  ).toBe("PK");

  return { info: info.data.response, config, bytes };
}

/**
 * Drives one generator to a finished file and hands back everything the
 * assertions need. Shared by the green test and the three `promised` ones, so a
 * defect test cannot drift from the flow it is a defect of.
 */
async function generateFile(
  apiSdk: ApiSDK,
  aiChat: AiAgentChat,
  generator: GeneratorSpec,
  agentTitle: string,
) {
  const ownerApi = apiSdk.forRole("owner");
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: agentTitle,
    profileId,
  });
  const resultStorageId = await agentStorageFolderId(
    ownerApi,
    agentId,
    FolderType.ResultStorage,
  );
  const threadId = await aiChat.createThreadId("owner", {
    title: `Autotest ${generator.toolName} thread`,
    profileId,
    agentId,
  });

  const driven = await driveToolCalls(aiChat, {
    threadId,
    profileId,
    entityId: agentId,
    message: generator.ask,
  });
  const call = driven.calls.find(
    (item) => item.toolName === generator.toolName,
  );
  expect(
    call,
    `the model called ${JSON.stringify(driven.calls.map((item) => item.toolName))} and answered "${driven.reply.slice(0, 160)}"`,
  ).toBeDefined();

  const created = generatedFile(call!.result);
  expect(created.id, `tool result was ${call!.result}`).toEqual(
    expect.any(Number),
  );

  return { agentId, profileId, threadId, resultStorageId, driven, created };
}

test.describe("MCP - the server-executed DocSpace tools", () => {
  for (const generator of GENERATORS) {
    test(`POST /api/2.0/ai/ai/approve-tool-call - an agent's ${generator.toolName} writes ${generator.label} into Result Storage, and it opens`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      // The positive control for the whole family, and the one that says the tool
      // ran rather than that the model said it had: the approval is answered with
      // the created file's id, that file is then read back out of DocSpace, and
      // the editor configuration a client would open it with is built from it.
      //
      // Result Storage, not "the Files section the user asked for": the agent room
      // root takes no files at all, so an agent-scoped chat has exactly one place
      // to put what it produces. The model's own sentence about where the file went
      // is deliberately not asserted — it is prose, and on the measured runs it
      // claimed "in your Files section" for a file that landed here.
      test.setTimeout(300000);
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const { profileId, agentId } = await setupChat(
        aiChat,
        "Autotest Server Tool Agent",
      );
      const resultStorageId = await agentStorageFolderId(
        ownerApi,
        agentId,
        FolderType.ResultStorage,
      );
      const threadId = await aiChat.createThreadId("owner", {
        title: `Autotest ${generator.toolName} thread`,
        profileId,
        agentId,
      });

      const { data: myDocs } = await ownerApi.folders.getMyFolder({});
      const myDocsId = myDocs.response!.current!.id!;

      const driven = await driveToolCalls(aiChat, {
        threadId,
        profileId,
        entityId: agentId,
        message: generator.ask,
      });

      // The pause is the engine's, not a client tool's: nothing was offered in
      // actionArgs, and the frame says the server will run the call.
      expect(
        driven.firstPending,
        `the model did not ask for a tool; frames were ${driven.sendFrames.join(", ")}`,
      ).toBeDefined();
      expect(driven.firstPending!.serverExecuted).toBe(true);

      const generated = driven.calls.filter(
        (call) => call.toolName === generator.toolName,
      );
      expect(
        generated.map((call) => call.toolName),
        `the model called ${JSON.stringify(driven.calls.map((call) => call.toolName))} and answered "${driven.reply.slice(0, 160)}"`,
      ).toEqual([generator.toolName]);
      expect(generated[0].args).toMatchObject({ fileName: expect.any(String) });

      // What the engine reported back — the created file, not a string a client
      // made up: `{"data":{"id":…,"title":"….docx","parentId":…}}`.
      const created = generatedFile(generated[0].result);
      expect(created.id, `tool result was ${generated[0].result}`).toEqual(
        expect.any(Number),
      );
      expect(created.title, "the result names the file it created").toEqual(
        expect.any(String),
      );
      expect(
        created.parentId,
        `${generator.label} is filed in the agent's Result Storage`,
      ).toBe(resultStorageId);

      // And DocSpace really has it — the tool result alone would only prove the
      // engine claimed a file id.
      const { data: storage, status } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: resultStorageId,
        });
      expect(status).toBe(200);
      const stored = (storage.response?.files ?? []) as Array<{
        id?: number;
        title?: string;
      }>;
      expect(stored.map((file) => file.id)).toContain(created.id);
      expect(stored.map((file) => file.title)).toContain(created.title);

      // "Confirming the call opens the finished file" — everything above proves
      // a row in a folder listing, this proves a file the editor can open.
      // WHAT it opens is the three tests after this one.
      await expectGeneratedFileOpens(apiSdk, "owner", created.id!);

      // And it is not ALSO in personal documents — the agent had a section of its
      // own, so My Documents is not a destination it may fall back to. Matched on
      // the created id rather than on a before/after count: a fresh portal is still
      // seeding its four sample files while the chat runs, and counting them would
      // make this race.
      const personal = ((
        await ownerApi.folders.getFolderByFolderId({ folderId: myDocsId })
      ).data.response?.files ?? []) as Array<{ id?: number; title?: string }>;
      expect(
        personal.map((file) => file.id),
        `My Documents holds ${JSON.stringify(personal.map((file) => file.title))}`,
      ).not.toContain(created.id);
    });
  }

  // -------------------------------------------------------------------------
  // What the finished file actually IS. The test above proves a file was
  // created, filed and openable; these three ask whether it is the thing the
  // tool is named after, which is the whole of "tools for creating docx, forms
  // and presentations".
  //
  // Measured on 2026-08-18: all three tools answer identically — one blank
  // `.docx` of 6942 bytes, byte-for-byte the same length whichever tool ran,
  // `documentType: "word"`, `isForm: false`, `word/document.xml` present and
  // empty. The arguments the model sends are not the problem: the presentation
  // call carried `{topic: "water cycle", slideCount: "3", style: "modern"}` and
  // the form call a description of both fields, and none of it reaches the file.
  //
  // Three tests rather than one so a partial fix reads correctly, and each one
  // `test.fail` on the CORRECT expectation rather than green on today's answer.

  test("BUG 83231: POST /api/2.0/ai/ai/approve-tool-call - the document generator writes a blank document", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The requirement says the finished file opens. It opens and it is empty:
    // the sentence the call described is nowhere in it, and the assistant adds
    // no text of its own either.
    //
    // Two ways out are accepted, because there are two designs the product
    // could mean and only the user-visible result is being asserted: either the
    // bytes carry the document, or the editor configuration carries the state
    // that would let the editor produce it — `generationToolCallState`, which
    // the DTO documents as "used to run the agent flow in the editor". Today
    // neither holds: the field is absent from the config.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { created } = await generateFile(
      apiSdk,
      aiChat,
      GENERATORS[0],
      "Autotest Blank Document Agent",
    );

    // Read everything before the verdict: nothing between here and test.fail()
    // may assert, or a build that fixed this would stay red for another reason.
    const opened = await expectGeneratedFileOpens(apiSdk, "owner", created.id!);
    const text = extractDocxText(opened.bytes);
    const continued = opened.config?.generationToolCallState?.toolName;

    test.fail();
    expect(
      { text: text.slice(0, 200), generationToolCallState: continued },
      "the generated document holds the content the call described, or the editor is told to produce it",
    ).not.toEqual({ text: "", generationToolCallState: undefined });
  });

  test("BUG 83232: POST /api/2.0/ai/ai/approve-tool-call - the presentation generator writes a presentation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Fixed on 2026-08-20. `docspace_generate_presentation` used to produce
    // `ProbeDeck.docx`, which the Word editor opens — a container with no slides
    // to hold, and no way for the user to get a deck out of it.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const generator = GENERATORS[1];
    const { created } = await generateFile(
      apiSdk,
      aiChat,
      generator,
      "Autotest Presentation Agent",
    );
    const opened = await expectGeneratedFileOpens(apiSdk, "owner", created.id!);
    const measured = {
      fileExst: opened.info?.fileExst,
      documentType: opened.config?.documentType,
      hasSlides: listDocxEntries(opened.bytes).includes(
        generator.promised.zipEntry,
      ),
    };

    expect(measured, `the tool created "${created.title}"`).toEqual({
      fileExst: generator.promised.extension,
      documentType: generator.promised.documentType,
      hasSlides: true,
    });
  });

  test("BUG 83233: POST /api/2.0/ai/ai/approve-tool-call - the form generator writes an ordinary document, not a form", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `docspace_generate_form` produces `ProbeForm.docx` with `isForm: false`,
    // so the editor opens it for editing and no one can fill it in — the fields
    // the call described do not exist as fields.
    //
    // `isForm` is the assertion rather than the extension: it is the flag the
    // editor decides form-filling mode on, so it stays correct whichever
    // container DocSpace forms are cast in.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { created } = await generateFile(
      apiSdk,
      aiChat,
      GENERATORS[2],
      "Autotest Form Agent",
    );
    const opened = await expectGeneratedFileOpens(apiSdk, "owner", created.id!);
    const isForm = opened.config?.document?.isForm ?? false;

    test.fail();
    expect(
      isForm,
      `the tool created "${created.title}", which the editor opens as an ordinary document`,
    ).toBe(true);
  });

  test("POST /api/2.0/ai/ai/deny-tool-call - a refused generator writes no file at all", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The other half of the confirmation dialog. Deny is covered for a
    // client-supplied tool — the refusal reaches the model and the reply finishes
    // — but a client tool has nothing to leave behind. A server-executed one
    // does: the engine, not the client, would run it, so "the user said no" has
    // to mean the document was never written.
    //
    // Both decisions are taken in one test on purpose. "Result Storage is empty"
    // is also what a portal where the tool never ran at all would report, so the
    // approve leg below is the positive control that makes the empty read mean
    // something — the same agent, the same request, one thread apart.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Denied Generator Agent",
    );
    const resultStorageId = await agentStorageFolderId(
      ownerApi,
      agentId,
      FolderType.ResultStorage,
    );

    const storedFiles = async () => {
      const { data, status } = await ownerApi.folders.getFolderByFolderId({
        folderId: resultStorageId,
      });
      expect(status, "the agent's Result Storage is readable").toBe(200);
      return (data.response?.files ?? []) as Array<{
        id?: number;
        title?: string;
      }>;
    };

    // Setup premise: nothing is in there before the conversation, or the
    // assertions below would be measuring the portal's seed data.
    expect(await storedFiles(), "Result Storage starts empty").toEqual([]);

    await test.step("the refused call", async () => {
      const threadId = await aiChat.createThreadId("owner", {
        title: "Autotest denied generator thread",
        profileId,
        agentId,
      });

      let stream: { status: number; text: string } = await aiChat.sendMessage(
        "owner",
        {
          threadId,
          profileId,
          agentId,
          message: ASK_FOR_DOCX,
          timeoutMs: 180000,
        },
      );
      const pending = AiAgentChat.pendingToolCall(stream.text);
      expect(
        pending,
        `the model did not ask for a tool; frames were ${AiAgentChat.frameTypes(stream.text).join(", ")}`,
      ).toBeDefined();
      expect(pending!.serverExecuted).toBe(true);

      // Denying once is not enough to end the turn: the model may ask again, and
      // a run that stopped at the first refusal would leave a second, unanswered
      // call pending and could not tell whether anything was written.
      for (let round = 0; round < 3; round += 1) {
        const next = AiAgentChat.pendingToolCall(stream.text);
        if (!next) break;
        stream = await aiChat.denyPendingToolCall("owner", next, {
          threadId,
          profileId,
          agentId,
        });
        expect(stream.status, `deny ${round}`).toBe(200);
      }

      // The refusal is a decision, not a failure: the thread carries on.
      const { data: messages } = await aiChat.readMessages("owner", threadId);
      const calls = AiAgentChat.assistantMessages(messages).flatMap((message) =>
        AiAgentChat.toolCalls(message),
      );
      expect(
        calls.map((call) => call.toolName),
        "the tool call stays in the transcript",
      ).toContain(BUILT_IN_DOC_TOOL_TOKEN);
      for (const call of calls.filter(
        (item) => item.toolName === BUILT_IN_DOC_TOOL_TOKEN,
      )) {
        expect(
          generatedFile(call.result).id,
          `a denied call reported a file: ${call.result}`,
        ).toBeUndefined();
      }

      expect(
        await storedFiles(),
        "nothing was written for a call the user refused",
      ).toEqual([]);
    });

    await test.step("the same request, approved", async () => {
      const threadId = await aiChat.createThreadId("owner", {
        title: "Autotest approved generator thread",
        profileId,
        agentId,
      });

      const driven = await driveToolCalls(aiChat, {
        threadId,
        profileId,
        entityId: agentId,
        message: ASK_FOR_DOCX,
      });
      const generated = driven.calls.find(
        (call) => call.toolName === BUILT_IN_DOC_TOOL_TOKEN,
      );
      expect(
        generated,
        `the control leg called ${JSON.stringify(driven.calls.map((call) => call.toolName))}`,
      ).toBeDefined();

      const created = generatedFile(generated!.result);
      expect(created.id, `tool result was ${generated!.result}`).toEqual(
        expect.any(Number),
      );
      expect(
        (await storedFiles()).map((file) => file.id),
        "an approved call does write into Result Storage",
      ).toContain(created.id);
    });
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - Allow with allowAlways stops the generator asking again", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The dialog's checkbox, on the tools the dialog is really shown for. It is
    // covered for a client-supplied tool, and that says nothing about these: the
    // built-in `docspace` server was hidden from the tools surface on 2026-08-18
    // and its `set-disabled` writes are dropped (see the disabling block above),
    // so whether the persisted pre-approval still applies to a generator is a
    // separate question with a user-visible answer — a confirmation dialog that
    // cannot be turned off.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Generator Allow Always Agent",
    );

    /**
     * One turn that reaches the generator, in a thread of its own.
     *
     * Retried, because "did a dialog come up" can only be read off a turn that
     * asked for the tool at all, and the model sometimes answers the same request
     * in prose (measured once in four). A retry is honest here in a way it would
     * not be for the decision itself: nothing about the pre-approval changes
     * between attempts, and a turn with no tool call carries no answer to the
     * question either way.
     *
     * `pending` absent while `usedTool` holds is not a failed read — it is the
     * strongest form of "no dialog": the engine ran the tool without stopping.
     */
    const askForDocx = async (title: string) => {
      let frames: string[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const threadId = await aiChat.createThreadId("owner", {
          title: `${title} #${attempt}`,
          profileId,
          agentId,
        });
        const sent = await aiChat.sendMessage("owner", {
          threadId,
          profileId,
          agentId,
          message: ASK_FOR_DOCX,
          timeoutMs: 180000,
        });
        frames = AiAgentChat.frameTypes(sent.text);
        const pending = AiAgentChat.pendingToolCall(sent.text);
        const { data: messages } = await aiChat.readMessages("owner", threadId);
        const usedTool = AiAgentChat.assistantMessages(messages)
          .flatMap((message) => AiAgentChat.toolCalls(message))
          .some((call) => call.toolName === BUILT_IN_DOC_TOOL_TOKEN);

        if (pending || usedTool) {
          return { threadId, pending, usedTool, frames };
        }
      }
      throw new Error(
        `${title}: the model never reached for the generator in 3 turns; last frames were ${frames.join(", ")}`,
      );
    };

    const first = await askForDocx("Autotest generator before allow-always");
    expect(
      first.pending,
      `the first call has to prompt, or there is no checkbox to tick; frames were ${first.frames.join(", ")}`,
    ).toBeDefined();
    expect(first.pending!.autoAllow, "the first call prompts").toBe(false);

    // Approved through the dialog's own transport — the checkbox rides along
    // with the decision. No `result`: the engine runs a server-executed tool
    // itself.
    const firstPending = first.pending!;
    const approve = await aiChat.approveToolCall("owner", {
      threadId: first.threadId,
      messageId: firstPending.messageId,
      idx: firstPending.idx ?? 0,
      message: firstPending.message,
      entityId: String(agentId),
      profileId,
      allowAlways: true,
    });
    expect(approve.status).toBe(200);

    // Persisted where the settings screen reads it, or the checkbox was
    // decoration. Both spellings are accepted answers: the model is offered
    // `docspace_generate_docx` and the pair the setting is keyed on is
    // (`docspace`, `generate_docx`).
    const stored = await aiTools.getAllowAlways("owner", agentId);
    expect(stored.status).toBe(200);
    expect(
      (stored.data ?? []).filter((name) =>
        [BUILT_IN_DOC_TOOL, BUILT_IN_DOC_TOOL_TOKEN].includes(name),
      ),
      `the pre-approval list holds ${JSON.stringify(stored.data)}`,
    ).not.toEqual([]);

    // The requirement itself: the next document does not stop for a dialog. A
    // fresh thread, so only the stored decision can carry it over.
    //
    // "No dialog" has two shapes and both count: the pause frame comes back
    // flagged `autoAllow`, or there is no pause at all because the engine ran
    // the tool straight through. What must not happen is a frame that prompts.
    const second = await askForDocx("Autotest generator after allow-always");
    expect(
      second.pending === undefined || second.pending.autoAllow === true,
      `the generator still stopped for a dialog; frames were ${second.frames.join(", ")}`,
    ).toBe(true);
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - a member of the agent generates a document and can open it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Every generator test in this file drives the chat as the portal owner, who
    // can write anywhere. A member cannot: ContentCreator is the lowest level
    // that may use an agent at all, and the file lands in a folder the member
    // does not own. Two things are worth pinning because the UI has no other
    // outcome to offer — the document is filed in the agent's Result Storage the
    // same way, and the member who asked for it can open it.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Member Generator Agent",
    );
    const resultStorageId = await agentStorageFolderId(
      ownerApi,
      agentId,
      FolderType.ResultStorage,
    );

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    await inviteToAgent(ownerApi.rooms, agentId, memberId);
    // Setup premise: the conversation below really is the member's. A shared
    // request context that fell back to the owner's session would make this test
    // a second owner run wearing a member's name.
    await aiChat.expectActingAs("user", memberId, "the invited member");

    const threadId = await aiChat.createThreadId("user", {
      title: "Autotest member generator thread",
      profileId,
      agentId,
    });

    const driven = await driveToolCalls(aiChat, {
      threadId,
      profileId,
      entityId: agentId,
      message: ASK_FOR_DOCX,
      role: "user",
    });

    expect(
      driven.firstPending,
      `the model did not ask for a tool; frames were ${driven.sendFrames.join(", ")}`,
    ).toBeDefined();
    const generated = driven.calls.find(
      (call) => call.toolName === BUILT_IN_DOC_TOOL_TOKEN,
    );
    expect(
      generated,
      `the member's chat called ${JSON.stringify(driven.calls.map((call) => call.toolName))} and answered "${driven.reply.slice(0, 160)}"`,
    ).toBeDefined();

    const created = generatedFile(generated!.result);
    expect(created.id, `tool result was ${generated!.result}`).toEqual(
      expect.any(Number),
    );
    expect(
      created.parentId,
      "a member's document is filed in the agent's Result Storage too",
    ).toBe(resultStorageId);

    // The member's own read, which is the one the requirement is about: they
    // confirmed the call, so the finished file has to open for them.
    await expectGeneratedFileOpens(apiSdk, "user", created.id!);
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - a document generated in a room chat is filed in that room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The same tool from the other kind of chat. An agent scope has exactly one
    // place to put a file, which is what makes the tests above easy; a chat
    // opened on an ordinary room does not, and nothing in the API says where the
    // result goes. The room the chat is about is the only answer a client could
    // present as "your file is ready" — anywhere else and the user is told a
    // document was created and cannot find it.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: room, status: roomStatus } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Generator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    expect(roomStatus, "the room the chat is opened on").toBe(200);
    const roomId = room.response!.id!;

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest room generator thread",
      profileId,
      agentId: roomId,
    });

    const driven = await driveToolCalls(aiChat, {
      threadId,
      profileId,
      entityId: roomId,
      message: ASK_FOR_DOCX,
    });

    const generated = driven.calls.find(
      (call) => call.toolName === BUILT_IN_DOC_TOOL_TOKEN,
    );
    expect(
      generated,
      `the room chat called ${JSON.stringify(driven.calls.map((call) => call.toolName))} and answered "${driven.reply.slice(0, 160)}"`,
    ).toBeDefined();

    const created = generatedFile(generated!.result);
    expect(created.id, `tool result was ${generated!.result}`).toEqual(
      expect.any(Number),
    );

    const { data: listing, status } =
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });
    expect(status).toBe(200);
    const stored = (listing.response?.files ?? []) as Array<{
      id?: number;
      title?: string;
    }>;
    expect(
      created.parentId,
      `the document went to folder ${created.parentId}, not to the room the chat was opened on`,
    ).toBe(roomId);
    expect(stored.map((file) => file.id)).toContain(created.id);

    await expectGeneratedFileOpens(apiSdk, "owner", created.id!);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - an agent-scoped chat is offered no REST DocSpace tool at all", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The scope control for the bug below, and the reason the same question in
    // the same agent room can answer two different ways: with `entityId` = the
    // agent room id the REST family is simply not there, so nothing can 401.
    //
    // Read through the calls rather than through the answer — "no catalogue tool
    // was CALLED" is a fact about the request. Two questions, because `entityId`
    // is the only thing that decides the toolset and a naming-the-section prompt
    // must not be able to change it:
    //
    //   * the tool asked for by name, answered with the sentinel — the inventory
    //     read that does not depend on how a refusal is phrased;
    //   * ASK_FOR_FILE_IN_FILES ("create a file in the Files section, name it
    //     'test'") — the request that produced the reported 401 elsewhere.
    //     Here it has to be served by the agent's own generator
    //     instead, which is also what keeps the negative half honest: the model
    //     acted, it just had nothing but built-in tools to act with.
    //
    // SKIPPED, and not because the test is wrong. Both halves held all morning on
    // 2026-08-17 and stopped holding the same afternoon: the REST family is now
    // offered in the agent scope too, so `get_my_folder` is called here (3 runs
    // out of 3) — see the cross-tenant test at the bottom of this block, BUG
    // XXXXX. Two reasons not to run it meanwhile:
    //
    //   * it would fail on the product's behaviour rather than on its own subject,
    //     which the bug test already covers;
    //   * the second half is worse than a red test. With the REST family present,
    //     the "create a file in the Files section" request makes the model pick
    //     `upload_file`, and that call lands on a portal that is not ours —
    //     measured twice, the file really was created in two strangers' My
    //     Documents. A test must not write into somebody else's portal on every
    //     run.
    //
    // Remove this skip when BUG 83172 is fixed: if the tools then point at the
    // caller's own portal, the toolset question this test asks becomes meaningful
    // again — and the answer may legitimately be a different one, so read the
    // failure before changing the assertions.
    test.skip(
      true,
      "BUG 83172: the REST family reaches the agent scope and writes into a foreign portal",
    );
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Agent Scope Tools",
    );

    for (const probe of [
      {
        label: "the folder tool asked for by name",
        message: ASK_FOR_MY_FOLDER,
        expectSentinel: true,
      },
      {
        label: "a file requested in the Files section",
        message: ASK_FOR_FILE_IN_FILES,
        expectSentinel: false,
      },
    ]) {
      await test.step(probe.label, async () => {
        const threadId = await aiChat.createThreadId("owner", {
          title: `Autotest agent scope — ${probe.label}`,
          profileId,
          agentId,
        });

        const driven = await driveToolCalls(aiChat, {
          threadId,
          profileId,
          entityId: agentId,
          message: probe.message,
        });

        expect(
          driven.calls
            .map((call) => call.toolName)
            .filter((name) => !isGeneratorTool(name)),
          `a REST tool was called after all; the model answered "${driven.reply.slice(0, 200)}"`,
        ).toEqual([]);

        if (probe.expectSentinel) {
          expect(driven.reply).toContain(NO_TOOL_SENTINEL);
        } else {
          // Naming the section did not reach for a folder tool — it reached for
          // the generator, the one document tool an agent scope has.
          expect(
            driven.calls.map((call) => call.toolName),
            `the model answered "${driven.reply.slice(0, 200)}"`,
          ).toContain(BUILT_IN_DOC_TOOL_TOKEN);
        }
      });
    }
  });

  // Where a server-executed DocSpace tool sends its request, which is the one
  // thing about this family a test can pin down: the tool result carries the URL
  // the ENGINE called, and its host must be the caller's own portal.
  //
  // This started as BUG 83164 — every call reported a host that was not this
  // portal, first a stranger's (`docspace-szxr6g…`, 401) and later
  // `ENOTFOUND integration-test-portal-<rand>-<ts>`. It was OUR bug, closed on
  // 2026-08-18: the engine resolves the target portal from the request's `Origin`,
  // and `AiHttp.headers()` was sending the portal's REGISTRATION NAME instead of
  // its domain — see the note there. `Origin` alone decides it; `Referer`,
  // `X-Forwarded-Host` and `X-Forwarded-Proto` were measured and change nothing.
  //
  // So this is now the regression test for that: get the header wrong and the
  // whole family talks to a portal that is not ours, which no status code and no
  // sentence of the model's would reveal. Hence the assertion is the HOST, with
  // `isError` as the secondary check — a refused call is the mild outcome, a
  // stranger's ANSWER is the other one, which is why `toolHttpCalls` reads
  // `links[].href` too and not only the failure trace (see the cross-tenant block
  // at the bottom of this file, BUG 83172).
  //
  // Three scopes, because all three are reachable while the user is looking at an
  // AI room and none of them is the agent id that would have been served by the
  // generators alone: the agent's own two folders, and an ordinary folder as the
  // control that this is not something about agent rooms.
  //
  // What is deliberately NOT asserted: whether the model recovers after a refused
  // call and produces the document anyway. It did in twelve runs and gave up in
  // three, with the same request — that is the model's decision, not the API's.
  const REST_TOOL_SCOPES: Array<{
    label: string;
    /** Which of the agent's folders to scope to; a plain folder when absent. */
    folder?: FolderType;
  }> = [
    { label: "the agent's Result Storage", folder: FolderType.ResultStorage },
    { label: "the agent's Knowledge Base", folder: FolderType.Knowledge },
    { label: "an ordinary folder in Files" },
  ];

  for (const scope of REST_TOOL_SCOPES) {
    test(`POST /api/2.0/ai/ai/approve-tool-call - a server-executed DocSpace tool scoped to ${scope.label} runs against the caller's own portal`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      test.setTimeout(300000);
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const { profileId, agentId } = await setupChat(
        aiChat,
        "Autotest REST Tool Agent",
      );

      let entityId: number;
      if (scope.folder === undefined) {
        const { data: myFolder } = await ownerApi.folders.getMyFolder({});
        const { data: created, status } = await ownerApi.folders.createFolder({
          folderId: myFolder.response!.current!.id!,
          createFolder: { title: "Autotest REST Tool Folder" },
        });
        expect(status, "the control folder was created").toBe(200);
        entityId = created.response!.id!;
      } else {
        entityId = await agentStorageFolderId(ownerApi, agentId, scope.folder);
      }

      const threadId = await aiChat.createThreadId("owner", {
        title: "Autotest REST tool thread",
        profileId,
        agentId: entityId,
      });

      const driven = await driveToolCalls(aiChat, {
        threadId,
        profileId,
        entityId,
        message: ASK_FOR_MY_FOLDER,
      });

      // The premise, and it holds on a fixed build too: the model really did
      // reach for a REST tool and the engine really ran it. Without this the
      // assertions below would be satisfied by a chat that never called
      // anything.
      const restCalls = driven.calls.filter(
        (call) => !isGeneratorTool(call.toolName),
      );
      expect(
        restCalls.map((call) => call.toolName),
        `no REST tool was called; the model answered "${driven.reply.slice(0, 200)}"`,
      ).not.toEqual([]);
      for (const call of restCalls) {
        expect(call.result, `${call.toolName} was executed`).toBeDefined();
      }

      const requested = restCalls.flatMap((call) =>
        toolHttpCalls(call.result).map((http) => ({
          toolName: call.toolName,
          ...http,
        })),
      );
      const ourHost = new URL(apiSdk.tokenStore.portalBaseUrl).host;

      // The other premise: the result really does say where the call went, in one
      // of its two spellings. Without it an engine that stopped reporting the URL
      // would leave `requested` empty and satisfy the host assertion by silence.
      expect(
        requested,
        `no request target is visible in ${JSON.stringify(restCalls.map((call) => call.result))}`,
      ).not.toEqual([]);

      expect(
        requested.filter((http) => http.host !== ourHost),
        `the engine called ${JSON.stringify(requested)} instead of ${ourHost}`,
      ).toEqual([]);
      expect(
        restCalls
          .filter((call) => toolIsError(call.result))
          .map((call) => ({ toolName: call.toolName, result: call.result })),
        "no DocSpace tool reported an error",
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// The other half of "the tools call the wrong portal": sometimes that portal
// answers them.
//
// BUG 83164 above is about the target — the request goes somewhere that is not
// this portal. This block is about what came back on 2026-08-17, when the same
// calls stopped being refused. Sixteen read-only calls in a row succeeded, and
// the payload was another tenant's data. The host is in the response DocSpace
// echoes back, so this is not an inference from the model's words:
//
//   "href": "https://design.onlyoffice.io/api/2.0/files/rooms?…"     -> 297 rooms, titles and ids
//   "href": "https://design.onlyoffice.io/api/2.0/people/filter?…"   -> 98 users, real @onlyoffice.com
//                                                                      addresses, names, departments
//   "href": "https://design.onlyoffice.io/api/2.0/files/@my?…"       -> a stranger's 57 documents
//   "href": "https://dvershinineutesting.onlyoffice.io/api/2.0/…"    -> a second tenant, same run
//
// Five distinct foreign hosts have been seen so far (`design`,
// `dvershinineutesting`, `ilkem`, `docspace-17h05o`, `docspace-szxr6g`), and which
// one a call lands on changes between calls inside one run — a pool of base URLs
// with credentials that work, none of them the caller's.
//
// It is not read-only in practice. Asked the reported question — "create a file
// in the Files section, name it 'test'" — from an agent-scoped chat, the model
// resolved the section with `get_my_folder` and then called `upload_file`, which
// reported `{"success":true,"data":{"id":2779216,"folderId":31908,"title":"<name>.txt","uploaded":true}}`
// against `ilkem.onlyoffice.io`, and `folderId: 5214682` against
// `docspace-17h05o.onlyoffice.io` on the next attempt. Two files really were
// created in two strangers' My Documents. That is why nothing here asks for a
// write and why the neighbouring toolset test is skipped: a suite must not mutate
// somebody else's portal, and reproducing a write is not needed to show the
// access exists.
//
// The scope is the agent room id — the reported one, and the reason this is worth
// a test of its own rather than a note on BUG 83164: the REST family used to be
// absent there (measured all morning, 4 runs) and is now offered, so the leak is
// one message away from a user who never left the AI room.
//
// The assertions, in the order they matter:
//
//   1. the folder the tool answered with is OUR My Documents. This is the
//      cross-tenant question stated directly, and it is the one that fails on a
//      leaking build with the foreign id printed;
//   2. the host it talked to is ours — the same invariant BUG 83164 asserts, kept
//      here so that a partial fix (right host, wrong data, or the reverse) still
//      leaves one of the two red.
//
// Not asserted: the model's wording, the status code, and whether the model went
// on to do anything with what it read.

test.describe("MCP - the DocSpace tools and another tenant's data", () => {
  test("BUG 83172: POST /api/2.0/ai/ai/send-with-stream - a server-executed DocSpace tool answers with another tenant's folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Cross Tenant Agent",
    );

    // The oracle, read as the owner over the ordinary API: this is the folder a
    // correctly wired `get_my_folder` has to come back with.
    const { data: myFolder, status: myFolderStatus } =
      await ownerApi.folders.getMyFolder({});
    expect(myFolderStatus).toBe(200);
    const ourMyFolderId = myFolder.response!.current!.id!;
    const ourHost = new URL(apiSdk.tokenStore.portalBaseUrl).host;

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest cross tenant thread",
      profileId,
      agentId,
    });

    const driven = await driveToolCalls(aiChat, {
      threadId,
      profileId,
      entityId: agentId,
      message: ASK_FOR_MY_FOLDER,
    });

    // Premises, all of which hold on a fixed build too.
    const restCalls = driven.calls.filter(
      (call) => !isGeneratorTool(call.toolName),
    );
    expect(
      restCalls.map((call) => call.toolName),
      `no REST tool was called; the model answered "${driven.reply.slice(0, 200)}"`,
    ).toContain("get_my_folder");

    const answered = restCalls.find(
      (call) => call.toolName === "get_my_folder",
    );
    expect(answered?.result, "the tool was executed").toBeDefined();

    const folderIds = [
      ...String(answered!.result).matchAll(/"id":\s*\\?"?(\d{3,})/g),
    ].map((match) => Number(match[1]));
    const requested = toolHttpCalls(answered!.result);
    expect(
      [...folderIds, ...requested.map((http) => http.host)],
      `the result carries neither a folder id nor a request target: ${answered!.result}`,
    ).not.toEqual([]);

    test.fail();
    expect(
      folderIds,
      `get_my_folder answered with ${JSON.stringify(folderIds)}; this portal's My Documents is ${ourMyFolderId}. Result: ${answered!.result}`,
    ).toContain(ourMyFolderId);
    expect(
      requested.filter((http) => http.host !== ourHost),
      `the engine talked to ${JSON.stringify(requested)} instead of ${ourHost}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// "A tool or a server that goes away mid-conversation does not hang the chat:
// the turn reports the tool as unavailable and the dialogue carries on. A failed
// server shows an error icon with an expandable log in its row."
//
// The blocks above cover the stored side of the switch — what set-disabled keeps,
// that a whole server goes off in one call, that `remove-custom-server` really
// unregisters. What none of them covers is the *timing*: every one of them writes
// the tool state before the first message, so nothing said anything about a write
// that lands after a conversation has already started.
//
// Two constraints shape what can be staged here, and both are other people's bugs
// rather than gaps in this block:
//
//   * A registered server's tools never reach the model (BUG 82989/83163), and
//     the built-in `docspace` ones cannot be switched off at all — the write is
//     dropped and the tool stays offered ("MCP - disabling a tool the model
//     really has"). So "the model lost a tool it had" cannot be staged through
//     either of those surfaces: there is no observable difference to measure.
//   * Client-supplied host tools are the one place where a tool the model really
//     has can be taken away — they live for one request, so withdrawing one from
//     the next request, or answering its call with a failure, *is* the mid-dialogue
//     switch as far as the API can see it.
//
// So the resilience half is measured on host tools and on the tool-scope writes
// that happen around them, and the assertions are always the same pair: the turn
// terminates (`message-end`, no stream error) and the thread answers the next
// question. A hang shows up as a missing `message-end` or as a send that never
// returns, not as a status code.
//
// The icon-and-log half is not testable beyond its precondition, and the last
// test pins exactly that: there is no per-server state anywhere on the surface.
// `/ai/tools/*` has 13 routes (see the header of src/helpers/ai-tools.ts) and none
// of them reports whether a server answered — `get-custom-server` gives back the
// config that was written and nothing else. Drawing the icon needs a UI test
// against whatever the client learns at call time; drawing it from the API is not
// possible today.

/** A server that is registered and cannot possibly answer. */
const DEAD_SERVER_CONFIG = {
  type: "http",
  url: "https://mcp.example.invalid/mcp",
};

/**
 * What a host surface reports when the tool the model asked for is gone — the
 * "unavailable" of the requirement, in the only shape the API takes it: the
 * result of an approved call.
 */
const TOOL_UNAVAILABLE_RESULT =
  "Error: get_weather is unavailable - the MCP server providing it was switched off.";

const ASK_FOR_TOOL_AGAIN =
  "What is the weather in Berlin? Call the get_weather tool.";

/** Answerable without any tool, so a stalled thread is the only way to fail it. */
const CARRY_ON = "Forget the weather. Reply with the single word: OK.";

test.describe("MCP - a tool that is not available any more", () => {
  test('POST /api/2.0/ai/ai/approve-tool-call - a tool that answers "unavailable" finishes the reply and the thread carries on', async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The requirement's happy path for a dead tool. The pause is resumed with a
    // failure instead of a result — which is what a client does when the server
    // behind the tool has gone — and the two things that must not happen are that
    // the turn never terminates and that the thread stops taking questions.
    //
    // The wording of the model's answer is deliberately not asserted: the reply
    // is prose, and the failure text itself is not localised (BUG 83046). What is
    // asserted is that the failure is persisted as the call's result, so re-opening
    // the thread still shows which call failed.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Unavailable Tool Agent",
    );

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: TOOL_UNAVAILABLE_RESULT,
    });

    expect(AiAgentChat.streamError(approve.text)).toBeUndefined();
    expect(
      AiAgentChat.frameTypes(approve.text),
      "the reply terminates instead of hanging on the failed call",
    ).toContain("message-end");
    expect(approve.status).toBe(200);

    // The transcript is what the user is left with, and it outlives the stream.
    const first = await aiChat.readMessages("owner", threadId);
    const replies = AiAgentChat.assistantMessages(first.data);
    expect(replies).toHaveLength(1);
    expect(
      AiAgentChat.toolCalls(replies[0])[0]?.result,
      "the failure is stored as the call's result",
    ).toBe(TOOL_UNAVAILABLE_RESULT);
    expect(
      replies[0].status?.error,
      "a failed tool is not a failed reply",
    ).toBeUndefined();
    expect(
      AiAgentChat.messageText(replies[0]).length,
      "the model answered around the failure",
    ).toBeGreaterThan(0);

    // And the dialogue continues in the same thread.
    const next = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: CARRY_ON,
    });
    expect(next.streamError).toBeUndefined();
    expect(AiAgentChat.frameTypes(next.text)).toContain("message-end");
    expect(next.status).toBe(200);
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReplies("owner", threadId, 2),
      2,
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a tool withdrawn from the next message does not stall the thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // "The tool was switched off mid-dialogue", staged the only way the API allows
    // it: the first message carries the tool and the model uses it, the second one
    // asks for the same thing with the tool no longer offered. Host tools live for
    // one request, so leaving it out of the second send is exactly what a client
    // does when the user turns the tool off between two questions.
    //
    // Both halves matter. The stream must not stop at a pause for a tool that is
    // not there any more — a `tool-call-pending` here would be a dialog the client
    // cannot answer and a chat that never finishes — and the thread must still be
    // answered.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Withdrawn Tool Agent",
    );

    // The control: with the tool offered, this model in this thread calls it.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();
    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: "21C and sunny",
    });
    expect(approve.status).toBe(200);
    expect(AiAgentChat.frameTypes(approve.text)).toContain("message-end");

    // The switch: the same request, without the tool.
    const withdrawn = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL_AGAIN,
    });

    expect(withdrawn.streamError).toBeUndefined();
    expect(
      AiAgentChat.pendingToolCall(withdrawn.text),
      "the stream must not pause for a tool the request did not offer",
    ).toBeUndefined();
    expect(
      AiAgentChat.frameTypes(withdrawn.text),
      "the turn runs to completion",
    ).toContain("message-end");
    expect(withdrawn.status).toBe(200);

    const messages = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      2,
      120000,
    );
    expectHealthyAssistantReply(messages, 2);
    const second = AiAgentChat.assistantMessages(messages)[1];
    expect(
      AiAgentChat.toolCalls(second).map((call) => call.toolName),
      "the withdrawn tool was not called again",
    ).not.toContain(WEATHER_TOOL.name);
  });
});

test.describe("MCP - a server that goes away mid-conversation", () => {
  test("DELETE /api/2.0/ai/tools/remove-custom-server - a server removed between two messages of one thread costs the next one nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The companion of "registering an unreachable server leaves an ordinary reply
    // unaffected", moved to the moment the requirement is about: the server is in
    // the agent's scope while the first question is answered and gone before the
    // second one is asked, in the same thread.
    //
    // Narrow on purpose, the same way that test is: this says the write does not
    // damage the conversation. It does not say the server was consulted — as of
    // 2026-08-18 a registered server's tools do not reach the model at all
    // (BUG 82989), so there is nothing yet for its removal to take away.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Vanishing Server Agent",
    );

    const name = "autotest-vanishing-server";
    const registered = await aiTools.addCustomServer("owner", {
      name,
      config: DEAD_SERVER_CONFIG,
      agentId,
    });
    expect(registered.data?.success, "the server is registered").toBe(true);
    expect(
      Object.keys(await serverMap(aiTools, agentId)),
      "and it is in the agent's scope for the first question",
    ).toEqual([name]);

    const before = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word: pong",
    });
    expect(before.streamError).toBeUndefined();
    expect(before.status).toBe(200);
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // The switch, mid-dialogue, verified as state rather than trusted from the
    // `{success:true}`: the scope is empty when the second question is asked.
    const removed = await aiTools.removeCustomServer("owner", {
      name,
      agentId,
    });
    expect(removed.status).toBe(200);
    expect(removed.data?.success).toBe(true);
    expect(Object.keys(await serverMap(aiTools, agentId))).toEqual([]);

    const after = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: CARRY_ON,
    });

    expect(after.streamError).toBeUndefined();
    expect(
      AiAgentChat.frameTypes(after.text),
      "the thread answers with the server gone",
    ).toContain("message-end");
    expect(after.status).toBe(200);
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReplies("owner", threadId, 2),
      2,
    );
  });

  test("POST /api/2.0/ai/ai/approve-tool-call - a pause decided after the server left the scope still resumes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The sharpest moment the requirement has: the tool scope is rewritten while a
    // call is waiting for the user's decision. A pause that could not be resumed
    // afterwards is the hang the requirement forbids, and nothing else can end it
    // — approve and deny are the only routes that resume a stream (there is no
    // stop, cancel or abort route).
    //
    // The pending call is a host tool's rather than the removed server's, and it
    // has to be: a registered server's tools never reach the model (BUG 82989), so
    // there is no way to make one pause the stream. What is measured is therefore
    // the tool-scope write landing under an open pause, not the removal of the
    // paused tool itself.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Pause Survives Removal Agent",
    );

    const name = "autotest-removed-under-pause";
    const registered = await aiTools.addCustomServer("owner", {
      name,
      config: DEAD_SERVER_CONFIG,
      agentId,
    });
    expect(registered.data?.success, "the server is registered").toBe(true);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [WEATHER_TOOL],
    });
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    // The scope changes while the call waits.
    const removed = await aiTools.removeCustomServer("owner", {
      name,
      agentId,
    });
    expect(removed.status).toBe(200);
    expect(removed.data?.success).toBe(true);
    expect(
      Object.keys(await serverMap(aiTools, agentId)),
      "the scope really was rewritten under the open pause",
    ).toEqual([]);

    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId,
      tools: [WEATHER_TOOL],
      result: "21C and sunny",
    });

    expect(AiAgentChat.streamError(approve.text)).toBeUndefined();
    expect(
      AiAgentChat.frameTypes(approve.text),
      "the decision still resumes the reply",
    ).toContain("message-end");
    expect(approve.status).toBe(200);

    const messages = await aiChat.readMessages("owner", threadId);
    const replies = AiAgentChat.assistantMessages(messages.data);
    expect(replies).toHaveLength(1);
    expect(
      AiAgentChat.toolCalls(replies[0])[0]?.result,
      "the result of the decision landed on the call",
    ).toBe("21C and sunny");
    expect(AiAgentChat.messageText(replies[0]).length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/ai/tools/get-custom-server, list-custom-servers - an unreachable server carries no status or log field", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The precondition of "a failed server shows an error icon with an expandable
    // log in its row", and it does not hold: no route on the tools surface reports
    // anything about a server beyond the config that was written into it. A client
    // has nothing to draw the icon from and nothing to fill the log with, other
    // than whatever it observes itself at call time.
    //
    // Deep equality is the assertion rather than a list of `not.toHaveProperty`
    // checks: any field the backend starts adding — `status`, `error`, `lastError`,
    // `log`, `connected` — breaks this test, which is where such a change should
    // show up.
    //
    // The reads are taken after a real turn has run with the dead server in scope,
    // so this is not "nothing was ever attempted": had the engine tried and failed,
    // this is the moment a status field would exist. And the equality is its own
    // positive control — an empty or refused read would fail it too, since the
    // config has to come back whole.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId, threadId } = await setupChat(
      aiChat,
      "Autotest Server Status Agent",
    );

    const name = "autotest-failed-server";
    const registered = await aiTools.addCustomServer("owner", {
      name,
      config: DEAD_SERVER_CONFIG,
      agentId,
    });
    expect(registered.data?.success, "the server is registered").toBe(true);

    const fresh = await aiTools.getCustomServer("owner", name, agentId);
    expect(fresh.status).toBe(200);
    expect(
      fresh.data,
      "a freshly registered server reads back as its config and nothing else",
    ).toEqual(DEAD_SERVER_CONFIG);

    // A turn with the dead server in the agent's scope.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word: pong",
    });
    expect(sent.streamError).toBeUndefined();
    expect(sent.status).toBe(200);
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    const after = await aiTools.getCustomServer("owner", name, agentId);
    expect(after.status).toBe(200);
    expect(
      after.data,
      "and it still reads back as its config after a turn ran with it in scope",
    ).toEqual(DEAD_SERVER_CONFIG);
    expect(
      await serverMap(aiTools, agentId),
      "the listing carries no per-server state either",
    ).toEqual({ [name]: DEAD_SERVER_CONFIG });
  });
});
