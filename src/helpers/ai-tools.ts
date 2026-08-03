import { AiHttp, AgentRole } from "./ai-http";

// MCP moved off `/ai/servers*` and `/ai/rooms/{roomId}/servers*` (all 404) onto
// a tools surface with a different model: custom MCP servers are registered by
// name, scoped either to one agent (`entityId`) or portal-wide (no `entityId`),
// and individual tools are enabled/disabled per server type.
//
//   GET    /ai/tools/list-system-tools      { docspace: [ {name, description, inputSchema} ] }
//   GET    /ai/tools/list-custom-servers[?entityId=]   map of name -> config
//   GET    /ai/tools/get-custom-server?name=[&entityId=]
//   POST   /ai/tools/add-custom-server      { name, config, entityId? }
//   PUT    /ai/tools/update-custom-server   { name, config, entityId? }
//   DELETE /ai/tools/remove-custom-server   { name, entityId? }
//   GET    /ai/tools/get-disabled[?entityId=]         map of serverType -> [toolName]
//   PUT    /ai/tools/set-disabled           { serverType, toolNames, entityId? }
//   GET    /ai/tools/is-tool-disabled?serverType=&toolName=[&entityId=]
//   GET    /ai/tools/get-allow-always[?entityId=]
//   PUT    /ai/tools/set-allow-always       { serverType, toolName, value, entityId? }
//   GET    /ai/tools/is-allow-always?serverType=&toolName=[&entityId=]
//
// Error style is mixed and matters for assertions: most failures come back as
// HTTP 200 with `{success:false, error:{field, message}}`, while a missing
// `config` on add is a real 400. Assert `data.success` / `data.error.message`,
// not just the status.

export type McpToolDto = {
  name?: string;
  description?: string;
  inputSchema?: object;
};

export type McpMutationResult = {
  success?: boolean;
  error?: { field?: string; message?: string };
};

export type McpServerMap = Record<string, Record<string, unknown>>;

export class AiTools extends AiHttp {
  private scope(agentId?: number, separator = "?") {
    return agentId === undefined ? "" : `${separator}entityId=${agentId}`;
  }

  listSystemTools(role: AgentRole) {
    return this.call<Record<string, McpToolDto[]>>(
      role,
      "get",
      "/api/2.0/ai/tools/list-system-tools",
    );
  }

  async listCustomServers(role: AgentRole, agentId?: number) {
    const { status, data, error } = await this.call<McpServerMap>(
      role,
      "get",
      `/api/2.0/ai/tools/list-custom-servers${this.scope(agentId)}`,
    );
    const isMap = !!data && typeof data === "object" && error === undefined;
    return { status, error, data: isMap ? data : {} };
  }

  getCustomServer(role: AgentRole, name: string, agentId?: number) {
    return this.call<Record<string, unknown>>(
      role,
      "get",
      `/api/2.0/ai/tools/get-custom-server?name=${encodeURIComponent(name)}${this.scope(agentId, "&")}`,
    );
  }

  addCustomServer(
    role: AgentRole,
    body: { name?: string; config?: unknown; agentId?: number },
  ) {
    return this.call<McpMutationResult>(
      role,
      "post",
      "/api/2.0/ai/tools/add-custom-server",
      {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.config === undefined ? {} : { config: body.config }),
        ...(body.agentId === undefined
          ? {}
          : { entityId: String(body.agentId) }),
      },
    );
  }

  updateCustomServer(
    role: AgentRole,
    body: { name: string; config: unknown; agentId?: number },
  ) {
    return this.call<McpMutationResult>(
      role,
      "put",
      "/api/2.0/ai/tools/update-custom-server",
      {
        name: body.name,
        config: body.config,
        ...(body.agentId === undefined
          ? {}
          : { entityId: String(body.agentId) }),
      },
    );
  }

  removeCustomServer(
    role: AgentRole,
    body: { name: string; agentId?: number },
  ) {
    return this.call<McpMutationResult>(
      role,
      "delete",
      "/api/2.0/ai/tools/remove-custom-server",
      {
        name: body.name,
        ...(body.agentId === undefined
          ? {}
          : { entityId: String(body.agentId) }),
      },
    );
  }

  getDisabledTools(role: AgentRole, agentId?: number) {
    return this.call<Record<string, string[]>>(
      role,
      "get",
      `/api/2.0/ai/tools/get-disabled${this.scope(agentId)}`,
    );
  }

  setDisabledTools(
    role: AgentRole,
    body: { serverType: string; toolNames: string[]; agentId?: number },
  ) {
    return this.call<McpMutationResult>(
      role,
      "put",
      "/api/2.0/ai/tools/set-disabled",
      {
        serverType: body.serverType,
        toolNames: body.toolNames,
        ...(body.agentId === undefined
          ? {}
          : { entityId: String(body.agentId) }),
      },
    );
  }

  isToolDisabled(
    role: AgentRole,
    body: { serverType: string; toolName: string; agentId?: number },
  ) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/tools/is-tool-disabled?serverType=${body.serverType}&toolName=${body.toolName}${this.scope(body.agentId, "&")}`,
    );
  }

  getAllowAlways(role: AgentRole, agentId?: number) {
    return this.call<string[]>(
      role,
      "get",
      `/api/2.0/ai/tools/get-allow-always${this.scope(agentId)}`,
    );
  }

  setAllowAlways(
    role: AgentRole,
    body: {
      serverType: string;
      toolName: string;
      value: boolean;
      agentId?: number;
    },
  ) {
    return this.call<McpMutationResult>(
      role,
      "put",
      "/api/2.0/ai/tools/set-allow-always",
      {
        serverType: body.serverType,
        toolName: body.toolName,
        value: body.value,
        ...(body.agentId === undefined
          ? {}
          : { entityId: String(body.agentId) }),
      },
    );
  }

  isAllowAlways(
    role: AgentRole,
    body: { serverType: string; toolName: string; agentId?: number },
  ) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/tools/is-allow-always?serverType=${body.serverType}&toolName=${body.toolName}${this.scope(body.agentId, "&")}`,
    );
  }
}
