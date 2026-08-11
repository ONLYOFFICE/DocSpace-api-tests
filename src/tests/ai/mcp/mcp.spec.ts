import { expect } from "@playwright/test";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiAgentChat,
  HostTool,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
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
//   2. "the tool-call pause" and "always-allow drives the pause" — the same
//      surface driven through a real conversation, where the model decides to
//      call a tool and the stream stops until approve/deny resumes it;
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

test.describe("MCP - System tools catalogue", () => {
  test("GET /api/2.0/ai/tools/list-system-tools - Owner gets the built-in DocSpace tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const { data, status } = await aiTools.listSystemTools("owner");
    const docspaceTools = data?.docspace ?? [];

    expect(status).toBe(200);
    expect(docspaceTools.length).toBeGreaterThan(0);
    for (const tool of docspaceTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
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

test.describe("MCP - Disabling individual tools", () => {
  test("PUT /api/2.0/ai/tools/set-disabled - Owner disables and re-enables a built-in tool", async ({
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

    const { data: before } = await aiTools.getDisabledTools("owner", agentId);
    expect(before).toEqual({});

    const { data, status } = await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: ["delete_file"],
      agentId,
    });
    expect(status).toBe(200);
    expect(data?.success).toBe(true);

    const { data: after } = await aiTools.getDisabledTools("owner", agentId);
    const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });

    expect(after?.docspace).toEqual(["delete_file"]);
    expect(isDisabled).toBe(true);

    // Re-enable by writing an empty list back.
    await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: [],
      agentId,
    });

    const { data: cleared } = await aiTools.isToolDisabled("owner", {
      serverType: "docspace",
      toolName: "delete_file",
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
      serverType: "docspace",
      toolNames: ["delete_file"],
      agentId: firstAgent,
    });

    const { data: other } = await aiTools.isToolDisabled("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId: secondAgent,
    });

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

  test("BUG 82837: POST /api/2.0/ai/ai/approve-tool-call, deny-tool-call - a non-member of the agent may decide on another user's tool call", async ({
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

    // Every neighbouring route refuses this member outright, so the thread really
    // is out of their reach.
    expect(
      (await aiChat.getThread("user", threadId)).status,
      "the thread itself is closed to them",
    ).toBe(403);
    expect((await aiChat.getMessageById("user", messageId)).status).toBe(403);

    // The confirmation routes are not: section 16.1's "Allow of someone else's
    // request id" is accepted. Nothing happens here only because the referenced
    // message carries no pending tool call — with a real one, a user outside the
    // room would be answering the model's permission prompt.
    const approve = await aiChat.approveToolCall("user", body);
    const deny = await aiChat.denyToolCall("user", body);
    expect(approve.status).toBe(200);
    expect(deny.status).toBe(200);

    await apiSdk.authenticateOwner();
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data.map((message) => message.id)).toEqual([messageId]);

    test.fail();
    expect(
      approve.status,
      "deciding on a tool call in someone else's thread must be refused",
    ).toBe(403);
  });
});

test.describe("MCP - tool-call confirmation with AI Disabled", () => {
  test("BUG 82838: POST /api/2.0/ai/ai/approve-tool-call, deny-tool-call - both are still accepted when AI access is disabled", async ({
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

    // Section 3.2 lists "an MCP tool cannot be invoked" among the things the
    // switch has to stop. These two routes are the decision half of that flow and
    // neither one checks it.
    const approve = await aiChat.approveToolCall("owner", body);
    const deny = await aiChat.denyToolCall("owner", body);
    expect(approve.status).toBe(200);
    expect(deny.status).toBe(200);

    test.fail();
    expect(
      approve.status,
      "tool-call decisions must be refused when AI access is disabled",
    ).toBe(403);
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
      "docspace",
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

    // Only the built-in server has tools to enumerate, whatever was stored above.
    const system = await aiTools.listSystemTools("owner");
    expect(system.status).toBe(200);
    expect(Object.keys(system.data ?? {})).toEqual(["docspace"]);
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

    const builtInTool = (await aiTools.listSystemTools("owner")).data
      ?.docspace?.[0]?.name;
    expect(builtInTool, "a built-in tool to measure against").toBeTruthy();

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
        toolName: builtInTool!,
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

  // A path-shaped name registers and lists, then cannot be addressed: get answers
  // null, update reports "Server not registered", and the entry survives every
  // attempt to delete it. Only replace-all, which rewrites the whole scope, can
  // clear it — so one mistyped name leaves a permanent entry in an agent's tool
  // configuration.
  //
  // `.` and `..` behave the same way as `a/b`, which is the interesting part: the
  // name is not being resolved as a path (`%2F`, `#`, `?`, `%` and `\` all work
  // fine, see the test below), it is the by-name lookup that cannot see keys the
  // list can. `.` goes one further and answers 405 Method Not Allowed on remove.
  for (const { label, name } of [
    { label: "a slash", name: "autotest/nested-name" },
    { label: "a single dot", name: "." },
    { label: "two dots", name: ".." },
  ]) {
    test(`BUG 82985: POST /api/2.0/ai/tools/add-custom-server - a server named with ${label} can be registered but never read, edited or removed`, async ({
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

      const added = await aiTools.addCustomServer("owner", {
        name,
        config: SERVER_CONFIG,
        agentId,
      });
      expect(added.data?.success, "the name is accepted").toBe(true);
      expect(
        Object.keys(await serverMap(aiTools, agentId)),
        "and listed under that key",
      ).toEqual([name]);

      const read = await aiTools.getCustomServer("owner", name, agentId);
      const updated = await aiTools.updateCustomServer("owner", {
        name,
        config: OTHER_CONFIG,
        agentId,
      });
      const removed = await aiTools.removeCustomServer("owner", {
        name,
        agentId,
      });
      const afterRemove = await serverMap(aiTools, agentId);

      test.fail();
      expect(read.data, "a registered server is readable by name").toEqual(
        SERVER_CONFIG,
      );
      expect(updated.data?.success, "and editable by name").toBe(true);
      expect(removed.status, "and removable by name").toBe(200);
      expect(
        Object.keys(afterRemove),
        "a successful remove empties the scope",
      ).toEqual([]);
    });
  }

  test("POST /api/2.0/ai/tools/add-custom-server - URL and shell punctuation in a name round-trips", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The counterweight to the bug above: nothing about "a name that looks like it
    // could be interpolated somewhere" is broken in general. An already-encoded
    // slash, a fragment, a query separator, a bare percent and a backslash all
    // survive the full add/get/update/remove cycle unchanged — which is what
    // narrows the bug down to `/`, `.` and `..`.
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
      "autotest\\backslash",
      "autotest server",
      "autotest.dotted",
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

  test("BUG 82987: POST /api/2.0/ai/tools/add-custom-server - an emoji in the server name answers 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Every other rejected name is either a soft `{success:false}` or a 400. An
    // emoji is an unhandled failure, and the following read of that name is a 500
    // as well — so the name is stored somewhere the reads cannot cope with. The
    // contract asserted here is only "not a 500": either store it or refuse it.
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
    const read = await aiTools.getCustomServer("owner", name, agentId);

    test.fail();
    expect(added.status, "an emoji name is handled, not a server error").toBe(
      200,
    );
    expect(read.status).toBe(200);
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

  test("BUG 82991: GET /api/2.0/ai/tools/list-system-tools - the catalogue is empty when scoped to an entity", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `entityId` is REQUIRED on this route in the SDK, and supplying it empties
    // the answer: unscoped, 20+ built-in `docspace` tools; scoped to an agent the
    // caller owns, `{}`. Combined with there being no other listing route (every
    // spelling of list-tools / list-server-tools is 404), a client has no way to
    // ask what tools an agent actually has.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Scoped Catalogue Agent",
      profileId,
    });

    const unscoped = await aiTools.listSystemTools("owner");
    expect(
      unscoped.data?.docspace?.length,
      "the unscoped catalogue is the positive control",
    ).toBeGreaterThan(0);

    const scoped = await aiTools.listSystemTools("owner", agentId);

    test.fail();
    expect(scoped.status).toBe(200);
    expect(Object.keys(scoped.data ?? {})).toEqual(["docspace"]);
  });
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

const BUILT_IN_DOC_TOOL = "generate_docx";
/** What the model sees, and what set-disabled's two fields spell out together. */
const BUILT_IN_DOC_TOOL_TOKEN = `docspace_${BUILT_IN_DOC_TOOL}`;

const ASK_FOR_DOCX =
  "Generate a .docx document titled ProbeDoc containing the single sentence 'hello probe'. " +
  `If you have no tool for that, reply with exactly: ${NO_TOOL_SENTINEL}`;

/**
 * Asks for a document in a thread of its own and reports which tools the model
 * reached for. A fresh thread per turn keeps each answer independent of the
 * refusal or the tool call in the one before it.
 */
async function askForDocument(
  aiChat: AiAgentChat,
  chat: { profileId: string; agentId: number; title: string },
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
    message: ASK_FOR_DOCX,
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

    const asked = await askForDocument(aiChat, {
      profileId,
      agentId,
      title: "Built-in tool enabled",
    });

    expect(
      asked.calledTools,
      `the model answered "${asked.reply.slice(0, 120)}"; frames were ${asked.frames.join(", ")}`,
    ).toContain(BUILT_IN_DOC_TOOL_TOKEN);
    // A server-executed tool pauses the stream the same way a host tool does.
    expect(asked.frames).toContain("tool-call-pending");
  });

  test("BUG 83013: PUT /api/2.0/ai/tools/set-disabled - a disabled built-in tool is still offered to the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // set-disabled stores the setting, is-tool-disabled reads it back, and the
    // model is never told: the same prompt still produces the same tool call.
    //
    // Both spellings of the name are disabled, so the finding does not rest on
    // guessing which one the engine matches — the bare `generate_docx` that
    // list-system-tools' own entries are named like, and the full
    // `docspace_generate_docx` token the model sees. Both scopes are written too:
    // the agent's and the portal's.
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
      expect(data?.success, "the tool is disabled").toBe(true);
    }

    // The setting really is in force before the question is asked — otherwise a
    // tool call below would say nothing about disabling.
    const { data: stored } = await aiTools.getDisabledTools("owner", agentId);
    expect(stored?.docspace).toEqual(toolNames);
    for (const toolName of toolNames) {
      const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
        serverType: "docspace",
        toolName,
        agentId,
      });
      expect(isDisabled, `${toolName} reads back as disabled`).toBe(true);
    }

    const asked = await askForDocument(aiChat, {
      profileId,
      agentId,
      title: "Built-in tool disabled",
    });

    test.fail();
    expect(
      asked.calledTools,
      `a disabled tool was called anyway; the model answered "${asked.reply.slice(0, 120)}"`,
    ).not.toContain(BUILT_IN_DOC_TOOL_TOKEN);
  });

  test("PUT /api/2.0/ai/tools/set-disabled - a tool disabled and enabled again is callable", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The closing leg of the cycle, and the one assertion of it that means the
    // same thing before and after the bug above is fixed: whatever disabling
    // does, clearing the list must leave the tool usable.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { profileId, agentId } = await setupChat(
      aiChat,
      "Autotest Re-enabled Tool Agent",
    );

    await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: [BUILT_IN_DOC_TOOL, BUILT_IN_DOC_TOOL_TOKEN],
      agentId,
    });
    const { data: cleared } = await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: [],
      agentId,
    });
    expect(cleared?.success).toBe(true);

    for (const toolName of [BUILT_IN_DOC_TOOL, BUILT_IN_DOC_TOOL_TOKEN]) {
      const { data: isDisabled } = await aiTools.isToolDisabled("owner", {
        serverType: "docspace",
        toolName,
        agentId,
      });
      expect(isDisabled, `${toolName} is enabled again`).toBe(false);
    }

    const asked = await askForDocument(aiChat, {
      profileId,
      agentId,
      title: "Built-in tool re-enabled",
    });

    expect(
      asked.calledTools,
      `the model answered "${asked.reply.slice(0, 120)}"; frames were ${asked.frames.join(", ")}`,
    ).toContain(BUILT_IN_DOC_TOOL_TOKEN);
  });
});
