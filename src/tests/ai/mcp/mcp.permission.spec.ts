import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat, AgentRole } from "@/src/helpers/ai-agent-chat";
import { AiTools, McpMutationResult } from "@/src/helpers/ai-tools";
import { ATTACKER_HOST } from "@/src/helpers/ssrf-payloads";
import { ApiSDK, UserType } from "@/src/services/api-sdk";
import { PaymentApi as PortalPaymentApi } from "@/src/services/payment-api";

// Measured on an agent the member has been invited to (ContentCreator, except
// Guest which tops out at Read). Every one of the twelve `/ai/tools/*` routes
// is covered, for every role:
//
//                        owner  DSAdmin  RoomAdmin  User  Guest  anon
//   list-system-tools      200    200      200      200    200   401
//   list-custom-servers    200    200      200      200    403   401
//   get-custom-server      200    200      200      200    403   401
//   get-disabled           200    200      200      200    403   401
//   is-tool-disabled       200    200      200      200    403   401
//   get-allow-always       200    200      200      200    403   401
//   is-allow-always        200    200      200      200    403   401
//   set-disabled           200    200      200      200    403   401
//   set-allow-always       200    200      200      200    403   401
//   add-custom-server      200    200      403      403    403   401
//   update-custom-server   200    200      403      403    403   401
//   remove-custom-server   200    200      403      403    403   401
//
// So registering MCP servers is admin-only, while reading them and toggling
// individual tools is open to any non-guest member. `list-system-tools` is the
// only route with no membership requirement at all — but it still needs a
// session, so anonymous is 401 across the board.
//
// The Guest column measures "Guest at Read", not "Guest": the agent room caps
// Guests at Read and Read cannot use the agent, so the two cannot be separated
// here.
//
// Validation is mostly soft: bad input comes back as HTTP 200 with
// `{success:false, error:{field, message}}`. Only a missing `config` on add is
// a real 400.

const SERVER_CONFIG = { url: "https://mcp.example.invalid/sse" };
const UPDATED_CONFIG = { url: "https://mcp-updated.example.invalid/sse" };
const OWNERS_SERVER = "owners-server";

const MEMBER_ROLES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
  { type: "Guest", role: "guest" },
];

type Payments = Pick<PortalPaymentApi, "setupPayment" | "makeWalletTopUp">;

async function agentForOwner(apiSdk: ApiSDK, paymentsApi: Payments) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);

  const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: "MCP Agent",
    profileId,
  });

  return { ownerApi, aiTools, agentId };
}

/**
 * One agent, one server the owner already registered on it, and one member of
 * `type` invited in.
 *
 * Ordering rule: `AiTools` issues raw `apiSdk.request` calls, and that shared
 * context's session cookie beats the bearer header — so every owner-side
 * `AiTools` call has to happen before the member authenticates, and
 * `apiSdk.authenticateOwner()` has to run before anything is read back as the
 * owner afterwards. `apiSdk.addMember` posts through the same context and is
 * bound by the same rule.
 *
 * The `forRole` clients are the one exception: their adapter sends
 * `Cookie: ""` on every request (src/utils/playwright-axios-adapter.ts), so
 * `ownerApi.rooms.setRoomSecurity` would still run as the owner even after the
 * member logs in. The invite is issued before authentication anyway — one
 * ordering rule for the whole helper is easier to keep true than two, and a
 * silently misattributed invite would leave the member outside the agent while
 * every assertion below still looked plausible.
 */
async function agentWithMember(
  apiSdk: ApiSDK,
  paymentsApi: Payments,
  type: UserType,
) {
  const { ownerApi, aiTools, agentId } = await agentForOwner(
    apiSdk,
    paymentsApi,
  );

  const { status } = await aiTools.addCustomServer("owner", {
    name: OWNERS_SERVER,
    config: SERVER_CONFIG,
    agentId,
  });
  expect(status, "owner registers the server the matrix reads").toBe(200);

  const { data: memberData, userData } = await apiSdk.addMember("owner", type);

  const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
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
  // Membership is the premise of the whole matrix: an unasserted invite could
  // fail and leave a 403 looking like a permission rule.
  expect(inviteStatus, `owner invites the ${type} into the agent`).toBe(200);

  await apiSdk.authenticateMember(userData, type);

  return { aiTools, agentId };
}

type Call = { status: number; error?: string; data?: unknown };

/**
 * A route that manages the server registry. `verify` runs as the owner and is
 * what separates a real refusal from a 403 returned after the write landed.
 */
type ManageOp = {
  label: string;
  run: (tools: AiTools, role: AgentRole, agentId: number) => Promise<Call>;
  verify: (
    tools: AiTools,
    role: AgentRole,
    agentId: number,
    allowed: boolean,
  ) => Promise<void>;
};

const MANAGE_OPS: ManageOp[] = [
  {
    label: "POST /api/2.0/ai/tools/add-custom-server",
    run: (tools, role, agentId) =>
      tools.addCustomServer(role, {
        name: `${role}-server`,
        config: SERVER_CONFIG,
        agentId,
      }),
    verify: async (tools, role, agentId, allowed) => {
      const { data: list } = await tools.listCustomServers("owner", agentId);
      if (allowed) {
        expect(Object.keys(list)).toContain(`${role}-server`);
      } else {
        expect(Object.keys(list)).not.toContain(`${role}-server`);
      }
    },
  },
  {
    label: "PUT /api/2.0/ai/tools/update-custom-server",
    run: (tools, role, agentId) =>
      tools.updateCustomServer(role, {
        name: OWNERS_SERVER,
        config: UPDATED_CONFIG,
        agentId,
      }),
    verify: async (tools, _role, agentId, allowed) => {
      const { data } = await tools.getCustomServer(
        "owner",
        OWNERS_SERVER,
        agentId,
      );
      expect(data).toEqual(allowed ? UPDATED_CONFIG : SERVER_CONFIG);
    },
  },
  {
    label: "DELETE /api/2.0/ai/tools/remove-custom-server",
    run: (tools, role, agentId) =>
      tools.removeCustomServer(role, { name: OWNERS_SERVER, agentId }),
    verify: async (tools, _role, agentId, allowed) => {
      const { data: list } = await tools.listCustomServers("owner", agentId);
      if (allowed) {
        expect(Object.keys(list)).not.toContain(OWNERS_SERVER);
      } else {
        expect(Object.keys(list)).toContain(OWNERS_SERVER);
      }
    },
  },
];

/**
 * A route any invited non-guest may call. `expectAllowed` asserts the payload
 * a fresh member sees — the disabled/allow-always state is per user, so a
 * member starts from an empty one even on an agent the owner has configured.
 */
type MemberOp = {
  label: string;
  run: (tools: AiTools, role: AgentRole, agentId: number) => Promise<Call>;
  expectAllowed: (
    call: Call,
    tools: AiTools,
    role: AgentRole,
    agentId: number,
  ) => Promise<void>;
};

const MEMBER_OPS: MemberOp[] = [
  {
    label: "GET /api/2.0/ai/tools/list-custom-servers",
    run: (tools, role, agentId) => tools.listCustomServers(role, agentId),
    expectAllowed: async ({ data }) => {
      expect(Object.keys(data as object)).toContain(OWNERS_SERVER);
    },
  },
  {
    label: "GET /api/2.0/ai/tools/get-custom-server",
    run: (tools, role, agentId) =>
      tools.getCustomServer(role, OWNERS_SERVER, agentId),
    expectAllowed: async ({ data }) => {
      expect(data).toEqual(SERVER_CONFIG);
    },
  },
  {
    label: "GET /api/2.0/ai/tools/get-disabled",
    run: (tools, role, agentId) => tools.getDisabledTools(role, agentId),
    expectAllowed: async ({ data }) => {
      expect(data).toEqual({});
    },
  },
  {
    label: "GET /api/2.0/ai/tools/is-tool-disabled",
    run: (tools, role, agentId) =>
      tools.isToolDisabled(role, {
        serverType: "docspace",
        toolName: "delete_file",
        agentId,
      }),
    expectAllowed: async ({ data }) => {
      expect(data).toBe(false);
    },
  },
  {
    label: "GET /api/2.0/ai/tools/get-allow-always",
    run: (tools, role, agentId) => tools.getAllowAlways(role, agentId),
    expectAllowed: async ({ data }) => {
      expect(data).toEqual([]);
    },
  },
  {
    label: "GET /api/2.0/ai/tools/is-allow-always",
    run: (tools, role, agentId) =>
      tools.isAllowAlways(role, {
        serverType: "docspace",
        toolName: "delete_file",
        agentId,
      }),
    expectAllowed: async ({ data }) => {
      expect(data).toBe(false);
    },
  },
  {
    label: "PUT /api/2.0/ai/tools/set-disabled",
    run: (tools, role, agentId) =>
      tools.setDisabledTools(role, {
        serverType: "docspace",
        toolNames: ["delete_file"],
        agentId,
      }),
    expectAllowed: async ({ data }, tools, role, agentId) => {
      expect((data as McpMutationResult)?.success).toBe(true);
      const { data: disabled } = await tools.isToolDisabled(role, {
        serverType: "docspace",
        toolName: "delete_file",
        agentId,
      });
      expect(disabled).toBe(true);
    },
  },
  {
    label: "PUT /api/2.0/ai/tools/set-allow-always",
    run: (tools, role, agentId) =>
      tools.setAllowAlways(role, {
        serverType: "docspace",
        toolName: "delete_file",
        value: true,
        agentId,
      }),
    expectAllowed: async ({ data }, tools, role, agentId) => {
      expect((data as McpMutationResult)?.success).toBe(true);
      const { data: allowed } = await tools.isAllowAlways(role, {
        serverType: "docspace",
        toolName: "delete_file",
        agentId,
      });
      expect(allowed).toBe(true);
    },
  },
];

test.describe("MCP - Server management permissions", () => {
  for (const { type, role } of MEMBER_ROLES) {
    for (const op of MANAGE_OPS) {
      test(`${op.label} - ${role} in the agent`, async ({
        apiSdk,
        paymentsApi,
      }) => {
        const { aiTools, agentId } = await agentWithMember(
          apiSdk,
          paymentsApi,
          type,
        );
        const allowed = role === "docSpaceAdmin";

        const { status, error, data } = await op.run(aiTools, role, agentId);

        // Read back as the owner first: a 403 that still wrote is the failure
        // mode a status-only assertion cannot see.
        await apiSdk.authenticateOwner();
        await op.verify(aiTools, role, agentId, allowed);

        if (allowed) {
          // These routes report soft failures as 200 + success:false, so the
          // status alone does not say the write was accepted.
          expect((data as McpMutationResult)?.success).toBe(true);
          expect(status).toBe(200);
        } else {
          expect(error).toBe("Forbidden");
          expect(status).toBe(403);
        }
      });
    }
  }
});

test.describe("MCP - Tool state permissions", () => {
  for (const { type, role } of MEMBER_ROLES) {
    for (const op of MEMBER_OPS) {
      test(`${op.label} - ${role} in the agent`, async ({
        apiSdk,
        paymentsApi,
      }) => {
        const { aiTools, agentId } = await agentWithMember(
          apiSdk,
          paymentsApi,
          type,
        );
        const allowed = role !== "guest";

        const call = await op.run(aiTools, role, agentId);

        if (allowed) {
          expect(call.status).toBe(200);
          await op.expectAllowed(call, aiTools, role, agentId);
        } else {
          // No side-effect check is possible for the refused writes: the
          // disabled / allow-always state is per user and the Guest is denied
          // the matching read as well, so there is nothing the owner could
          // look at.
          expect(call.error).toBe("Forbidden");
          expect(call.status).toBe(403);
        }
      });
    }

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
  // Every route, not a sample: `list-system-tools` needs no membership, so it
  // is the one most likely to have been left unauthenticated by accident.
  const ANONYMOUS_CALLS: Array<[string, (tools: AiTools) => Promise<Call>]> = [
    ["list-system-tools", (t) => t.listSystemTools("anonymous")],
    ["list-custom-servers", (t) => t.listCustomServers("anonymous")],
    ["get-custom-server", (t) => t.getCustomServer("anonymous", OWNERS_SERVER)],
    ["get-disabled", (t) => t.getDisabledTools("anonymous")],
    [
      "is-tool-disabled",
      (t) =>
        t.isToolDisabled("anonymous", {
          serverType: "docspace",
          toolName: "delete_file",
        }),
    ],
    ["get-allow-always", (t) => t.getAllowAlways("anonymous")],
    [
      "is-allow-always",
      (t) =>
        t.isAllowAlways("anonymous", {
          serverType: "docspace",
          toolName: "delete_file",
        }),
    ],
    [
      "set-disabled",
      (t) =>
        t.setDisabledTools("anonymous", {
          serverType: "docspace",
          toolNames: ["delete_file"],
        }),
    ],
    [
      "set-allow-always",
      (t) =>
        t.setAllowAlways("anonymous", {
          serverType: "docspace",
          toolName: "delete_file",
          value: true,
        }),
    ],
    [
      "add-custom-server",
      (t) =>
        t.addCustomServer("anonymous", {
          name: "anon-server",
          config: SERVER_CONFIG,
        }),
    ],
    [
      "update-custom-server",
      (t) =>
        t.updateCustomServer("anonymous", {
          name: OWNERS_SERVER,
          config: UPDATED_CONFIG,
        }),
    ],
    [
      "remove-custom-server",
      (t) => t.removeCustomServer("anonymous", { name: OWNERS_SERVER }),
    ],
  ];

  for (const [label, call] of ANONYMOUS_CALLS) {
    test(`/api/2.0/ai/tools/${label} - Anonymous gets 401`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
      // A portal-level registration, so the routes that name a server are
      // refused for the session and not for a missing resource.
      await aiTools.addCustomServer("owner", {
        name: OWNERS_SERVER,
        config: SERVER_CONFIG,
      });

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
      const { aiTools, agentId } = await agentForOwner(apiSdk, paymentsApi);

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
    const { aiTools, agentId } = await agentForOwner(apiSdk, paymentsApi);

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
    const { aiTools, agentId } = await agentForOwner(apiSdk, paymentsApi);

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
    const { aiTools, agentId } = await agentForOwner(apiSdk, paymentsApi);

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
    const { aiTools, agentId } = await agentForOwner(apiSdk, paymentsApi);

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
    const { aiTools, agentId } = await agentForOwner(apiSdk, paymentsApi);
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
