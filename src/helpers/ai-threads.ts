import { expect } from "@playwright/test";
import type {
  AiProfile as SdkAiProfile,
  AiThreadMessageLike,
} from "@onlyoffice/docspace-api-sdk";
import { AiHttp, AgentRole } from "./ai-http";
import { AiAgentChat, AiProfile } from "./ai-agent-chat";
import { enableAiGateway } from "./wallet-services";
import type { ApiSDK } from "../services/api-sdk";

// Shared plumbing for the ThreadsApi suites (threads.spec.ts,
// threads.messages.spec.ts, threads.permission.spec.ts, threads.lifecycle.spec.ts).
//
// The main checks go through the SDK (`forRole(role).chat`). Raw requests are
// kept for what the SDK cannot say: a missing or mistyped field, an empty body,
// a missing query parameter.
//
// Two places where the live portal and the SDK 4.0.0 typings disagree, both
// handled here so the tests read cleanly:
//
//   * `append-user-message` is typed `{ messageId: string }`, but answers with
//     the whole stored message nested under `messageId`. `appendedMessage`
//     accepts either shape.
//   * `read-messages` / `get-message-by-id` hand back `content` as either a
//     string or a list of typed parts; `textOf` flattens both.

export type ThreadsClient = ReturnType<ApiSDK["forRole"]>["chat"];

/** Well-formed, never issued. */
export const UNKNOWN_ID = "019ed117-0000-7000-8000-000000000000";
export const MALFORMED_ID = "not-a-guid";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function expectUuid(value: unknown, label = "id") {
  expect(typeof value, `${label} is a string`).toBe("string");
  expect(value, `${label} is a uuid`).toMatch(UUID);
}

/** Raw JSON calls, for the bodies the SDK's typed signatures cannot express. */
export class RawThreads extends AiHttp {
  send(
    role: AgentRole,
    method: "get" | "post" | "put" | "delete",
    path: string,
    body?: unknown,
  ) {
    return this.call<unknown>(role, method, path, body);
  }

  /** A bare JSON value as the body, e.g. `"<threadId>"`. */
  sendJsonText(
    role: AgentRole,
    method: "post" | "put" | "delete",
    path: string,
    json: unknown,
  ) {
    return this.call<unknown>(role, method, path, JSON.stringify(json));
  }
}

export type ThreadsCtx = {
  aiChat: AiAgentChat;
  raw: RawThreads;
  /** Owner's SDK client. */
  api: ThreadsClient;
  profileId: string;
  profile: AiProfile;
  agentId: number;
};

/**
 * Owner-side setup: gateway on, one agent, its model. Every suite starts here so
 * "the thread's scope" is always a real agent the owner owns.
 */
export async function threadsSetup(
  apiSdk: ApiSDK,
  paymentsApi: Parameters<typeof enableAiGateway>[0],
): Promise<ThreadsCtx> {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);

  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const raw = new RawThreads(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId("owner");
  const profile = (await aiChat.listProfiles("owner")).find(
    (candidate) => candidate.id === profileId,
  )!;
  expect(profile, "the default profile is in the catalogue").toBeTruthy();
  const agentId = await aiChat.createAgentId("owner", {
    title: "Autotest Threads Agent",
    profileId,
  });

  return { aiChat, raw, api: ownerApi.chat, profileId, profile, agentId };
}

/** Creates a thread through the SDK and insists on the 200. */
export async function createThread(
  ctx: ThreadsCtx,
  title = "Autotest thread",
  options: { entityId?: string | null } = {},
  client: ThreadsClient = ctx.api,
): Promise<string> {
  const entityId =
    options.entityId === undefined ? String(ctx.agentId) : options.entityId;
  const { status, data } = await client.aiThreadsCreate({
    aiThreadsCreateRequest: {
      title,
      profileId: ctx.profileId,
      ...(entityId === null ? {} : { entityId }),
    },
  });
  expect(status, `creating thread "${title}"`).toBe(200);
  expectUuid(data.threadId, "threadId");
  return data.threadId;
}

/** The stored message `append-user-message` answered with. */
export function appendedMessage(data: unknown): {
  id: string;
  role?: string;
  content?: unknown;
} {
  const value = (data as { messageId?: unknown } | undefined)?.messageId;
  if (typeof value === "string") return { id: value };
  const message = value as { id?: string; role?: string; content?: unknown };
  expect(message?.id, "append-user-message returned a message id").toBeTruthy();
  return { id: message.id!, role: message.role, content: message.content };
}

/** Stores one user message without inference and returns its id. */
export async function appendText(
  ctx: ThreadsCtx,
  threadId: string,
  text: string,
  client: ThreadsClient = ctx.api,
): Promise<string> {
  const { status, data } = await client.aiThreadsAppendUserMessage({
    aiThreadsAppendUserMessageRequest: {
      threadId,
      profileId: ctx.profileId,
      message: { role: "user", content: [{ type: "text", text }] },
    },
  });
  expect(status, `storing "${text.slice(0, 40)}"`).toBe(200);
  return appendedMessage(data).id;
}

/** Flattens a message's content, which is a string or a list of parts. */
export function textOf(message: AiThreadMessageLike | null | undefined) {
  const content = message?.content as unknown;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part: { type?: string }) => part?.type === "text")
    .map((part: { text?: string }) => part.text ?? "")
    .join("\n");
}

export async function readAll(
  ctx: ThreadsCtx,
  threadId: string,
  client: ThreadsClient = ctx.api,
) {
  const { status, data } = await client.aiThreadsReadMessages({ threadId });
  expect(status, "read-messages").toBe(200);
  return data;
}

export async function readTexts(
  ctx: ThreadsCtx,
  threadId: string,
  client: ThreadsClient = ctx.api,
) {
  return (await readAll(ctx, threadId, client)).map((message) =>
    textOf(message),
  );
}

export async function getThread(
  ctx: ThreadsCtx,
  threadId: string,
  client: ThreadsClient = ctx.api,
) {
  const { status, data } = await client.aiThreadsGetById({ threadId });
  expect(status, "get-by-id").toBe(200);
  return data;
}

export async function listThreadIds(
  ctx: ThreadsCtx,
  options: { entityId?: string; query?: string; count?: number } = {},
  client: ThreadsClient = ctx.api,
) {
  const { status, data } = await client.aiThreadsList({
    entityId: options.entityId ?? String(ctx.agentId),
    query: options.query,
    count: options.count,
  });
  expect(status, "list").toBe(200);
  return data;
}

/**
 * Polls `read` until `done` holds. For the few places a state is reached
 * asynchronously (a stream being stored, `lastEditDate` ticking over): a bounded
 * wait with re-reading, never a fixed sleep.
 */
export async function waitUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 15000, intervalMs = 500 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    value = await read();
  }
  return value;
}

/** A thread's complete observable state, for "nothing changed" comparisons. */
export async function snapshotThread(
  ctx: ThreadsCtx,
  threadId: string,
  client: ThreadsClient = ctx.api,
) {
  const thread = await getThread(ctx, threadId, client);
  const messages = await readAll(ctx, threadId, client);
  return { thread, messages };
}

/** The catalogue profile as the SDK's request types want it. */
export function sdkProfile(ctx: ThreadsCtx): SdkAiProfile {
  return ctx.profile as unknown as SdkAiProfile;
}
