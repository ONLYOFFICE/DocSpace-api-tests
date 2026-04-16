import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
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

  test.fail(
    "BUG 81107: POST /api/2.0/ai/servers - accepts name with 128 characters",
    async ({ apiSdk }) => {
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
    },
  );

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
