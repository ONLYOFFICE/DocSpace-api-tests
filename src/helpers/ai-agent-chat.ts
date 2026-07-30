import { APIRequestContext } from "@playwright/test";
import { TokenStore, Role } from "../services/token-store";

// The SDK's AgentsApi points at `/internal/ai/integration/agents` (405 through
// nginx) and ChatApi at `/api/2.0/ai/rooms/{roomId}/chats` (404) — both dead on
// current builds. The live surface is the rewritten AI stack below, driven with
// raw requests until the SDK catches up.
//
//   GET  /api/2.0/ai/profiles/list
//   POST /api/2.0/ai/agents                 { title, color, cover, profileId, prompt }
//   GET  /api/2.0/ai/agents/{id}            -> response.chatSettings.prompt
//   POST /api/2.0/ai/threads/create         { title, profileId, entityId }
//   POST /api/2.0/ai/ai/send-with-stream    { threadId, entityId, profileId, actionArgs, userMessage }
//   GET  /api/2.0/ai/threads/read-messages?threadId=...

export type AiProfile = {
  id: string;
  name: string;
  modelId: string;
};

export type AiThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: Array<{ type: string; text?: string }>;
  createdAt: number;
};

export class AiAgentChat {
  constructor(
    private readonly request: APIRequestContext,
    private readonly tokenStore: TokenStore,
  ) {}

  private headers(role: Role) {
    return {
      Authorization: `Bearer ${this.tokenStore.getToken(role)}`,
      Origin: `http://${this.tokenStore.newTenantDomain}`,
      "Content-Type": "application/json",
    };
  }

  private url(path: string) {
    return `${this.tokenStore.portalBaseUrl}${path}`;
  }

  async listProfiles(role: Role): Promise<AiProfile[]> {
    const response = await this.request.get(
      this.url("/api/2.0/ai/profiles/list"),
      { headers: this.headers(role) },
    );
    return (await response.json()) as AiProfile[];
  }

  /** The gateway profile every agent in these tests runs on. */
  async defaultProfileId(role: Role): Promise<string> {
    const profiles = await this.listProfiles(role);
    if (profiles.length === 0) {
      throw new Error("No AI profiles available on the portal");
    }
    return profiles[0].id;
  }

  /** `prompt` is the AI Instructions field; it is stored as chatSettings.prompt. */
  async createAgent(
    role: Role,
    body: { title: string; profileId: string; prompt: string },
  ) {
    const response = await this.request.post(this.url("/api/2.0/ai/agents"), {
      headers: this.headers(role),
      data: {
        title: body.title,
        color: "FF5733",
        cover: "layers",
        profileId: body.profileId,
        prompt: body.prompt,
      },
    });
    const data = (await response.json()) as {
      response?: { id?: number; chatSettings?: { prompt?: string } };
    };
    return { status: response.status(), data };
  }

  async getAgent(role: Role, agentId: number) {
    const response = await this.request.get(
      this.url(`/api/2.0/ai/agents/${agentId}`),
      { headers: this.headers(role) },
    );
    const text = await response.text();
    const data = text.startsWith("{")
      ? (JSON.parse(text) as {
          response?: { chatSettings?: { prompt?: string } };
        })
      : undefined;
    return { status: response.status(), data };
  }

  async getAgentInstructions(role: Role, agentId: number) {
    const { data } = await this.getAgent(role, agentId);
    return data?.response?.chatSettings?.prompt;
  }

  async createThread(
    role: Role,
    body: { title: string; profileId: string; agentId: number },
  ) {
    const response = await this.request.post(
      this.url("/api/2.0/ai/threads/create"),
      {
        headers: this.headers(role),
        data: {
          title: body.title,
          profileId: body.profileId,
          entityId: String(body.agentId),
        },
      },
    );
    const data = (await response.json()) as { threadId: string };
    return { status: response.status(), threadId: data.threadId };
  }

  /**
   * Sends a user message. `instructions` is passed as the system-prompt override
   * the way the client does it — the backend does not pull the agent's stored
   * AI Instructions into the thread by itself.
   */
  async sendMessage(
    role: Role,
    body: {
      threadId: string;
      profileId: string;
      agentId: number;
      message: string;
      instructions?: string;
    },
  ) {
    const response = await this.request.post(
      this.url("/api/2.0/ai/ai/send-with-stream"),
      {
        headers: this.headers(role),
        data: {
          threadId: body.threadId,
          entityId: String(body.agentId),
          profileId: body.profileId,
          ...(body.instructions
            ? {
                actionArgs: {
                  prompt: { mode: "replace", text: body.instructions },
                },
              }
            : {}),
          userMessage: {
            role: "user",
            content: [{ type: "text", text: body.message }],
          },
        },
        timeout: 120000,
      },
    );
    return { status: response.status() };
  }

  async readMessages(role: Role, threadId: string) {
    const response = await this.request.get(
      this.url(`/api/2.0/ai/threads/read-messages?threadId=${threadId}`),
      { headers: this.headers(role) },
    );
    const data = (await response.json()) as AiThreadMessage[];
    return { status: response.status(), headers: response.headers(), data };
  }

  /** The assistant reply lands asynchronously after send-with-stream returns. */
  async waitForAssistantReply(
    role: Role,
    threadId: string,
    timeoutMs = 90000,
  ): Promise<AiThreadMessage[]> {
    const deadline = Date.now() + timeoutMs;
    let messages: AiThreadMessage[] = [];

    while (Date.now() < deadline) {
      const { data } = await this.readMessages(role, threadId);
      messages = data;
      if (messages.some((message) => message.role === "assistant")) {
        return messages;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return messages;
  }

  static assistantText(messages: AiThreadMessage[]): string {
    return messages
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.content.map((block) => block.text ?? ""))
      .join("\n");
  }
}
