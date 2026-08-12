import { AiHttp, AgentRole, Envelope } from "./ai-http";

// Live settings-side routes after the AI rewrite.
//
//   GET  /api/2.0/ai/config                    portal AI settings (SDK still works)
//   GET  /api/2.0/ai/config/user               per-user chat preferences
//   PUT  /api/2.0/ai/config/user               (POST is 404)
//   GET  /api/2.0/ai/config/vectorization      403 for everyone — the gateway owns it
//   PUT  /api/2.0/ai/config/vectorization      403 for everyone
//   GET  /api/2.0/ai/web-search/is-configured  replaces GET /ai/config/web-search (404)
//   GET  /api/2.0/ai/web-search/get-active-config
//   POST /api/2.0/ai/vectorization/tasks       { files: [id] }  (GET is 404)
//   POST /api/2.0/ai/text-to-docx              { title, content, folderId } -> 202
//
// `/ai/config/web-search` and `/ai/web-search/configure` are both 404 on current
// builds: manual web-search provider configuration is not exposed at all.

export type AiUserConfig = {
  chatRecommendedModelVisible?: boolean;
};

/**
 * Body of `POST /ai/text-to-docx`. The types are deliberately wider than the
 * DTO: negative tests need to send a null title or a folderId of the wrong
 * type, and doing that through the type system beats casting at every call.
 */
export type TextToDocxBody = {
  title?: string | null;
  content?: string | null;
  folderId?: number | string | null;
  /**
   * Not part of the contract. The endpoint writes a .docx and nothing else, and
   * the "only format" test sends these to show they are accepted and ignored
   * rather than honoured.
   */
  format?: string;
  extension?: string;
};

export class AiSettings extends AiHttp {
  getAiConfig(role: AgentRole) {
    return this.call<Envelope<Record<string, unknown>>>(
      role,
      "get",
      "/api/2.0/ai/config",
    );
  }

  getUserConfig(role: AgentRole) {
    return this.call<Envelope<AiUserConfig>>(
      role,
      "get",
      "/api/2.0/ai/config/user",
    );
  }

  setUserConfig(role: AgentRole, body: AiUserConfig) {
    return this.call<Envelope<AiUserConfig>>(
      role,
      "put",
      "/api/2.0/ai/config/user",
      body,
    );
  }

  getVectorizationSettings(role: AgentRole) {
    return this.call<Envelope<unknown>>(
      role,
      "get",
      "/api/2.0/ai/config/vectorization",
    );
  }

  setVectorizationSettings(role: AgentRole, body: Record<string, unknown>) {
    return this.call<Envelope<unknown>>(
      role,
      "put",
      "/api/2.0/ai/config/vectorization",
      body,
    );
  }

  webSearchIsConfigured(role: AgentRole) {
    return this.call<boolean>(
      role,
      "get",
      "/api/2.0/ai/web-search/is-configured",
    );
  }

  webSearchActiveConfig(role: AgentRole) {
    return this.call<unknown>(
      role,
      "get",
      "/api/2.0/ai/web-search/get-active-config",
    );
  }

  startVectorizationTask(role: AgentRole, body: { files: number[] }) {
    return this.call<Envelope<unknown>>(
      role,
      "post",
      "/api/2.0/ai/vectorization/tasks",
      body,
    );
  }

  /** Replaces the removed POST /ai/messages/{id}/export. Success is 202. */
  textToDocx(role: AgentRole, body: TextToDocxBody) {
    return this.call<{ success?: boolean }>(
      role,
      "post",
      "/api/2.0/ai/text-to-docx",
      body,
    );
  }
}
