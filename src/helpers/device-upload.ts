import { expect } from "@playwright/test";
import { deflateRawSync, gzipSync } from "node:zlib";
import { FileType, FolderType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";
import { AgentRole } from "./ai-http";
import { AiAttachments } from "./ai-attachments";
import { uploadFileToFolder } from "./upload-file";

// "Upload from device" in an agent chat, from the server's side.
//
// The composer's claim is that a file picked from the device becomes a DocSpace
// file — in the area the chat is open in, or in My Documents when the user
// cannot create files there — and only then a chat attachment. The second step
// has a server-side route (`save-file` with `path` = the DocSpace file id, see
// `attachDocSpaceFile` below); the choice of folder for the first step does not:
// there is no upload route anywhere under `/api/2.0/ai/`, so the destination is
// picked by the client and handed to `POST /files/{folderId}/upload`, which is
// what this helper wraps.
//
// Two shapes bite every caller:
//
//   * the upload answers with an ARRAY of created entries even for one file, so
//     `data.response.id` is always undefined — go through `uploadedEntry`;
//   * the multipart body must be built by hand. The SDK's `uploadFile` sends
//     `Content-Type: application/json`, which serializes a File as `{}` and gets
//     "No input files" back — hence `upload-file.ts`, which this builds on.

type RoleApi = ReturnType<ApiSDK["forRole"]>;

export type UploadedFile = {
  id: number;
  title: string;
  folderId: number;
  fileExst?: string;
  pureContentLength?: number;
  /**
   * Only ever set on files inside an agent's Knowledge folder — DocSpace
   * auto-indexes those. Its absence is how a test shows that a chat attachment
   * stored in the agent room did NOT become agent knowledge.
   */
  vectorizationStatus?: number;
};

/** The single created entry out of the array the upload route answers with. */
export function uploadedEntry(data: unknown): UploadedFile | undefined {
  const response = (data as { response?: unknown } | undefined)?.response;
  const entry = Array.isArray(response) ? response[0] : response;
  return (entry ?? undefined) as UploadedFile | undefined;
}

/** A file handed to the portal the way the composer hands over a device file. */
export async function uploadDeviceFile(
  apiSdk: ApiSDK,
  role: Role,
  folderId: number | string | "@my",
  fileName: string,
  content: Buffer,
  mimeType?: string,
): Promise<{ status: number; file?: UploadedFile }> {
  const { status, data } = await uploadFileToFolder(
    apiSdk,
    role,
    folderId,
    content,
    fileName,
    mimeType === undefined ? undefined : { mimeType },
  );
  return { status, file: uploadedEntry(data) };
}

/**
 * Setup-only: throws unless the file was really created, so a test never
 * carries an undefined id into its assertions.
 */
export async function expectDeviceFileStored(
  apiSdk: ApiSDK,
  role: Role,
  folderId: number | string | "@my",
  fileName: string,
  content: Buffer,
  mimeType?: string,
): Promise<UploadedFile> {
  const { status, file } = await uploadDeviceFile(
    apiSdk,
    role,
    folderId,
    fileName,
    content,
    mimeType,
  );
  expect(status, `${role} uploading ${fileName} into ${folderId}`).toBe(200);
  expect(file?.id, `no file entry came back for ${fileName}`).toBeTruthy();
  return file as UploadedFile;
}

/**
 * Raw bytes of a stored file. The presigned stream URL is refused without
 * credentials, so the download carries the caller's bearer token — the same
 * dance as `readExportedDocxText` in `text-to-docx.ts`.
 */
export async function downloadFile(
  apiSdk: ApiSDK,
  role: Role,
  fileId: number,
): Promise<Buffer> {
  const { data, status } = await apiSdk
    .forRole(role)
    .files.getPresignedFileUri({ fileId });
  if (status !== 200 || !data.response?.url) {
    throw new Error(`no presigned URI for file ${fileId}: ${status}`);
  }

  const response = await apiSdk.request.get(data.response.url, {
    headers: {
      Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}`,
      Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
    },
  });
  if (response.status() !== 200) {
    throw new Error(`download of file ${fileId} failed: ${response.status()}`);
  }

  return response.body();
}

/**
 * Turns a stored DocSpace file into a chat attachment the way the composer does
 * — by reference, not by value.
 *
 * `save-file`'s `path` is the DocSpace **file id, as a string**: the server
 * resolves it, checks the caller's access to it and extracts the text itself.
 * That is the opposite of what the SDK documents (`path` = "Original host file
 * path"). Consequences worth knowing before writing a test against it:
 *
 *   * the id must be a string — a number is a 400;
 *   * **`content` and `type` are required** even though the server ignores what
 *     is in `content`: it always answers with the text it extracted, including
 *     when `content` was sent empty. So this helper sends `""` — a caller that
 *     passes real text would be asserting on a value the server discards.
 *     Validation was tightened on 2026-08-10; before that both fields were
 *     optional and the body below was enough on its own;
 *   * `title` is optional — the server fills it in from the file;
 *   * the draft comes back with `path` rewritten to `"<fileId>/<title>"`;
 *   * the ~128 KB request-body cap does not apply, because the payload never
 *     travels in the request: a 240 KB file attaches whole;
 *   * archives are refused here with 400, which is where the composer's
 *     "unsupported type" rule actually lives.
 */
export function attachDocSpaceFile(
  attachments: AiAttachments,
  role: AgentRole,
  fileId: number,
  title: string,
  entityId?: string,
) {
  return attachments.saveFile(role, {
    input: {
      path: String(fileId),
      title,
      content: "",
      type: FileType.Document,
    },
    ...(entityId === undefined ? {} : { entityId }),
  });
}

/**
 * Id of one of an agent room's two built-in subfolders (Knowledge, Result
 * Storage). Throws when it is missing: an agent without them is broken setup,
 * not a state a test should quietly skip over.
 */
export async function agentStorageFolderId(
  api: RoleApi,
  agentId: number,
  type: FolderType,
): Promise<number> {
  const { data, status } = await api.folders.getFolders({ folderId: agentId });
  if (status !== 200) {
    throw new Error(`getFolders failed for agent ${agentId}: ${status}`);
  }

  const folders = (data.response ?? []) as Array<{
    id?: number;
    type?: number;
  }>;
  const found = folders.find((folder) => folder.type === type)?.id;
  if (found === undefined) {
    throw new Error(
      `agent ${agentId} has no folder of type ${type}: ${JSON.stringify(folders)}`,
    );
  }
  return found;
}

/* ---------------------------------------------------------------------------
 * Archives. The composer refuses these by extension, so a test that asks what
 * the server does with one needs a file that really is an archive rather than a
 * .txt renamed — otherwise an acceptance could always be explained away as "it
 * only looked at the bytes". `listDocxEntries` in `docx.ts` reads the zip built
 * here back, which is what makes it a genuine archive and not a plausible
 * header.
 * ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** A valid deflate-compressed zip archive holding the given members. */
export function createZipArchive(
  entries: Array<{ name: string; content: string }>,
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.content, "utf8");
    const deflated = deflateRawSync(raw);
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    locals.push(local, name, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + deflated.length;
  }

  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // central directory start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localBytes, centralBytes, eocd]);
}

/** A valid gzip stream, for the `.gz` / `.tgz` names the composer also refuses. */
export function createGzipArchive(content: string): Buffer {
  return gzipSync(Buffer.from(content, "utf8"));
}
