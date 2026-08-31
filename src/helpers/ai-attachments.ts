import { expect } from "@playwright/test";
import { FileType } from "@onlyoffice/docspace-api-sdk";
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
// Measured against a live portal on 2026-08-03 and re-measured on 2026-08-10,
// when the whole write side was given real validation. Where the SDK
// (dist/api/new-ai/attachments-api.d.ts) disagrees, the SDK is wrong:
//
//   * The SDK generates every route under `/api/2.0/new-ai/…`, which is a 404
//     HTML error page. The live prefix is `/api/2.0/ai/…`, like the rest of the
//     rewritten AI stack.
//   * `get` is typed as returning `NewAiAttachment`; it answers `200 null` for
//     anything it cannot find.
//
// What shapes every test in the suite:
//
//   * A FILE DRAFT IS A REFERENCE TO A DOCSPACE FILE. `input.path` is required
//     and is the file's **id as a string** — not a path, whatever the DTO's
//     "Storage path/key of the file" says. The server resolves it, checks the
//     caller's access, extracts the text itself and answers with THAT: the
//     `content` a client sends is required to be a string and then discarded,
//     and the draft's `title` comes from the file, not from the body. `path: ""`
//     is accepted and gives back a record that was never stored. So a test that
//     needs a draft holding particular text uploads a file holding it —
//     `saveFileId` does this for a body with no `path` of its own.
//   * The extension of that file decides whether the attach works at all:
//     `.docx` and `.txt` are extracted, `.bin` and a name with no extension are
//     a 400, and an archive is a 400 as well.
//   * A write that returns `{success:true}` proves nothing on the linking side.
//     `link-to-message` does now reject an empty body, unknown ids and a
//     message/thread mismatch, but a link it accepts still attaches nothing.
//   * The request body limit is about 128 KB and applies to the whole body, not
//     to any one field: 100 KB of `content` is accepted, 120 KB is 413, and a
//     100 KB `title` is fine on its own because nothing else is in the body. It
//     does not apply to the file behind `path`, which never travels in the
//     request.
//
// Reads and deletes used to be INTERMITTENT — 4 of 8 single reads right after a
// save came back empty, and a draft survived 4 of 8 single deletes. Re-measured
// on 2026-08-10 both are now reliable, 8 of 8 either way. The polling reads
// (`findAttachment`, `expectStored`) and the repeating `purge` below are kept:
// they cost one round trip when the store answers first time, and they are what
// the two tests that pin the flapping (BUG 82764, BUG 82767) measure with.
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
  /**
   * Set by the backend for a form it can analyse, and never by a client — see
   * attachments/attachments.spec.ts.
   */
  canAnalyze?: boolean;
  formKeys?: Array<{ key?: string; text?: string }>;
};

export type AiAttachmentMutation = { success?: boolean };

/**
 * A file draft. `path`, `content` and `type` are required and `title` is
 * optional — exactly what the SDK documents, and the inverse of what the route
 * used to accept.
 */
export type FileInput = {
  title?: unknown;
  content?: unknown;
  type?: unknown;
  /** The DocSpace file id, as a string. */
  path?: unknown;
  [key: string]: unknown;
};

/** An image draft. `name` and a valid base64 `base64` are both required. */
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
    options?: { timeoutMs?: number },
  ) {
    return this.call<T>(role, method, path, body, options);
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
   * A real DocSpace file in the caller's My Documents holding `content`, whose
   * id is what `save-file`'s `path` wants. Uploaded by hand rather than through
   * the SDK for the reason `upload-file.ts` gives: the SDK's `uploadFile` sends
   * JSON and the server answers "No input files".
   *
   * The name matters — the extension decides whether the portal will extract
   * text at all, and `.bin` or no extension is a 400 on the attach that follows.
   */
  async backingFileId(role: AgentRole, name: string, content: string) {
    const cacheKey = `${role} ${name} ${content}`;
    const cached = this.backingFiles.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const headers: Record<string, string> = {
      Origin: `http://${this.tokenStore.newTenantDomain}`,
    };
    if (role !== "anonymous") {
      headers.Authorization = `Bearer ${this.tokenStore.getToken(role)}`;
    }

    const response = await this.request.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/files/@my/upload`,
      {
        headers,
        multipart: {
          file: {
            name,
            mimeType: "text/plain",
            buffer: Buffer.from(content, "utf8"),
          },
        },
      },
    );
    const body = (await response.json()) as {
      response?: Array<{ id?: number }> | { id?: number };
    };
    const entry = Array.isArray(body.response)
      ? body.response[0]
      : body.response;
    if (response.status() !== 200 || entry?.id === undefined) {
      throw new Error(
        `uploading the backing file ${name} failed: ${response.status()}`,
      );
    }

    this.backingFiles.set(cacheKey, entry.id);
    return entry.id;
  }

  private readonly backingFiles = new Map<string, number>();

  /**
   * Setup-only: a stored draft carrying `content`, addressed by its id. Throws
   * unless a draft really came back, so a test asserting on a draft never
   * carries an empty id into its assertions.
   *
   * An input with no `path` of its own is backed by a real DocSpace file that
   * this mints — see the note on the class about what `path` is. That is not a
   * convenience: a draft with no resolvable `path` cannot be stored at all any
   * more, so "give me a draft holding this text" *means* "upload a file holding
   * this text and attach it". The backing file is named after the title,
   * because the server takes the draft's title from the file too.
   *
   * Tests measuring save-file's own validation must use `saveFile` /
   * `saveFileRaw` and build the body themselves; this helper exists for the
   * drafts a test needs to have around.
   */
  async saveFileId(
    role: AgentRole,
    input: FileInput,
    entityId?: string,
  ): Promise<string> {
    let body = input;
    if (input.path === undefined) {
      const title =
        typeof input.title === "string" ? input.title : "autotest.txt";
      const fileId = await this.backingFileId(
        role,
        title,
        typeof input.content === "string" ? input.content : "",
      );
      body = {
        ...input,
        path: String(fileId),
        content: "",
        type: input.type ?? FileType.Document,
      };
    }

    const { status, data, error } = await this.saveFile(role, {
      input: body,
      ...(entityId === undefined ? {} : { entityId }),
    });
    if (status !== 200 || !data?.id) {
      throw new Error(
        `save-file failed for ${JSON.stringify(body)}: ${status} ${error ?? "(no id)"}`,
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
