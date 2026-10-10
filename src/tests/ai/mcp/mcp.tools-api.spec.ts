import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AiTools, McpMutationResult } from "@/src/helpers/ai-tools";
import { ApiSDK } from "@/src/services/api-sdk";

// Contract coverage of the thirteen `/ai/tools/*` routes, written from an audit of
// mcp.spec.ts / mcp.permission.spec.ts / mcp.ai-disabled.spec.ts (2026-10-09).
// Those files already own: the role matrix, AI-off transitions, name validation,
// the stored-config round trip, copy-from-portal, the BUG 82864/82984/82986 shapes,
// the allow-always dialog path and everything that drives a real conversation. This
// file adds what they leave out and does not repeat it. Role, revocation, secret and
// AI-off persistence checks live in mcp.tools-api.permission.spec.ts.
//
// Measured on 2026-10-09 (one portal, owner):
//
//   * `add`/`update` config: `{url, command}` together is a soft 200 `{success:false}`
//     ("not both"); a non-string or empty `url`/`command` is the same soft refusal.
//     A string that is not a URL is accepted — there is no format check.
//   * `get-custom-server`: unknown name 200 `null`; missing/empty name 400
//     `name required`; whitespace-only 400 `Bad Request`. Lookup is case-insensitive.
//   * `replace-all`: a map that is not an object (string, number, array, null,
//     missing) is a hard 400 `map is required and must be an object`; invalid
//     configs come back as `errors[{name,error}]` and nothing is applied.
//   * `Object.prototype` names (`constructor`, `toString`, …) are ordinary names now.
//   * `set-disabled`: the list is a full replacement per serverType, duplicates are
//     collapsed, unknown tool names are stored as given.
//   * `get-allow-always` is a flat list of `"<serverType>_<toolName>"` strings.
//   * Removing a server purges its disabled and allow-always entries; registering
//     the same name again starts empty. Entries for a serverType that never was a
//     server (`ghost`) are not touched by that.

const HTTP_CONFIG = { url: "https://tools-api.example.invalid/sse" };
const OTHER_CONFIG = { url: "https://tools-api-other.example.invalid/sse" };
const STDIO_CONFIG = {
  command: "node",
  args: ["server.js", "--flag"],
  env: { AUTOTEST: "1" },
};

type Payments = Parameters<typeof enableAiGateway>[0];

async function setup(apiSdk: ApiSDK, paymentsApi: Payments) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);

  const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId("owner");
  const newAgent = (title: string) =>
    aiChat.createAgentId("owner", { title, profileId });
  const agentId = await newAgent("Tools API Agent");

  return { ownerApi, aiTools, aiChat, agentId, newAgent };
}

/** Registers a server and asserts the registration took, so a later absence means something. */
async function register(
  aiTools: AiTools,
  name: string,
  config: unknown,
  agentId?: number,
) {
  const { status, data } = await aiTools.addCustomServer("owner", {
    name,
    config,
    agentId,
  });
  expect(status, `registering ${name}`).toBe(200);
  expect(data?.success, `registering ${name}`).toBe(true);
}

const q = (agentId?: number) =>
  agentId === undefined ? "" : `?entityId=${agentId}`;

async function disabledOf(aiTools: AiTools, agentId?: number) {
  const { status, data } = await aiTools.getDisabledTools("owner", agentId);
  expect(status, "get-disabled").toBe(200);
  return data ?? {};
}

async function allowedOf(aiTools: AiTools, agentId?: number) {
  const { status, data } = await aiTools.getAllowAlways("owner", agentId);
  expect(status, "get-allow-always").toBe(200);
  return data ?? [];
}

async function serversOf(aiTools: AiTools, agentId?: number) {
  const { status, data } = await aiTools.listCustomServers("owner", agentId);
  expect(status, "list-custom-servers").toBe(200);
  return data;
}

// ---------------------------------------------------------------------------
// get-custom-server / list-custom-servers
// ---------------------------------------------------------------------------

test.describe("ToolsApi - get-custom-server and list-custom-servers", () => {
  test("GET /api/2.0/ai/tools/get-custom-server - names that exist on Object.prototype read as unregistered", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "real-server", HTTP_CONFIG, agentId);

    // Positive control: the same call does find a registered name.
    const control = await aiTools.getCustomServer(
      "owner",
      "real-server",
      agentId,
    );
    expect(control.status).toBe(200);
    expect(control.data).toEqual(HTTP_CONFIG);

    for (const name of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "isPrototypeOf",
      "__proto__",
      "prototype",
    ]) {
      const { status, data } = await aiTools.getCustomServer(
        "owner",
        name,
        agentId,
      );
      expect(status, name).toBe(200);
      expect(data, `${name} was never registered`).toBeNull();
    }
    expect(await serversOf(aiTools, agentId)).toEqual({
      "real-server": HTTP_CONFIG,
    });
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - Object.prototype names registered through replace-all round-trip through get and list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    const names = ["constructor", "toString", "valueOf", "hasOwnProperty"];
    const map = Object.fromEntries(
      names.map((name, index) => [
        name,
        { url: `https://proto-${index}.example.invalid/sse` },
      ]),
    );

    const replaced = await aiTools.replaceAllCustomServers("owner", {
      map,
      agentId,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.data?.success).toBe(true);

    expect(await serversOf(aiTools, agentId)).toEqual(map);
    for (const name of names) {
      const { status, data } = await aiTools.getCustomServer(
        "owner",
        name,
        agentId,
      );
      expect(status, name).toBe(200);
      expect(data, name).toEqual(map[name]);
    }

    const removed = await aiTools.removeCustomServer("owner", {
      name: "constructor",
      agentId,
    });
    expect(removed.data?.success).toBe(true);
    const { constructor: _gone, ...rest } = map;
    void _gone;
    expect(await serversOf(aiTools, agentId)).toEqual(rest);
  });

  test("GET /api/2.0/ai/tools/get-custom-server - a bad name is refused, an unknown one is null, and a read changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "CasedServer", HTTP_CONFIG, agentId);
    const before = await serversOf(aiTools, agentId);

    const missing = await aiTools.raw(
      "owner",
      "get",
      "get-custom-server",
      undefined,
      q(agentId),
    );
    expect(missing.status, "no name").toBe(400);
    expect(missing.error).toBe("name required");

    const empty = await aiTools.raw(
      "owner",
      "get",
      "get-custom-server",
      undefined,
      `?name=&entityId=${agentId}`,
    );
    expect(empty.status, "empty name").toBe(400);
    expect(empty.error).toBe("name required");

    const blank = await aiTools.raw(
      "owner",
      "get",
      "get-custom-server",
      undefined,
      `?name=%20%20&entityId=${agentId}`,
    );
    expect(blank.status, "whitespace-only name").toBe(400);

    const unknown = await aiTools.getCustomServer(
      "owner",
      "never-registered",
      agentId,
    );
    expect(unknown.status).toBe(200);
    expect(unknown.data).toBeNull();

    for (const spelling of ["CasedServer", "casedserver", "CASEDSERVER"]) {
      const { status, data } = await aiTools.getCustomServer(
        "owner",
        spelling,
        agentId,
      );
      expect(status, spelling).toBe(200);
      expect(data, spelling).toEqual(HTTP_CONFIG);
    }

    expect(await serversOf(aiTools, agentId), "reads changed nothing").toEqual(
      before,
    );
  });

  test("GET /api/2.0/ai/tools/get-custom-server, list-custom-servers - portal, agent and a second agent are three separate scopes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId, newAgent } = await setup(apiSdk, paymentsApi);
    const secondAgent = await newAgent("Tools API Second Agent");
    await register(aiTools, "portal-only", HTTP_CONFIG);
    await register(aiTools, "agent-only", OTHER_CONFIG, agentId);

    expect(await serversOf(aiTools)).toEqual({ "portal-only": HTTP_CONFIG });
    expect(await serversOf(aiTools, agentId)).toEqual({
      "agent-only": OTHER_CONFIG,
    });
    expect(await serversOf(aiTools, secondAgent), "empty scope is {}").toEqual(
      {},
    );

    const portalFromAgent = await aiTools.getCustomServer(
      "owner",
      "portal-only",
      agentId,
    );
    expect(portalFromAgent.status).toBe(200);
    expect(portalFromAgent.data).toBeNull();

    const agentFromPortal = await aiTools.getCustomServer(
      "owner",
      "agent-only",
    );
    expect(agentFromPortal.data).toBeNull();

    const agentFromOther = await aiTools.getCustomServer(
      "owner",
      "agent-only",
      secondAgent,
    );
    expect(agentFromOther.data).toBeNull();
  });

  test("GET /api/2.0/ai/tools/get-custom-server, list-custom-servers - an entityId that names nothing reads the portal scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // A documented asymmetry (reads fall back, writes 404). The exposure is only
    // the caller's own portal-level data: asserted here so a change to either end
    // is noticed, not endorsed.
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "portal-one", HTTP_CONFIG);
    await register(aiTools, "agent-one", OTHER_CONFIG, agentId);

    for (const entityId of ["abc", "999999999", "-1"]) {
      const listed = await aiTools.raw(
        "owner",
        "get",
        "list-custom-servers",
        undefined,
        `?entityId=${entityId}`,
      );
      expect(listed.status, entityId).toBe(200);
      expect(listed.data, entityId).toEqual({ "portal-one": HTTP_CONFIG });

      const got = await aiTools.raw(
        "owner",
        "get",
        "get-custom-server",
        undefined,
        `?name=portal-one&entityId=${entityId}`,
      );
      expect(got.status, entityId).toBe(200);
      expect(got.data, entityId).toEqual(HTTP_CONFIG);
    }
  });

  test("POST/GET /api/2.0/ai/tools/*-custom-server - headers, auth, extra fields and a stdio config survive get and list whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    const http = {
      ...HTTP_CONFIG,
      type: "http",
      headers: {
        Authorization: "Bearer AUTOTEST-NOT-A-SECRET",
        "X-Trace": "1",
      },
      auth: { type: "oauth", clientId: "autotest-client" },
      extra: { nested: { list: [1, "two", null], flag: true } },
    };
    await register(aiTools, "http-full", http, agentId);
    await register(aiTools, "stdio-full", STDIO_CONFIG, agentId);

    for (const [name, config] of [
      ["http-full", http],
      ["stdio-full", STDIO_CONFIG],
    ] as const) {
      const first = await aiTools.getCustomServer("owner", name, agentId);
      const second = await aiTools.getCustomServer("owner", name, agentId);
      expect(first.status, name).toBe(200);
      expect(first.data, name).toEqual(config);
      expect(second.data, `${name}: a repeated read`).toEqual(first.data);
    }
    expect(await serversOf(aiTools, agentId)).toEqual({
      "http-full": http,
      "stdio-full": STDIO_CONFIG,
    });
  });
});

// ---------------------------------------------------------------------------
// add-custom-server
// ---------------------------------------------------------------------------

test.describe("ToolsApi - add-custom-server", () => {
  test("POST /api/2.0/ai/tools/add-custom-server - a config with both url and command is refused and nothing is stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);

    const { status, data } = await aiTools.addCustomServer("owner", {
      name: "both-kinds",
      config: { url: HTTP_CONFIG.url, command: "node" },
      agentId,
    });

    expect(status).toBe(200);
    expect(data?.success).toBe(false);
    expect(data?.error?.field).toBe("url");
    expect(data?.error?.message).toBe(
      "Server config must be HTTP (url) or STDIO (command), not both",
    );
    const got = await aiTools.getCustomServer("owner", "both-kinds", agentId);
    expect(got.data).toBeNull();
    expect(await serversOf(aiTools, agentId)).toEqual({});
  });

  test("POST /api/2.0/ai/tools/add-custom-server - a url or command of the wrong type is refused and leaves existing servers alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "keeper", HTTP_CONFIG, agentId);

    const bad: Array<[string, unknown]> = [
      ["url number", { url: 5 }],
      ["url null", { url: null }],
      ["url empty", { url: "" }],
      ["url array", { url: ["https://a.invalid"] }],
      ["command number", { command: 5 }],
      ["command empty", { command: "" }],
      ["command object", { command: { run: "node" } }],
    ];
    for (const [label, config] of bad) {
      const name = `bad-${label.replace(/\s/g, "-")}`;
      const { status, data } = await aiTools.addCustomServer("owner", {
        name,
        config,
        agentId,
      });
      expect(status, label).toBe(200);
      expect(data?.success, label).toBe(false);
      expect(data?.error?.field, label).toBe("url");
      expect(data?.error?.message, label).toBe(
        "Server config requires either 'url' (HTTP) or 'command' (STDIO)",
      );
    }

    expect(
      await serversOf(aiTools, agentId),
      "no refused registration left a partial entry",
    ).toEqual({ keeper: HTTP_CONFIG });
  });

  test("POST /api/2.0/ai/tools/add-custom-server - a null or numeric name is a hard 400 and a one-character name is fine", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);

    for (const name of [null, 5, true, {}]) {
      const { status, error } = await aiTools.raw(
        "owner",
        "post",
        "add-custom-server",
        {
          name,
          config: HTTP_CONFIG,
          entityId: String(agentId),
        },
      );
      expect(status, JSON.stringify(name)).toBe(400);
      expect(error, JSON.stringify(name)).toBe("name is required");
    }
    expect(await serversOf(aiTools, agentId)).toEqual({});

    await register(aiTools, "a", HTTP_CONFIG, agentId);
    expect(await serversOf(aiTools, agentId)).toEqual({ a: HTTP_CONFIG });
  });

  test("POST /api/2.0/ai/tools/add-custom-server - one name registers independently in the portal and in an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "shared-name", HTTP_CONFIG);
    await register(aiTools, "shared-name", OTHER_CONFIG, agentId);

    expect(await serversOf(aiTools)).toEqual({ "shared-name": HTTP_CONFIG });
    expect(await serversOf(aiTools, agentId)).toEqual({
      "shared-name": OTHER_CONFIG,
    });

    const updated = await aiTools.updateCustomServer("owner", {
      name: "shared-name",
      config: STDIO_CONFIG,
      agentId,
    });
    expect(updated.data?.success).toBe(true);
    expect(await serversOf(aiTools), "portal copy is untouched").toEqual({
      "shared-name": HTTP_CONFIG,
    });
  });

  test("POST /api/2.0/ai/tools/add-custom-server - copying a portal server that does not exist is a hard 400, and a second copy is refused as a duplicate", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);

    const ghost = await aiTools.addCustomServer("owner", {
      name: "no-such-portal-server",
      agentId,
    });
    expect(ghost.status).toBe(400);
    expect(ghost.error).toBe(
      'No config provided and no portal-level server named "no-such-portal-server"',
    );
    expect(await serversOf(aiTools, agentId)).toEqual({});

    await register(aiTools, "portal-template", HTTP_CONFIG);
    const first = await aiTools.addCustomServer("owner", {
      name: "portal-template",
      agentId,
    });
    expect(first.data?.success).toBe(true);

    const second = await aiTools.addCustomServer("owner", {
      name: "portal-template",
      agentId,
    });
    expect(second.status).toBe(200);
    expect(second.data?.success).toBe(false);
    expect(second.data?.error?.message).toContain("already registered");
    expect(await serversOf(aiTools, agentId)).toEqual({
      "portal-template": HTTP_CONFIG,
    });
  });
});

// ---------------------------------------------------------------------------
// update-custom-server / remove-custom-server
// ---------------------------------------------------------------------------

test.describe("ToolsApi - update-custom-server", () => {
  test("PUT /api/2.0/ai/tools/update-custom-server - every refused update leaves the stored config exactly as it was", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    const original = { ...HTTP_CONFIG, headers: { "X-Keep": "yes" } };
    await register(aiTools, "target", original, agentId);
    await register(aiTools, "neighbour", OTHER_CONFIG, agentId);
    const entity = String(agentId);

    const hard: Array<[string, Record<string, unknown>, string]> = [
      ["no name", { config: OTHER_CONFIG }, "name is required"],
      ["empty name", { name: "", config: OTHER_CONFIG }, "name is required"],
      ["blank name", { name: "   ", config: OTHER_CONFIG }, "name is required"],
      [
        "no config",
        { name: "target" },
        'No config provided and no portal-level server named "target"',
      ],
      [
        "null config",
        { name: "target", config: null },
        'No config provided and no portal-level server named "target"',
      ],
      [
        "empty config",
        { name: "target", config: {} },
        'No config provided and no portal-level server named "target"',
      ],
    ];
    for (const [label, body, message] of hard) {
      const { status, error } = await aiTools.raw(
        "owner",
        "put",
        "update-custom-server",
        { ...body, entityId: entity },
      );
      expect(status, label).toBe(400);
      expect(error, label).toBe(message);
    }

    const soft: Array<[string, unknown, string]> = [
      ["string config", "not-an-object", "Server config must be an object"],
      [
        "array config",
        [1],
        "Server config requires either 'url' (HTTP) or 'command' (STDIO)",
      ],
      [
        "url number",
        { url: 5 },
        "Server config requires either 'url' (HTTP) or 'command' (STDIO)",
      ],
      [
        "command number",
        { command: 5 },
        "Server config requires either 'url' (HTTP) or 'command' (STDIO)",
      ],
      [
        "url and command",
        { url: "https://a.invalid", command: "x" },
        "Server config must be HTTP (url) or STDIO (command), not both",
      ],
    ];
    for (const [label, config, message] of soft) {
      const { status, data } = await aiTools.updateCustomServer("owner", {
        name: "target",
        config,
        agentId,
      });
      const result = data as McpMutationResult;
      expect(status, label).toBe(200);
      expect(result?.success, label).toBe(false);
      expect(result?.error?.message, label).toBe(message);
    }

    expect(
      await serversOf(aiTools, agentId),
      "a refused update must not touch the scope",
    ).toEqual({ target: original, neighbour: OTHER_CONFIG });
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - the name is case-insensitive, the key keeps its casing, and repeating an update is harmless", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "MixedCase", HTTP_CONFIG, agentId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { status, data } = await aiTools.updateCustomServer("owner", {
        name: "mixedcase",
        config: OTHER_CONFIG,
        agentId,
      });
      expect(status, `attempt ${attempt}`).toBe(200);
      expect(data?.success, `attempt ${attempt}`).toBe(true);
    }

    expect(await serversOf(aiTools, agentId)).toEqual({
      MixedCase: OTHER_CONFIG,
    });
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - a server changes kind, gains and loses fields, and the other scope never moves", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "morph", HTTP_CONFIG);
    await register(aiTools, "morph", HTTP_CONFIG, agentId);

    const steps: Array<[string, Record<string, unknown>]> = [
      ["http to stdio", STDIO_CONFIG],
      [
        "stdio gains a field",
        { ...STDIO_CONFIG, cwd: "/tmp", extra: { a: 1 } },
      ],
      ["stdio loses fields", { command: "node" }],
      [
        "back to http with headers",
        { ...OTHER_CONFIG, headers: { "X-A": "1" } },
      ],
      ["headers dropped", OTHER_CONFIG],
    ];
    for (const [label, config] of steps) {
      const { status, data } = await aiTools.updateCustomServer("owner", {
        name: "morph",
        config,
        agentId,
      });
      expect(status, label).toBe(200);
      expect(data?.success, label).toBe(true);

      const got = await aiTools.getCustomServer("owner", "morph", agentId);
      expect(got.data, label).toEqual(config);
      expect(await serversOf(aiTools, agentId), label).toEqual({
        morph: config,
      });
      expect(await serversOf(aiTools), `${label}: portal`).toEqual({
        morph: HTTP_CONFIG,
      });
    }
  });
});

test.describe("ToolsApi - remove-custom-server", () => {
  test("DELETE /api/2.0/ai/tools/remove-custom-server - a bad name is refused, an unknown one is a no-op, and neither touches the scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "survivor", HTTP_CONFIG, agentId);
    const entity = String(agentId);
    const remove = (body: Record<string, unknown>) =>
      aiTools.raw("owner", "delete", "remove-custom-server", {
        ...body,
        entityId: entity,
      });

    const missing = await remove({});
    expect(missing.status).toBe(400);
    expect(missing.error).toBe("name required");

    const empty = await remove({ name: "" });
    expect(empty.status).toBe(400);
    expect(empty.error).toBe("name required");

    const dot = await remove({ name: "." });
    expect(dot.status, "the router refuses `.` before the handler").toBe(405);

    for (const name of ["..", "never-registered", "survivor-not"]) {
      const { status, data } = await remove({ name });
      expect(status, name).toBe(200);
      expect((data as McpMutationResult)?.success, name).toBe(true);
    }

    expect(await serversOf(aiTools, agentId)).toEqual({
      survivor: HTTP_CONFIG,
    });
  });

  test("DELETE /api/2.0/ai/tools/remove-custom-server - another casing removes the server, a repeat is a no-op, and only the named scope and server change", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "Twin", HTTP_CONFIG);
    await register(aiTools, "Twin", OTHER_CONFIG, agentId);
    await register(aiTools, "Sibling", STDIO_CONFIG, agentId);

    const first = await aiTools.removeCustomServer("owner", {
      name: "TWIN",
      agentId,
    });
    expect(first.status).toBe(200);
    expect(first.data?.success).toBe(true);
    expect(await serversOf(aiTools, agentId)).toEqual({
      Sibling: STDIO_CONFIG,
    });
    const gone = await aiTools.getCustomServer("owner", "Twin", agentId);
    expect(gone.data).toBeNull();

    const repeat = await aiTools.removeCustomServer("owner", {
      name: "Twin",
      agentId,
    });
    expect(repeat.status).toBe(200);
    expect(repeat.data?.success).toBe(true);

    expect(await serversOf(aiTools), "the portal twin survives").toEqual({
      Twin: HTTP_CONFIG,
    });
    expect(await serversOf(aiTools, agentId)).toEqual({
      Sibling: STDIO_CONFIG,
    });
  });
});

// ---------------------------------------------------------------------------
// replace-all-custom-servers
// ---------------------------------------------------------------------------

test.describe("ToolsApi - replace-all-custom-servers", () => {
  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - the scope always ends up as exactly the map that was sent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "portal-bystander", HTTP_CONFIG);

    const maps: Array<[string, Record<string, unknown>]> = [
      ["empty to one", { one: HTTP_CONFIG }],
      ["one replaced by another", { two: OTHER_CONFIG }],
      ["several", { a: HTTP_CONFIG, b: STDIO_CONFIG, c: OTHER_CONFIG }],
      [
        "one kept, one changed, one dropped, one new",
        { a: OTHER_CONFIG, b: STDIO_CONFIG, d: HTTP_CONFIG },
      ],
      [
        "the same map again",
        { a: OTHER_CONFIG, b: STDIO_CONFIG, d: HTTP_CONFIG },
      ],
      ["cleared", {}],
    ];
    for (const [label, map] of maps) {
      const { status, data } = await aiTools.replaceAllCustomServers("owner", {
        map,
        agentId,
      });
      expect(status, label).toBe(200);
      expect(data?.success, label).toBe(true);

      expect(await serversOf(aiTools, agentId), label).toEqual(map);
      for (const [name, config] of Object.entries(map)) {
        const got = await aiTools.getCustomServer("owner", name, agentId);
        expect(got.data, `${label}: ${name}`).toEqual(config);
      }
      expect(await serversOf(aiTools), `${label}: portal`).toEqual({
        "portal-bystander": HTTP_CONFIG,
      });
    }
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - a portal-level replace leaves every agent scope alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "agent-owned", STDIO_CONFIG, agentId);
    await register(aiTools, "old-portal", HTTP_CONFIG);

    const { data } = await aiTools.replaceAllCustomServers("owner", {
      map: { "new-portal": OTHER_CONFIG },
    });
    expect(data?.success).toBe(true);

    expect(await serversOf(aiTools)).toEqual({ "new-portal": OTHER_CONFIG });
    expect(await serversOf(aiTools, agentId)).toEqual({
      "agent-owned": STDIO_CONFIG,
    });
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - a map that is a string or a number is a hard 400 and the scope survives", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "stays", HTTP_CONFIG, agentId);

    for (const [label, map] of [
      ["string", "not-a-map"],
      ["number", 5],
      ["boolean", true],
    ] as const) {
      const { status, error } = await aiTools.raw(
        "owner",
        "put",
        "replace-all-custom-servers",
        { map, entityId: String(agentId) },
      );
      expect(status, label).toBe(400);
      expect(error, label).toBe("map is required and must be an object");
    }
    expect(await serversOf(aiTools, agentId)).toEqual({ stays: HTTP_CONFIG });
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - several invalid configs are all reported in errors[] and not one entry of the map is applied", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "old-one", HTTP_CONFIG, agentId);
    await register(aiTools, "old-two", STDIO_CONFIG, agentId);
    const before = await serversOf(aiTools, agentId);

    const { status, data } = await aiTools.raw(
      "owner",
      "put",
      "replace-all-custom-servers",
      {
        map: {
          fine: OTHER_CONFIG,
          "bad-string": "x",
          "bad-url": { url: 5 },
          "bad-both": { url: "https://a.invalid", command: "x" },
        },
        entityId: String(agentId),
      },
    );
    const body = data as {
      success?: boolean;
      errors?: Array<{
        name?: string;
        error?: { field?: string; message?: string };
      }>;
    };

    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.errors?.map((e) => e.name).sort()).toEqual([
      "bad-both",
      "bad-string",
      "bad-url",
    ]);
    for (const entry of body.errors ?? []) {
      expect(entry.error?.field, entry.name).toBe("url");
      expect(entry.error?.message, entry.name).toEqual(expect.any(String));
    }
    expect(
      await serversOf(aiTools, agentId),
      "neither the valid entry nor the wipe went through",
    ).toEqual(before);
  });

  test("PUT /api/2.0/ai/tools/replace-all-custom-servers - a name the route refuses outright rejects the whole map", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "old-one", HTTP_CONFIG, agentId);
    const before = await serversOf(aiTools, agentId);
    const entity = String(agentId);

    const cases: Array<[string, Record<string, unknown>, number]> = [
      ["a slash in a name", { "a/b": HTTP_CONFIG, ok: OTHER_CONFIG }, 400],
      ["a backslash", { "a\\b": HTTP_CONFIG, ok: OTHER_CONFIG }, 400],
      ["a dot name", { ".": HTTP_CONFIG, ok: OTHER_CONFIG }, 400],
      [
        "a control character",
        { "a\u0007b": HTTP_CONFIG, ok: OTHER_CONFIG },
        400,
      ],
      [
        "129 characters",
        { ["n".repeat(129)]: HTTP_CONFIG, ok: OTHER_CONFIG },
        400,
      ],
      ["an empty config object", { empty: {}, ok: OTHER_CONFIG }, 400],
    ];
    for (const [label, map, expected] of cases) {
      const { status } = await aiTools.raw(
        "owner",
        "put",
        "replace-all-custom-servers",
        { map, entityId: entity },
      );
      expect(status, label).toBe(expected);
      expect(await serversOf(aiTools, agentId), label).toEqual(before);
    }

    const underscore = await aiTools.replaceAllCustomServers("owner", {
      map: { my_server: HTTP_CONFIG },
      agentId,
    });
    expect(underscore.status).toBe(200);
    expect(underscore.data?.success).toBe(false);
    expect(await serversOf(aiTools, agentId), "an underscore").toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// set-disabled / get-disabled / is-tool-disabled
// ---------------------------------------------------------------------------

test.describe("ToolsApi - set-disabled, get-disabled, is-tool-disabled", () => {
  test("PUT /api/2.0/ai/tools/set-disabled - a bad serverType or a non-string tool name is a 400 and the stored list is untouched", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);
    const ok = await aiTools.setDisabledTools("owner", {
      serverType: "srv",
      toolNames: ["keep"],
      agentId,
    });
    expect(ok.data?.success).toBe(true);
    const entity = String(agentId);

    for (const [label, body] of [
      ["missing serverType", { toolNames: ["x"] }],
      ["empty serverType", { serverType: "", toolNames: ["x"] }],
      ["null serverType", { serverType: null, toolNames: ["x"] }],
      ["unregistered serverType", { serverType: "ghost", toolNames: ["x"] }],
      ["numeric tool names", { serverType: "srv", toolNames: [1, 2] }],
    ] as Array<[string, Record<string, unknown>]>) {
      const { status, error } = await aiTools.raw(
        "owner",
        "put",
        "set-disabled",
        { ...body, entityId: entity },
      );
      expect(status, label).toBe(400);
      expect(error, label).toEqual(expect.any(String));
      expect(await disabledOf(aiTools, agentId), label).toEqual({
        srv: ["keep"],
      });
    }

    const unknownType = await aiTools.raw("owner", "put", "set-disabled", {
      serverType: "ghost",
      toolNames: ["x"],
      entityId: entity,
    });
    expect(unknownType.error).toContain('unknown serverType "ghost"');
    expect(unknownType.error).toContain("srv");
    expect(unknownType.error).toContain("docspace");
  });

  test("BUG 84402: PUT /api/2.0/ai/tools/set-disabled - a string toolNames is rejected instead of being split into single-letter tool names", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);
    await aiTools.setDisabledTools("owner", {
      serverType: "srv",
      toolNames: ["keep"],
      agentId,
    });

    const { status } = await aiTools.raw("owner", "put", "set-disabled", {
      serverType: "srv",
      toolNames: "abc",
      entityId: String(agentId),
    });

    // Measured: 200, and the list becomes ["a","b","c"] — the string is iterated
    // as a sequence of characters. `toolNames` is `Array<string>` in the SDK.
    expect(await disabledOf(aiTools, agentId)).toEqual({ srv: ["keep"] });
    expect(status).toBe(400);
  });

  test("BUG 84403: PUT /api/2.0/ai/tools/set-disabled - a request with no toolNames, or null, is rejected instead of wiping the disabled list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);
    const entity = String(agentId);

    for (const [label, body] of [
      ["missing", { serverType: "srv" }],
      ["null", { serverType: "srv", toolNames: null }],
    ] as Array<[string, Record<string, unknown>]>) {
      await aiTools.setDisabledTools("owner", {
        serverType: "srv",
        toolNames: ["keep"],
        agentId,
      });

      const { status } = await aiTools.raw("owner", "put", "set-disabled", {
        ...body,
        entityId: entity,
      });

      // Measured: 200 `{success:true}` and the list is gone — same defect class as
      // the old BUG 82864, where a body without `map` cleared a whole scope.
      expect(await disabledOf(aiTools, agentId), label).toEqual({
        srv: ["keep"],
      });
      expect(status, label).toBe(400);
    }
  });

  test("PUT /api/2.0/ai/tools/set-disabled - duplicates collapse, unknown tool names are kept, an empty list clears, and every read agrees", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);

    const set = (toolNames: string[]) =>
      aiTools.setDisabledTools("owner", {
        serverType: "srv",
        toolNames,
        agentId,
      });
    const isDisabled = async (toolName: string) => {
      const { status, data } = await aiTools.isToolDisabled("owner", {
        serverType: "srv",
        toolName,
        agentId,
      });
      expect(status, toolName).toBe(200);
      return data;
    };

    expect((await set(["a", "a", "b"])).data?.success).toBe(true);
    expect(await disabledOf(aiTools, agentId)).toEqual({ srv: ["a", "b"] });
    expect(await isDisabled("a")).toBe(true);
    expect(await isDisabled("b")).toBe(true);
    expect(await isDisabled("c"), "a tool nobody disabled").toBe(false);

    expect((await set(["a", "a", "b"])).data?.success, "again").toBe(true);
    expect(
      await disabledOf(aiTools, agentId),
      "a repeat is idempotent",
    ).toEqual({ srv: ["a", "b"] });

    expect((await set(["b", "never-advertised"])).data?.success).toBe(true);
    expect(await disabledOf(aiTools, agentId)).toEqual({
      srv: ["b", "never-advertised"],
    });
    expect(await isDisabled("a"), "dropped from the list, so enabled").toBe(
      false,
    );
    expect(await isDisabled("never-advertised")).toBe(true);

    expect((await set([])).data?.success).toBe(true);
    expect(await disabledOf(aiTools, agentId)).toEqual({});
    expect(await isDisabled("b")).toBe(false);
  });

  test("PUT /api/2.0/ai/tools/set-disabled - the list belongs to its serverType: two servers with the same tool name and a built-in group do not interfere", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "alpha", HTTP_CONFIG, agentId);
    await register(aiTools, "beta", OTHER_CONFIG, agentId);
    const disable = (serverType: string, toolNames: string[]) =>
      aiTools.setDisabledTools("owner", { serverType, toolNames, agentId });

    expect(
      (await disable("alpha", ["shared", "only-alpha"])).data?.success,
    ).toBe(true);
    expect((await disable("web-search", ["lookup"])).data?.success).toBe(true);
    expect(await disabledOf(aiTools, agentId)).toEqual({
      alpha: ["shared", "only-alpha"],
      "web-search": ["lookup"],
    });

    const probe = async (serverType: string, toolName: string) =>
      (await aiTools.isToolDisabled("owner", { serverType, toolName, agentId }))
        .data;
    expect(await probe("alpha", "shared")).toBe(true);
    expect(await probe("beta", "shared"), "same name, other server").toBe(
      false,
    );
    expect(await probe("web-search", "shared")).toBe(false);

    expect((await disable("beta", ["shared"])).data?.success).toBe(true);
    expect((await disable("alpha", [])).data?.success).toBe(true);
    expect(
      await disabledOf(aiTools, agentId),
      "clearing alpha left beta and web-search alone",
    ).toEqual({ beta: ["shared"], "web-search": ["lookup"] });
  });

  test("PUT /api/2.0/ai/tools/set-disabled - the portal scope and an agent scope hold separate lists, and a read of nothing changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "portal-srv", HTTP_CONFIG);
    await register(aiTools, "agent-srv", OTHER_CONFIG, agentId);

    const portalWrite = await aiTools.setDisabledTools("owner", {
      serverType: "portal-srv",
      toolNames: ["p1"],
    });
    expect(portalWrite.data?.success).toBe(true);
    const agentWrite = await aiTools.setDisabledTools("owner", {
      serverType: "agent-srv",
      toolNames: ["a1"],
      agentId,
    });
    expect(agentWrite.data?.success).toBe(true);

    for (let read = 0; read < 2; read += 1) {
      expect(await disabledOf(aiTools)).toEqual({ "portal-srv": ["p1"] });
      expect(await disabledOf(aiTools, agentId)).toEqual({
        "agent-srv": ["a1"],
      });
    }
    const crossed = await aiTools.isToolDisabled("owner", {
      serverType: "portal-srv",
      toolName: "p1",
      agentId,
    });
    expect(crossed.status).toBe(200);
    expect(crossed.data, "the portal's list does not answer for an agent").toBe(
      false,
    );
  });

  test("GET /api/2.0/ai/tools/is-tool-disabled - missing or empty parameters are a 400, an unknown serverType is false, an entityId that names nothing reads the portal", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "portal-srv", HTTP_CONFIG);
    await aiTools.setDisabledTools("owner", {
      serverType: "portal-srv",
      toolNames: ["p1"],
    });

    for (const query of [
      `?toolName=p1&entityId=${agentId}`,
      `?serverType=portal-srv&entityId=${agentId}`,
      `?serverType=&toolName=&entityId=${agentId}`,
      "",
    ]) {
      const { status, error } = await aiTools.raw(
        "owner",
        "get",
        "is-tool-disabled",
        undefined,
        query,
      );
      expect(status, query).toBe(400);
      expect(error, query).toBe("serverType and toolName required");
    }

    const unknown = await aiTools.isToolDisabled("owner", {
      serverType: "no-such-server",
      toolName: "p1",
      agentId,
    });
    expect(unknown.status).toBe(200);
    expect(unknown.data).toBe(false);

    const fallback = await aiTools.raw(
      "owner",
      "get",
      "is-tool-disabled",
      undefined,
      "?serverType=portal-srv&toolName=p1&entityId=999999999",
    );
    expect(fallback.status).toBe(200);
    expect(fallback.data, "the portal's own list").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// set-allow-always / get-allow-always / is-allow-always
// ---------------------------------------------------------------------------

test.describe("ToolsApi - set-allow-always, get-allow-always, is-allow-always", () => {
  test("PUT /api/2.0/ai/tools/set-allow-always - the list is flat serverType_toolName strings, set is idempotent, and revoking one entry touches no other", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "alpha", HTTP_CONFIG, agentId);
    await register(aiTools, "beta", OTHER_CONFIG, agentId);
    const set = (serverType: string, toolName: string, value: boolean) =>
      aiTools.setAllowAlways("owner", { serverType, toolName, value, agentId });
    const isAllowed = async (serverType: string, toolName: string) => {
      const { status, data } = await aiTools.isAllowAlways("owner", {
        serverType,
        toolName,
        agentId,
      });
      expect(status, `${serverType}/${toolName}`).toBe(200);
      return data;
    };

    expect(await allowedOf(aiTools, agentId), "starts empty").toEqual([]);

    for (const repeat of [1, 2]) {
      expect((await set("alpha", "t1", true)).data?.success, `${repeat}`).toBe(
        true,
      );
    }
    expect((await set("alpha", "t2", true)).data?.success).toBe(true);
    expect((await set("beta", "t1", true)).data?.success).toBe(true);

    const listed = await allowedOf(aiTools, agentId);
    expect([...listed].sort(), "no duplicates, one entry per pair").toEqual([
      "alpha_t1",
      "alpha_t2",
      "beta_t1",
    ]);
    expect(await isAllowed("alpha", "t1")).toBe(true);
    expect(await isAllowed("alpha", "unlisted")).toBe(false);

    for (const repeat of [1, 2]) {
      expect((await set("alpha", "t1", false)).data?.success, `${repeat}`).toBe(
        true,
      );
    }
    expect([...(await allowedOf(aiTools, agentId))].sort()).toEqual([
      "alpha_t2",
      "beta_t1",
    ]);
    expect(await isAllowed("alpha", "t1")).toBe(false);
    expect(await isAllowed("alpha", "t2")).toBe(true);
    expect(await isAllowed("beta", "t1"), "same tool name, other server").toBe(
      true,
    );
  });

  test("PUT /api/2.0/ai/tools/set-allow-always - a pre-approval for a DocSpace tool does not cover the host tool of that name (BUG 83161, other direction)", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);

    const write = await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
      agentId,
    });
    expect(write.data?.success).toBe(true);
    expect(
      (
        await aiTools.isAllowAlways("owner", {
          serverType: "docspace",
          toolName: "delete_file",
          agentId,
        })
      ).data,
      "control: the pair that was written",
    ).toBe(true);

    for (const serverType of ["host", "web-search", "image-generation"]) {
      const { status, data } = await aiTools.isAllowAlways("owner", {
        serverType,
        toolName: "delete_file",
        agentId,
      });
      expect(status, serverType).toBe(200);
      expect(data, `${serverType}/delete_file`).toBe(false);
    }
    expect(await allowedOf(aiTools, agentId)).toEqual(["docspace_delete_file"]);
  });

  test("PUT /api/2.0/ai/tools/set-allow-always - falsy values (0, null) grant nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);

    for (const [label, value] of [
      ["zero", 0],
      ["null", null],
      ["missing", undefined],
    ] as Array<[string, unknown]>) {
      const { status } = await aiTools.raw("owner", "put", "set-allow-always", {
        serverType: "srv",
        toolName: `tool-${label}`,
        ...(value === undefined ? {} : { value }),
        entityId: String(agentId),
      });
      expect(status, label).toBe(200);
      expect(
        (
          await aiTools.isAllowAlways("owner", {
            serverType: "srv",
            toolName: `tool-${label}`,
            agentId,
          })
        ).data,
        label,
      ).toBe(false);
    }
    expect(await allowedOf(aiTools, agentId)).toEqual([]);
  });

  test('BUG 84404: PUT /api/2.0/ai/tools/set-allow-always - the string "false" does not grant a permanent approval', async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);

    await aiTools.raw("owner", "put", "set-allow-always", {
      serverType: "srv",
      toolName: "risky",
      value: "false",
      entityId: String(agentId),
    });

    // Measured: 200, and `is-allow-always` answers true — any non-empty string
    // (`"false"`, `"yes"`) and any object is read as truthy. `value` is a boolean
    // in the SDK. A permanent "never ask again" must not hang on JS truthiness.
    const { data } = await aiTools.isAllowAlways("owner", {
      serverType: "srv",
      toolName: "risky",
      agentId,
    });
    expect(data, 'the string "false" must not approve the tool').toBe(false);
  });

  test("BUG 84405: PUT /api/2.0/ai/tools/set-allow-always - a request with no toolName, or null, is a 400 and not a 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);
    await aiTools.setAllowAlways("owner", {
      serverType: "srv",
      toolName: "kept",
      value: true,
      agentId,
    });

    for (const [label, extra] of [
      ["missing", {}],
      ["null", { toolName: null }],
    ] as Array<[string, Record<string, unknown>]>) {
      const { status } = await aiTools.raw("owner", "put", "set-allow-always", {
        serverType: "srv",
        value: true,
        ...extra,
        entityId: String(agentId),
      });
      expect(await allowedOf(aiTools, agentId), label).toEqual(["srv_kept"]);
      // Measured: 500 `{"error":"Internal server error"}`.
      expect(status, label).toBe(400);
    }
  });

  test("GET /api/2.0/ai/tools/is-allow-always - missing parameters are a 400, an unvalidated serverType is stored as given, and a refused call leaves the list alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "kept",
      value: true,
      agentId,
    });

    for (const query of [
      `?toolName=kept&entityId=${agentId}`,
      `?serverType=docspace&entityId=${agentId}`,
      `?serverType=&toolName=&entityId=${agentId}`,
      "",
    ]) {
      const { status, error } = await aiTools.raw(
        "owner",
        "get",
        "is-allow-always",
        undefined,
        query,
      );
      expect(status, query).toBe(400);
      expect(error, query).toBe("serverType and toolName required");
    }

    // set-allow-always has no serverType validation, unlike set-disabled.
    const invented = await aiTools.setAllowAlways("owner", {
      serverType: "invented-type",
      toolName: "t",
      value: true,
      agentId,
    });
    expect(invented.status).toBe(200);
    expect(invented.data?.success).toBe(true);
    expect(
      (
        await aiTools.isAllowAlways("owner", {
          serverType: "invented-type",
          toolName: "t",
          agentId,
        })
      ).data,
    ).toBe(true);
    expect([...(await allowedOf(aiTools, agentId))].sort()).toEqual([
      "docspace_kept",
      "invented-type_t",
    ]);
  });

  test("PUT /api/2.0/ai/tools/set-allow-always - the portal scope and an agent scope are separate lists", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId, newAgent } = await setup(apiSdk, paymentsApi);
    const otherAgent = await newAgent("Tools API Other Agent");
    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "portal_tool",
      value: true,
    });
    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "agent_tool",
      value: true,
      agentId,
    });

    expect(await allowedOf(aiTools)).toEqual(["docspace_portal_tool"]);
    expect(await allowedOf(aiTools, agentId)).toEqual(["docspace_agent_tool"]);
    expect(await allowedOf(aiTools, otherAgent)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// list-system-tools
// ---------------------------------------------------------------------------

test.describe("ToolsApi - list-system-tools with servers registered", () => {
  test("GET /api/2.0/ai/tools/list-system-tools - the catalogue is keyed by registered server, names an unreachable one in errors, and follows the scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // With nothing registered the catalogue is the empty wrapper (pinned in
    // mcp.spec.ts). With servers registered the route enumerates them, so it
    // reaches out at read time — registration itself does not.
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "portal-srv", HTTP_CONFIG);
    await register(
      aiTools,
      "agent-srv",
      {
        ...OTHER_CONFIG,
        headers: { Authorization: "Bearer AUTOTEST-NOT-A-SECRET" },
      },
      agentId,
    );

    const read = async (agent?: number | string) => {
      const { status, data } = await aiTools.listSystemTools("owner", agent);
      expect(status, `scope ${agent}`).toBe(200);
      return data!;
    };

    const portal = await read();
    expect(Object.keys(portal.groups)).toEqual(["portal-srv"]);
    expect(Array.isArray(portal.groups["portal-srv"])).toBe(true);
    expect(Array.isArray(portal.system)).toBe(true);
    expect(Object.keys(portal.errors)).toEqual(["portal-srv"]);
    expect(typeof portal.errors["portal-srv"]).toBe("string");

    const agent = await read(agentId);
    // An agent's catalogue is its effective set: its own servers plus the
    // portal-level ones.
    expect(Object.keys(agent.groups).sort()).toEqual([
      "agent-srv",
      "portal-srv",
    ]);
    expect(Object.keys(agent.errors).sort()).toEqual([
      "agent-srv",
      "portal-srv",
    ]);
    expect(
      JSON.stringify(agent),
      "the error text must not echo the stored credentials",
    ).not.toContain("AUTOTEST-NOT-A-SECRET");

    const again = await read();
    expect(Object.keys(again.groups), "a repeat is consistent").toEqual(
      Object.keys(portal.groups),
    );

    for (const entityId of ["abc", "999999999"]) {
      const { status, data } = await aiTools.raw(
        "owner",
        "get",
        "list-system-tools",
        undefined,
        `?entityId=${entityId}`,
      );
      expect(status, entityId).toBe(200);
      expect(
        Object.keys((data as { groups: object }).groups),
        `${entityId} reads the portal scope`,
      ).toEqual(["portal-srv"]);
    }
  });

  test("GET /api/2.0/ai/tools/list-system-tools - the catalogue lists no tool name twice and is not the model's toolset", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The catalogue is a per-server enumeration. It says nothing about which tools
    // the model is offered — the four real ones are pinned in the conversation
    // blocks of mcp.spec.ts — so a registered server's name is a group key, never
    // an entry of `system`.
    const { aiTools } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "listed-server", HTTP_CONFIG);

    const { status, data } = await aiTools.listSystemTools("owner");
    expect(status).toBe(200);

    const names = [...Object.values(data!.groups).flat(), ...data!.system].map(
      (tool) => tool.name,
    );
    expect(new Set(names).size, "no duplicated tool names").toBe(names.length);
    expect(data!.system.map((tool) => tool.name)).not.toContain(
      "listed-server",
    );
    expect(names).not.toContain("docspace_generate_docx");
  });
});

// ---------------------------------------------------------------------------
// Integration: lifecycles, state that survives, state that does not
// ---------------------------------------------------------------------------

test.describe("ToolsApi - lifecycles across routes", () => {
  test("add-custom-server -> remove-custom-server -> add-custom-server - a removed server takes its disabled and allow-always entries with it, and a new one starts clean", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "doomed", HTTP_CONFIG, agentId);
    await register(aiTools, "bystander", OTHER_CONFIG, agentId);

    for (const serverType of ["doomed", "bystander"]) {
      expect(
        (
          await aiTools.setDisabledTools("owner", {
            serverType,
            toolNames: ["t1", "t2"],
            agentId,
          })
        ).data?.success,
      ).toBe(true);
      expect(
        (
          await aiTools.setAllowAlways("owner", {
            serverType,
            toolName: "t1",
            value: true,
            agentId,
          })
        ).data?.success,
      ).toBe(true);
    }
    // An entry under a serverType that never was a registered server, as a
    // control for "purged because of the server" rather than "purged".
    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "generate_docx",
      value: true,
      agentId,
    });

    const removed = await aiTools.removeCustomServer("owner", {
      name: "doomed",
      agentId,
    });
    expect(removed.data?.success).toBe(true);

    expect(await disabledOf(aiTools, agentId)).toEqual({
      bystander: ["t1", "t2"],
    });
    expect([...(await allowedOf(aiTools, agentId))].sort()).toEqual([
      "bystander_t1",
      "docspace_generate_docx",
    ]);
    const writeToRemoved = await aiTools.setDisabledTools("owner", {
      serverType: "doomed",
      toolNames: ["t3"],
      agentId,
    });
    expect(
      writeToRemoved.status,
      "a removed server is no longer a valid serverType",
    ).toBe(400);

    await register(aiTools, "doomed", OTHER_CONFIG, agentId);
    expect(
      await disabledOf(aiTools, agentId),
      "the new `doomed` inherited no disabled tools",
    ).toEqual({ bystander: ["t1", "t2"] });
    expect(
      (await allowedOf(aiTools, agentId)).filter((entry) =>
        entry.startsWith("doomed_"),
      ),
      "and no standing approvals",
    ).toEqual([]);
    expect(
      (
        await aiTools.isAllowAlways("owner", {
          serverType: "doomed",
          toolName: "t1",
          agentId,
        })
      ).data,
    ).toBe(false);
  });

  test("BUG 84406: PUT /api/2.0/ai/tools/replace-all-custom-servers - a server dropped by replace-all loses its disabled and allow-always entries like a removed one does", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "kept", HTTP_CONFIG, agentId);
    await register(aiTools, "dropped", OTHER_CONFIG, agentId);
    for (const serverType of ["kept", "dropped"]) {
      await aiTools.setDisabledTools("owner", {
        serverType,
        toolNames: ["t"],
        agentId,
      });
      await aiTools.setAllowAlways("owner", {
        serverType,
        toolName: "t",
        value: true,
        agentId,
      });
    }

    const { data } = await aiTools.replaceAllCustomServers("owner", {
      map: { kept: HTTP_CONFIG },
      agentId,
    });
    expect(data?.success).toBe(true);

    // remove-custom-server purges both lists for the server. Measured: replace-all
    // does not — `dropped` stays in get-disabled and get-allow-always, and a server
    // registered under that name later inherits a standing "never ask" approval
    // (is-allow-always answers true for a server nobody has approved).
    await register(aiTools, "dropped", OTHER_CONFIG, agentId);
    expect(
      (
        await aiTools.isAllowAlways("owner", {
          serverType: "dropped",
          toolName: "t",
          agentId,
        })
      ).data,
      "the re-registered server must not inherit an approval",
    ).toBe(false);
    expect(await allowedOf(aiTools, agentId)).toEqual(["kept_t"]);
    expect(await disabledOf(aiTools, agentId)).toEqual({ kept: ["t"] });
  });

  test("add -> get -> list -> update -> get -> remove -> get, then add -> replace-all -> get/list, then replace-all -> update -> remove", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);

    await test.step("single-server lifecycle, every step read back", async () => {
      await register(aiTools, "life", HTTP_CONFIG, agentId);
      expect(
        (await aiTools.getCustomServer("owner", "life", agentId)).data,
      ).toEqual(HTTP_CONFIG);
      expect(await serversOf(aiTools, agentId)).toEqual({ life: HTTP_CONFIG });

      const updated = await aiTools.updateCustomServer("owner", {
        name: "life",
        config: OTHER_CONFIG,
        agentId,
      });
      expect(updated.data?.success).toBe(true);
      expect(
        (await aiTools.getCustomServer("owner", "life", agentId)).data,
      ).toEqual(OTHER_CONFIG);
      expect(await serversOf(aiTools, agentId)).toEqual({ life: OTHER_CONFIG });

      const removed = await aiTools.removeCustomServer("owner", {
        name: "life",
        agentId,
      });
      expect(removed.data?.success).toBe(true);
      expect(
        (await aiTools.getCustomServer("owner", "life", agentId)).data,
      ).toBeNull();
      expect(await serversOf(aiTools, agentId)).toEqual({});
    });

    await test.step("add, then replace-all over it", async () => {
      await register(aiTools, "life", HTTP_CONFIG, agentId);
      const replaced = await aiTools.replaceAllCustomServers("owner", {
        map: { fresh: STDIO_CONFIG },
        agentId,
      });
      expect(replaced.data?.success).toBe(true);
      expect(
        (await aiTools.getCustomServer("owner", "life", agentId)).data,
        "the added server was replaced away",
      ).toBeNull();
      expect(
        (await aiTools.getCustomServer("owner", "fresh", agentId)).data,
      ).toEqual(STDIO_CONFIG);
      expect(await serversOf(aiTools, agentId)).toEqual({
        fresh: STDIO_CONFIG,
      });
    });

    await test.step("replace-all, then update, then remove what it created", async () => {
      const replaced = await aiTools.replaceAllCustomServers("owner", {
        map: { one: HTTP_CONFIG, two: OTHER_CONFIG },
        agentId,
      });
      expect(replaced.data?.success).toBe(true);

      const updated = await aiTools.updateCustomServer("owner", {
        name: "one",
        config: STDIO_CONFIG,
        agentId,
      });
      expect(updated.data?.success).toBe(true);
      expect(await serversOf(aiTools, agentId)).toEqual({
        one: STDIO_CONFIG,
        two: OTHER_CONFIG,
      });

      const removed = await aiTools.removeCustomServer("owner", {
        name: "one",
        agentId,
      });
      expect(removed.data?.success).toBe(true);
      expect(await serversOf(aiTools, agentId)).toEqual({ two: OTHER_CONFIG });
    });
  });

  test("a battery of refused add, update, replace-all, set-disabled and set-allow-always calls leaves the whole tools state byte-identical", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);
    await register(aiTools, "portal-srv", OTHER_CONFIG);
    await aiTools.setDisabledTools("owner", {
      serverType: "srv",
      toolNames: ["d1"],
      agentId,
    });
    await aiTools.setAllowAlways("owner", {
      serverType: "srv",
      toolName: "a1",
      value: true,
      agentId,
    });
    const snapshot = async () => ({
      agentServers: await serversOf(aiTools, agentId),
      portalServers: await serversOf(aiTools),
      disabled: await disabledOf(aiTools, agentId),
      allowed: await allowedOf(aiTools, agentId),
    });
    const before = await snapshot();
    const entityId = String(agentId);

    const refused = [
      aiTools.raw("owner", "post", "add-custom-server", {
        name: "srv",
        config: OTHER_CONFIG,
        entityId,
      }),
      aiTools.raw("owner", "post", "add-custom-server", {
        name: "new",
        config: { url: 5 },
        entityId,
      }),
      aiTools.raw("owner", "post", "add-custom-server", {
        name: "a/b",
        config: HTTP_CONFIG,
        entityId,
      }),
      aiTools.raw("owner", "put", "update-custom-server", {
        name: "srv",
        config: "x",
        entityId,
      }),
      aiTools.raw("owner", "put", "update-custom-server", {
        name: "ghost",
        config: HTTP_CONFIG,
        entityId,
      }),
      aiTools.raw("owner", "put", "replace-all-custom-servers", {
        map: { x: { url: 5 } },
        entityId,
      }),
      aiTools.raw("owner", "put", "replace-all-custom-servers", {
        map: "x",
        entityId,
      }),
      aiTools.raw("owner", "put", "set-disabled", {
        serverType: "ghost",
        toolNames: ["x"],
        entityId,
      }),
      aiTools.raw("owner", "put", "set-disabled", {
        serverType: "srv",
        toolNames: [1],
        entityId,
      }),
      aiTools.raw("owner", "put", "set-disabled", {
        toolNames: ["x"],
        entityId,
      }),
    ];
    for (const call of await Promise.all(refused)) {
      expect(call.status === 400 || call.data !== undefined).toBe(true);
      expect(
        call.status === 400 ||
          (call.data as McpMutationResult | undefined)?.success === false,
        `a refused write: ${call.status} ${call.text}`,
      ).toBe(true);
    }

    expect(await snapshot()).toEqual(before);
  });

  test("set-disabled and set-allow-always are independent: neither write changes the other, and a disabled tool is not enabled by its approval", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The engine's precedence between the two (a disabled tool must never run, even
    // one marked "always allow") needs a model that really calls the tool; here
    // only the stored state is pinned — both flags coexist and neither write
    // clears the other, so the engine always has both to read.
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "srv", HTTP_CONFIG, agentId);

    await aiTools.setAllowAlways("owner", {
      serverType: "srv",
      toolName: "t",
      value: true,
      agentId,
    });
    expect(
      await disabledOf(aiTools, agentId),
      "allow wrote no disabled",
    ).toEqual({});

    await aiTools.setDisabledTools("owner", {
      serverType: "srv",
      toolNames: ["t"],
      agentId,
    });
    expect(
      await allowedOf(aiTools, agentId),
      "disable kept the approval",
    ).toEqual(["srv_t"]);
    expect(
      (
        await aiTools.isToolDisabled("owner", {
          serverType: "srv",
          toolName: "t",
          agentId,
        })
      ).data,
      "the approval did not un-disable the tool",
    ).toBe(true);

    await aiTools.setDisabledTools("owner", {
      serverType: "srv",
      toolNames: [],
      agentId,
    });
    expect(
      await allowedOf(aiTools, agentId),
      "enabling does not revoke the approval",
    ).toEqual(["srv_t"]);

    await aiTools.setAllowAlways("owner", {
      serverType: "srv",
      toolName: "t",
      value: false,
      agentId,
    });
    await aiTools.setDisabledTools("owner", {
      serverType: "srv",
      toolNames: ["t"],
      agentId,
    });
    await aiTools.setAllowAlways("owner", {
      serverType: "srv",
      toolName: "t",
      value: false,
      agentId,
    });
    expect(
      await disabledOf(aiTools, agentId),
      "revoking the approval does not enable the tool",
    ).toEqual({ srv: ["t"] });
  });
});

test.describe("ToolsApi - settings of a deleted agent", () => {
  test("DELETE /api/2.0/ai/agents/{id} - the agent's disabled and allow-always entries are not reachable through its id, the portal or a new agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, aiChat, agentId, newAgent } = await setup(
      apiSdk,
      paymentsApi,
    );
    await register(aiTools, "doomed-srv", HTTP_CONFIG, agentId);
    await aiTools.setDisabledTools("owner", {
      serverType: "doomed-srv",
      toolNames: ["gone"],
      agentId,
    });
    await aiTools.setAllowAlways("owner", {
      serverType: "doomed-srv",
      toolName: "gone",
      value: true,
      agentId,
    });
    expect(await disabledOf(aiTools, agentId), "control, before").toEqual({
      "doomed-srv": ["gone"],
    });
    expect(await allowedOf(aiTools, agentId)).toEqual(["doomed-srv_gone"]);

    const deleted = await aiChat.deleteAgent("owner", agentId);
    expect(deleted.status).toBe(200);
    expect(await aiChat.waitForAgentDeleted("owner", agentId)).toBe(404);

    // A read through the dead id falls back to the portal scope, which holds none
    // of it.
    expect(await disabledOf(aiTools, agentId)).toEqual({});
    expect(await allowedOf(aiTools, agentId)).toEqual([]);
    expect(await disabledOf(aiTools)).toEqual({});
    expect(await allowedOf(aiTools)).toEqual([]);

    const fresh = await newAgent("Tools API Fresh Agent");
    expect(await disabledOf(aiTools, fresh)).toEqual({});
    expect(await allowedOf(aiTools, fresh)).toEqual([]);
    expect(await serversOf(aiTools, fresh)).toEqual({});
  });
});

test.describe("ToolsApi - concurrent writes", () => {
  test("POST /api/2.0/ai/tools/add-custom-server - eight concurrent registrations of one name store it once", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    const configs = Array.from({ length: 8 }, (_, index) => ({
      url: `https://race-${index}.example.invalid/sse`,
    }));

    const results = await Promise.all(
      configs.map((config) =>
        aiTools.addCustomServer("owner", {
          name: "contested",
          config,
          agentId,
        }),
      ),
    );

    const winners = results.filter((r) => r.data?.success === true);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(winners, "exactly one registration wins").toHaveLength(1);
    for (const loser of results.filter((r) => r.data?.success !== true)) {
      expect(loser.data?.error?.message).toContain("already registered");
    }
    const stored = await serversOf(aiTools, agentId);
    expect(Object.keys(stored)).toEqual(["contested"]);
    expect(configs).toContainEqual(stored.contested);
  });

  test("PUT|DELETE /api/2.0/ai/tools/*-custom-server - an update racing a remove leaves the server absent or whole, and its neighbours untouched", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    await register(aiTools, "bystander", STDIO_CONFIG, agentId);

    for (let round = 0; round < 4; round += 1) {
      const name = `racer-${round}`;
      await register(aiTools, name, HTTP_CONFIG, agentId);
      const next = { url: `https://raced-${round}.example.invalid/sse` };

      const [updated, removed] = await Promise.all([
        aiTools.updateCustomServer("owner", { name, config: next, agentId }),
        aiTools.removeCustomServer("owner", { name, agentId }),
      ]);
      // Measured: whichever lands first decides. Update first: 200 success. Remove
      // first: the update is a hard 404 `Not Found` (a never-registered name is a
      // soft 200 `Server not registered` — the two spellings of "gone" differ).
      if (updated.status === 200) {
        expect(updated.data?.success, `round ${round}`).toBe(true);
      } else {
        expect(updated.status, `round ${round}`).toBe(404);
        expect(updated.error, `round ${round}`).toBe("Not Found");
      }
      expect(removed.status, `round ${round}`).toBe(200);
      expect(removed.data?.success, `round ${round}`).toBe(true);

      const stored = await serversOf(aiTools, agentId);
      expect(stored.bystander, `round ${round}`).toEqual(STDIO_CONFIG);
      if (name in stored) {
        // An update that landed after the remove is a soft "not registered", so a
        // survivor must be one of the two whole configs — never a torn mix.
        expect([HTTP_CONFIG, next], `round ${round}`).toContainEqual(
          stored[name],
        );
      }
      expect(Object.keys(stored).filter((key) => key !== name)).toEqual([
        "bystander",
        ...Array.from({ length: round }, (_, i) => `racer-${i}`).filter(
          (key) => key in stored,
        ),
      ]);
    }
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - concurrent updates of different servers lose none", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { aiTools, agentId } = await setup(apiSdk, paymentsApi);
    const names = ["s0", "s1", "s2", "s3", "s4", "s5"];
    for (const name of names)
      await register(aiTools, name, HTTP_CONFIG, agentId);

    const results = await Promise.all(
      names.map((name) =>
        aiTools.updateCustomServer("owner", {
          name,
          config: { url: `https://${name}-new.example.invalid/sse` },
          agentId,
        }),
      ),
    );
    for (const result of results) expect(result.data?.success).toBe(true);

    expect(await serversOf(aiTools, agentId)).toEqual(
      Object.fromEntries(
        names.map((name) => [
          name,
          { url: `https://${name}-new.example.invalid/sse` },
        ]),
      ),
    );
  });
});
