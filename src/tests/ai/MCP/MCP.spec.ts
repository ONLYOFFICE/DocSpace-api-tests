import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders } from "@/src/helpers/ai-providers";
import { readIconAsBase64 } from "@/src/utils/icon.utils";
import config from "@/config";

const GITHUB_MCP_ENDPOINT = config.GITHUB_MCP_ENDPOINT;

test.describe("MCP Servers", () => {
  for (const { role, label } of [
    { role: "owner" as const, label: "Owner" },
    { role: "docSpaceAdmin" as const, label: "DocSpaceAdmin" },
  ]) {
    test.fail(
      `BUG 81107: POST /api/2.0/ai/servers - ${label} registers a custom MCP server`,
      async ({ apiSdk }) => {
        const mcpApiKey = process.env.MCP_API_KEY;
        if (!mcpApiKey) {
          throw new Error(
            "MCP_API_KEY is not defined in environment variables",
          );
        }

        const api = apiSdk.forRole(role);

        await test.step("Create AI provider as precondition", async () => {
          const provider = aiProviders.deepSeek;
          await api.providers.addProvider({
            createProviderRequestDto: {
              type: provider.type,
              title: provider.title,
              key: provider.key,
            },
          });
        });

        const serverName = `mcp-basic-${Date.now()}`;
        const serverDescription = "GitHub Copilot MCP server";
        const iconBase64 = readIconAsBase64("src/assets/mcp-icon.png");
        let serverId: string;

        await test.step("POST /api/2.0/ai/servers - create MCP server", async () => {
          const { data, status } = await api.mcp.addServer({
            addMcpServerRequestBody: {
              name: serverName,
              description: serverDescription,
              endpoint: GITHUB_MCP_ENDPOINT,
              headers: { Authorization: `Bearer ${mcpApiKey}` },
              icon: iconBase64,
            },
          });

          expect(status).toBe(200);
          expect(data.response).toBeDefined();

          const server = data.response!;
          expect(server.id).toBeDefined();
          expect(server.name).toBe(serverName);
          expect(server.description).toBe(serverDescription);
          expect(server.endpoint).toBe(GITHUB_MCP_ENDPOINT);
          expect(server.headers).toEqual({
            Authorization: `Bearer ${mcpApiKey}`,
          });
          expect(server.icon).toBeDefined();
          expect(server.serverType).toBeDefined();
          expect(server.enabled).toBeDefined();
          expect(server.needReset).toBeDefined();

          serverId = server.id!;
        });

        await test.step("GET /api/2.0/ai/servers - verify server appears in list", async () => {
          const { data, status } = await api.mcp.getServers();

          expect(status).toBe(200);
          expect(data.response).toBeDefined();

          const found = data.response!.find((s) => s.id === serverId);
          expect(found).toBeDefined();
          expect(found!.name).toBe(serverName);
          expect(found!.description).toBe(serverDescription);
          expect(found!.endpoint).toBe(GITHUB_MCP_ENDPOINT);
        });
      },
    );
  }
});
