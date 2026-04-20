import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders } from "@/src/helpers/ai-providers";
import config from "@/config";

const GITHUB_MCP_ENDPOINT = config.GITHUB_MCP_ENDPOINT;
const forbiddenRoles = ["RoomAdmin", "User", "Guest"] as const;

test.describe("MCP Servers - Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`POST /api/2.0/ai/servers - ${role} cannot register a custom MCP server`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-basic-${Date.now()}`,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: "Bearer token" },
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("POST /api/2.0/ai/servers - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-basic-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: "Bearer token" },
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("MCP Servers - Name Validation", () => {
  const invalidNames: Array<{ label: string; name: string | null }> = [
    { label: "empty string", name: "" },
    { label: "null", name: null },
    { label: "spaces", name: "my server" },
    { label: "dot", name: "my.server" },
    { label: "at sign", name: "my@server" },
    { label: "Cyrillic letters", name: "мой-сервер" },
  ];

  for (const { label, name } of invalidNames) {
    test(`POST /api/2.0/ai/servers - returns 400 when name is ${label}`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk.forRole("owner").mcp.addServer({
        addMcpServerRequestBody: {
          name,
          description: "GitHub Copilot MCP server",
          endpoint: GITHUB_MCP_ENDPOINT,
          headers: { Authorization: "Bearer token" },
        },
      });

      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/ai/servers - returns 400 when name exceeds 128 characters", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").mcp.addServer({
      addMcpServerRequestBody: {
        name: "a".repeat(129),
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: "Bearer token" },
      },
    });

    expect(status).toBe(400);
  });

  test("BUG 81107: POST /api/2.0/ai/servers - accepts name with 128 characters", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { status } = await apiSdk.forRole("owner").mcp.addServer({
      addMcpServerRequestBody: {
        name: "a".repeat(128),
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/servers - returns 400 when name is already taken", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const ownerApi = apiSdk.forRole("owner");
    const serverName = `mcp-dup-${Date.now()}`;

    await ownerApi.mcp.addServer({
      addMcpServerRequestBody: {
        name: serverName,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });

    const { status } = await ownerApi.mcp.addServer({
      addMcpServerRequestBody: {
        name: serverName,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });

    expect(status).toBe(400);
  });
});

test.describe("MCP Servers - Endpoint Validation", () => {
  const invalidEndpoints: Array<{ label: string; endpoint: string | null }> = [
    { label: "empty string", endpoint: "" },
    { label: "null", endpoint: null },
    { label: "plain text without scheme", endpoint: "not-a-url" },
    { label: "missing scheme", endpoint: "api.githubcopilot.com/mcp" },
    { label: "ftp scheme", endpoint: "ftp://api.githubcopilot.com/mcp" },
  ];

  for (const { label, endpoint } of invalidEndpoints) {
    test(`POST /api/2.0/ai/servers - returns 400 when endpoint is ${label}`, async ({
      apiSdk,
    }) => {
      const { status } = await apiSdk.forRole("owner").mcp.addServer({
        addMcpServerRequestBody: {
          name: `mcp-url-${Date.now()}`,
          description: "GitHub Copilot MCP server",
          endpoint,
          headers: { Authorization: "Bearer token" },
        },
      });

      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/ai/servers - returns 400 when Authorization header contains invalid token", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-key-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: "Bearer invalid-token" },
      },
    });

    expect(status).toBe(400);
  });
});

const fakeServerId = "00000000-0000-0000-0000-000000000000";

test.describe("MCP Servers - Delete Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`DELETE /api/2.0/ai/servers - ${role} cannot delete a MCP server`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.mcp.deleteServer({
        deleteServersRequestBody: {
          servers: new Set([fakeServerId]),
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("DELETE /api/2.0/ai/servers - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set([fakeServerId]),
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("MCP Servers - Update Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`PUT /api/2.0/ai/servers/:id - ${role} cannot update a custom MCP server`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.mcp.updateServer({
        id: fakeServerId,
        updateServerRequestBody: {
          name: `mcp-renamed-${Date.now()}`,
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("PUT /api/2.0/ai/servers/:id - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().mcp.updateServer({
      id: fakeServerId,
      updateServerRequestBody: {
        name: `mcp-renamed-${Date.now()}`,
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("MCP Servers - Get List Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`GET /api/2.0/ai/servers - ${role} cannot get list of MCP servers`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.mcp.getServers();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("GET /api/2.0/ai/servers - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().mcp.getServers();

    expect(status).toBe(401);
  });
});

test.describe("MCP Servers - Get Available Permissions", () => {
  for (const role of ["RoomAdmin", "User"] as const) {
    test(`GET /api/2.0/ai/servers/available - ${role} can get available MCP servers`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { status } = await api.mcp.getAvailableServers();

      expect(status).toBe(200);
    });
  }

  test.fail(
    "BUG 81140: GET /api/2.0/ai/servers/available - Guest cannot get available MCP servers",
    async ({ apiSdk }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { data, status } = await api.mcp.getAvailableServers();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    },
  );

  test("GET /api/2.0/ai/servers/available - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().mcp.getAvailableServers();

    expect(status).toBe(401);
  });
});

test.describe("MCP Servers - Get Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`GET /api/2.0/ai/servers/:id - ${role} cannot get a MCP server by id`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.mcp.getServer({ id: fakeServerId });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("GET /api/2.0/ai/servers/:id - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .mcp.getServer({ id: fakeServerId });

    expect(status).toBe(401);
  });
});

test.describe("MCP Servers - DocSpaceAdmin Access", () => {
  test("BUG 81107: POST /api/2.0/ai/servers - DocSpaceAdmin registers a custom MCP server", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });

    const { status } = await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-admin-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });

    expect(status).toBe(200);
  });

  test("BUG 81107: GET /api/2.0/ai/servers - DocSpaceAdmin gets list of MCP servers", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });

    await api.mcp.addServer({
      addMcpServerRequestBody: {
        name: `mcp-admin-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });

    const { status } = await api.mcp.getServers();

    expect(status).toBe(200);
  });

  test("BUG 81107: PUT /api/2.0/ai/servers/:id - DocSpaceAdmin updates MCP server name", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

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
        name: `mcp-admin-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const newName = `mcp-admin-renamed-${Date.now()}`;
    const { status } = await api.mcp.updateServer({
      id: serverId,
      updateServerRequestBody: { name: newName },
    });

    expect(status).toBe(200);
  });

  test("BUG 81107: PUT /api/2.0/ai/servers/:id - DocSpaceAdmin updates MCP server description", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

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
        name: `mcp-admin-${Date.now()}`,
        description: "Original description",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { status } = await api.mcp.updateServer({
      id: serverId,
      updateServerRequestBody: { description: "Updated description" },
    });

    expect(status).toBe(200);
  });

  test("BUG 81107: GET /api/2.0/ai/servers/:id - DocSpaceAdmin gets MCP server by id", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
    });

    const serverName = `mcp-admin-get-${Date.now()}`;
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

  test("BUG 81107: PUT /api/2.0/ai/servers/:id/status - DocSpaceAdmin can change MCP server status", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

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
        name: `mcp-admin-status-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    const { status } = await api.mcp.setServerStatus({
      id: serverId,
      setServerStatusRequestBody: { enabled: false },
    });

    expect(status).toBe(200);
  });

  test("BUG 81107: GET /api/2.0/ai/servers/available - DocSpaceAdmin gets available MCP servers", async ({
    apiSdk,
  }) => {
    const mcpApiKey = process.env.MCP_API_KEY;
    if (!mcpApiKey) {
      throw new Error("MCP_API_KEY is not defined in environment variables");
    }

    const { api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const provider = aiProviders.deepSeek;
    await api.providers.addProvider({
      createProviderRequestDto: {
        type: provider.type,
        title: provider.title,
        key: provider.key,
      },
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

test.describe("MCP Servers - Set Status Permissions", () => {
  for (const role of forbiddenRoles) {
    test(`PUT /api/2.0/ai/servers/:id/status - ${role} cannot change MCP server status`, async ({
      apiSdk,
    }) => {
      const { api } = await apiSdk.addAuthenticatedMember("owner", role);

      const { data, status } = await api.mcp.setServerStatus({
        id: fakeServerId,
        setServerStatusRequestBody: { enabled: false },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }

  test("PUT /api/2.0/ai/servers/:id/status - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().mcp.setServerStatus({
      id: fakeServerId,
      setServerStatusRequestBody: { enabled: false },
    });

    expect(status).toBe(401);
  });
});

test.describe("MCP Servers - Delete Edge Cases", () => {
  test("DELETE /api/2.0/ai/servers - Owner gets 204 when deleting a non-existent server", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk.forRole("owner").mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set([fakeServerId]),
      },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();
  });

  test("DELETE /api/2.0/ai/servers - Owner gets 204 when deleting an already deleted server", async ({
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
        name: `mcp-redel-${Date.now()}`,
        description: "GitHub Copilot MCP server",
        endpoint: GITHUB_MCP_ENDPOINT,
        headers: { Authorization: `Bearer ${mcpApiKey}` },
      },
    });
    const serverId = created.response!.id!;

    await api.mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set([serverId]),
      },
    });

    const { data, status } = await api.mcp.deleteServer({
      deleteServersRequestBody: {
        servers: new Set([serverId]),
      },
    });

    expect(status).toBe(204);
    expect(data).toBeFalsy();
  });
});
