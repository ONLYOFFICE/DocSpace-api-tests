import { randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { FileDto } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Api } from "./private-rooms";

/**
 * Helpers for the private-room upload tests (fileEncryption.upload.spec.ts).
 *
 * A private room takes content only through a chunked-upload session opened with
 * `encrypted: true` (the portal never reads the bytes, it trusts the flag), so
 * these wrap the session calls, the listing read-back and the few raw requests
 * the SDK cannot send with an explicit caller. The bytes used with them are
 * dummy buffers, not ciphertext.
 */

/** `chunkUploadSize` of the portal: parts above it are refused, files below it go in one call. */
export async function getChunkSize(api: Api): Promise<number> {
  const { data, status } = await api.filesSettings.getFilesSettings();
  expect(status).toBe(200);
  const size = (data.response as { chunkUploadSize?: number }).chunkUploadSize;
  expect(size, "chunkUploadSize").toBeGreaterThan(0);
  return size!;
}

export type OpenedSession = {
  status: number;
  id?: string;
  /** The name the session was opened under (the future server title). */
  name: string;
};

/**
 * POST /files/{folderId}/session. `encrypted` defaults to true; pass `null` to
 * leave the field out of the request altogether.
 */
export async function openSession(
  api: Api,
  folderId: number | string,
  opts: {
    size: number;
    ext?: string;
    fileName?: string;
    encrypted?: boolean | null;
    createNewIfExist?: boolean;
  },
): Promise<OpenedSession> {
  const name = opts.fileName ?? `${randomUUID()}.${opts.ext ?? "docx"}`;
  const sessionRequest: {
    fileName: string;
    fileSize: number;
    encrypted?: boolean;
    createNewIfExist?: boolean;
  } = { fileName: name, fileSize: opts.size };
  if (opts.encrypted !== null)
    sessionRequest.encrypted = opts.encrypted ?? true;
  if (opts.createNewIfExist !== undefined)
    sessionRequest.createNewIfExist = opts.createNewIfExist;
  const res = await api.operations.createUploadSessionInFolder({
    folderId,
    sessionRequest,
  });
  const id = (res.data?.response as { id?: string } | undefined)?.id;
  return { status: res.status, id, name };
}

const part = (bytes: Buffer, name = "part") =>
  new File([new Uint8Array(bytes)], name);

/** POST /files/{folderId}/session/{sessionId}: the next part, appended by arrival. */
export function sendNext(
  api: Api,
  folderId: number | string,
  sessionId: string,
  bytes: Buffer,
  partName?: string,
) {
  return api.operations.uploadSession({
    folderId,
    sessionId,
    file: part(bytes, partName),
  });
}

/** POST /files/{folderId}/session/{sessionId}/upload: a part kept under its number. */
export function sendNumbered(
  api: Api,
  folderId: number | string,
  sessionId: string,
  chunkNumber: number,
  bytes: Buffer,
) {
  return api.operations.uploadAsyncSession({
    folderId,
    sessionId,
    chunkNumber,
    file: part(bytes),
  });
}

/** The id of the file a session answer carries (`id` or `file.id`), 0 when none. */
export function storedFileId(res: { data?: unknown }): number {
  const r = (res.data as { response?: { id?: number; file?: { id?: number } } })
    ?.response;
  return r?.file?.id ?? r?.id ?? 0;
}

export type RoomFile = {
  id: number;
  title: string;
  version: number;
  size: number;
  encrypted: boolean;
  ext: string;
};

/** The files directly inside a folder, read back from the portal. */
export async function filesIn(
  api: Api,
  folderId: number | string,
): Promise<RoomFile[]> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  expect(status, `listing ${folderId}`).toBe(200);
  return ((data.response?.files ?? []) as FileDto[]).map((f) => ({
    id: f.id!,
    title: f.title!,
    version: f.version!,
    size: f.pureContentLength!,
    encrypted: f.encrypted === true,
    ext: f.fileExst ?? "",
  }));
}

export const idsOf = (files: RoomFile[]) => files.map((f) => f.id).sort();

/** The caller's file operations that have not finished yet. */
export async function unfinishedOperations(api: Api) {
  const { data } = await api.operations.getOperationStatuses();
  return (data.response ?? []).filter((o) => !o.finished);
}

/**
 * A multipart upload: the file is cut into `partSize` parts, sent through the
 * numbered-part route and assembled with finalize.
 */
export async function uploadInParts(
  api: Api,
  folderId: number,
  bytes: Buffer,
  opts: {
    partSize: number;
    ext?: string;
    order?: "asc" | "desc";
    repeatFirst?: boolean;
  },
) {
  const opened = await openSession(api, folderId, {
    size: bytes.length,
    ext: opts.ext,
  });
  expect(opened.status, "opening a multipart session").toBe(200);
  const parts: Buffer[] = [];
  for (let at = 0; at < bytes.length; at += opts.partSize)
    parts.push(bytes.subarray(at, at + opts.partSize));
  expect(
    parts.length,
    "a multipart upload needs several parts",
  ).toBeGreaterThan(1);
  const numbers = parts.map((_, i) => i + 1);
  if (opts.order === "desc") numbers.reverse();
  const sent: number[] = [];
  for (const n of numbers) {
    const res = await sendNumbered(api, folderId, opened.id!, n, parts[n - 1]);
    sent.push(res.status);
    if (opts.repeatFirst && n === numbers[0]) {
      const again = await sendNumbered(
        api,
        folderId,
        opened.id!,
        n,
        parts[n - 1],
      );
      sent.push(again.status);
    }
  }
  const fin = await api.operations.finalizeSession({
    folderId,
    sessionId: opened.id!,
  });
  return {
    opened,
    parts: parts.length,
    sent,
    finalized: fin,
    id: storedFileId(fin),
  };
}

/**
 * A raw request with an explicit caller: a bearer token, or none for an anonymous
 * one. The shared request context's cookie is blanked so it cannot stand in for
 * the caller.
 */
export async function rawRequest(
  apiSdk: ApiSDK,
  token: string | null,
  path: string,
  init:
    | { json: object }
    | { multipart: { name: string; bytes: Buffer }; query?: string },
) {
  const headers: Record<string, string> = {
    Cookie: "",
    Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/${path}`;
  const response =
    "json" in init
      ? await apiSdk.request.fetch(base, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          data: init.json,
        })
      : await apiSdk.request.fetch(
          base + (init.query ? `?${init.query}` : ""),
          {
            method: "POST",
            headers,
            multipart: {
              file: {
                name: init.multipart.name,
                mimeType: "application/octet-stream",
                buffer: init.multipart.bytes,
              },
            },
          },
        );
  return { status: response.status(), text: await response.text() };
}
