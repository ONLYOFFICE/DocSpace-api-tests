import { randomBytes, randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { ApiSDK, UserType } from "../services/api-sdk";
import { Api } from "./private-rooms";
import { waitForOperation } from "./wait-for-operation";
import { isZip, readZip, ZipEntry } from "./zip";

/**
 * Helpers for the private-room download tests (fileEncryption.download.spec.ts).
 *
 * The bytes the tests upload are NOT real ciphertext: the portal never reads
 * the content of an `encrypted` upload, so a random buffer with a unique marker
 * is enough to prove which bytes come back and that nothing else does. Real
 * decryption is out of scope here.
 */

export type UploadedFile = {
  id: number;
  /** The GUID-based name the file was sent under (the server title). */
  serverName: string;
  bytes: Buffer;
};

/** Random bytes that begin with a unique printable marker, for leak checks. */
export function markedBytes(marker: string, size = 600): Buffer {
  const head = Buffer.from(`${marker}:`);
  return Buffer.concat([head, randomBytes(Math.max(size - head.length, 16))]);
}

/** Uploads `bytes` into a private-room folder as an `encrypted` file. */
export async function uploadEncrypted(
  api: Api,
  folderId: number,
  opts: { ext?: string; bytes?: Buffer } = {},
): Promise<UploadedFile> {
  const bytes = opts.bytes ?? randomBytes(512);
  const serverName = `${randomUUID()}.${opts.ext ?? "docx"}`;
  const opened = await api.operations.createUploadSessionInFolder({
    folderId,
    sessionRequest: {
      fileName: serverName,
      fileSize: bytes.length,
      encrypted: true,
    },
  });
  const sessionId = (opened.data.response as { id?: string } | undefined)?.id;
  expect(
    sessionId,
    `opening a session in ${folderId}: ${opened.status}`,
  ).toBeDefined();
  const sent = await api.operations.uploadSession({
    folderId,
    sessionId: sessionId!,
    file: new File([new Uint8Array(bytes)], serverName),
  });
  const stored = sent.data.response as { id?: number; file?: { id?: number } };
  const id = stored?.file?.id ?? stored?.id;
  expect(id, `uploading into ${folderId}: ${sent.status}`).toBeDefined();
  return { id: id!, serverName, bytes };
}

export type Account = {
  id: string;
  type: UserType;
  api: Api;
  /** Bearer token, for the raw requests the SDK has no method for. */
  token: string;
};

/**
 * Creates accounts first and authenticates them afterwards (the shared request
 * context keeps the last login's cookie, which would break later owner-side
 * `addMember` calls), gives the ones asked for an encryption key and logs the
 * owner in again.
 */
export async function addAccounts(
  apiSdk: ApiSDK,
  specs: { type: UserType; key?: boolean }[],
): Promise<Account[]> {
  const created = [];
  for (const spec of specs) {
    const { data, userData } = await apiSdk.addMember("owner", spec.type);
    expect(data.response?.id, `addMember ${spec.type}`).toBeDefined();
    created.push({ ...spec, id: data.response!.id as string, userData });
  }
  const accounts: Account[] = [];
  const roleOf = {
    DocSpaceAdmin: "docSpaceAdmin",
    RoomAdmin: "roomAdmin",
    User: "user",
    Guest: "guest",
  } as const;
  for (const c of created) {
    const api = await apiSdk.authenticateMember(c.userData, c.type);
    const token = apiSdk.tokenStore.getToken(roleOf[c.type]);
    if (c.key) {
      const { status } = await api.privacyroom.setKeys({
        encryptionKeyRequestDto: {
          publicKey: "dl-pk-" + apiSdk.faker.generateString(12),
          privateKeyEnc: "dl-prv-" + apiSdk.faker.generateString(12),
        },
      });
      expect(status, `setKeys for ${c.type}`).toBe(201);
    }
    accounts.push({ id: c.id, type: c.type, api, token });
  }
  await apiSdk.authenticateOwner();
  return accounts;
}

/** A GET with an explicit caller: a bearer token, or none for an anonymous call. */
export async function fetchAs(url: string, token: string | null) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return {
    status: response.status,
    bytes: Buffer.from(await response.arrayBuffer()),
    headers: response.headers,
  };
}

/**
 * GET /files/file/{id}/presigneduri through the SDK, then the bytes behind the
 * address. `url` is only set when the address was issued.
 */
export async function downloadVia(api: Api, token: string, fileId: number) {
  const issued = await api.files.getPresignedUri({ fileId });
  if (issued.status !== 200) {
    return { issued: issued.status, url: undefined, bytes: undefined };
  }
  const url = issued.data.response as unknown as string;
  const got = await fetchAs(url, token);
  return {
    issued: issued.status,
    url,
    fetched: got.status,
    bytes: got.bytes,
  };
}

/** The same call sent raw with no credentials at all (an anonymous caller). */
export async function anonymousPresignedStatus(
  apiSdk: ApiSDK,
  fileId: number,
): Promise<number> {
  const response = await apiSdk.request.fetch(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/file/${fileId}/presigneduri`,
    {
      method: "GET",
      headers: {
        Cookie: "",
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );
  return response.status();
}

/** The positive control: the file really is there and `api` can fetch its bytes. */
export async function expectDownloads(
  api: Api,
  token: string,
  file: UploadedFile,
  who: string,
) {
  const got = await downloadVia(api, token, file.id);
  expect(got.issued, `${who}: presigneduri`).toBe(200);
  expect(got.fetched, `${who}: fetching the address`).toBe(200);
  expect(got.bytes!.equals(file.bytes), `${who}: bytes differ`).toBe(true);
}

/** Case-insensitive search for `marker` in a response body. */
export const containsMarker = (body: Buffer, marker: string) =>
  body.includes(Buffer.from(marker));

export type Bulk = {
  status: number;
  error?: string | null;
  url?: string;
  downloadStatus?: number;
  bytes?: Buffer;
  /** The archive entries; a single requested file comes back as the bare file. */
  entries?: ZipEntry[];
  isZip?: boolean;
};

/**
 * PUT /files/fileops/bulkdownload, waits for the operation and fetches what its
 * `url` points at.
 */
export async function bulkDownload(
  api: Api,
  token: string,
  downloadRequestDto: { fileIds?: number[]; folderIds?: number[] },
): Promise<Bulk> {
  const queued = await api.operations.bulkDownload({ downloadRequestDto });
  if (queued.status !== 200) return { status: queued.status };
  const op = await waitForOperation(api.operations);
  if (!op.url) return { status: queued.status, error: op.error };
  const got = await fetchAs(op.url, token);
  const zip = isZip(got.bytes);
  return {
    status: queued.status,
    error: op.error,
    url: op.url,
    downloadStatus: got.status,
    bytes: got.bytes,
    isZip: zip,
    entries: zip ? readZip(got.bytes) : undefined,
  };
}
