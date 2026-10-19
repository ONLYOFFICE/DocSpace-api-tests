import { expect } from "@playwright/test";
import type { ApiSDK } from "../services/api-sdk";
import type { PaymentApi } from "../services/payment-api";
import { AiHttp, AgentRole } from "./ai-http";
import { enableAiGateway } from "./wallet-services";

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

/** Well-formed ids that no library holds. */
export const UNKNOWN_PROMPT_ID = "019fcc1d-2c4d-7557-b8d2-6b4f1be1b212";
export const UNKNOWN_FOLDER_ID = "019fcc1d-2ccd-7274-974a-cc335f583f58";

/** Switches the owner's AI gateway on and hands back a client for the library. */
export async function ownerPrompts(apiSdk: ApiSDK, paymentsApi: PaymentApi) {
  await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);
  return new AiPrompts(apiSdk.request, apiSdk.tokenStore);
}

/** A whole library as plain data, for "nothing changed" comparisons. */
export type LibrarySnapshot = {
  folders: AiPromptFolder[];
  prompts: Array<Omit<AiPrompt, "folderId"> & { folderId: string | null }>;
};

/**
 * The library without its ids: one `folder/name: text` line per prompt plus the
 * folder names. What survives an export/import round trip, since the import
 * issues fresh ids.
 */
export function libraryShape(snapshot: LibrarySnapshot) {
  const folderName = new Map(
    snapshot.folders.map((folder) => [folder.id, folder.name]),
  );
  return {
    folders: snapshot.folders.map((folder) => folder.name).sort(),
    prompts: snapshot.prompts
      .map(
        (prompt) =>
          `${prompt.folderId ? folderName.get(prompt.folderId) : "<root>"}/${prompt.name}: ${prompt.text}`,
      )
      .sort(),
  };
}

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

  /**
   * Everything the caller owns, read through `export`, ordered by id so two
   * snapshots compare with `toEqual`. Timestamps are included on purpose: a
   * refused write that still touched a row would show up as a changed
   * `updatedAt`.
   */
  async snapshot(role: AgentRole): Promise<LibrarySnapshot> {
    const { status, data } = await this.exportBundle(role);
    expect(status, `export as ${role}`).toBe(200);
    const byId = (a: { id?: string }, b: { id?: string }) =>
      (a.id ?? "").localeCompare(b.id ?? "");
    return {
      folders: [...(data?.folders ?? [])].sort(byId),
      prompts: [...(data?.prompts ?? [])]
        .map((prompt) => ({ ...prompt, folderId: prompt.folderId ?? null }))
        .sort(byId),
    };
  }

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
