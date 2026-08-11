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
  /**
   * The agent's fixed model. Absent from the SDK's own DTO, but the API does
   * return it — it is where a composer reads the model it hides the picker in
   * favour of. A roomType 9 room made through /files/rooms has no such field.
   */
  profileId?: string;
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
  /**
   * "" instead of the usual blocks when the reply failed. A reply that asked for
   * a tool carries a `tool-call` part alongside the text ones; its `result` is
   * absent until approve/deny fills it in.
   */
  content: Array<AiMessageContentPart> | string;
  createdAt: number;
  status?: AiThreadMessageStatus;
  /** Echoed back verbatim from what the send carried. */
  attachments?: Array<Record<string, unknown>>;
};

export type AiMessageContentPart = {
  type: string;
  text?: string;
  /** `tool-call` parts only. */
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  argsText?: string;
  /** Written by approve-tool-call / deny-tool-call. */
  result?: unknown;
};

/**
 * A tool the *client* offers the model for one request — what the editor does
 * when it hands over insert_text/replace_selection, and what
 * `actionArgs.tools` on send-with-stream takes. Shape is the SDK's TMCPItem.
 *
 * `requireApproval` is the per-tool half of the pause contract: `false` lets the
 * engine flag the pending call `autoAllow`, `true` always prompts, and leaving
 * it unset defers to the persisted allow-always list.
 */
export type HostTool = {
  name: string;
  description: string;
  inputSchema: object;
  enabled?: boolean;
  requireApproval?: boolean;
};

/**
 * One frame of a streamed response. `tool-call-pending` is the only pause point
 * the engine has: the stream stops there and only resumes through
 * approve-tool-call / deny-tool-call.
 */
export type AiStreamFrame = {
  type?: string;
  message?: AiThreadMessage;
  messageId?: string;
  threadId?: string;
  idx?: number;
  autoAllow?: boolean;
  serverExecuted?: boolean;
  title?: string;
  [key: string]: unknown;
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
      /**
       * "Attach the default DocSpace MCP tool server" per the SDK's own
       * AiAgentsCreateRequest. Accepted in every spelling and, as of 2026-08-07,
       * with no observable effect — see the agent-body block of mcp/mcp.spec.ts.
       */
      attachDefaultTools?: boolean;
      /**
       * Extra body fields, for the tests that send what the composer does not —
       * e.g. an `mcpServers` map, to pin that the agent body is not where MCP
       * servers are stored.
       */
      extra?: Record<string, unknown>;
    },
  ) {
    const { extra, ...rest } = body;
    return this.call<Envelope<AgentDto>>(role, "post", "/api/2.0/ai/agents", {
      color: "FF5733",
      cover: "layers",
      ...rest,
      ...extra,
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
      /** Raw extra body fields — see `createAgent`. Overrides the above. */
      extra?: Record<string, unknown>;
    },
  ) {
    const { prompt, extra, ...rest } = body;
    return this.call<Envelope<AgentDto>>(
      role,
      "put",
      `/api/2.0/ai/agents/${agentId}`,
      {
        ...rest,
        ...(prompt === undefined ? {} : { chatSettings: { prompt } }),
        ...extra,
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
    body: { title: string; profileId: string; agentId: number | string },
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
    body: { title: string; profileId: string; agentId: number | string },
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
      /**
       * Per-request model override. Omit it to let the backend resolve the model
       * from the entity's / portal's assignment instead.
       */
      profileId?: string;
      agentId: number | string;
      message: string;
      instructions?: string;
      /** Client-supplied tools for this request only — see `HostTool`. */
      tools?: HostTool[];
      /** Attachment drafts carried by the user message. */
      attachments?: Array<Record<string, unknown>>;
      /**
       * Caps the wait on the stream. Needed for the requests that never
       * terminate; the frames received before the cap are lost, so the
       * assertions then have to read the thread back.
       */
      timeoutMs?: number;
    },
  ) {
    const actionArgs = {
      ...(body.instructions
        ? { prompt: { mode: "replace", text: body.instructions } }
        : {}),
      ...(body.tools ? { tools: body.tools } : {}),
    };

    const { status, error, text, headers } = await this.call(
      role,
      "post",
      "/api/2.0/ai/ai/send-with-stream",
      {
        threadId: body.threadId,
        entityId: String(body.agentId),
        ...(body.profileId === undefined ? {} : { profileId: body.profileId }),
        ...(Object.keys(actionArgs).length > 0 ? { actionArgs } : {}),
        userMessage: {
          role: "user",
          content: [{ type: "text", text: body.message }],
          ...(body.attachments ? { attachments: body.attachments } : {}),
        },
      },
      body.timeoutMs === undefined ? undefined : { timeoutMs: body.timeoutMs },
    );
    return {
      status,
      error,
      text,
      headers,
      streamError: AiAgentChat.streamError(text),
      frames: AiAgentChat.streamFrames(text),
    };
  }

  /**
   * Sends and then cuts the HTTP request off after `afterMs`.
   *
   * This is the whole of "stop generation" as the product has it. The portal
   * has no stop/cancel route — every spelling of one answers 404 — and the
   * client library's `stopStreaming()` does not call one: it aborts the
   * in-flight `send-with-stream` request. Hanging up is therefore the only stop
   * gesture there is, which is what this does.
   *
   * The backend does not act on it — it finishes the answer and stores it, see
   * the stop block in messages.spec.ts — so a test using this must not assume
   * the reply is truncated.
   *
   * `aborted` is returned rather than assumed: a stream that happened to finish
   * inside the window would otherwise let a stop test pass without ever having
   * stopped anything.
   */
  async sendAndAbort(
    role: AgentRole,
    body: {
      threadId: string;
      profileId?: string;
      agentId: number | string;
      message: string;
      instructions?: string;
      tools?: HostTool[];
      /** How long to let the reply stream before hanging up. */
      afterMs?: number;
    },
  ): Promise<{ aborted: boolean }> {
    const { afterMs, ...rest } = body;
    try {
      await this.sendMessage(role, { ...rest, timeoutMs: afterMs ?? 5000 });
      return { aborted: false };
    } catch {
      // The request context threw on its own timeout — the connection is gone,
      // which is exactly the event under test.
      return { aborted: true };
    }
  }

  /**
   * Polls the newest assistant reply until its text has not grown for
   * `quietMs`, and returns it with the length trajectory.
   *
   * A test around a dropped connection cannot just read the thread once: the
   * generation carries on without the client and the reply keeps growing —
   * measured at twenty seconds of further writing — so an immediate read
   * catches a value that is about to change. Waiting for the text to go quiet
   * is what tells "the backend is done with it" apart from "the rest has not
   * been written yet".
   */
  async waitForStableAssistantText(
    role: AgentRole,
    threadId: string,
    quietMs = 20000,
    timeoutMs = 120000,
  ): Promise<{
    message?: AiThreadMessage;
    text: string;
    /** Every distinct length seen, in order — the growth curve. */
    lengths: number[];
  }> {
    const deadline = Date.now() + timeoutMs;
    const lengths: number[] = [];
    let message: AiThreadMessage | undefined;
    let text = "";
    let lastChange = Date.now();

    while (Date.now() < deadline) {
      const { data } = await this.readMessages(role, threadId);
      const replies = AiAgentChat.assistantMessages(data);
      message = replies[replies.length - 1];
      const current = message ? AiAgentChat.messageText(message) : "";

      if (current.length !== text.length) {
        lengths.push(current.length);
        text = current;
        lastChange = Date.now();
      } else if (Date.now() - lastChange >= quietMs) {
        return { message, text, lengths };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return { message, text, lengths };
  }

  /**
   * The frames of a `send-with-stream` / `regenerate-stream` response. The
   * protocol is newline-delimited JSON (`application/x-ndjson`) objects with a
   * `type` discriminator, NOT the `event:`/`data:` SSE the old chat endpoints
   * used — `parseSseEvents` does not apply here.
   *
   * The vocabulary is the SDK's AiChatEventTypeEnum: `user-message-stored`,
   * `message-start`, `message-delta`, `message-end`, `message-incomplete`,
   * `tool-call-pending`, `thread-title` — plus the `error` frame, which is not
   * in the enum but is what a failed request answers with instead of a status.
   */
  static streamFrames(body: string): AiStreamFrame[] {
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

  /** The frame types in order — the cheap way to say what a stream did. */
  static frameTypes(body: string): string[] {
    return AiAgentChat.streamFrames(body).map((frame) => frame.type ?? "");
  }

  /**
   * The frames that carry the assistant reply as it grows: `message-start`, the
   * `message-delta`s and the terminal `message-end`. Deliberately not the whole
   * `message`-bearing set — `user-message-stored` also carries one, and it is
   * the question, not the answer.
   */
  static readonly CONTENT_FRAME_TYPES = [
    "message-start",
    "message-delta",
    "message-end",
  ];

  static contentFrames(body: string): AiStreamFrame[] {
    return AiAgentChat.streamFrames(body).filter((frame) =>
      AiAgentChat.CONTENT_FRAME_TYPES.includes(frame.type ?? ""),
    );
  }

  /** The text one frame carries, "" if it carries no message. */
  static frameText(frame: AiStreamFrame): string {
    return frame.message ? AiAgentChat.messageText(frame.message) : "";
  }

  /**
   * The reply as a client assembles it from the stream.
   *
   * Note what the protocol is NOT: a `message-delta` carries the whole reply so
   * far, not the piece that was added, so the assembled text is the last content
   * frame's text and concatenating the frames would produce nonsense. The frames
   * are snapshots — which is also why `deltaTexts` below grows as a chain of
   * prefixes.
   */
  static streamedText(body: string): string {
    const frames = AiAgentChat.contentFrames(body);
    return frames.length === 0
      ? ""
      : AiAgentChat.frameText(frames[frames.length - 1]);
  }

  /** Every content frame's snapshot, in arrival order. */
  static deltaTexts(body: string): string[] {
    return AiAgentChat.contentFrames(body).map((frame) =>
      AiAgentChat.frameText(frame),
    );
  }

  /**
   * The pause frame, if the model asked to run a tool. Everything needed to
   * resume — messageId, idx, the message itself — lives on it, so approve/deny
   * bodies are built from this rather than from the thread.
   */
  static pendingToolCall(body: string): AiStreamFrame | undefined {
    return AiAgentChat.streamFrames(body).find(
      (frame) => frame.type === "tool-call-pending",
    );
  }

  /** The `tool-call` parts of a stored message, in content order. */
  static toolCalls(message: AiThreadMessage): AiMessageContentPart[] {
    return typeof message.content === "string"
      ? []
      : message.content.filter((part) => part.type === "tool-call");
  }

  /**
   * Resumes a paused tool call. `result` is what the model is told the tool
   * returned — pass a string: an object result is refused by the gateway (see
   * the bug in the tool-call pause block of
   * mcp/mcp.spec.ts).
   */
  approvePendingToolCall(
    role: AgentRole,
    pending: AiStreamFrame,
    body: {
      threadId: string;
      profileId: string;
      agentId: number | string;
      result: unknown;
      tools?: HostTool[];
      allowAlways?: boolean;
    },
  ) {
    return this.approveToolCall(role, {
      threadId: body.threadId,
      messageId: pending.messageId,
      idx: pending.idx ?? 0,
      message: pending.message,
      entityId: String(body.agentId),
      profileId: body.profileId,
      result: body.result,
      ...(body.allowAlways === undefined
        ? {}
        : { allowAlways: body.allowAlways }),
      ...(body.tools ? { actionArgs: { tools: body.tools } } : {}),
    });
  }

  /** Refuses a paused tool call; the model is told the user denied it. */
  denyPendingToolCall(
    role: AgentRole,
    pending: AiStreamFrame,
    body: {
      threadId: string;
      profileId: string;
      agentId: number | string;
      tools?: HostTool[];
    },
  ) {
    return this.denyToolCall(role, {
      threadId: body.threadId,
      messageId: pending.messageId,
      idx: pending.idx ?? 0,
      message: pending.message,
      entityId: String(body.agentId),
      profileId: body.profileId,
      ...(body.tools ? { actionArgs: { tools: body.tools } } : {}),
    });
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
    agentId?: number | string,
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

  /**
   * Single-shot inference against a caller-supplied system prompt.
   *
   * The two stream modes answer differently, and only one of them is JSON:
   * `isStream:false` is the assistant message itself, while `isStream:true` is
   * NDJSON — the message, then a `{isEnd, responseMessage}` frame. So `data` is
   * undefined for the streamed form and `sendCustomFrames` is what reads it.
   */
  sendCustom(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiThreadMessage & { status?: AiThreadMessageStatus }>(
      role,
      "post",
      "/api/2.0/ai/ai/send-custom",
      body,
    );
  }

  /** The NDJSON frames of a streamed `send-custom`, in order. */
  static sendCustomFrames(text: string): Array<
    {
      isEnd?: boolean;
      responseMessage?: AiThreadMessage & { status?: AiThreadMessageStatus };
    } & AiThreadMessage
  > {
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
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

  /**
   * The whole history of one thread. `count`/`cursor` are the paging parameters
   * the client library's `enablePagination` expects here; the route takes them
   * and ignores them, so they exist on this signature only for the test that
   * pins that — see the paging block in messages.spec.ts.
   */
  async readMessages(
    role: AgentRole,
    threadId: string,
    options?: { count?: number; cursor?: string },
  ) {
    const params = new URLSearchParams({ threadId });
    if (options?.count !== undefined)
      params.set("count", String(options.count));
    if (options?.cursor !== undefined) params.set("cursor", options.cursor);

    const { status, data, error } = await this.call<AiThreadMessage[]>(
      role,
      "get",
      `/api/2.0/ai/threads/read-messages?${params}`,
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
