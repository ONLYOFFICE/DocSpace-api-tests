import { AiHttp, AgentRole, Envelope } from "./ai-http";

// The SDK's AgentsApi points at `/internal/ai/integration/agents` (405 through
// nginx) and ChatApi at `/api/2.0/ai/rooms/{roomId}/chats` (404) — both dead on
// current builds. The live surface is the rewritten AI stack below.
//
//   GET    /api/2.0/ai/profiles/list
//   GET    /api/2.0/ai/agents                 -> response.folders[]
//   POST   /api/2.0/ai/agents                 { title, color, cover, tags, profileId, prompt }
//   GET    /api/2.0/ai/agents/{id}            -> response.chatSettings.prompt
//   PUT    /api/2.0/ai/agents/{id}            { title, tags, profileId, chatSettings: { prompt } }
//   DELETE /api/2.0/ai/agents/{id}            { deleteAfter }
//   GET    /api/2.0/ai/agents/news
//   PUT    /api/2.0/ai/agents/agentquota      { roomIds, quota }
//   PUT    /api/2.0/ai/agents/resetquota      { roomIds }
//   POST   /api/2.0/ai/threads/create         { title, profileId, entityId }
//   POST   /api/2.0/ai/ai/send-with-stream    { threadId, entityId, profileId, actionArgs, userMessage }
//   GET    /api/2.0/ai/threads/read-messages?threadId=...
//
// Asymmetry worth remembering: create takes a FLAT `prompt`, update takes a
// NESTED `chatSettings.prompt`. A flat `prompt` on update returns 200 and is
// silently ignored.

export type { AgentRole };

export type AiProfile = {
  id: string;
  name: string;
  modelId: string;
};

export type AgentDto = {
  id?: number;
  title?: string;
  tags?: string[];
  roomType?: number;
  chatSettings?: { prompt?: string };
};

export type AiThread = {
  threadId?: string;
  title?: string;
  lastEditDate?: number;
  profileId?: string;
};

/**
 * Present only on a reply the backend could not finish. A refused inference
 * call (e.g. the portal has no paid AI Tools wallet service) still lands in the
 * thread as an assistant message: empty `content` plus this status.
 */
export type AiThreadMessageStatus = {
  type?: string;
  reason?: string;
  error?: { code?: string; message?: string };
};

export type AiThreadMessage = {
  id: string;
  role: "user" | "assistant";
  /** "" instead of the usual blocks when the reply failed. */
  content: Array<{ type: string; text?: string }> | string;
  createdAt: number;
  status?: AiThreadMessageStatus;
};

export class AiAgentChat extends AiHttp {
  // ---------------------------------------------------------------- profiles

  /** Returns [] on any non-array payload, e.g. the 403 `{"error":...}` body. */
  async listProfiles(role: AgentRole = "owner"): Promise<AiProfile[]> {
    const { data } = await this.call<AiProfile[]>(
      role,
      "get",
      "/api/2.0/ai/profiles/list",
    );
    return Array.isArray(data) ? data : [];
  }

  /** The gateway profile agents in these tests run on. */
  async defaultProfileId(role: AgentRole = "owner"): Promise<string> {
    const profiles = await this.listProfiles(role);
    if (profiles.length === 0) {
      throw new Error("No AI profiles available on the portal");
    }
    return profiles[0].id;
  }

  // ------------------------------------------------------------------ agents

  /** `prompt` is the AI Instructions field; stored as chatSettings.prompt. */
  createAgent(
    role: AgentRole,
    body: {
      title?: string;
      profileId?: string;
      prompt?: string;
      tags?: string[];
      color?: string;
      cover?: string;
    },
  ) {
    return this.call<Envelope<AgentDto>>(role, "post", "/api/2.0/ai/agents", {
      color: "FF5733",
      cover: "layers",
      ...body,
    });
  }

  getAgents(role: AgentRole) {
    return this.call<Envelope<{ folders?: AgentDto[]; files?: unknown[] }>>(
      role,
      "get",
      "/api/2.0/ai/agents",
    );
  }

  getAgentInfo(role: AgentRole, agentId: number | string) {
    return this.call<Envelope<AgentDto>>(
      role,
      "get",
      `/api/2.0/ai/agents/${agentId}`,
    );
  }

  async getAgentInstructions(role: AgentRole, agentId: number) {
    const { data } = await this.getAgentInfo(role, agentId);
    return data?.response?.chatSettings?.prompt;
  }

  /** Note the nested chatSettings — a flat `prompt` here is ignored. */
  updateAgent(
    role: AgentRole,
    agentId: number | string,
    body: {
      title?: string;
      tags?: string[];
      profileId?: string;
      prompt?: string;
    },
  ) {
    const { prompt, ...rest } = body;
    return this.call<Envelope<AgentDto>>(
      role,
      "put",
      `/api/2.0/ai/agents/${agentId}`,
      {
        ...rest,
        ...(prompt === undefined ? {} : { chatSettings: { prompt } }),
      },
    );
  }

  /** Returns an async operation, but the agent is already gone (GET → 404). */
  deleteAgent(role: AgentRole, agentId: number | string, deleteAfter = false) {
    return this.call<Envelope<{ id?: string; finished?: boolean }>>(
      role,
      "delete",
      `/api/2.0/ai/agents/${agentId}`,
      { deleteAfter },
    );
  }

  getAgentsNewItems(role: AgentRole) {
    return this.call<Envelope<unknown[]>>(
      role,
      "get",
      "/api/2.0/ai/agents/news",
    );
  }

  updateAgentsQuota(
    role: AgentRole,
    body: { roomIds: number[]; quota: number },
  ) {
    return this.call<Envelope<AgentDto[]>>(
      role,
      "put",
      "/api/2.0/ai/agents/agentquota",
      body,
    );
  }

  resetAgentsQuota(role: AgentRole, body: { roomIds: number[] }) {
    return this.call<Envelope<AgentDto[]>>(
      role,
      "put",
      "/api/2.0/ai/agents/resetquota",
      body,
    );
  }

  /** Convenience for the common "make an agent, hand me its id" setup. */
  async createAgentId(
    role: AgentRole,
    body: {
      title: string;
      profileId: string;
      prompt?: string;
      tags?: string[];
    },
  ): Promise<number> {
    const { status, data } = await this.createAgent(role, {
      prompt: "You are a test assistant",
      ...body,
    });
    if (status !== 200 || !data?.response?.id) {
      throw new Error(`createAgent failed: ${status} ${JSON.stringify(data)}`);
    }
    return data.response.id;
  }

  // ----------------------------------------------------------------- threads

  async createThread(
    role: AgentRole,
    body: { title: string; profileId: string; agentId: number },
  ) {
    const { status, data, error } = await this.call<{ threadId: string }>(
      role,
      "post",
      "/api/2.0/ai/threads/create",
      {
        title: body.title,
        profileId: body.profileId,
        entityId: String(body.agentId),
      },
    );
    return { status, error, threadId: data?.threadId ?? "" };
  }

  /**
   * Sends a user message. `instructions` is passed as the system-prompt
   * override the way the client does it — the backend does not pull the agent's
   * stored AI Instructions into the thread by itself.
   */
  async sendMessage(
    role: AgentRole,
    body: {
      threadId: string;
      profileId: string;
      agentId: number;
      message: string;
      instructions?: string;
    },
  ) {
    const { status } = await this.call(
      role,
      "post",
      "/api/2.0/ai/ai/send-with-stream",
      {
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
    );
    return { status };
  }

  /**
   * Threads are listed per entity — without `entityId` the list is empty.
   * `data` is normalised to [] on an error payload so side-effect assertions
   * read cleanly; check `error`/`status` for the failure itself.
   */
  async listThreads(role: AgentRole, agentId?: number) {
    const query = agentId === undefined ? "" : `?entityId=${agentId}`;
    const { status, data, error } = await this.call<AiThread[]>(
      role,
      "get",
      `/api/2.0/ai/threads/list${query}`,
    );
    return { status, error, data: Array.isArray(data) ? data : [] };
  }

  getThread(role: AgentRole, threadId: string) {
    return this.call<AiThread>(
      role,
      "get",
      `/api/2.0/ai/threads/get-by-id?threadId=${threadId}`,
    );
  }

  renameThread(role: AgentRole, threadId: string, title: string) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/threads/rename",
      { threadId, title },
    );
  }

  deleteThread(role: AgentRole, threadId: string) {
    return this.call<{ success?: boolean }>(
      role,
      "delete",
      "/api/2.0/ai/threads/delete",
      { threadId },
    );
  }

  clearThreadMessages(role: AgentRole, threadId: string) {
    return this.call<{ success?: boolean }>(
      role,
      "delete",
      "/api/2.0/ai/threads/clear-messages",
      { threadId },
    );
  }

  touchThread(role: AgentRole, threadId: string) {
    return this.call<{ success?: boolean }>(
      role,
      "post",
      "/api/2.0/ai/threads/touch",
      { threadId },
    );
  }

  /** Stores a user message without asking the model to answer it. */
  appendUserMessage(
    role: AgentRole,
    body: { threadId: string; profileId: string; text: string },
  ) {
    return this.call<{ messageId?: unknown }>(
      role,
      "post",
      "/api/2.0/ai/threads/append-user-message",
      {
        threadId: body.threadId,
        profileId: body.profileId,
        message: {
          role: "user",
          content: [{ type: "text", text: body.text }],
        },
      },
    );
  }

  async readMessages(role: AgentRole, threadId: string) {
    const { status, data, error } = await this.call<AiThreadMessage[]>(
      role,
      "get",
      `/api/2.0/ai/threads/read-messages?threadId=${threadId}`,
    );
    return { status, error, data: Array.isArray(data) ? data : [] };
  }

  /** The assistant reply lands asynchronously after send-with-stream returns. */
  async waitForAssistantReply(
    role: AgentRole,
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

  /** Flattens one message's content, which is "" on a failed reply. */
  static messageText(message: AiThreadMessage): string {
    return typeof message.content === "string"
      ? message.content
      : message.content.map((block) => block.text ?? "").join("\n");
  }

  static assistantText(messages: AiThreadMessage[]): string {
    return messages
      .filter((message) => message.role === "assistant")
      .map((message) => AiAgentChat.messageText(message))
      .join("\n");
  }

  /**
   * Status of the newest assistant reply. `undefined` on a reply the model
   * finished normally, populated when the backend gave up on it.
   */
  static assistantStatus(
    messages: AiThreadMessage[],
  ): AiThreadMessageStatus | undefined {
    const replies = messages.filter((message) => message.role === "assistant");
    return replies[replies.length - 1]?.status;
  }
}
