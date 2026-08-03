import { expect } from "@playwright/test";
import { AiHttp, AgentRole } from "./ai-http";
import { AiAgentChat } from "./ai-agent-chat";

// Chat attachments — the store behind "attach a document to an agent chat".
//
//   POST   /api/2.0/ai/attachments/save-file          { input, entityId? }
//   POST   /api/2.0/ai/attachments/save-files-many    { inputs, entityId? }
//   POST   /api/2.0/ai/attachments/save-image         { input, entityId? }
//   POST   /api/2.0/ai/attachments/save-images-many   { inputs, entityId? }
//   POST   /api/2.0/ai/attachments/get                "<id>"   (JSON literal)
//   POST   /api/2.0/ai/attachments/get-many           ["<id>", …]
//   POST   /api/2.0/ai/attachments/link-to-message    { ids, messageId, threadId }
//   DELETE /api/2.0/ai/attachments/delete             { id }
//   DELETE /api/2.0/ai/attachments/delete-many        ["<id>", …]
//
// Measured against a live portal on 2026-08-03. Where the SDK
// (dist/api/new-ai/attachments-api.d.ts) disagrees, the SDK is wrong:
//
//   * The SDK generates every route under `/api/2.0/new-ai/…`, which is a 404
//     HTML error page. The live prefix is `/api/2.0/ai/…`, like the rest of the
//     rewritten AI stack.
//   * `NewAiAttachmentsSaveFileRequestInput` declares `path`, `content` and
//     `type` required and `title` optional. It is the exact inverse: `title` is
//     the only field that must be present, `content`/`type` are optional
//     passthrough, and any NON-EMPTY `path` makes the call 500.
//   * `get` is typed as returning `NewAiAttachment`; it answers `200 null` for
//     anything it cannot find.
//
// Three behaviours shape every test in the suite:
//
//   * Reads and deletes are INTERMITTENT. Measured: 4 of 8 single reads right
//     after a save came back empty, the draft survived 4 of 8 single deletes, and
//     0 of 8 after six deletes in a row. So a read used as setup is always a poll
//     (`findAttachment`, `expectStored`) and a deletion a test needs to be real is
//     always a `purge`.
//
//     The cause is not established. An unreplicated per-instance store fits, but
//     so would eventual consistency, a read cache or an asynchronous write, and
//     plain eventual consistency does not explain a deleted record coming back.
//     Tests are therefore named after the symptom, not the mechanism.
//   * A write that returns `{success:true}` proves nothing. `link-to-message`
//     answers 200 to an empty body, to unknown ids and to a message/thread
//     mismatch alike, and never actually attaches anything.
//   * The request body limit is about 128 KB and applies to the whole body, not
//     to any one field: 100 KB of `content` is accepted, 120 KB is 413, and a
//     100 KB `title` is fine on its own because nothing else is in the body.
export type AiAttachment = {
  id?: string;
  kind?: "file" | "image";
  source?: "user" | "tool";
  title?: unknown;
  content?: unknown;
  base64?: string;
  path?: string;
  type?: unknown;
  messageId?: string;
  threadId?: string;
  entityId?: string;
  createdAt?: number;
};

export type AiAttachmentMutation = { success?: boolean };

/** A file draft. `title` is the only field the endpoint requires. */
export type FileInput = {
  title?: unknown;
  content?: unknown;
  type?: unknown;
  /** Present only to prove that any non-empty value 500s. */
  path?: unknown;
  [key: string]: unknown;
};

/** An image draft. No field is required — `{}` is accepted. */
export type ImageInput = {
  name?: unknown;
  base64?: unknown;
  title?: unknown;
  [key: string]: unknown;
};

export const ATTACHMENTS_BASE = "/api/2.0/ai/attachments";

/** The dead prefix the SDK generates, kept so a test can pin it as a 404. */
export const ATTACHMENTS_SDK_BASE = "/api/2.0/new-ai/attachments";

/**
 * How many times a read is retried before a draft is called missing. A single
 * read succeeded about half the time in measurement, so 14 attempts put a false
 * "missing" below 1e-4 if the misses are independent.
 */
export const READ_ATTEMPTS = 14;

/**
 * How many times a delete is repeated before the draft is expected to be gone.
 * Six sufficed in 8 of 8 measured runs; ten leaves headroom.
 */
export const PURGE_ROUNDS = 10;

/**
 * A body this size is accepted; roughly 120 KB and up answers 413, and the limit
 * is on the whole request rather than on any single field.
 */
export const LARGE_CONTENT_BYTES = 100_000;

/** Comfortably over the limit, for the 413 case. */
export const OVERSIZED_CONTENT_BYTES = 200_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AiAttachments extends AiHttp {
  /**
   * Escape hatch for requests outside this controller — the dead `/new-ai`
   * prefix and `ai/send-with-stream`, which is where attachments actually reach
   * a message.
   */
  rawRequest<T>(
    role: AgentRole,
    method: "get" | "post" | "put" | "delete",
    path: string,
    body?: unknown,
  ) {
    return this.call<T>(role, method, path, body);
  }

  // ------------------------------------------------------------------- writes

  saveFile(role: AgentRole, body: { input?: unknown; entityId?: string }) {
    return this.call<AiAttachment>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/save-file`,
      body,
    );
  }

  saveFilesMany(
    role: AgentRole,
    body: { inputs?: unknown; entityId?: string },
  ) {
    return this.call<AiAttachment[]>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/save-files-many`,
      body,
    );
  }

  saveImage(role: AgentRole, body: { input?: unknown; entityId?: string }) {
    return this.call<AiAttachment>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/save-image`,
      body,
    );
  }

  saveImagesMany(
    role: AgentRole,
    body: { inputs?: unknown; entityId?: string },
  ) {
    return this.call<AiAttachment[]>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/save-images-many`,
      body,
    );
  }

  /** Raw body escape hatch — `undefined` sends no body at all. */
  saveFileRaw(role: AgentRole, body?: unknown) {
    return this.call<AiAttachment>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/save-file`,
      body,
    );
  }

  saveImageRaw(role: AgentRole, body?: unknown) {
    return this.call<AiAttachment>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/save-image`,
      body,
    );
  }

  // -------------------------------------------------------------------- reads

  /**
   * The body is a bare JSON string literal — `"3fa85f64-…"`, quotes included.
   * Playwright sends a JS string verbatim, so the id has to be stringified or
   * the wire body is unquoted and the server answers 400.
   */
  get(role: AgentRole, id: string) {
    return this.call<AiAttachment | null>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/get`,
      JSON.stringify(id),
    );
  }

  /** For body-format tests: passes whatever it is given straight through. */
  getRaw(role: AgentRole, body?: unknown) {
    return this.call<AiAttachment | null>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/get`,
      body,
    );
  }

  getMany(role: AgentRole, ids: string[]) {
    return this.call<Array<AiAttachment | null>>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/get-many`,
      ids,
    );
  }

  getManyRaw(role: AgentRole, body?: unknown) {
    return this.call<Array<AiAttachment | null>>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/get-many`,
      body,
    );
  }

  // ------------------------------------------------------------------ linking

  linkToMessage(
    role: AgentRole,
    body: { ids?: unknown; messageId?: unknown; threadId?: unknown },
  ) {
    return this.call<AiAttachmentMutation>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/link-to-message`,
      body,
    );
  }

  linkToMessageRaw(role: AgentRole, body?: unknown) {
    return this.call<AiAttachmentMutation>(
      role,
      "post",
      `${ATTACHMENTS_BASE}/link-to-message`,
      body,
    );
  }

  // ----------------------------------------------------------------- deletion

  /** `{ id }` and a bare JSON string literal both bind; an array is a 400. */
  deleteOne(role: AgentRole, id: string) {
    return this.call<AiAttachmentMutation>(
      role,
      "delete",
      `${ATTACHMENTS_BASE}/delete`,
      { id },
    );
  }

  deleteRaw(role: AgentRole, body?: unknown) {
    return this.call<AiAttachmentMutation>(
      role,
      "delete",
      `${ATTACHMENTS_BASE}/delete`,
      body,
    );
  }

  deleteMany(role: AgentRole, ids: string[]) {
    return this.call<AiAttachmentMutation>(
      role,
      "delete",
      `${ATTACHMENTS_BASE}/delete-many`,
      ids,
    );
  }

  deleteManyRaw(role: AgentRole, body?: unknown) {
    return this.call<AiAttachmentMutation>(
      role,
      "delete",
      `${ATTACHMENTS_BASE}/delete-many`,
      body,
    );
  }

  // ------------------------------------------------------- setup convenience

  /**
   * Setup-only: throws unless a draft really came back, so a test asserting on
   * a draft never carries an empty id into its assertions.
   */
  async saveFileId(
    role: AgentRole,
    input: FileInput,
    entityId?: string,
  ): Promise<string> {
    const { status, data, error } = await this.saveFile(role, {
      input,
      ...(entityId === undefined ? {} : { entityId }),
    });
    if (status !== 200 || !data?.id) {
      throw new Error(
        `save-file failed for ${JSON.stringify(input)}: ${status} ${error ?? "(no id)"}`,
      );
    }
    return data.id;
  }

  async saveImageId(
    role: AgentRole,
    input: ImageInput,
    entityId?: string,
  ): Promise<string> {
    const { status, data, error } = await this.saveImage(role, {
      input,
      ...(entityId === undefined ? {} : { entityId }),
    });
    if (status !== 200 || !data?.id) {
      throw new Error(
        `save-image failed for ${JSON.stringify(input)}: ${status} ${error ?? "(no id)"}`,
      );
    }
    return data.id;
  }

  // ----------------------------------------------------------- polling reads

  /**
   * Polls `get-many` until the id resolves, and returns null only after every
   * attempt came back empty. `get-many` rather than `get` because it answers a
   * positional array and never 405s on a value it dislikes.
   */
  async findAttachment(
    role: AgentRole,
    id: string,
    attempts = READ_ATTEMPTS,
  ): Promise<AiAttachment | null> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const { status, data } = await this.getMany(role, [id]);
      if (status === 200 && Array.isArray(data) && data[0]) {
        return data[0];
      }
    }
    return null;
  }

  /** Same, through the single-id `get`, for tests that must exercise that route. */
  async findAttachmentViaGet(
    role: AgentRole,
    id: string,
    attempts = READ_ATTEMPTS,
  ): Promise<AiAttachment | null> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const { status, data } = await this.get(role, id);
      if (status === 200 && data) {
        return data;
      }
    }
    return null;
  }

  async expectStored(
    role: AgentRole,
    id: string,
    what = "attachment",
  ): Promise<AiAttachment> {
    const found = await this.findAttachment(role, id);
    expect(
      found,
      `${what} ${id} was not readable in ${READ_ATTEMPTS} attempts`,
    ).not.toBeNull();
    return found as AiAttachment;
  }

  async expectAbsent(
    role: AgentRole,
    id: string,
    what = "attachment",
  ): Promise<void> {
    const found = await this.findAttachment(role, id);
    expect(
      found,
      `${what} ${id} is still readable after ${READ_ATTEMPTS} attempts`,
    ).toBeNull();
  }

  /**
   * Asserts which user a role's requests are actually acting as.
   *
   * `apiSdk.request` is one shared context whose session cookie beats the bearer
   * token, so a missed `authenticateOwner()` silently sends a "member reads the
   * owner's draft" call as the owner — which would turn a leak test green. Any
   * test whose conclusion depends on *who* made the call should pin it with this
   * first.
   */
  async whoAmI(role: AgentRole): Promise<string> {
    const { status, data } = await this.call<{
      response?: { id?: string };
    }>(role, "get", "/api/2.0/people/@self");
    expect(status, `GET /people/@self as ${role}`).toBe(200);
    const id = data?.response?.id;
    expect(id, `GET /people/@self as ${role} returned no id`).toBeTruthy();
    return id as string;
  }

  async expectActingAs(role: AgentRole, userId: string, label: string = role) {
    expect(
      await this.whoAmI(role),
      `the request context is acting as ${label}`,
    ).toBe(userId);
  }

  async expectNotActingAs(role: AgentRole, userId: string, label: string) {
    expect(
      await this.whoAmI(role),
      `the request context must not be acting as ${label}`,
    ).not.toBe(userId);
  }

  /**
   * Deletes until the draft is gone, and asserts each call was accepted. One
   * `delete` is intermittent — the draft survived a single delete in half the
   * measured attempts — so a test that needs an attachment to really be gone has
   * to repeat the call.
   *
   * This is a setup/teardown tool. A contract test of `DELETE /delete` must use a
   * single `deleteOne`, or it proves only that the record disappears eventually.
   */
  async purge(
    role: AgentRole,
    id: string,
    rounds = PURGE_ROUNDS,
  ): Promise<void> {
    for (let round = 0; round < rounds; round++) {
      const { status } = await this.deleteOne(role, id);
      expect(status, `delete round ${round + 1} of ${rounds}`).toBe(200);
    }
    await this.expectAbsent(role, id, "purged attachment");
  }
}

/** Asserts the shape every successful save-* answers with. */
export function expectDraftShape(
  attachment: AiAttachment | null | undefined,
  kind: "file" | "image",
) {
  expect(attachment, "save-* response body").toBeTruthy();
  const draft = attachment as AiAttachment;
  expect(draft.id, "attachment id").toMatch(UUID_RE);
  expect(draft.kind).toBe(kind);
  expect(typeof draft.createdAt).toBe("number");
  // A draft is a draft: nothing ties it to a message or a thread yet.
  expect(draft.messageId).toBeUndefined();
  expect(draft.threadId).toBeUndefined();
}

/**
 * `entityId` never comes back, in any state, from any route — so the "drafts
 * are isolated per entity" story cannot be verified through the API at all.
 * Pinned here so a test does not silently assert an absent field.
 */
export function expectEntityIdNotEchoed(
  attachment: AiAttachment | null | undefined,
) {
  expect(attachment?.entityId).toBeUndefined();
}

/**
 * A thread plus one stored user message to link attachments to.
 *
 * `append-user-message` is used rather than `send-with-stream` on purpose: it
 * stores the message without asking the model anything, so the attachment tests
 * do not depend on inference (or on a funded AI wallet) at all.
 *
 * Watch the response shape — the field called `messageId` holds the whole
 * message object, and the id is one level further down.
 */
export async function createThreadWithUserMessage(
  aiChat: AiAgentChat,
  role: AgentRole,
  options: {
    profileId: string;
    agentId: number;
    title?: string;
    text?: string;
  },
): Promise<{ threadId: string; messageId: string }> {
  const threadId = await aiChat.createThreadId(role, {
    title: options.title ?? "Autotest Attachments Thread",
    profileId: options.profileId,
    agentId: options.agentId,
  });

  const { status, data, error } = await aiChat.appendUserMessage(role, {
    threadId,
    profileId: options.profileId,
    text: options.text ?? "Autotest attachment carrier",
  });

  const messageId = (data as { messageId?: { id?: string } } | undefined)
    ?.messageId?.id;
  if (status !== 200 || !messageId) {
    throw new Error(
      `append-user-message failed: ${status} ${error ?? JSON.stringify(data)}`,
    );
  }

  return { threadId, messageId };
}

/** Reads a thread and returns the message with that id, or undefined. */
export async function readMessageById(
  aiChat: AiAgentChat,
  role: AgentRole,
  threadId: string,
  messageId: string,
) {
  const { status, data } = await aiChat.readMessages(role, threadId);
  expect(status, `read-messages for thread ${threadId}`).toBe(200);
  return (data as Array<{ id?: string; attachments?: unknown }>).find(
    (message) => message.id === messageId,
  );
}
