import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders, toCreateDto } from "@/src/helpers/ai-providers";
import { readIconAsBase64 } from "@/src/utils/icon.utils";
import config from "@/config";
import { RoomType, ServerType } from "@onlyoffice/docspace-api-sdk";

const GITHUB_MCP_ENDPOINT = config.GITHUB_MCP_ENDPOINT;

// NOTE: OAuth-based MCP servers are not covered by these tests — only API-key-based servers
// (GitHub Copilot MCP) are used as the test target. OAuth authentication flow for MCP servers
// is not yet fully implemented and is still in development.
//
// The following methods are also not covered for the same reason (functionality is incomplete,
// endpoints are under active development):
//   - connectServer    POST /api/2.0/ai/rooms/{roomId}/servers/{serverId}/connect
//   - disconnectServer POST /api/2.0/ai/rooms/{roomId}/servers/{serverId}/disconnect

test.describe("MCP Servers", () => {
  test("BUG 81107: POST /api/2.0/ai/servers - Owner registers a custom MCP server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data, status } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-basic-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
        icon: readIconAsBase64("src/assets/mcp-icon.png"),
      },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    const server = data.response!;
    expect(server.id).toBeDefined();
    expect(server.name).toBeDefined();
    expect(server.description).toBeDefined();
    expect(server.endpoint).toBe(GITHUB_MCP_ENDPOINT);
    expect(server.headers).toEqual({
      Authorization: `Bearer ${mcpApiKey}`,
    });
    expect(server.icon).toBeDefined();
    expect(server.serverType).toBeDefined();
    expect(server.enabled).toBeDefined();
    expect(server.needReset).toBeDefined();
  });
});

test.describe("MCP Servers - Update", () => {
  test("BUG 81107: PUT /api/2.0/ai/servers/:id - Owner updates MCP server name", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-upd-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const newName = `mcp-renamed-${Date.now()}`;
    const { data, status } = await api.mcp.updateServer({
      id: serverId,
      updateServerRequestBody: {
        name: newName,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(newName);
  });

  test("BUG 81107: PUT /api/2.0/ai/servers/:id - Owner updates MCP server description", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-upd-${Date.now()}`,
        description: "Original description",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const newDescription = "Updated description";
    const { data, status } = await api.mcp.updateServer({
      id: serverId,
      updateServerRequestBody: {
        description: newDescription,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.description).toBe(newDescription);
  });
});

test.describe("MCP Servers - Delete", () => {
  test("DELETE /api/2.0/ai/servers - Owner deletes a MCP server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-del-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { data, status } = await api.mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set([serverId]),
      },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();

    const { status: getStatus } = await api.mcp.getServer({ id: serverId });
    expect(getStatus).toBe(404);
  });

  test("DELETE /api/2.0/ai/servers - Owner deletes multiple MCP servers in one request", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const ts = Date.now();
    const serverIds: string[] = [];
    for (const suffix of ["first", "second", "third"]) {
      const { data } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-multi-${suffix}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    const { data, status } = await api.mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set(serverIds),
      },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();

    for (const id of serverIds) {
      const { status: getStatus } = await api.mcp.getServer({ id });
      expect(getStatus).toBe(404);
    }
  });

  test("DELETE /api/2.0/ai/servers - DocSpaceAdmin deletes multiple MCP servers in one request", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const ownerApi = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const ts = Date.now();
    const serverIds: string[] = [];
    for (const suffix of ["first", "second", "third"]) {
      const { data } = await ownerApi.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-multi-admin-${suffix}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set(serverIds),
      },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();

    for (const id of serverIds) {
      const { status: getStatus } = await ownerApi.mcp.getServer({ id });
      expect(getStatus).toBe(404);
    }
  });

  test("DELETE /api/2.0/ai/servers - DocSpaceAdmin deletes a MCP server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const ownerApi = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await ownerApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: created } = await ownerApi.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-del-admin-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set([serverId]),
      },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();
  });
});

test.describe("MCP Servers - Set Status", () => {
  test("PUT /api/2.0/ai/servers/:id/status - Owner disables an MCP server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-disable-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { data, status } = await api.mcp.setServerStatus({
      id: serverId,
      setServerStatusRequestBody: { enabled: false },
    });

    expect(status).toBe(200);
    expect(data.response?.enabled).toBe(false);
  });

  test("PUT /api/2.0/ai/servers/:id/status - Owner re-enables a disabled MCP server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-reenable-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.setServerStatus({
      id: serverId,
      setServerStatusRequestBody: { enabled: false },
    });

    const { data, status } = await api.mcp.setServerStatus({
      id: serverId,
      setServerStatusRequestBody: { enabled: true },
    });

    expect(status).toBe(200);
    expect(data.response?.enabled).toBe(true);
  });
});

test.describe("MCP Servers - Get", () => {
  test("BUG 81107: GET /api/2.0/ai/servers - Owner gets list of MCP servers", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const serverName = `mcp-basic-${Date.now()}`;
    const serverDescription = "GitHub Copilot MCP server";

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: serverName,
        description: serverDescription,
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
        icon: readIconAsBase64("src/assets/mcp-icon.png"),
      },
    });
    const serverId = created.response!.id!;

    const { data, status } = await api.mcp.getServers();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    const found = data.response!.find((s) => s.id === serverId);
    expect(found).toBeDefined();
    expect(found!.name).toBe(serverName);
    expect(found!.description).toBe(serverDescription);
    expect(found!.endpoint).toBe(GITHUB_MCP_ENDPOINT);
  });

  test("GET /api/2.0/ai/servers/:id - Owner gets MCP server by id", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const serverName = `mcp-get-${Date.now()}`;
    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: serverName,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { data, status } = await api.mcp.getServer({ id: serverId });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    const server = data.response!;
    expect(server.id).toBe(serverId);
    expect(server.name).toBe(serverName);
    expect(server.serverType).toBeDefined();
    expect(server.enabled).toBeDefined();
  });

  test("GET /api/2.0/ai/servers/available - Owner gets available MCP servers", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const ts = Date.now();

    const { data: created1 } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-avail-enabled-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const enabledServerId = created1.response!.id!;

    const { data: created2 } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-avail-disabled-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const disabledServerId = created2.response!.id!;

    await api.mcp.setServerStatus({
      id: disabledServerId,
      setServerStatusRequestBody: { enabled: false },
    });

    const { data, status } = await api.mcp.getAvailableServers();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    const ids = data.response!.map((s) => s.id);
    expect(ids).toContain(enabledServerId);
    expect(ids).not.toContain(disabledServerId);
  });
});

test.describe("MCP Servers - Add Room Servers", () => {
  test("POST /api/2.0/ai/rooms/:roomId/servers - Owner adds one MCP server to room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-room-add-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { data, status } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response).toHaveLength(1);
    expect(data.response![0].id).toBe(serverId);
    expect(data.response![0].connected).toBe(true);
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - Owner adds 2 MCP servers to room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const serverIds: string[] = [];
    for (const suffix of ["a", "b"]) {
      const { data } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-multi-${suffix}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    const { data, status } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response).toHaveLength(2);

    const returnedIds = data.response!.map((s) => s.id);
    for (const id of serverIds) {
      expect(returnedIds).toContain(id);
    }
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - Owner adds exactly 5 MCP servers to room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const serverIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { data } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-five-${i}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    const { status } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - response contains valid McpServerStatusDto structure", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-contract-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
        icon: readIconAsBase64("src/assets/mcp-icon.png"),
      },
    });
    const serverId = created.response!.id!;

    const { data } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const server = data.response![0];
    expect(server.id).toBeDefined();
    expect(server.name).toBeDefined();
    expect(server.serverType).toBeDefined();
    expect(server.connected).toBeDefined();
    expect(server.icon).toBeDefined();
    expect(server.needReset).toBeDefined();
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - DocSpaceAdmin can add servers to room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await adminApi.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await adminApi.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-admin-room-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { status } = await adminApi.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - server is linked to room after request", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-linked-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: roomServers, status } = await api.mcp.getRoomServers({
      roomId,
    });

    expect(status).toBe(200);
    expect(roomServers.response!.map((s) => s.id)).toContain(serverId);
  });

  test("BUG 81166: POST /api/2.0/ai/rooms/:roomId/servers - re-adding already linked server does not create duplicate", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-idem-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { status } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    expect(status).toBe(400);

    const { data: roomServers, status: getRoomStatus } =
      await api.mcp.getRoomServers({ roomId });
    expect(getRoomStatus).toBe(200);
    const matches = roomServers.response!.filter((s) => s.id === serverId);
    expect(matches).toHaveLength(1);
  });
});

test.describe("MCP Servers - Delete Room Servers", () => {
  test("DELETE /api/2.0/ai/rooms/:roomId/servers - Owner deletes one MCP server from room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-delroom-one-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();
  });

  test("DELETE /api/2.0/ai/rooms/:roomId/servers - Owner deletes multiple MCP servers from room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const serverIds: string[] = [];
    for (const suffix of ["a", "b", "c"]) {
      const { data } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-delroom-multi-${suffix}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    const { data, status } = await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();
  });

  test("DELETE /api/2.0/ai/rooms/:roomId/servers - deleting all linked servers leaves room with empty server list", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const serverIds: string[] = [];
    for (const suffix of ["x", "y"]) {
      const { data } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-delroom-all-${suffix}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    const { data: roomServers, status } = await api.mcp.getRoomServers({
      roomId,
    });

    expect(status).toBe(200);
    expect(roomServers.response).toHaveLength(0);
  });

  test("DELETE /api/2.0/ai/rooms/:roomId/servers - deleting only selected servers does not remove remaining linked servers", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const serverIds: string[] = [];
    for (const suffix of ["keep1", "keep2", "del"]) {
      const { data } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-delroom-sel-${suffix}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    const [keepId1, keepId2, deleteId] = serverIds;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set([deleteId]) },
    });

    const { data: roomServers, status: getRoomStatus } =
      await api.mcp.getRoomServers({ roomId });
    expect(getRoomStatus).toBe(200);
    const linkedIds = roomServers.response!.map((s) => s.id);

    expect(linkedIds).not.toContain(deleteId);
    expect(linkedIds).toContain(keepId1);
    expect(linkedIds).toContain(keepId2);
  });

  test("DELETE /api/2.0/ai/rooms/:roomId/servers - deleting from one room does not affect another room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room1 } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room1-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId1 = room1.response!.id!;

    const { data: room2 } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room2-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId2 = room2.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-delroom-iso-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId: roomId1,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });
    await api.mcp.addRoomServers({
      roomId: roomId2,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    await api.mcp.deleteRoomServers({
      roomId: roomId1,
      deleteRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: room2Servers, status: getRoom2Status } =
      await api.mcp.getRoomServers({ roomId: roomId2 });
    expect(getRoom2Status).toBe(200);
    expect(room2Servers.response!.map((s) => s.id)).toContain(serverId);
  });

  test("DELETE /api/2.0/ai/rooms/:roomId/servers - deleted server can be re-added to room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-delroom-readd-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { status: addStatus } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });
    expect(addStatus).toBe(200);

    const { data: roomServers, status: getRoomStatus } =
      await api.mcp.getRoomServers({ roomId });
    expect(getRoomStatus).toBe(200);
    expect(roomServers.response!.map((s) => s.id)).toContain(serverId);
  });

  test("DELETE /api/2.0/ai/rooms/:roomId/servers - repeated delete of same server ids returns 204", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-delroom-idem-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();
  });
});

test.describe("MCP Servers - Get Room Servers", () => {
  test("GET /api/2.0/ai/rooms/:roomId/servers - returns 200 and empty array when no servers are assigned", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-empty-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - returns 200 with connected=true for one assigned direct server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-getroom-one-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(1);
    expect(data.response![0].id).toBe(serverId);
    expect(data.response![0].connected).toBe(true);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - returns all assigned servers when multiple are linked", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const serverIds: string[] = [];
    for (const suffix of ["a", "b", "c"]) {
      const { data } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-getroom-multi-${suffix}-${ts}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: `Bearer ${mcpApiKey}` },
        },
      });
      serverIds.push(data.response!.id!);
    }

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set(serverIds) },
    });

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(3);
    const returnedIds = data.response!.map((s) => s.id);
    for (const id of serverIds) {
      expect(returnedIds).toContain(id);
    }
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - direct server has connected=true for Owner", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-personal-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.getRoomServers({ roomId });
    expect(status).toBe(200);
    expect(data.response).toHaveLength(1);
    expect(data.response![0].connected).toBe(true);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - response contains valid McpServerStatusDto structure", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-contract-get-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
        icon: readIconAsBase64("src/assets/mcp-icon.png"),
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(1);

    const server = data.response![0];
    expect(server.id).toBeDefined();
    expect(server.name).toBeDefined();
    expect(server.serverType).toBeDefined();
    expect(server.connected).toBeDefined();
    expect(server.icon).toBeDefined();
    expect(server.needReset).toBeDefined();
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - returns only servers assigned to requested room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room1 } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room1-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const room1Id = room1.response!.id!;

    const { data: room2 } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room2-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const room2Id = room2.response!.id!;

    const { data: server1Data } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-isolation-1-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const server1Id = server1Data.response!.id!;

    const { data: server2Data } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-isolation-2-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const server2Id = server2Data.response!.id!;

    await api.mcp.addRoomServers({
      roomId: room1Id,
      addRoomServersRequestBody: { servers: new Set([server1Id]) },
    });

    await api.mcp.addRoomServers({
      roomId: room2Id,
      addRoomServersRequestBody: { servers: new Set([server2Id]) },
    });

    const { data: room1Servers, status: getRoom1Status } =
      await api.mcp.getRoomServers({ roomId: room1Id });
    expect(getRoom1Status).toBe(200);

    const { data: room2Servers, status: getRoom2Status } =
      await api.mcp.getRoomServers({ roomId: room2Id });
    expect(getRoom2Status).toBe(200);

    const room1Ids = room1Servers.response!.map((s) => s.id);
    const room2Ids = room2Servers.response!.map((s) => s.id);

    expect(room1Ids).toContain(server1Id);
    expect(room1Ids).not.toContain(server2Id);

    expect(room2Ids).toContain(server2Id);
    expect(room2Ids).not.toContain(server1Id);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - needReset is false for a healthy server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-needreset-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status: getRoomStatus } = await api.mcp.getRoomServers({
      roomId,
    });
    expect(getRoomStatus).toBe(200);
    const server = data.response!.find((s) => s.id === serverId)!;

    expect(server.needReset).toBe(false);
  });
});

test.describe("MCP Servers - Get Tools", () => {
  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - Owner gets tools for valid room and connected MCP server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-tools-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-tools-get-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.getTools({ roomId, serverId });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - response returns valid McpToolArrayWrapper structure", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-tools-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-tools-struct-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.getTools({ roomId, serverId });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(Array.isArray(data.response)).toBe(true);

    for (const tool of data.response!) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.enabled).toBe("boolean");
    }
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - all tools are enabled by default after server is added to room", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-tools-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-tools-default-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data } = await api.mcp.getTools({ roomId, serverId });

    expect(data.response!.length).toBeGreaterThan(0);
    for (const tool of data.response!) {
      expect(tool.enabled).toBe(true);
    }
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - tool state changes are reflected in subsequent getTools call", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-tools-room-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-tools-state-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: before } = await api.mcp.getTools({ roomId, serverId });
    expect(before.response!.length).toBeGreaterThan(0);

    const toolToDisable = before.response![0].name!;

    await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    const { data: after, status } = await api.mcp.getTools({
      roomId,
      serverId,
    });

    expect(status).toBe(200);

    const disabledTool = after.response!.find((t) => t.name === toolToDisable);
    expect(disabledTool).toBeDefined();
    expect(disabledTool!.enabled).toBe(false);

    const remainingTools = after.response!.filter(
      (t) => t.name !== toolToDisable,
    );
    for (const tool of remainingTools) {
      expect(tool.enabled).toBe(true);
    }
  });
});

test.describe("MCP Servers - Set Tools", () => {
  test("BUG 81208: PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - disables one existing tool and keeps others enabled", async ({
    apiSdk,
  }) => {
    test.fail();
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-one-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-one-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const tools = toolsData.response!;
    expect(tools.length).toBeGreaterThan(0);

    const toolToDisable = tools[0].name!;

    const { data, status } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    expect(status).toBe(200);

    const disabled = data.response!.find((t) => t.name === toolToDisable);
    expect(disabled!.enabled).toBe(false);

    for (const t of data.response!.filter((t) => t.name !== toolToDisable)) {
      expect(t.enabled).toBe(true);
    }
  });

  test("BUG 81208: PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - disables multiple existing tools", async ({
    apiSdk,
  }) => {
    test.fail();
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-multi-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-multi-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const tools = toolsData.response!;
    expect(tools.length).toBeGreaterThanOrEqual(2);

    const toDisable = [tools[0].name!, tools[1].name!];

    const { data, status } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: toDisable },
    });

    expect(status).toBe(200);

    for (const name of toDisable) {
      expect(data.response!.find((t) => t.name === name)!.enabled).toBe(false);
    }
    for (const t of data.response!.filter(
      (t) => !toDisable.includes(t.name!),
    )) {
      expect(t.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - enables all tools when disabledTools is empty", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-empty-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-empty-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const firstTool = toolsData.response![0].name!;

    await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [firstTool] },
    });

    const { data, status } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [] },
    });

    expect(status).toBe(200);
    for (const t of data.response!) {
      expect(t.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - is idempotent when sending same disabledTools twice", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-idem-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-idem-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const toolToDisable = toolsData.response![0].name!;

    await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    const { data, status } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    expect(status).toBe(200);
    expect(data.response!.find((t) => t.name === toolToDisable)!.enabled).toBe(
      false,
    );
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - re-enables tool when it is removed from disabledTools", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-reenable-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-reenable-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const toolToToggle = toolsData.response![0].name!;

    await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToToggle] },
    });

    const { data, status } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [] },
    });

    expect(status).toBe(200);
    expect(data.response!.find((t) => t.name === toolToToggle)!.enabled).toBe(
      true,
    );
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - returns 200 and valid McpToolArrayWrapper", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-contract-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-contract-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data, status } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [] },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(Array.isArray(data.response)).toBe(true);
    expect(typeof data.count).toBe("number");

    for (const tool of data.response!) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.enabled).toBe("boolean");
    }
  });

  test("BUG 81208: PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - returns tools with correct enabled/disabled states in response", async ({
    apiSdk,
  }) => {
    test.fail();
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-states-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-states-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const tools = toolsData.response!;
    expect(tools.length).toBeGreaterThan(0);

    const toolToDisable = tools[0].name!;

    const { data } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    expect(data.response!.find((t) => t.name === toolToDisable)!.enabled).toBe(
      false,
    );
    for (const t of data.response!.filter((t) => t.name !== toolToDisable)) {
      expect(t.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - returns all tools of the server in response", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-alltools-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-alltools-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const expectedCount = toolsData.response!.length;

    const { data } = await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [] },
    });

    expect(data.response!.length).toBe(expectedCount);
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - persists disabled state and returns correct data via getTools", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-persist-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-persist-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({ roomId, serverId });
    const toolToDisable = toolsData.response![0].name!;

    await api.mcp.setTools({
      roomId,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    const { data, status } = await api.mcp.getTools({ roomId, serverId });

    expect(status).toBe(200);
    expect(data.response!.find((t) => t.name === toolToDisable)!.enabled).toBe(
      false,
    );
    for (const t of data.response!.filter((t) => t.name !== toolToDisable)) {
      expect(t.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - does not affect tool state in other rooms for the same server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const provider = aiProviders.deepSeek;
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(provider),
    });

    const { data: room1 } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-iso1-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const room1Id = room1.response!.id!;

    const { data: room2 } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-set-iso2-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const room2Id = room2.response!.id!;

    const { data: created } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-set-iso-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.addRoomServers({
      roomId: room1Id,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });
    await api.mcp.addRoomServers({
      roomId: room2Id,
      addRoomServersRequestBody: { servers: new Set([serverId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({
      roomId: room1Id,
      serverId,
    });
    const toolToDisable = toolsData.response![0].name!;

    await api.mcp.setTools({
      roomId: room1Id,
      serverId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    const { data: room2Tools, status } = await api.mcp.getTools({
      roomId: room2Id,
      serverId,
    });

    expect(status).toBe(200);
    expect(
      room2Tools.response!.find((t) => t.name === toolToDisable)!.enabled,
    ).toBe(true);
  });
});

test.describe("MCP Servers - Built-in DocSpace Server", () => {
  test("GET /api/2.0/ai/servers/available - built-in DocSpace server is present in the list", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .mcp.getAvailableServers();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    const builtIn = data.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    );
    expect(builtIn).toBeDefined();
  });

  test.fail(
    "BUG 81211: GET /api/2.0/ai/servers/available - built-in DocSpace server has correct McpServerShortDto fields",
    async ({ apiSdk }) => {
      const { data } = await apiSdk.forRole("owner").mcp.getAvailableServers();

      const server = data.response!.find(
        (s) => s.serverType === ServerType.DocSpace,
      );
      expect(server).toBeDefined();

      expect(server!.id).toBeDefined();
      expect(server!.name).toBeDefined();
      expect(server!.serverType).toBe(ServerType.DocSpace);
      expect(server!.icon).toBeDefined();
      expect(typeof server!.needReset).toBe("boolean");
      expect(server!.enabled).toBe(true);
    },
  );

  test("GET /api/2.0/ai/servers/available - RoomAdmin can see built-in DocSpace server", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await api.mcp.getAvailableServers();

    expect(status).toBe(200);
    const builtIn = data.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    );
    expect(builtIn).toBeDefined();
  });

  test("GET /api/2.0/ai/servers/available - User can see built-in DocSpace server", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await api.mcp.getAvailableServers();

    expect(status).toBe(200);
    const builtIn = data.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    );
    expect(builtIn).toBeDefined();
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - Owner adds built-in DocSpace server to room", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-add-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data, status } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.map((s) => s.id)).toContain(builtInServerId);
  });

  test("POST /api/2.0/ai/rooms/:roomId/servers - built-in DocSpace server has correct McpServerStatusDto fields after being added to room", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-struct-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const server = data.response!.find((s) => s.id === builtInServerId)!;
    expect(server.id).toBe(builtInServerId);
    expect(server.name).toBeDefined();
    expect(server.serverType).toBe(ServerType.DocSpace);
    expect(server.connected).toBe(true);
    expect(typeof server.needReset).toBe("boolean");
  });

  test.fail(
    "BUG 81166: POST /api/2.0/ai/rooms/:roomId/servers - re-adding built-in DocSpace server does not create duplicate",
    async ({ apiSdk }) => {
      const api = apiSdk.forRole("owner");
      const ts = Date.now();

      const { data: available } = await api.mcp.getAvailableServers();
      const builtInServerId = available.response!.find(
        (s) => s.serverType === ServerType.DocSpace,
      )!.id!;

      const { data: room } = await api.rooms.createRoom({
        createRoomRequestDto: {
          title: `mcp-builtin-idem-${ts}`,
          roomType: RoomType.AiRoom,
        },
      });
      const roomId = room.response!.id!;

      await api.mcp.addRoomServers({
        roomId,
        addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
      });

      const { status } = await api.mcp.addRoomServers({
        roomId,
        addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
      });
      expect(status).toBe(200);

      const { data: roomServers } = await api.mcp.getRoomServers({ roomId });
      const matches = roomServers.response!.filter(
        (s) => s.id === builtInServerId,
      );
      expect(matches).toHaveLength(1);
    },
  );

  test("POST /api/2.0/ai/rooms/:roomId/servers - Owner adds built-in DocSpace server together with a custom server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    await api.providers.addProvider({
      createProviderRequestDto: toCreateDto(aiProviders.deepSeek),
    });

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: custom } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-builtin-mix-${ts}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const customServerId = custom.response!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-mix-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data, status } = await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: {
        servers: new Set([builtInServerId, customServerId]),
      },
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(2);
    const returnedIds = data.response!.map((s) => s.id);
    expect(returnedIds).toContain(builtInServerId);
    expect(returnedIds).toContain(customServerId);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - built-in DocSpace server is visible after addRoomServers", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-getroom-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    expect(data.response!.map((s) => s.id)).toContain(builtInServerId);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - built-in DocSpace server is not visible before being added", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-getroom-before-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    expect(data.response!.map((s) => s.id)).not.toContain(builtInServerId);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - built-in DocSpace server disappears after deleteRoomServers", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-getroom-del-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    await api.mcp.deleteRoomServers({
      roomId,
      deleteRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    expect(data.response!.map((s) => s.id)).not.toContain(builtInServerId);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers - built-in DocSpace server has correct McpServerStatusDto structure", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-getroom-dto-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data, status } = await api.mcp.getRoomServers({ roomId });

    expect(status).toBe(200);
    const server = data.response!.find((s) => s.id === builtInServerId)!;
    expect(server.id).toBe(builtInServerId);
    expect(server.name).toBeDefined();
    expect(server.serverType).toBe(ServerType.DocSpace);
    expect(server.connected).toBe(true);
    expect(typeof server.needReset).toBe("boolean");
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - returns tools for built-in DocSpace server", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-tools-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data, status } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - each tool of built-in DocSpace server has correct McpToolDto fields", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-tools-dto-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });

    expect(data.response!.length).toBeGreaterThan(0);
    for (const tool of data.response!) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name).not.toBeNull();
      expect(typeof tool.enabled).toBe("boolean");
    }
  });

  test("GET /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - all tools of built-in DocSpace server are enabled by default", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-tools-default-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });

    expect(data.response!.length).toBeGreaterThan(0);
    for (const tool of data.response!) {
      expect(tool.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - disables one tool for built-in DocSpace server", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-settools-one-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    const toolToDisable = toolsData.response![0].name!;

    const { status } = await api.mcp.setTools({
      roomId,
      serverId: builtInServerId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });
    expect(status).toBe(200);

    const { data: after } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    expect(after.response!.find((t) => t.name === toolToDisable)!.enabled).toBe(
      false,
    );
    for (const t of after.response!.filter((t) => t.name !== toolToDisable)) {
      expect(t.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - re-enables a disabled tool for built-in DocSpace server", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-settools-reenable-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    const toolToToggle = toolsData.response![0].name!;

    await api.mcp.setTools({
      roomId,
      serverId: builtInServerId,
      setMcpToolsRequestBody: { disabledTools: [toolToToggle] },
    });

    await api.mcp.setTools({
      roomId,
      serverId: builtInServerId,
      setMcpToolsRequestBody: { disabledTools: [] },
    });

    const { data: after } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    for (const t of after.response!) {
      expect(t.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - changes state of multiple tools for built-in DocSpace server", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-settools-multi-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    expect(toolsData.response!.length).toBeGreaterThanOrEqual(2);
    const toDisable = [
      toolsData.response![0].name!,
      toolsData.response![1].name!,
    ];

    const { status } = await api.mcp.setTools({
      roomId,
      serverId: builtInServerId,
      setMcpToolsRequestBody: { disabledTools: toDisable },
    });
    expect(status).toBe(200);

    const { data: after } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    for (const name of toDisable) {
      expect(after.response!.find((t) => t.name === name)!.enabled).toBe(false);
    }
    for (const t of after.response!.filter(
      (t) => !toDisable.includes(t.name!),
    )) {
      expect(t.enabled).toBe(true);
    }
  });

  test("PUT /api/2.0/ai/rooms/:roomId/servers/:serverId/tools - setTools changes for built-in server are persisted and visible via getTools", async ({
    apiSdk,
  }) => {
    const api = apiSdk.forRole("owner");
    const ts = Date.now();

    const { data: available } = await api.mcp.getAvailableServers();
    const builtInServerId = available.response!.find(
      (s) => s.serverType === ServerType.DocSpace,
    )!.id!;

    const { data: room } = await api.rooms.createRoom({
      createRoomRequestDto: {
        title: `mcp-builtin-settools-persist-${ts}`,
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = room.response!.id!;

    await api.mcp.addRoomServers({
      roomId,
      addRoomServersRequestBody: { servers: new Set([builtInServerId]) },
    });

    const { data: toolsData } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    const toolToDisable = toolsData.response![0].name!;

    await api.mcp.setTools({
      roomId,
      serverId: builtInServerId,
      setMcpToolsRequestBody: { disabledTools: [toolToDisable] },
    });

    const { data, status } = await api.mcp.getTools({
      roomId,
      serverId: builtInServerId,
    });
    expect(status).toBe(200);
    expect(data.response!.find((t) => t.name === toolToDisable)!.enabled).toBe(
      false,
    );
    for (const t of data.response!.filter((t) => t.name !== toolToDisable)) {
      expect(t.enabled).toBe(true);
    }
  });

  test.fail(
    "DELETE /api/2.0/ai/servers - built-in DocSpace server cannot be deleted",
    async ({ apiSdk }) => {
      const api = apiSdk.forRole("owner");

      const { data: available } = await api.mcp.getAvailableServers();
      const builtInServer = available.response!.find(
        (s) => s.serverType === ServerType.DocSpace,
      )!;
      const builtInServerId = builtInServer.id!;

      const { status, data: deleteData } = await api.mcp.deleteServer({
        deleteServersRequestBody: { servers: new Set([builtInServerId]) },
      });
      console.log("[delete] status:", status);
      console.log("[delete] response:", JSON.stringify(deleteData));

      const { data: afterDelete } = await api.mcp.getAvailableServers();
      const stillPresent = afterDelete.response!.find(
        (s) => s.id === builtInServerId,
      );
      console.log(
        "[delete] server still present after delete:",
        !!stillPresent,
      );

      expect(status).not.toBe(204);
      expect(stillPresent).toBeDefined();
    },
  );

  test.fail(
    "PUT /api/2.0/ai/servers/:id - built-in DocSpace server cannot be updated",
    async ({ apiSdk }) => {
      const api = apiSdk.forRole("owner");

      const { data: available } = await api.mcp.getAvailableServers();
      const builtInServer = available.response!.find(
        (s) => s.serverType === ServerType.DocSpace,
      )!;
      const builtInServerId = builtInServer.id!;
      const originalName = builtInServer.name!;
      const newName = `renamed-${Date.now()}`;

      const { status, data: updateData } = await api.mcp.updateServer({
        id: builtInServerId,
        updateServerRequestBody: { name: newName },
      });
      console.log("[update] status:", status);
      console.log("[update] response:", JSON.stringify(updateData));

      const { data: afterUpdate } = await api.mcp.getServer({
        id: builtInServerId,
      });
      const nameAfter = afterUpdate.response?.name;
      console.log("[update] original name:", originalName);
      console.log("[update] name after update attempt:", nameAfter);
      console.log("[update] name changed:", nameAfter !== originalName);

      expect(status).not.toBe(200);
      expect(nameAfter).toBe(originalName);
    },
  );
});
