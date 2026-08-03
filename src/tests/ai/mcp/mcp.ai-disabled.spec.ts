import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { ApiSDK } from "@/src/services/api-sdk";

// All twelve `/ai/tools/*` routes are pinned here, not just the ones the other
// suites happen to exercise: every one answers 403 once the portal AI switch is
// off, except `list-system-tools`, which keeps returning the built-in catalogue.
//
// Each test proves a transition rather than an end state. The portal is
// provisioned with `enableAiGateway`, the route is called once with AI on and
// must answer 200, the switch is flipped and read back, and only then is the
// 403 asserted. A test that only asserted the 403 would also pass when the
// route is refused for an unrelated reason — an unprovisioned gateway, a
// changed permission, or a disable call that never took effect. Every test
// therefore works on a real agent and, for the server routes, a really
// registered server; a nonexistent id would make a 403 indistinguishable from
// the portal refusing an unknown resource.
//
// The refused writes are deliberately different from the value that is already
// stored (disable -> clear, allow -> revoke, update -> a third URL), so the
// "nothing changed" check after re-enabling can actually fail.

const SERVER_CONFIG = { url: "https://mcp.example.invalid/sse" };
const UPDATED_CONFIG = { url: "https://mcp-updated.example.invalid/sse" };
const DISABLED_CONFIG = { url: "https://mcp-written-while-off.invalid/sse" };

type OwnerApi = Parameters<typeof setPortalAiAccess>[0];

/** Flips the portal AI switch off and proves it actually stored the value. */
async function turnAiOff(ownerApi: OwnerApi) {
  const result = await setPortalAiAccess(ownerApi, false);
  expect(result.writeStatus, "PUT /settings/ai-access {enabled:false}").toBe(
    200,
  );
  expect(result.enabled, "ai-access read back after disabling").toBe(false);
}

/** Back on, so the refused write can be checked for side effects. */
async function turnAiOn(ownerApi: OwnerApi) {
  const result = await setPortalAiAccess(ownerApi, true);
  expect(result.writeStatus, "PUT /settings/ai-access {enabled:true}").toBe(
    200,
  );
  expect(result.enabled, "ai-access read back after re-enabling").toBe(true);
}

/** Provisioned gateway + one real agent to scope every tools call to. */
async function mcpSetup(
  apiSdk: ApiSDK,
  paymentsApi: Parameters<typeof enableAiGateway>[0],
) {
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

test.describe("MCP - AI Disabled", () => {
  test("GET /api/2.0/ai/tools/list-system-tools - stays readable when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Deliberately pinned: the built-in tool catalogue is the one tools route
    // the portal AI switch does not gate.
    const { ownerApi, aiTools } = await mcpSetup(apiSdk, paymentsApi);

    const before = await aiTools.listSystemTools("owner");
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { data, status } = await aiTools.listSystemTools("owner");

    expect(status).toBe(200);
    expect((data?.docspace ?? []).length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/ai/tools/list-custom-servers - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.addCustomServer("owner", {
      name: "autotest-server",
      config: SERVER_CONFIG,
      agentId,
    });
    const before = await aiTools.listCustomServers("owner", agentId);
    expect(before.status).toBe(200);
    expect(Object.keys(before.data)).toContain("autotest-server");

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.listCustomServers("owner", agentId);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/get-custom-server - a registered server becomes unreadable when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.addCustomServer("owner", {
      name: "autotest-server",
      config: SERVER_CONFIG,
      agentId,
    });
    const before = await aiTools.getCustomServer(
      "owner",
      "autotest-server",
      agentId,
    );
    expect(before.status).toBe(200);
    expect(before.data).toEqual(SERVER_CONFIG);

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.getCustomServer(
      "owner",
      "autotest-server",
      agentId,
    );

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/tools/add-custom-server - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    const before = await aiTools.addCustomServer("owner", {
      name: "autotest-server-added-while-on",
      config: SERVER_CONFIG,
      agentId,
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.addCustomServer("owner", {
      name: "autotest-server-added-while-off",
      config: SERVER_CONFIG,
      agentId,
    });

    // Nothing must have been registered behind the 403.
    await turnAiOn(ownerApi);
    const { data: list } = await aiTools.listCustomServers("owner", agentId);
    expect(Object.keys(list)).toContain("autotest-server-added-while-on");
    expect(Object.keys(list)).not.toContain("autotest-server-added-while-off");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - a registered server cannot be reconfigured when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.addCustomServer("owner", {
      name: "autotest-server",
      config: SERVER_CONFIG,
      agentId,
    });
    const before = await aiTools.updateCustomServer("owner", {
      name: "autotest-server",
      config: UPDATED_CONFIG,
      agentId,
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.updateCustomServer("owner", {
      name: "autotest-server",
      config: DISABLED_CONFIG,
      agentId,
    });

    // The refused update must not have landed on the stored config.
    await turnAiOn(ownerApi);
    const { data: after } = await aiTools.getCustomServer(
      "owner",
      "autotest-server",
      agentId,
    );
    expect(after).toEqual(UPDATED_CONFIG);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/tools/remove-custom-server - a registered server cannot be removed when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.addCustomServer("owner", {
      name: "autotest-throwaway-server",
      config: SERVER_CONFIG,
      agentId,
    });
    await aiTools.addCustomServer("owner", {
      name: "autotest-server",
      config: SERVER_CONFIG,
      agentId,
    });

    const before = await aiTools.removeCustomServer("owner", {
      name: "autotest-throwaway-server",
      agentId,
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.removeCustomServer("owner", {
      name: "autotest-server",
      agentId,
    });

    // A surviving registration is what tells the 403 apart from a silently
    // accepted delete — `remove` reports a missing server as success anyway.
    await turnAiOn(ownerApi);
    const { data: list } = await aiTools.listCustomServers("owner", agentId);
    expect(Object.keys(list)).toContain("autotest-server");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/get-disabled - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: ["delete_file"],
      agentId,
    });
    const before = await aiTools.getDisabledTools("owner", agentId);
    expect(before.status).toBe(200);
    expect(before.data?.docspace).toEqual(["delete_file"]);

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.getDisabledTools("owner", agentId);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/tools/set-disabled - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    const before = await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: ["delete_file"],
      agentId,
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    // Clearing the list, so a write that slipped through would be visible.
    const { status, error } = await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: [],
      agentId,
    });

    await turnAiOn(ownerApi);
    const { data: after } = await aiTools.getDisabledTools("owner", agentId);
    expect(after?.docspace).toEqual(["delete_file"]);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/is-tool-disabled - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: ["delete_file"],
      agentId,
    });
    const before = await aiTools.isToolDisabled("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });
    expect(before.status).toBe(200);
    expect(before.data).toBe(true);

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.isToolDisabled("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/get-allow-always - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
      agentId,
    });
    const before = await aiTools.getAllowAlways("owner", agentId);
    expect(before.status).toBe(200);
    expect(before.data).toContain("delete_file");

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.getAllowAlways("owner", agentId);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/tools/set-allow-always - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    const before = await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
      agentId,
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    // Revoking, so a write that slipped through would be visible.
    const { status, error } = await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: false,
      agentId,
    });

    await turnAiOn(ownerApi);
    const { data: after } = await aiTools.getAllowAlways("owner", agentId);
    expect(after).toContain("delete_file");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/is-allow-always - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { ownerApi, aiTools, agentId } = await mcpSetup(apiSdk, paymentsApi);

    await aiTools.setAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      value: true,
      agentId,
    });
    const before = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });
    expect(before.status).toBe(200);
    expect(before.data).toBe(true);

    await turnAiOff(ownerApi);

    const { status, error } = await aiTools.isAllowAlways("owner", {
      serverType: "docspace",
      toolName: "delete_file",
      agentId,
    });

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });
});
