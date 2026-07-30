import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiTools } from "@/src/helpers/ai-tools";

// Every tools route is gated by the portal AI switch except
// `list-system-tools`, which keeps answering 200. That exception is pinned
// below rather than left as an assumption.

const fakeAgentId = 999999999;

test.describe("MCP - AI Disabled", () => {
  test("GET /api/2.0/ai/tools/list-custom-servers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiTools.listCustomServers("owner", fakeAgentId);

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/tools/add-custom-server - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiTools.addCustomServer("owner", {
      name: "autotest-server",
      config: { url: "https://mcp.example.invalid/sse" },
      agentId: fakeAgentId,
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/tools/update-custom-server - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiTools.updateCustomServer("owner", {
      name: "autotest-server",
      config: { url: "https://mcp.example.invalid/sse" },
      agentId: fakeAgentId,
    });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/tools/remove-custom-server - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiTools.removeCustomServer("owner", {
      name: "autotest-server",
      agentId: fakeAgentId,
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/tools/set-disabled - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiTools.setDisabledTools("owner", {
      serverType: "docspace",
      toolNames: ["delete_file"],
      agentId: fakeAgentId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/get-disabled - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiTools.getDisabledTools("owner", fakeAgentId);

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/get-allow-always - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await aiTools.getAllowAlways("owner", fakeAgentId);

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/tools/list-system-tools - stays readable when AI access is disabled", async ({
    apiSdk,
  }) => {
    // Deliberately pinned: the built-in tool catalogue is the one tools route
    // the portal AI switch does not gate.
    const ownerApi = apiSdk.forRole("owner");
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { data, status } = await aiTools.listSystemTools("owner");

    expect(status).toBe(200);
    expect((data?.docspace ?? []).length).toBeGreaterThan(0);
  });
});
