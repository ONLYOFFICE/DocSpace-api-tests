import { APIRequestContext } from "@playwright/test";
import config from "@/config";

// The real MCP server the QA team keeps for manual checks, plus the direct MCP
// handshake used as a liveness control.
//
// Why the handshake matters: the interesting question about a registered server
// is whether the portal ever offers its tools to the model, and the answer is
// currently "no" for every server tried. That conclusion is only worth anything
// if the server was demonstrably up at the moment of the test — otherwise
// "the model has no such tool" is indistinguishable from "the endpoint was down".
// `mcpToolNames` therefore talks to the server from the test process, over plain
// MCP, and the tests skip themselves when it does not answer.
//
// The calculator (ONLYOFFICE QA, Node.js behind Nginx) answers `initialize` with
// protocolVersion 2024-11-05 and lists `calculate` and `get_time`. It speaks
// streamable HTTP, so `tools/list` needs the `Mcp-Session-Id` that `initialize`
// hands back — without it the server answers -32000.

export type McpServer = {
  url: string;
  headers: Record<string, string>;
};

/** Arithmetic (`calculate`) and the current time (`get_time`). */
export const CALCULATOR_MCP_SERVER: McpServer = {
  url: config.MCP_CALCULATOR_URL,
  headers: { Authorization: `Bearer ${config.MCP_CALCULATOR_TOKEN}` },
};

export function isMcpServerConfigured(server: McpServer): boolean {
  return (
    server.url.startsWith("http") &&
    !server.headers.Authorization.includes("NOT_CONFIGURED")
  );
}

/**
 * The JSON-RPC envelope out of an MCP response, which may arrive either as plain
 * JSON or as a single `event: message` / `data: {…}` SSE frame.
 */
function jsonRpcBody(body: string): Record<string, unknown> | undefined {
  const payload = body.includes("data:")
    ? (body.match(/^data:\s*(\{.*\})\s*$/m)?.[1] ?? "")
    : body;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * `initialize` + `tools/list` against the server itself. Returns the tool names,
 * or [] if the server is unreachable, unauthorised or not speaking MCP — callers
 * treat [] as "skip, this is not the portal's fault".
 */
export async function mcpToolNames(
  request: APIRequestContext,
  server: McpServer,
): Promise<string[]> {
  const headers = {
    ...server.headers,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  try {
    const initialized = await request.post(server.url, {
      headers,
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "docspace-api-tests", version: "1.0" },
        },
      },
      timeout: 30000,
    });
    if (!jsonRpcBody(await initialized.text())?.result) {
      return [];
    }

    // Streamable HTTP hands out a session on initialize and requires it after.
    const sessionId = initialized.headers()["mcp-session-id"];
    const listed = await request.post(server.url, {
      headers: {
        ...headers,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
      timeout: 30000,
    });

    const result = jsonRpcBody(await listed.text())?.result as
      | { tools?: Array<{ name?: unknown }> }
      | undefined;
    return (result?.tools ?? [])
      .map((tool) => String(tool.name ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}
