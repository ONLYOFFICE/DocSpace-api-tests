import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import config from "@/config";

const GITHUB_MCP_ENDPOINT = config.GITHUB_MCP_ENDPOINT;
const fakeServerId = "00000000-0000-0000-0000-000000000000";
const fakeRoomId = 999999999;

test.describe("MCP Servers - AI Disabled", () => {
  test("POST /api/2.0/ai/servers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-disabled-${Date.now()}`,
        description: "test",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: "Bearer token" },
      },
    });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/servers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set([fakeServerId]),
      },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/servers/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.updateServer({
      id: fakeServerId,
      updateServerRequestBody: { name: `mcp-disabled-${Date.now()}` },
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/servers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.getServers();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/servers/available - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.getAvailableServers();

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/servers/:id - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.getServer({ id: fakeServerId });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/servers/:id/status - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.setServerStatus({
      id: fakeServerId,
      setServerStatusRequestBody: { enabled: false },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.addRoomServers({
      roomId: fakeRoomId,
      addRoomServersRequestBody: { servers: new Set([fakeServerId]) },
    });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/ai/rooms/:roomId/servers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.deleteRoomServers({
      roomId: fakeRoomId,
      deleteRoomServersRequestBody: { servers: new Set([fakeServerId]) },
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.getRoomServers({
      roomId: fakeRoomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.getTools({
      roomId: fakeRoomId,
      serverId: fakeServerId,
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.mcp.setTools({
      roomId: fakeRoomId,
      serverId: fakeServerId,
      setMcpToolsRequestBody: { disabledTools: [] },
    });

    expect(status).toBe(403);
  });
});
