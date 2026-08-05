import { expect } from "@playwright/test";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiAgentChat, HostTool } from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";

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
//      replace-all route.
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
    expect(toolCalls[0].args).toEqual({ city: "Paris" });
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

  test("BUG XXXXX: POST /api/2.0/ai/ai/approve-tool-call - a structured tool result cannot be resumed", async ({
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

    // The result is stored, so the failure is not in accepting it: the gateway
    // refuses the CONTINUATION request, with
    //   400 invalid request: bind "messages.content" from body: json: cannot
    //   unmarshal object into Go struct field ChatMessage.messages.content
    // and the reply is abandoned half-written.
    expect(AiAgentChat.toolCalls(reply)[0].result).toEqual({
      temperature: "21C",
      conditions: "sunny",
    });

    test.fail();
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
  test("BUG XXXXX: POST /api/2.0/ai/tools/add-custom-server - a server registered for a room is readable by name but never listed", async ({
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

    // It is not in the portal-wide scope either, so it is not simply misfiled.
    const portalWide = await aiTools.listCustomServers("owner");
    expect(portalWide.status).toBe(200);
    expect(Object.keys(portalWide.data)).not.toContain("autotest-room-server");

    const listed = await aiTools.listCustomServers("owner", roomId);
    expect(listed.status).toBe(200);

    test.fail();
    expect(Object.keys(listed.data)).toContain("autotest-room-server");
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

  // OPEN QUESTION — do not turn this into a passing test either way until the
  // developers answer it.
  //
  // Measured 2026-08-05: `entityId` = a folder the Owner owns is refused with
  // 403 on add-custom-server AND on get-custom-server, while the same call for a
  // room succeeds. Whether that is the contract is not ours to decide:
  //
  //   * Chat itself IS available in a folder — threads/create takes a folder id
  //     and the conversation works (chat/chat.spec.ts).
  //   * The tools scope is meant to follow the entity the user is looking at.
  //
  // If both hold, a folder must be able to carry tools and the 403 is a defect;
  // if the per-entity tool scope is deliberately limited to agents and rooms,
  // the 403 is correct and this becomes a negative test. Written as the
  // folder-is-supported case so that answer only has to flip fixme → test, or
  // the assertions to 403.
  test.fixme("POST /api/2.0/ai/tools/add-custom-server - a folder carries its own tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const myDocsId = myFolder.response!.current!.id!;
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: myDocsId,
      createFolder: { title: "Autotest MCP Folder" },
    });
    const folderId = folder.response!.id!;

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

  test("BUG XXXXX: PUT /api/2.0/ai/tools/replace-all-custom-servers - a body without `map` wipes the scope instead of being rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `map` is required by the contract, and the field name is easy to get wrong
    // — the SDK's own model for the neighbouring routes calls this kind of
    // payload `servers`. Sending anything but `map` is not a no-op and not a
    // 400: the scope is emptied, silently, with `{success:true}`.
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

    test.fail();
    expect(status).toBe(400);
    expect(
      Object.keys(after.data),
      "the registered server survives a rejected write",
    ).toEqual(["autotest-keep-me"]);
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
