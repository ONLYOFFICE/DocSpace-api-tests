import { AiHttp, AgentRole } from "./ai-http";

// Saved prompts and prompt folders — verified against a live portal 2026-08-04.
//
//   GET    /ai/prompts/list[?folderId=]        AiPrompt[]   (root when omitted)
//   GET    /ai/prompts/get-by-id?id=           AiPrompt | null
//   POST   /ai/prompts/create                  { name, text, folderId? }
//   PUT    /ai/prompts/update                  { id, updates: { name?, text?, folderId? } }
//   PUT    /ai/prompts/move                    { id, folderId | null }
//   DELETE /ai/prompts/delete                  bare prompt id string
//   GET    /ai/prompts/list-folders            AiPromptFolder[]
//   GET    /ai/prompts/get-folder-by-id?id=
//   POST   /ai/prompts/create-folder           bare folder-name string
//   PUT    /ai/prompts/rename-folder           { id, name }
//   DELETE /ai/prompts/delete-folder           bare folder id string
//   GET    /ai/prompts/export                  { version, folders[], prompts[] }
//   POST   /ai/prompts/import-bundle           { bundle, options? }
//
// The store is per-user: another user's prompt is invisible to `list`, reads back
// as `200 null` from `get-by-id` and is "not found" on update. There is no
// built-in/read-only prompt set on a fresh portal — `list` and `list-folders`
// both start empty, so the section-18 "built-in prompts are read-only" cases have
// nothing to assert against and are recorded as gaps instead of guessed at.
//
// Error style is split in a way that matters for assertions:
//   * a blank *name* is HTTP 200 `{success:false, error:{field:"name", ...}}`
//   * a blank *text* is a hard HTTP 400
//   * an over-long name (5000 chars) is a hard HTTP 400 on *create*-folder only;
//     `rename-folder` takes any length, answers 200 and silently truncates to
//     255 chars (BUG 83123) — do not generalise create's validation to rename
//   * a missing id on delete/get is HTTP 400 `{"error":"id required"}`
//   * `list?folderId=` is 200 + `[]` for an unknown GUID but a hard 400 for a
//     value that is not a GUID at all — it fails to bind before the store
//
// Per-folder name uniqueness is enforced on `create` and on `update{name}`, but
// NOT on `move` or `update{folderId}`: either will happily park a second prompt
// with the same name in the target folder (BUG 83122).
// `error.field` is always "name", even when the offending field is folderId or
// the provider type — do not assert the field name as if it were meaningful.

export type AiPrompt = {
  id?: string;
  name?: string;
  text?: string;
  folderId?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type AiPromptFolder = {
  id?: string;
  name?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type AiPromptResult = {
  success?: boolean;
  prompt?: AiPrompt;
  error?: { field?: string; message?: string };
};

export type AiFolderResult = {
  success?: boolean;
  folder?: AiPromptFolder;
  error?: { field?: string; message?: string };
};

export type AiPromptBundle = {
  version?: number;
  folders?: AiPromptFolder[];
  prompts?: AiPrompt[];
};

/**
 * `import-bundle` is documented as all-or-nothing: either every entry persisted
 * and `imported` carries the counts, or nothing persisted and `errors` names the
 * offending entries. `options.mode` is `"merge"` (add to the library) or
 * `"replace"` (drop it first) — the destructive one, so it is worth spelling out.
 */
export type AiImportResult = {
  success?: boolean;
  imported?: { folders?: number; prompts?: number };
  errors?: Array<{
    kind?: "folder" | "prompt";
    ref?: string;
    error?: { field?: string; message?: string };
  }>;
  error?: { field?: string; message?: string };
};

export class AiPrompts extends AiHttp {
  // ----------------------------------------------------------------- prompts

  async listPrompts(role: AgentRole, folderId?: string) {
    const query =
      folderId === undefined ? "" : `?folderId=${encodeURIComponent(folderId)}`;
    const { status, data, error } = await this.call<AiPrompt[]>(
      role,
      "get",
      `/api/2.0/ai/prompts/list${query}`,
    );
    return { status, error, data: Array.isArray(data) ? data : [] };
  }

  getPrompt(role: AgentRole, id: string) {
    return this.call<AiPrompt | null>(
      role,
      "get",
      `/api/2.0/ai/prompts/get-by-id?id=${encodeURIComponent(id)}`,
    );
  }

  createPrompt(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiPromptResult>(
      role,
      "post",
      "/api/2.0/ai/prompts/create",
      body,
    );
  }

  updatePrompt(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiPromptResult>(
      role,
      "put",
      "/api/2.0/ai/prompts/update",
      body,
    );
  }

  movePrompt(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiPromptResult>(
      role,
      "put",
      "/api/2.0/ai/prompts/move",
      body,
    );
  }

  deletePrompt(role: AgentRole, id: unknown) {
    return this.call<AiPromptResult>(
      role,
      "delete",
      "/api/2.0/ai/prompts/delete",
      id,
    );
  }

  // ----------------------------------------------------------------- folders

  async listFolders(role: AgentRole) {
    const { status, data, error } = await this.call<AiPromptFolder[]>(
      role,
      "get",
      "/api/2.0/ai/prompts/list-folders",
    );
    return { status, error, data: Array.isArray(data) ? data : [] };
  }

  getFolder(role: AgentRole, id: string) {
    return this.call<AiPromptFolder | null>(
      role,
      "get",
      `/api/2.0/ai/prompts/get-folder-by-id?id=${encodeURIComponent(id)}`,
    );
  }

  createFolder(role: AgentRole, name: unknown) {
    return this.call<AiFolderResult>(
      role,
      "post",
      "/api/2.0/ai/prompts/create-folder",
      name,
    );
  }

  renameFolder(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiFolderResult>(
      role,
      "put",
      "/api/2.0/ai/prompts/rename-folder",
      body,
    );
  }

  deleteFolder(role: AgentRole, id: unknown) {
    return this.call<AiFolderResult>(
      role,
      "delete",
      "/api/2.0/ai/prompts/delete-folder",
      id,
    );
  }

  // ------------------------------------------------------- export and import

  exportBundle(role: AgentRole) {
    return this.call<AiPromptBundle>(role, "get", "/api/2.0/ai/prompts/export");
  }

  importBundle(role: AgentRole, body: Record<string, unknown>) {
    return this.call<AiImportResult>(
      role,
      "post",
      "/api/2.0/ai/prompts/import-bundle",
      body,
    );
  }

  // ----------------------------------------------------------------- helpers

  /** Setup-only: throws unless the prompt was really created. */
  async createPromptId(
    role: AgentRole,
    body: { name: string; text: string; folderId?: string },
  ): Promise<string> {
    const { status, data } = await this.createPrompt(role, body);
    const id = data?.prompt?.id;
    if (status !== 200 || !data?.success || !id) {
      throw new Error(
        `POST /ai/prompts/create failed: ${status} ${JSON.stringify(data)}`,
      );
    }
    return id;
  }

  /** Setup-only: throws unless the folder was really created. */
  async createFolderId(role: AgentRole, name: string): Promise<string> {
    const { status, data } = await this.createFolder(role, name);
    const id = data?.folder?.id;
    if (status !== 200 || !data?.success || !id) {
      throw new Error(
        `POST /ai/prompts/create-folder failed: ${status} ${JSON.stringify(data)}`,
      );
    }
    return id;
  }
}
