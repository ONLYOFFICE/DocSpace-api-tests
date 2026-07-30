import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat, AgentRole } from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { ATTACKER_HOST } from "@/src/helpers/ssrf-payloads";
import { ApiSDK, UserType } from "@/src/services/api-sdk";

// Access matrix measured on an agent the member has been invited to:
//
//                        owner  DSAdmin  RoomAdmin  User  Guest  anon
//   list-system-tools      200    200      200      200    200   401
//   list-custom-servers    200    200      200      200    403   401
//   add / remove server    200    200      403      403    403   401
//   set-disabled           200    200      200      200    403   401
//
// So managing MCP servers is admin-only, while toggling individual tools is
// open to any non-guest member.
//
// Validation is mostly soft: bad input comes back as HTTP 200 with
// `{success:false, error:{field, message}}`. Only a missing `config` on add is
// a real 400.

const SERVER_CONFIG = { url: "https://mcp.example.invalid/sse" };

const MEMBER_ROLES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
  { type: "Guest", role: "guest" },
];

async function agentWithMember(apiSdk: ApiSDK, type: UserType) {
  const ownerApi = apiSdk.forRole("owner");
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: "MCP Agent",
    profileId,
  });

  const { data: memberData } = await apiSdk.addAuthenticatedMember(
    "owner",
    type,
  );

  await ownerApi.rooms.setRoomSecurity({
    id: agentId,
    roomInvitationRequest: {
      invitations: [
        {
          id: memberData.response!.id!,
          access: type === "Guest" ? FileShare.Read : FileShare.ContentCreator,
        },
      ],
      notify: false,
    },
  });

  return agentId;
}

test.describe("MCP - Server management permissions", () => {
  for (const { type, role } of MEMBER_ROLES) {
    test(`POST /api/2.0/ai/tools/add-custom-server - ${role} in the agent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
      const agentId = await agentWithMember(apiSdk, type);

      const { data, status } = await aiTools.addCustomServer(role, {
        name: `${role}-server`,
        config: SERVER_CONFIG,
        agentId,
      });

      if (role === "docSpaceAdmin") {
        expect(status).toBe(200);
        expect(data?.success).toBe(true);
      } else {
        // Nothing was registered.
        await apiSdk.authenticateOwner();
        const { data: list } = await aiTools.listCustomServers(
          "owner",
          agentId,
        );
        expect(Object.keys(list)).not.toContain(`${role}-server`);

        expect(status).toBe(403);
      }
    });

    test(`DELETE /api/2.0/ai/tools/remove-custom-server - ${role} in the agent`, async ({
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
        name: "owners-server",
        config: SERVER_CONFIG,
        agentId,
      });

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [
            {
              id: memberData.response!.id!,
              access:
                type === "Guest" ? FileShare.Read : FileShare.ContentCreator,
            },
          ],
          notify: false,
        },
      });

      const { status } = await aiTools.removeCustomServer(role, {
        name: "owners-server",
        agentId,
      });

      await apiSdk.authenticateOwner();
      const { data: list } = await aiTools.listCustomServers("owner", agentId);

      if (role === "docSpaceAdmin") {
        expect(Object.keys(list)).not.toContain("owners-server");
        expect(status).toBe(200);
      } else {
        expect(Object.keys(list)).toContain("owners-server");
        expect(status).toBe(403);
      }
    });
  }
});

test.describe("MCP - Tool toggling permissions", () => {
  for (const { type, role } of MEMBER_ROLES) {
    test(`PUT /api/2.0/ai/tools/set-disabled - ${role} in the agent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
      const agentId = await agentWithMember(apiSdk, type);

      const { data, status } = await aiTools.setDisabledTools(role, {
        serverType: "docspace",
        toolNames: ["delete_file"],
        agentId,
      });

      if (role === "guest") {
        expect(status).toBe(403);
      } else {
        expect(status).toBe(200);
        expect(data?.success).toBe(true);
      }
    });

    test(`GET /api/2.0/ai/tools/list-custom-servers - ${role} in the agent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
      const agentId = await agentWithMember(apiSdk, type);

      const { status } = await aiTools.listCustomServers(role, agentId);

      expect(status).toBe(role === "guest" ? 403 : 200);
    });

    test(`GET /api/2.0/ai/tools/list-system-tools - ${role} reads the catalogue`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
      await apiSdk.addAuthenticatedMember("owner", type);

      const { data, status } = await aiTools.listSystemTools(role);

      expect(status).toBe(200);
      expect((data?.docspace ?? []).length).toBeGreaterThan(0);
    });
  }
});

test.describe("MCP - Anonymous access", () => {
  for (const [label, call] of [
    [
      "list-system-tools",
      (tools: AiTools) => tools.listSystemTools("anonymous"),
    ],
    [
      "list-custom-servers",
      (tools: AiTools) => tools.listCustomServers("anonymous"),
    ],
    [
      "add-custom-server",
      (tools: AiTools) =>
        tools.addCustomServer("anonymous", {
          name: "anon-server",
          config: SERVER_CONFIG,
        }),
    ],
  ] as Array<
    [string, (tools: AiTools) => Promise<{ status: number; error?: string }>]
  >) {
    test(`GET|POST /api/2.0/ai/tools/${label} - Anonymous gets 401`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

      const { status, error } = await call(aiTools);

      expect(error).toBe("Unauthorized");
      expect(status).toBe(401);
    });
  }
});

test.describe("MCP - Custom server validation", () => {
  for (const { name, body, message } of [
    {
      name: "an empty name",
      body: { name: "", config: SERVER_CONFIG },
      message: "Server name is required",
    },
    {
      name: "a missing name",
      body: { config: SERVER_CONFIG },
      message: "Server name is required",
    },
  ]) {
    test(`POST /api/2.0/ai/tools/add-custom-server - rejects ${name}`, async ({
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

      const { data, status } = await aiTools.addCustomServer("owner", {
        ...body,
        agentId,
      });

      // Soft failure: HTTP 200 with success:false.
      expect(data?.success).toBe(false);
      expect(data?.error?.field).toBe("name");
      expect(data?.error?.message).toBe(message);
      expect(status).toBe(200);
    });
  }

  test("POST /api/2.0/ai/tools/add-custom-server - a missing config is a hard 400", async ({
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

    const { status, error } = await aiTools.addCustomServer("owner", {
      name: "no-config",
      agentId,
    });

    expect(error).toBe(
      'No config provided and no portal-level server named "no-config"',
    );
    expect(status).toBe(400);
  });

  test("POST /api/2.0/ai/tools/add-custom-server - rejects a duplicate name", async ({
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
      name: "duplicate",
      config: SERVER_CONFIG,
      agentId,
    });

    const { data, status } = await aiTools.addCustomServer("owner", {
      name: "duplicate",
      config: { url: "https://other.example.invalid/sse" },
      agentId,
    });

    // The original registration must survive the rejected duplicate.
    const { data: existing } = await aiTools.getCustomServer(
      "owner",
      "duplicate",
      agentId,
    );
    expect(existing).toEqual(SERVER_CONFIG);

    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe("Server already registered: duplicate");
    expect(status).toBe(200);
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - rejects an unknown server", async ({
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

    const { data, status } = await aiTools.updateCustomServer("owner", {
      name: "does-not-exist",
      config: SERVER_CONFIG,
      agentId,
    });

    expect(data?.success).toBe(false);
    expect(data?.error?.message).toBe("Server not registered: does-not-exist");
    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/ai/tools/remove-custom-server - removing an unknown server is a silent no-op", async ({
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

    const { data, status } = await aiTools.removeCustomServer("owner", {
      name: "never-existed",
      agentId,
    });

    // Unlike add/update, remove does not report a missing server at all.
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("GET /api/2.0/ai/tools/list-custom-servers - an unknown agent id falls back to the portal scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // entityId is not validated: a bogus one behaves like no entityId at all.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    await aiTools.addCustomServer("owner", {
      name: "portal-server",
      config: SERVER_CONFIG,
    });

    const { data, status } = await aiTools.listCustomServers(
      "owner",
      999999999,
    );

    expect(status).toBe(200);
    expect(Object.keys(data)).toContain("portal-server");
  });
});

test.describe("MCP - Registration does not reach out to the server", () => {
  test("POST /api/2.0/ai/tools/add-custom-server - an unreachable endpoint is stored without a connection attempt", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The old POST /ai/servers validated the endpoint by connecting to it
    // (ThrowIfNotConnectAsync), which made registration a live SSRF egress
    // surface: an unresolvable host produced a connection-failure 400. The new
    // endpoint stores the config as-is and answers success immediately, so a
    // non-resolving .invalid host is accepted. Registration therefore performs
    // no outbound request; any egress now happens at tool-execution time, which
    // this suite does not cover.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "MCP Agent",
      profileId,
    });
    const attackerConfig = { url: `https://${ATTACKER_HOST}/sse` };

    const { data, status } = await aiTools.addCustomServer("owner", {
      name: "attacker-server",
      config: attackerConfig,
      agentId,
    });

    const { data: stored } = await aiTools.getCustomServer(
      "owner",
      "attacker-server",
      agentId,
    );

    expect(stored).toEqual(attackerConfig);
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });
});
