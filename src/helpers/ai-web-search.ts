import { AiHttp, AgentRole } from "./ai-http";

// Web Search provider configuration — verified live 2026-08-04.
//
//   GET    /ai/web-search/is-configured[?entityId=]      -> bare true/false
//   GET    /ai/web-search/get-active-config[?entityId=]  -> config | null
//   PUT    /ai/web-search/configure        { config: {...}, entityId? }
//   PUT    /ai/web-search/set-active-config{ config: {...}, entityId? }
//   POST   /ai/web-search/test-connection  { provider, key?, baseUrl? }
//   DELETE /ai/web-search/clear            { entityId? }
//
// State of this surface on current builds, and the reason most of section 17 is
// blocked rather than covered: the portal recognises **no** web-search provider.
// `test-connection` answers 200 `{field:"name", message:"Unknown web-search
// provider: X"}` for every candidate tried (exa, onlyoffice, tavily, brave,
// google, bing, serper, searxng, duckduckgo), and `configure` /
// `set-active-config` answer 500 for every body, including a well-formed one.
//
// That 500 also lands *before* both the authorization check and the portal AI
// switch: a Guest gets 500 instead of 403, and so does a caller on a portal with
// AI turned off. Those are the tests in web-search.spec.ts; the "save a valid Exa
// config / switch the active provider / read the key back masked" cases of 17.1
// cannot be written until a provider name exists.

export const WEB_SEARCH_PROVIDER_CANDIDATES = [
  "exa",
  "onlyoffice",
  "tavily",
  "brave",
  "google",
  "bing",
  "serper",
  "searxng",
  "duckduckgo",
] as const;

export type AiWebSearchConfig = {
  provider?: string;
  key?: string;
  baseUrl?: string;
  isCloudProvider?: boolean;
  headers?: Record<string, string>;
};

export type AiWebSearchTestResult = {
  field?: string;
  message?: string;
};

export class AiWebSearch extends AiHttp {
  private scope(entityId?: number | string) {
    return entityId === undefined ? "" : `?entityId=${entityId}`;
  }

  isConfigured(role: AgentRole, entityId?: number | string) {
    return this.call<boolean>(
      role,
      "get",
      `/api/2.0/ai/web-search/is-configured${this.scope(entityId)}`,
    );
  }

  getActiveConfig(role: AgentRole, entityId?: number | string) {
    return this.call<AiWebSearchConfig | null>(
      role,
      "get",
      `/api/2.0/ai/web-search/get-active-config${this.scope(entityId)}`,
    );
  }

  configure(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/web-search/configure",
      body,
    );
  }

  setActiveConfig(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/web-search/set-active-config",
      body,
    );
  }

  testConnection(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiWebSearchTestResult>(
      role,
      "post",
      "/api/2.0/ai/web-search/test-connection",
      body,
    );
  }

  clear(role: AgentRole, body: unknown) {
    return this.call<{ success?: boolean }>(
      role,
      "delete",
      "/api/2.0/ai/web-search/clear",
      body,
    );
  }
}
