import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders } from "@/src/helpers/ai-providers";
import { readIconAsBase64 } from "@/src/utils/icon.utils";
import config from "@/config";

const GITHUB_MCP_ENDPOINT = config.GITHUB_MCP_ENDPOINT;

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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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
});
