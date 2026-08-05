import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";

// MCP was reshaped. `/ai/servers*` and `/ai/rooms/{roomId}/servers*` are 404;
// custom servers now live under `/ai/tools/*`, keyed by name and scoped either
// to one agent (`entityId`) or portal-wide. Per-tool enable/disable replaced the
// old "set tools on a room server" call. See src/helpers/ai-tools.ts.
//
// NOT covered here, and deliberately so: end-to-end tool execution (the old
// "Built-in DocSpace Server" blocks, including BUG 81131's upload_file case).
// Execution runs through `/ai/ai/approve-tool-call` mid-conversation, which needs
// the model to actually decide to call a tool. That is a separate, heavier piece
// of work and is still an open gap — what the confirmation blocks at the bottom of
// this file do cover is the routes themselves: what they accept, and who may call
// them.

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
// WHAT IS AND IS NOT COVERABLE HERE
//
// The Allow/Deny flow of 16.1 starts with the model deciding to call a tool, and
// the pending confirmation it produces is not something the API can be asked for:
// there is no "list pending tool calls" route, and making a model reliably emit a
// tool call needs a registered MCP server that actually answers. So the positive
// half of 16.1 ("Allow runs the tool", "Deny returns a controlled result to the
// model", "the dialogue continues") and all of 16.2's always-allow propagation
// cannot be driven from the API alone — the always-allow *state* is covered in
// mcp.spec.ts, the flow that consumes it is a gap.
//
// What this file pins is the part 16.1 asks for that is reachable: what these two
// routes do with a confirmation that refers to nothing. The answer is "accept it
// silently", which is worth a test of its own — a decision endpoint that cannot
// tell a real pending call from a fabricated one has no way to enforce the
// "Allow of an unknown request id" and "Allow of someone else's request id" rules.

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
