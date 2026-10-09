import { expect } from "@playwright/test";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiAgentChat, inviteToAgent } from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { ApiSDK, UserType } from "@/src/services/api-sdk";

// Isolation, revocation, credential exposure and AI-switch persistence for the
// `/ai/tools/*` routes. The role-by-route matrix itself is in
// mcp.permission.spec.ts and the per-route AI-off transitions are in
// mcp.ai-disabled.spec.ts; neither is repeated here.
//
// Measured 2026-10-09:
//
//   * A User who was never invited to an agent is 403 on every read and write that
//     names it. Reads answer `{"error":"Forbidden"}`; writes answer
//     `{"error":"Entity \"<id>\" is not accessible"}` — a different body, same status.
//   * `list-system-tools?entityId=<agent the caller is not in>` answers 200 with the
//     PORTAL catalogue, not the agent's.
//   * Without `entityId` the portal scope is open to every non-Guest: reads 200,
//     `set-disabled` / `set-allow-always` 200 (stored per user), registry writes 403.
//   * `get-disabled` / `get-allow-always` are per user.
//
// Ordering: every owner-side `AiTools` call goes first. `AiTools` runs on the
// shared request context, whose session cookie beats the bearer header once a
// member has authenticated, so the owner has to be re-authenticated before state is
// read back as the owner.

const SECRET = "AUTOTEST-SECRET-TOKEN-4711";
const HOST = "secret-host-4711.example.invalid";
const SECRET_CONFIG = {
  url: `https://${HOST}/sse`,
  headers: { Authorization: `Bearer ${SECRET}` },
};
const PLAIN_CONFIG = { url: "https://plain.example.invalid/sse" };

type Payments = Parameters<typeof enableAiGateway>[0];

/** Owner, agent, one server with credentials on the agent and one on the portal. */
async function ownerWithServers(apiSdk: ApiSDK, paymentsApi: Payments) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);

  const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: "Tools API Permission Agent",
    profileId,
  });

  for (const [name, scope] of [
    ["agent-secret", agentId],
    ["portal-secret", undefined],
  ] as const) {
    const { data } = await aiTools.addCustomServer("owner", {
      name,
      config: SECRET_CONFIG,
      agentId: scope,
    });
    expect(data?.success, `registering ${name}`).toBe(true);
  }
  return { ownerApi, aiTools, aiChat, agentId };
}

async function ownersState(aiTools: AiTools, agentId: number) {
  const read = async <T>(
    call: Promise<{ status: number; data: T | undefined }>,
    label: string,
  ) => {
    const { status, data } = await call;
    expect(status, label).toBe(200);
    return data;
  };
  return {
    agentServers: await read(
      aiTools.listCustomServers("owner", agentId),
      "agent servers",
    ),
    portalServers: await read(
      aiTools.listCustomServers("owner"),
      "portal servers",
    ),
    agentDisabled: await read(
      aiTools.getDisabledTools("owner", agentId),
      "agent disabled",
    ),
    portalDisabled: await read(
      aiTools.getDisabledTools("owner"),
      "portal disabled",
    ),
    agentAllowed: await read(
      aiTools.getAllowAlways("owner", agentId),
      "agent allowed",
    ),
    portalAllowed: await read(
      aiTools.getAllowAlways("owner"),
      "portal allowed",
    ),
  };
}

async function stageOwnersSettings(aiTools: AiTools, agentId: number) {
  for (const [serverType, scope] of [
    ["agent-secret", agentId],
    ["portal-secret", undefined],
  ] as const) {
    const disabled = await aiTools.setDisabledTools("owner", {
      serverType,
      toolNames: ["owner-disabled"],
      agentId: scope,
    });
    expect(disabled.data?.success, `disable under ${serverType}`).toBe(true);
    const allowed = await aiTools.setAllowAlways("owner", {
      serverType,
      toolName: "owner-allowed",
      value: true,
      agentId: scope,
    });
    expect(allowed.data?.success, `allow under ${serverType}`).toBe(true);
  }
}

/** The "valid values: …" tail of an unknown-serverType 400 (the name the caller sent is echoed before it). */
function validValues(text: string) {
  return text.split("valid values:")[1] ?? "";
}

async function addUser(apiSdk: ApiSDK, type: UserType) {
  const { data, userData } = await apiSdk.addMember("owner", type);
  return { userId: data.response!.id!, userData };
}

// ---------------------------------------------------------------------------

test.describe("ToolsApi permissions - a user who was never invited to the agent", () => {
  test("every /ai/tools route that names the agent is a 403 for an outsider, the body carries no configuration, and nothing the owner stored moves", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, aiChat, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    await stageOwnersSettings(aiTools, agentId);
    const before = await ownersState(aiTools, agentId);
    const { userId, userData } = await addUser(apiSdk, "User");
    await apiSdk.authenticateMember(userData, "User");
    await aiChat.expectActingAs("user", userId, "the outsider");

    const entityId = String(agentId);
    const q = `?entityId=${entityId}`;
    const calls: Array<[string, Promise<{ status: number; text: string }>]> = [
      [
        "list-custom-servers",
        aiTools.raw("user", "get", "list-custom-servers", undefined, q),
      ],
      [
        "get-custom-server",
        aiTools.raw(
          "user",
          "get",
          "get-custom-server",
          undefined,
          `?name=agent-secret&entityId=${entityId}`,
        ),
      ],
      [
        "add-custom-server",
        aiTools.raw("user", "post", "add-custom-server", {
          name: "outsider",
          config: PLAIN_CONFIG,
          entityId,
        }),
      ],
      [
        "update-custom-server",
        aiTools.raw("user", "put", "update-custom-server", {
          name: "agent-secret",
          config: PLAIN_CONFIG,
          entityId,
        }),
      ],
      [
        "remove-custom-server",
        aiTools.raw("user", "delete", "remove-custom-server", {
          name: "agent-secret",
          entityId,
        }),
      ],
      [
        "replace-all-custom-servers",
        aiTools.raw("user", "put", "replace-all-custom-servers", {
          map: { outsider: PLAIN_CONFIG },
          entityId,
        }),
      ],
      [
        "get-disabled",
        aiTools.raw("user", "get", "get-disabled", undefined, q),
      ],
      [
        "set-disabled",
        aiTools.raw("user", "put", "set-disabled", {
          serverType: "agent-secret",
          toolNames: ["x"],
          entityId,
        }),
      ],
      [
        "is-tool-disabled",
        aiTools.raw(
          "user",
          "get",
          "is-tool-disabled",
          undefined,
          `?serverType=agent-secret&toolName=owner-disabled&entityId=${entityId}`,
        ),
      ],
      [
        "get-allow-always",
        aiTools.raw("user", "get", "get-allow-always", undefined, q),
      ],
      [
        "set-allow-always",
        aiTools.raw("user", "put", "set-allow-always", {
          serverType: "agent-secret",
          toolName: "x",
          value: true,
          entityId,
        }),
      ],
      [
        "is-allow-always",
        aiTools.raw(
          "user",
          "get",
          "is-allow-always",
          undefined,
          `?serverType=agent-secret&toolName=owner-allowed&entityId=${entityId}`,
        ),
      ],
    ];
    const settled = await Promise.all(calls.map(([, call]) => call));

    // The catalogue needs no membership, so it must answer for the PORTAL, never
    // for the agent the caller is not in.
    const catalogue = await aiTools.listSystemTools("user", agentId);

    await apiSdk.authenticateOwner();
    expect(
      await ownersState(aiTools, agentId),
      "the outsider changed nothing",
    ).toEqual(before);

    calls.forEach(([label], index) => {
      const { status, text } = settled[index];
      expect(status, label).toBe(403);
      expect(
        text,
        `${label}: the refusal must not carry the config`,
      ).not.toContain(SECRET);
      expect(text, `${label}: nor the endpoint`).not.toContain(HOST);
      expect(text, `${label}: nor a server name`).not.toContain("agent-secret");
    });

    expect(catalogue.status).toBe(200);
    expect(
      Object.keys(catalogue.data?.groups ?? {}),
      "the agent's servers are not enumerated for an outsider",
    ).not.toContain("agent-secret");
    expect(JSON.stringify(catalogue.data)).not.toContain(SECRET);
  });
});

test.describe("ToolsApi permissions - credentials in a stored config", () => {
  test("BUG XXXXX: GET /api/2.0/ai/tools/get-custom-server, list-custom-servers - a plain User is not handed the Authorization header an admin stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, aiChat, ownerApi, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    // Two plain Users, both created before either authenticates: one invited to
    // the agent, one never invited to anything.
    const invited = await addUser(apiSdk, "User");
    const outsider = await addUser(apiSdk, "User");
    await inviteToAgent(
      ownerApi.rooms,
      agentId,
      invited.userId,
      FileShare.ContentCreator,
    );

    const exposed: string[] = [];
    const check = (label: string, call: { status: number; text: string }) => {
      // Booleans only: a failure must not print the response body.
      expect(call.status, label).toBe(200);
      if (call.text.includes(SECRET)) exposed.push(label);
    };

    await apiSdk.authenticateMember(invited.userData, "User");
    await aiChat.expectActingAs("user", invited.userId, "the invited User");
    check(
      "invited User, get agent server",
      await aiTools.getCustomServer("user", "agent-secret", agentId),
    );
    check(
      "invited User, list agent servers",
      await aiTools.raw(
        "user",
        "get",
        "list-custom-servers",
        undefined,
        `?entityId=${agentId}`,
      ),
    );
    check(
      "invited User, get portal server",
      await aiTools.getCustomServer("user", "portal-secret"),
    );

    await apiSdk.authenticateMember(outsider.userData, "User");
    await aiChat.expectActingAs("user", outsider.userId, "the uninvited User");
    check(
      "uninvited User, get portal server",
      await aiTools.getCustomServer("user", "portal-secret"),
    );
    check(
      "uninvited User, list portal servers",
      await aiTools.raw("user", "get", "list-custom-servers"),
    );

    // Measured: all five are 200 and carry `headers.Authorization` verbatim.
    // Registering a server is admin-only, but the credential stored with it is
    // readable by any invited non-Guest and, at portal scope, by any User at all.
    // Whether a read response should mask credentials is the product's call.
    expect(exposed, "reads that returned the stored credential").toEqual([]);
  });
});

test.describe("ToolsApi permissions - one user's settings and another's", () => {
  test("get-disabled, get-allow-always - an invited User starts empty, writes their own, and neither side sees the other's, at agent and portal scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, aiChat, ownerApi, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    await stageOwnersSettings(aiTools, agentId);
    const { userId, userData } = await addUser(apiSdk, "User");
    await inviteToAgent(
      ownerApi.rooms,
      agentId,
      userId,
      FileShare.ContentCreator,
    );
    await apiSdk.authenticateMember(userData, "User");
    await aiChat.expectActingAs("user", userId, "the User");

    expect(
      (await aiTools.getDisabledTools("user", agentId)).data,
      "the owner's disabled list is not the member's",
    ).toEqual({});
    expect((await aiTools.getAllowAlways("user", agentId)).data).toEqual([]);

    for (const [scope, serverType] of [
      [agentId, "agent-secret"],
      [undefined, "portal-secret"],
    ] as const) {
      const disabled = await aiTools.setDisabledTools("user", {
        serverType,
        toolNames: ["user-disabled"],
        agentId: scope,
      });
      expect(disabled.status, `${serverType} disable`).toBe(200);
      expect(disabled.data?.success).toBe(true);
      const allowed = await aiTools.setAllowAlways("user", {
        serverType,
        toolName: "user-allowed",
        value: true,
        agentId: scope,
      });
      expect(allowed.status, `${serverType} allow`).toBe(200);
      expect(allowed.data?.success).toBe(true);

      expect((await aiTools.getDisabledTools("user", scope)).data).toEqual({
        [serverType]: ["user-disabled"],
      });
      expect((await aiTools.getAllowAlways("user", scope)).data).toEqual([
        `${serverType}_user-allowed`,
      ]);
    }

    await apiSdk.authenticateOwner();
    await aiChat.expectNotActingAs("user", userId, "the member");
    for (const [scope, serverType] of [
      [agentId, "agent-secret"],
      [undefined, "portal-secret"],
    ] as const) {
      expect((await aiTools.getDisabledTools("owner", scope)).data).toEqual({
        [serverType]: ["owner-disabled"],
      });
      expect((await aiTools.getAllowAlways("owner", scope)).data).toEqual([
        `${serverType}_owner-allowed`,
      ]);
      expect(
        (
          await aiTools.isToolDisabled("owner", {
            serverType,
            toolName: "user-disabled",
            agentId: scope,
          })
        ).data,
        "the member's disable does not reach the owner",
      ).toBe(false);
    }
  });

  test("set-disabled, set-allow-always, add-custom-server - at portal scope a User and a RoomAdmin may keep their own tool settings but not touch the registry", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, aiChat, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    const before = await ownersState(aiTools, agentId);
    const { userId, userData } = await addUser(apiSdk, "User");
    await apiSdk.authenticateMember(userData, "User");
    await aiChat.expectActingAs("user", userId, "the User");

    const write = await aiTools.setDisabledTools("user", {
      serverType: "portal-secret",
      toolNames: ["t"],
    });
    expect(write.status).toBe(200);
    expect(write.data?.success).toBe(true);
    expect((await aiTools.getDisabledTools("user")).data).toEqual({
      "portal-secret": ["t"],
    });

    const add = await aiTools.addCustomServer("user", {
      name: "user-registered",
      config: PLAIN_CONFIG,
    });
    const update = await aiTools.updateCustomServer("user", {
      name: "portal-secret",
      config: PLAIN_CONFIG,
    });
    const remove = await aiTools.removeCustomServer("user", {
      name: "portal-secret",
    });
    const replace = await aiTools.replaceAllCustomServers("user", {
      map: { x: PLAIN_CONFIG },
    });

    await apiSdk.authenticateOwner();
    expect(
      await ownersState(aiTools, agentId),
      "refused registry writes and the user's own settings left the owner's state alone",
    ).toEqual(before);
    for (const [label, call] of [
      ["add", add],
      ["update", update],
      ["remove", remove],
      ["replace-all", replace],
    ] as const) {
      expect(call.status, label).toBe(403);
      expect(call.error, label).toBe("Forbidden");
    }
  });

  test("every /ai/tools route except list-system-tools is a 403 for a Guest at portal scope too, and the owner's state is untouched", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, aiChat, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    await stageOwnersSettings(aiTools, agentId);
    const before = await ownersState(aiTools, agentId);
    const { userId, userData } = await addUser(apiSdk, "Guest");
    await apiSdk.authenticateMember(userData, "Guest");
    await aiChat.expectActingAs("guest", userId, "the Guest");

    const calls: Array<[string, Promise<{ status: number; text: string }>]> = [
      [
        "list-custom-servers",
        aiTools.raw("guest", "get", "list-custom-servers"),
      ],
      [
        "get-custom-server",
        aiTools.raw(
          "guest",
          "get",
          "get-custom-server",
          undefined,
          "?name=portal-secret",
        ),
      ],
      [
        "add-custom-server",
        aiTools.raw("guest", "post", "add-custom-server", {
          name: "g",
          config: PLAIN_CONFIG,
        }),
      ],
      [
        "update-custom-server",
        aiTools.raw("guest", "put", "update-custom-server", {
          name: "portal-secret",
          config: PLAIN_CONFIG,
        }),
      ],
      [
        "remove-custom-server",
        aiTools.raw("guest", "delete", "remove-custom-server", {
          name: "portal-secret",
        }),
      ],
      [
        "replace-all-custom-servers",
        aiTools.raw("guest", "put", "replace-all-custom-servers", {
          map: { g: PLAIN_CONFIG },
        }),
      ],
      ["get-disabled", aiTools.raw("guest", "get", "get-disabled")],
      [
        "set-disabled",
        aiTools.raw("guest", "put", "set-disabled", {
          serverType: "web-search",
          toolNames: ["g"],
        }),
      ],
      [
        "is-tool-disabled",
        aiTools.raw(
          "guest",
          "get",
          "is-tool-disabled",
          undefined,
          "?serverType=portal-secret&toolName=owner-disabled",
        ),
      ],
      ["get-allow-always", aiTools.raw("guest", "get", "get-allow-always")],
      [
        "set-allow-always",
        aiTools.raw("guest", "put", "set-allow-always", {
          serverType: "portal-secret",
          toolName: "g",
          value: true,
        }),
      ],
      [
        "is-allow-always",
        aiTools.raw(
          "guest",
          "get",
          "is-allow-always",
          undefined,
          "?serverType=portal-secret&toolName=owner-allowed",
        ),
      ],
    ];
    const settled = await Promise.all(calls.map(([, call]) => call));
    const catalogue = await aiTools.listSystemTools("guest");

    await apiSdk.authenticateOwner();
    expect(await ownersState(aiTools, agentId)).toEqual(before);
    calls.forEach(([label], index) => {
      expect(settled[index].status, label).toBe(403);
      expect(settled[index].text, label).not.toContain(SECRET);
    });
    expect(catalogue.status).toBe(200);
  });
});

test.describe("ToolsApi permissions - access to the agent is withdrawn", () => {
  test("a removed member is refused on read and write, their refused write lands nowhere, and re-inviting restores exactly what they had", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, aiChat, ownerApi, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    const { userId, userData } = await addUser(apiSdk, "RoomAdmin");
    await inviteToAgent(
      ownerApi.rooms,
      agentId,
      userId,
      FileShare.ContentCreator,
    );
    await apiSdk.authenticateMember(userData, "RoomAdmin");
    await aiChat.expectActingAs("roomAdmin", userId, "the RoomAdmin");

    const mine = await aiTools.setDisabledTools("roomAdmin", {
      serverType: "agent-secret",
      toolNames: ["mine"],
      agentId,
    });
    expect(
      mine.data?.success,
      "the member's own setting while still a member",
    ).toBe(true);
    const stillMember = await aiTools.getCustomServer(
      "roomAdmin",
      "agent-secret",
      agentId,
    );
    expect(stillMember.status, "control: access before the removal").toBe(200);

    // The owner acts through the SDK client, which carries its own token.
    const revoked = await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.None }],
        notify: false,
      },
    });
    expect(revoked.status, "removing the member from the agent").toBe(200);

    const entityId = String(agentId);
    const refused: Array<[string, { status: number; text: string }]> = [
      [
        "list",
        await aiTools.raw(
          "roomAdmin",
          "get",
          "list-custom-servers",
          undefined,
          `?entityId=${entityId}`,
        ),
      ],
      [
        "get",
        await aiTools.raw(
          "roomAdmin",
          "get",
          "get-custom-server",
          undefined,
          `?name=agent-secret&entityId=${entityId}`,
        ),
      ],
      [
        "get-disabled",
        await aiTools.raw(
          "roomAdmin",
          "get",
          "get-disabled",
          undefined,
          `?entityId=${entityId}`,
        ),
      ],
      [
        "set-disabled",
        await aiTools.raw("roomAdmin", "put", "set-disabled", {
          serverType: "agent-secret",
          toolNames: ["after-removal"],
          entityId,
        }),
      ],
      [
        "get-allow-always",
        await aiTools.raw(
          "roomAdmin",
          "get",
          "get-allow-always",
          undefined,
          `?entityId=${entityId}`,
        ),
      ],
      [
        "set-allow-always",
        await aiTools.raw("roomAdmin", "put", "set-allow-always", {
          serverType: "agent-secret",
          toolName: "after-removal",
          value: true,
          entityId,
        }),
      ],
      [
        "add",
        await aiTools.raw("roomAdmin", "post", "add-custom-server", {
          name: "after-removal",
          config: PLAIN_CONFIG,
          entityId,
        }),
      ],
    ];
    for (const [label, call] of refused) {
      expect(call.status, label).toBe(403);
      expect(call.text, label).not.toContain(SECRET);
    }

    await apiSdk.authenticateOwner();
    expect(await ownersState(aiTools, agentId)).toMatchObject({
      agentServers: { "agent-secret": SECRET_CONFIG },
    });
    await inviteToAgent(
      ownerApi.rooms,
      agentId,
      userId,
      FileShare.ContentCreator,
    );
    await apiSdk.authenticateMember(userData, "RoomAdmin");
    await aiChat.expectActingAs(
      "roomAdmin",
      userId,
      "the re-invited RoomAdmin",
    );

    expect(
      (await aiTools.getDisabledTools("roomAdmin", agentId)).data,
      "only the write made while a member survives",
    ).toEqual({ "agent-secret": ["mine"] });
    expect((await aiTools.getAllowAlways("roomAdmin", agentId)).data).toEqual(
      [],
    );
    await apiSdk.authenticateOwner();
    expect(
      Object.keys((await aiTools.listCustomServers("owner", agentId)).data),
      "the refused add registered nothing",
    ).toEqual(["agent-secret"]);
  });
});

test.describe("ToolsApi - the portal AI switch off and on again", () => {
  test("nothing stored under /ai/tools is lost to, or changed by, an off period in which every route is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, ownerApi, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    await stageOwnersSettings(aiTools, agentId);
    const before = await ownersState(aiTools, agentId);
    expect(Object.keys(before.agentServers ?? {})).toEqual(["agent-secret"]);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.writeStatus).toBe(200);
    expect(off.enabled, "the switch really is off").toBe(false);

    const entityId = String(agentId);
    const q = `?entityId=${entityId}`;
    const refused: Array<
      [string, Promise<{ status: number; text: string; error?: string }>]
    > = [
      [
        "list-custom-servers",
        aiTools.raw("owner", "get", "list-custom-servers", undefined, q),
      ],
      [
        "get-custom-server",
        aiTools.raw(
          "owner",
          "get",
          "get-custom-server",
          undefined,
          `?name=agent-secret&entityId=${entityId}`,
        ),
      ],
      [
        "add-custom-server",
        aiTools.raw("owner", "post", "add-custom-server", {
          name: "while-off",
          config: PLAIN_CONFIG,
          entityId,
        }),
      ],
      [
        "update-custom-server",
        aiTools.raw("owner", "put", "update-custom-server", {
          name: "agent-secret",
          config: PLAIN_CONFIG,
          entityId,
        }),
      ],
      [
        "remove-custom-server",
        aiTools.raw("owner", "delete", "remove-custom-server", {
          name: "agent-secret",
          entityId,
        }),
      ],
      [
        "replace-all-custom-servers",
        aiTools.raw("owner", "put", "replace-all-custom-servers", {
          map: {},
          entityId,
        }),
      ],
      [
        "get-disabled",
        aiTools.raw("owner", "get", "get-disabled", undefined, q),
      ],
      [
        "set-disabled",
        aiTools.raw("owner", "put", "set-disabled", {
          serverType: "web-search",
          toolNames: [],
          entityId,
        }),
      ],
      [
        "is-tool-disabled",
        aiTools.raw(
          "owner",
          "get",
          "is-tool-disabled",
          undefined,
          `?serverType=agent-secret&toolName=owner-disabled&entityId=${entityId}`,
        ),
      ],
      [
        "get-allow-always",
        aiTools.raw("owner", "get", "get-allow-always", undefined, q),
      ],
      [
        "set-allow-always",
        aiTools.raw("owner", "put", "set-allow-always", {
          serverType: "agent-secret",
          toolName: "owner-allowed",
          value: false,
          entityId,
        }),
      ],
      [
        "is-allow-always",
        aiTools.raw(
          "owner",
          "get",
          "is-allow-always",
          undefined,
          `?serverType=agent-secret&toolName=owner-allowed&entityId=${entityId}`,
        ),
      ],
    ];
    const settled = await Promise.all(refused.map(([, call]) => call));
    const catalogue = await aiTools.listSystemTools("owner");

    refused.forEach(([label], index) => {
      expect(settled[index].status, label).toBe(403);
      expect(settled[index].error, label).toBe("Forbidden");
      expect(settled[index].text, label).not.toContain(SECRET);
    });
    expect(
      catalogue.status,
      "the catalogue is the one route AI-off does not gate",
    ).toBe(200);

    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.writeStatus).toBe(200);
    expect(on.enabled, "the switch really is back on").toBe(true);

    expect(
      await ownersState(aiTools, agentId),
      "servers, disabled lists and approvals all survived, and no refused write landed",
    ).toEqual(before);
  });
});

test.describe("ToolsApi - the order of the gate and the serverType check", () => {
  test("BUG XXXXX: PUT /api/2.0/ai/tools/set-disabled - with AI access off, a registered custom server as serverType is a 403 like every other tools write", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, ownerApi, agentId } = await ownerWithServers(
      apiSdk,
      paymentsApi,
    );
    const control = await aiTools.setDisabledTools("owner", {
      serverType: "agent-secret",
      toolNames: ["control"],
      agentId,
    });
    expect(control.data?.success, "control: the same write with AI on").toBe(
      true,
    );

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);
    const refused = await aiTools.setDisabledTools("owner", {
      serverType: "agent-secret",
      toolNames: ["while-off"],
      agentId,
    });
    const unknown = await aiTools.raw("owner", "put", "set-disabled", {
      serverType: "no-such-server",
      toolNames: ["while-off"],
      entityId: String(agentId),
    });
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled).toBe(true);

    const { data } = await aiTools.getDisabledTools("owner", agentId);
    expect(data).toEqual({ "agent-secret": ["control"] });
    // The wrong status is the whole defect: the refusal reveals nothing about the
    // registry (it names only the built-in types, and reads the same for a server
    // that was never registered).
    expect(validValues(refused.text)).not.toContain("agent-secret");
    expect(validValues(refused.text)).not.toContain("portal-secret");
    expect(refused.text.replace("agent-secret", "X")).toBe(
      unknown.text.replace("no-such-server", "X"),
    );
    // Measured: 400 `unknown serverType "agent-secret"; valid values: docspace, …`
    // — with AI off the registry reads as empty, and the serverType check runs
    // before the gate that answers 403 for a built-in serverType.
    expect(refused.status).toBe(403);
  });

  test("BUG XXXXX: PUT /api/2.0/ai/tools/set-disabled - a Guest naming a registered custom server is a 403, not a 400 that lists the valid values", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, aiChat } = await ownerWithServers(apiSdk, paymentsApi);
    const { userId, userData } = await addUser(apiSdk, "Guest");
    await apiSdk.authenticateMember(userData, "Guest");
    await aiChat.expectActingAs("guest", userId, "the Guest");

    const refused = await aiTools.setDisabledTools("guest", {
      serverType: "portal-secret",
      toolNames: ["g"],
    });
    const unknown = await aiTools.raw("guest", "put", "set-disabled", {
      serverType: "no-such-server",
      toolNames: ["g"],
    });

    // The wrong status is the whole defect: the 400 names only the built-in
    // types and reads the same for a server that was never registered, so it is
    // not an oracle for the registry.
    expect(validValues(refused.text)).not.toContain("agent-secret");
    expect(validValues(refused.text)).not.toContain("portal-secret");
    expect(refused.text.replace("portal-secret", "X")).toBe(
      unknown.text.replace("no-such-server", "X"),
    );
    expect(refused.status).toBe(403);
  });
});
