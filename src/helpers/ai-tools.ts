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
//   PUT    /ai/tools/replace-all-custom-servers { map, entityId? }
//   GET    /ai/tools/get-disabled[?entityId=]         map of serverType -> [toolName]
//   PUT    /ai/tools/set-disabled           { serverType, toolNames, entityId? }
//   GET    /ai/tools/is-tool-disabled?serverType=&toolName=[&entityId=]
//   GET    /ai/tools/get-allow-always[?entityId=]
//   PUT    /ai/tools/set-allow-always       { serverType, toolName, value, entityId? }
//   GET    /ai/tools/is-allow-always?serverType=&toolName=[&entityId=]
//
// `entityId` is any entity the caller may manage, not just an agent: a plain
// room id is accepted too (and refused with 403 for a personal folder, or for
// anyone who is not the room's owner/admin). Room-scoped servers are readable
// through get-custom-server but missing from list-custom-servers — see
// the room-scope block of mcp/mcp.spec.ts.
//
// Reads and writes disagree about what a valid `entityId` is. A read accepts
// anything and falls back to the portal scope when the entity is unknown or
// already deleted; `add-custom-server` and `replace-all-custom-servers` answer a
// hard 404 instead, and `remove-custom-server` validates nothing at all and
// reports `{success:true}`. An agent nobody invited the caller to is 403 on every
// route, reads included.
//
// This is the ONLY place MCP servers live. `/ai/agents` has no servers field: an
// `mcpServers` map in the create/update body is dropped like any unknown field,
// `attachDefaultTools` (the SDK's one MCP-shaped agent field) leaves no
// observable trace, and no agent edit disturbs the map. See the agent-body block
// of mcp/mcp.spec.ts.
//
// Error style is mixed and matters for assertions: most failures come back as
// HTTP 200 with `{success:false, error:{field, message}}` — `replace-all` uses
// `errors: [{name, error}]` and rejects the whole map atomically. Assert
// `data.success` / `data.error.message`, not just the status. The hard 400s are
// the exceptions: a name over 128 characters or made only of whitespace, and any
// `config` the binder reads as absent — `{}`, `null`, a number, or nothing at all
// — which is also the "copy the portal-level server of this name into this
// entity" path when such a server does exist.
//
// A stored config is whatever was sent, minus nothing, as long as it is an object
// carrying `url` (HTTP) or `command` (stdio); update replaces it wholesale rather
// than merging.
//
// Names are the map keys and carry most of the sharp edges. `_` is banned
// anywhere in a name ("reserved for tool-token format" — the engine addresses a
// tool as `server_tool`, e.g. `docspace_generate_docx`). The duplicate check is
// case-insensitive while the key keeps its original casing, names are not trimmed
// and not Unicode-normalised, and 128 characters is the cap. Open bugs, all in
// the names block of mcp/mcp.spec.ts: `/`, `.` and `..` register and list but are
// unreachable by name afterwards; an emoji answers 500; `constructor`/`toString`
// are refused as if their config were broken, which is what gives away that the
// map is a bare JS object; and `replace-all` skips the duplicate check, storing
// two case-variants of one name of which only one can ever be read.
//
// Nothing here reaches the model. A real, credentialed, reachable MCP server
// registered on an agent is not offered to it — see the conversation block of
// mcp/mcp.spec.ts.

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
  private scope(agentId?: number | string, separator = "?") {
    return agentId === undefined
      ? ""
      : `${separator}entityId=${encodeURIComponent(String(agentId))}`;
  }

  /**
   * Full replacement of one scope's custom servers, keyed by name. The body
   * field is `map` — an SDK-shaped `{servers: …}` is accepted with
   * `{success:true}` and silently clears the scope instead.
   */
  replaceAllCustomServers(
    role: AgentRole,
    body: { map?: unknown; agentId?: number | string },
  ) {
    return this.call<McpMutationResult>(
      role,
      "put",
      "/api/2.0/ai/tools/replace-all-custom-servers",
      {
        ...(body.map === undefined ? {} : { map: body.map }),
        ...(body.agentId === undefined
          ? {}
          : { entityId: String(body.agentId) }),
      },
    );
  }

  /**
   * The built-in tool catalogue. `agentId` maps to the `entityId` the SDK
   * declares as REQUIRED on this route — and passing it answers `{}` instead of
   * the catalogue, so the SDK's own signature cannot list anything. See the
   * scoped-catalogue bug in mcp/mcp.spec.ts.
   */
  listSystemTools(role: AgentRole, agentId?: number | string) {
    return this.call<Record<string, McpToolDto[]>>(
      role,
      "get",
      `/api/2.0/ai/tools/list-system-tools${this.scope(agentId)}`,
    );
  }

  async listCustomServers(role: AgentRole, agentId?: number | string) {
    const { status, data, error } = await this.call<McpServerMap>(
      role,
      "get",
      `/api/2.0/ai/tools/list-custom-servers${this.scope(agentId)}`,
    );
    const isMap = !!data && typeof data === "object" && error === undefined;
    return { status, error, data: isMap ? data : {} };
  }

  getCustomServer(role: AgentRole, name: string, agentId?: number | string) {
    return this.call<Record<string, unknown>>(
      role,
      "get",
      `/api/2.0/ai/tools/get-custom-server?name=${encodeURIComponent(name)}${this.scope(agentId, "&")}`,
    );
  }

  addCustomServer(
    role: AgentRole,
    body: { name?: string; config?: unknown; agentId?: number | string },
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
    body: { name: string; config: unknown; agentId?: number | string },
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
    body: { name: string; agentId?: number | string },
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

  getDisabledTools(role: AgentRole, agentId?: number | string) {
    return this.call<Record<string, string[]>>(
      role,
      "get",
      `/api/2.0/ai/tools/get-disabled${this.scope(agentId)}`,
    );
  }

  setDisabledTools(
    role: AgentRole,
    body: {
      serverType: string;
      toolNames: string[];
      agentId?: number | string;
    },
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
    body: { serverType: string; toolName: string; agentId?: number | string },
  ) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/tools/is-tool-disabled?serverType=${body.serverType}&toolName=${body.toolName}${this.scope(body.agentId, "&")}`,
    );
  }

  getAllowAlways(role: AgentRole, agentId?: number | string) {
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
      agentId?: number | string;
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
    body: { serverType: string; toolName: string; agentId?: number | string },
  ) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/tools/is-allow-always?serverType=${body.serverType}&toolName=${body.toolName}${this.scope(body.agentId, "&")}`,
    );
  }
}
