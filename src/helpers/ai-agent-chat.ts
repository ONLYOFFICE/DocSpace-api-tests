import { expect } from "@playwright/test";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
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

/**
 * One entry of GET /ai/profiles/list. A live entry looks like
 *
 *   { id: "019ed117-…", name: "Claude Sonnet 5", providerType: "onlyoffice",
 *     baseUrl: "https://<portal>", modelId: "claude-sonnet-5", key: "onlyoffice",
 *     createdAt: -62135596800000, reasoning: true, capabilities: 385,
 *     canUseTool: true, useResponsesApi: false }
 *
 * `createdAt` really is DateTime.MinValue for the gateway profiles — don't
 * assert on it.
 */
export type AiProfile = {
  id: string;
  name: string;
  modelId: string;
  providerType?: string;
  /**
   * `list` publishes the portal's public address here; `get-by-id` answers with
   * the cluster-internal one. See the leak test in profiles.spec.ts.
   */
  baseUrl?: string;
  key?: string;
  /** Bitmask; image-only profiles come back as 2, text ones as 257/385. */
  capabilities?: number;
  /** false on the image/video profiles, true on every text one. */
  canUseTool?: boolean;
  reasoning?: boolean;
  [key: string]: unknown;
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

  /**
   * Raw catalogue read. Negative tests must use this one: it keeps the status
   * and the error string, so "the list is empty" can be told apart from "the
   * call was refused".
   */
  getProfiles(role: AgentRole = "owner") {
    return this.call<AiProfile[]>(role, "get", "/api/2.0/ai/profiles/list");
  }

  /**
   * Setup-only convenience. Throws on anything but a real catalogue, so a test
   * that needs a profile fails at the setup line instead of quietly carrying an
   * empty array into its assertions.
   */
  async listProfiles(role: AgentRole = "owner"): Promise<AiProfile[]> {
    const { status, data, error } = await this.getProfiles(role);
    if (status !== 200 || !Array.isArray(data)) {
      throw new Error(
        `GET /ai/profiles/list failed: ${status} ${error ?? "(no error field)"}`,
      );
    }
    return data;
  }

  /**
   * Small, fast text models to run the chat tests on, most preferred first.
   * Matched as a substring of `modelId`; a name that has left the catalogue is
   * simply skipped, so this list does not need to be kept in lockstep with it.
   */
  static readonly TEXT_MODEL_PREFERENCE = [
    "gemini-3.5-flash",
    "deepseek-v4-flash",
    "gpt-5.6-luna",
    "claude-sonnet-5",
  ];

  /** modelId fragments that mark a profile as not a plain text completion. */
  static readonly NON_TEXT_MODEL_MARKERS = [
    "image",
    "vision",
    "video",
    "audio",
    "tts",
    "whisper",
    "embed",
    "rerank",
    "banana",
  ];

  /**
   * Deterministic pick of a usable text profile — never blindly profiles[0].
   *
   * The catalogue mixes text models in with image ones ("Nano Banana 2",
   * `gpt-5.4-image-2`), which do not answer a "what is 2+2" prompt with text,
   * and its order is not a contract. Image entries are recognised two ways
   * (`canUseTool: false` and an image/audio/video fragment in `modelId`) so
   * either signal drifting on its own does not put an image model back in play.
   */
  static pickTextProfile(profiles: AiProfile[]): AiProfile {
    const usable = profiles.filter(
      (profile) =>
        !!profile.id &&
        !!profile.modelId &&
        profile.canUseTool !== false &&
        !AiAgentChat.NON_TEXT_MODEL_MARKERS.some((marker) =>
          profile.modelId.toLowerCase().includes(marker),
        ),
    );

    if (usable.length === 0) {
      throw new Error(
        `No text profile in the catalogue: ${JSON.stringify(profiles)}`,
      );
    }

    for (const preferred of AiAgentChat.TEXT_MODEL_PREFERENCE) {
      const match = usable.find((profile) =>
        profile.modelId.toLowerCase().includes(preferred),
      );
      if (match) {
        return match;
      }
    }

    // Still deterministic without a preferred model: sort, don't trust order.
    return [...usable].sort((a, b) => a.modelId.localeCompare(b.modelId))[0];
  }

  /** The gateway profile agents in these tests run on. */
  async defaultProfileId(role: AgentRole = "owner"): Promise<string> {
    const profiles = await this.listProfiles(role);
    if (profiles.length === 0) {
      throw new Error("No AI profiles available on the portal");
    }
    return AiAgentChat.pickTextProfile(profiles).id;
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

  /**
   * Returns an async operation. The agent is usually gone by the time the call
   * comes back, but not reliably — read it back with `waitForAgentDeleted`.
   */
  deleteAgent(role: AgentRole, agentId: number | string, deleteAfter = false) {
    return this.call<Envelope<{ id?: string; finished?: boolean }>>(
      role,
      "delete",
      `/api/2.0/ai/agents/${agentId}`,
      { deleteAfter },
    );
  }

  /**
   * Polls GET /ai/agents/{id} until the agent is gone, and returns the last
   * status seen so the caller still does the asserting.
   *
   * DELETE hands back an async operation. It usually lands before the call
   * returns, which is why a bare follow-up GET passed for a long time, but on
   * 2026-08-03 a Room Admin run read 200 straight after a 200 delete. Polling
   * is what tells "the operation needed a moment" apart from "the 200 was a
   * lie": if this still returns 200 at the deadline, the delete really was a
   * no-op and the caller's `toBe(404)` fails on a product bug, not a race.
   */
  async waitForAgentDeleted(
    role: AgentRole,
    agentId: number | string,
    timeoutMs = 15000,
  ): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let status: number;

    for (;;) {
      ({ status } = await this.getAgentInfo(role, agentId));
      if (status === 404 || Date.now() >= deadline) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
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
   * Setup-only: throws unless a thread was really created. Tests that assert on
   * what happens *inside* a thread must not silently run against `threadId: ""`.
   */
  async createThreadId(
    role: AgentRole,
    body: { title: string; profileId: string; agentId: number },
  ): Promise<string> {
    const { status, error, threadId } = await this.createThread(role, body);
    if (status !== 200 || !threadId) {
      throw new Error(
        `POST /ai/threads/create failed: ${status} ${error ?? "(no threadId)"}`,
      );
    }
    return threadId;
  }

  /**
   * Sends a user message. `instructions` is passed as the system-prompt
   * override the way the client does it — the backend does not pull the agent's
   * stored AI Instructions into the thread by itself.
   *
   * The response body is a stream, so `text` is the only place a per-request
   * failure shows up: an unknown thread comes back as HTTP 200 carrying
   * `{"type":"error","message":"stream error"}`.
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
    const { status, error, text } = await this.call(
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
    return { status, error, text, streamError: AiAgentChat.streamError(text) };
  }

  /**
   * The frames of a `send-with-stream` / `regenerate-stream` response. The
   * protocol is newline-delimited JSON objects with a `type` discriminator
   * (`user-message-stored`, `message-start`, `message-end`, `error`), NOT the
   * `event:`/`data:` SSE the old chat endpoints used — `parseSseEvents` does not
   * apply here.
   */
  static streamFrames(
    body: string,
  ): Array<{ type?: string; messageId?: string; [key: string]: unknown }> {
    return body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"))
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  }

  /**
   * The chunks of a `send-with-stream-openai` response: OpenAI-compatible
   * `data: {...}` frames terminated by `data: [DONE]`.
   */
  static openAiStreamChunks(body: string): {
    chunks: Array<Record<string, unknown>>;
    done: boolean;
    text: string;
  } {
    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());

    const chunks: Array<Record<string, unknown>> = [];
    let done = false;
    for (const payload of lines) {
      if (payload === "[DONE]") {
        done = true;
        continue;
      }
      try {
        chunks.push(JSON.parse(payload));
      } catch {
        // a partial frame — ignore, the assertions look at what did arrive
      }
    }

    const text = chunks
      .map((chunk) => {
        const choices = chunk.choices as
          | Array<{ delta?: { content?: string } }>
          | undefined;
        return (
          choices?.map((choice) => choice.delta?.content ?? "").join("") ?? ""
        );
      })
      .join("");

    return { chunks, done, text };
  }

  /**
   * The `{"type":"error","message":"..."}` frame a streamed response carries
   * instead of an HTTP error status. `undefined` when the stream looks healthy.
   */
  static streamError(body: string): string | undefined {
    const match = body.match(
      /"type"\s*:\s*"error"[^}]*?"message"\s*:\s*"([^"]*)"/,
    );
    return match?.[1];
  }

  /**
   * Threads are listed per entity — without `entityId` the list is empty.
   * `data` is normalised to [] on an error payload so side-effect assertions
   * read cleanly; check `error`/`status` for the failure itself.
   *
   * `count`, `cursor` and `query` are accepted by the route and, as of
   * 2026-08-04, all three are ignored — see chat/threads.spec.ts.
   */
  async listThreads(
    role: AgentRole,
    agentId?: number,
    options?: { count?: number; cursor?: string; query?: string },
  ) {
    const params = new URLSearchParams();
    if (agentId !== undefined) params.set("entityId", String(agentId));
    if (options?.count !== undefined)
      params.set("count", String(options.count));
    if (options?.cursor !== undefined) params.set("cursor", options.cursor);
    if (options?.query !== undefined) params.set("query", options.query);
    const query = params.toString() ? `?${params}` : "";

    const { status, data, error } = await this.call<AiThread[]>(
      role,
      "get",
      `/api/2.0/ai/threads/list${query}`,
    );
    return { status, error, data: Array.isArray(data) ? data : [] };
  }

  /**
   * "Open the thread if I already have one, otherwise start it from this first
   * message" — the route the client uses instead of `create`, and the API-side
   * counterpart of section 8.1. The `profile` field is the whole AiProfile
   * object, not just its id: omitting it answers 500.
   *
   * The create half of that contract does not work on current builds: without a
   * `threadId` the call answers 500 whatever else is sent.
   */
  openOrCreateThread(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{
      threadId?: string;
      title?: string;
      priorMessages?: unknown[];
    }>(role, "post", "/api/2.0/ai/threads/open-or-create", body);
  }

  /** Asks the model for a fresh title. Answers 500 on current builds. */
  regenerateThreadTitle(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean; title?: string }>(
      role,
      "post",
      "/api/2.0/ai/threads/regenerate-title",
      body,
    );
  }

  getMessageById(role: AgentRole, messageId: string) {
    return this.call<AiThreadMessage | null>(
      role,
      "get",
      `/api/2.0/ai/threads/get-message-by-id?messageId=${encodeURIComponent(messageId)}`,
    );
  }

  /**
   * Rewrites a stored message in place. The id and the thread binding survive;
   * `createdAt` is re-stamped, so it is a modification timestamp after an edit.
   */
  updateMessage(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{ success?: boolean }>(
      role,
      "put",
      "/api/2.0/ai/threads/update-message",
      body,
    );
  }

  deleteMessage(role: AgentRole, messageId: unknown) {
    return this.call<{ success?: boolean }>(
      role,
      "delete",
      "/api/2.0/ai/threads/delete-message",
      messageId,
    );
  }

  /**
   * Re-runs the last assistant turn. Streams like send-with-stream, so a
   * per-request failure shows up in `text` as a `{"type":"error"}` frame rather
   * than as an HTTP status.
   */
  async regenerateStream(role: AgentRole, body: Record<string, unknown>) {
    const { status, error, text } = await this.call(
      role,
      "post",
      "/api/2.0/ai/ai/regenerate-stream",
      body,
    );
    return { status, error, text, streamError: AiAgentChat.streamError(text) };
  }

  /** Non-streaming single-shot inference for one action type. */
  send(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiThreadMessage & { status?: AiThreadMessageStatus }>(
      role,
      "post",
      "/api/2.0/ai/ai/send",
      body,
    );
  }

  /** Single-shot inference against a caller-supplied system prompt. */
  sendCustom(role: AgentRole, body: Record<string, unknown>) {
    return this.call<{
      isEnd?: boolean;
      responseMessage?: AiThreadMessage & { status?: AiThreadMessageStatus };
    }>(role, "post", "/api/2.0/ai/ai/send-custom", body);
  }

  /** OpenAI-compatible SSE variant: `data: {...}` frames ending in `data: [DONE]`. */
  sendWithStreamOpenAi(role: AgentRole, body: Record<string, unknown>) {
    return this.call(
      role,
      "post",
      "/api/2.0/ai/ai/send-with-stream-openai",
      body,
    );
  }

  approveToolCall(role: AgentRole, body: Record<string, unknown>) {
    return this.call(role, "post", "/api/2.0/ai/ai/approve-tool-call", body);
  }

  denyToolCall(role: AgentRole, body: Record<string, unknown>) {
    return this.call(role, "post", "/api/2.0/ai/ai/deny-tool-call", body);
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
    return this.waitForAssistantReplies(role, threadId, 1, timeoutMs);
  }

  /**
   * Waits for the Nth reply. Continuing a thread needs this: polling for "an
   * assistant message" returns immediately on the reply the previous turn
   * already produced.
   */
  async waitForAssistantReplies(
    role: AgentRole,
    threadId: string,
    count: number,
    timeoutMs = 90000,
  ): Promise<AiThreadMessage[]> {
    const deadline = Date.now() + timeoutMs;
    let messages: AiThreadMessage[] = [];

    while (Date.now() < deadline) {
      const { data } = await this.readMessages(role, threadId);
      messages = data;
      if (AiAgentChat.assistantMessages(messages).length >= count) {
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

  /** `undefined` on a reply the model finished normally. */
  static messageStatus(
    message: AiThreadMessage,
  ): AiThreadMessageStatus | undefined {
    return message.status;
  }

  static assistantMessages(messages: AiThreadMessage[]): AiThreadMessage[] {
    return messages.filter((message) => message.role === "assistant");
  }

  static userMessages(messages: AiThreadMessage[]): AiThreadMessage[] {
    return messages.filter((message) => message.role === "user");
  }

  static assistantText(messages: AiThreadMessage[]): string {
    return AiAgentChat.assistantMessages(messages)
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
    const replies = AiAgentChat.assistantMessages(messages);
    return replies[replies.length - 1]?.status;
  }
}

/**
 * Invites a member into the agent room. An invitation that silently failed
 * makes the following 403 look like a permission contract instead of broken
 * setup, so the status is asserted here once for every caller.
 */
export async function inviteToAgent(
  rooms: { setRoomSecurity: SetRoomSecurity },
  agentId: number,
  userId: string,
  access: FileShare = FileShare.ContentCreator,
) {
  const { status } = await rooms.setRoomSecurity({
    id: agentId,
    roomInvitationRequest: {
      invitations: [{ id: userId, access }],
      notify: false,
    },
  });
  expect(status, `inviting ${userId} into agent ${agentId}`).toBe(200);
}

type SetRoomSecurity = (args: {
  id: number;
  roomInvitationRequest: {
    invitations: Array<{ id: string; access: FileShare }>;
    notify: boolean;
  };
}) => Promise<{ status: number }>;

/**
 * A reply only counts as "the agent answered" when the model actually finished
 * it. A refused inference (unpaid wallet service, gateway auth failure, …) is
 * still stored as an assistant message, so `some(role === "assistant")` passes
 * on a portal where AI is completely dead — that is a false positive, not a
 * pass. Every positive send test goes through here instead.
 */
export function expectHealthyAssistantReply(
  messages: AiThreadMessage[],
  expectedCount = 1,
) {
  const replies = AiAgentChat.assistantMessages(messages);
  expect(replies).toHaveLength(expectedCount);

  for (const reply of replies) {
    const status = AiAgentChat.messageStatus(reply);
    expect(status?.error).toBeUndefined();
    expect(status?.reason).not.toBe("error");
    expect(AiAgentChat.messageText(reply).length).toBeGreaterThan(0);
  }
}
