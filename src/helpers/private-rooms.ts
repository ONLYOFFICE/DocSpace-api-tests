import { randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { createPrivateRoom } from "./rooms";

export const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

export type Api = ReturnType<ApiSDK["forRole"]>;

/**
 * The body of a response that must have succeeded. The SDK never throws on an
 * HTTP error, so an unchecked `data.response` of a 403/500 would read as "empty":
 * this asserts the exact status first, then that a body is there.
 */
export function okBody<T>(
  res: { status: number; data?: { response?: T | null } | null },
  label: string,
  status = 200,
): T {
  expect(res.status, `${label}: HTTP status`).toBe(status);
  const body = res.data?.response;
  expect(body, `${label}: the response carries no body`).toBeDefined();
  expect(body, `${label}: the response body is null`).not.toBeNull();
  return body as T;
}

/** A list response that must have succeeded: 200 and an actual array. */
export function okList<T>(
  res: { status: number; data?: { response?: T[] | null } | null },
  label: string,
): T[] {
  const body = okBody<T[]>(res, label);
  expect(Array.isArray(body), `${label}: the body is not a list`).toBe(true);
  return body;
}

export type KeyedMember = {
  id: string;
  api: Api;
  /** Bearer token, for the raw requests the SDK has no method for. */
  token: string;
  publicKey: string;
  privateKeyEnc: string;
};

/**
 * Creates `count` Users that each hold an encryption key of their own and
 * returns them as independent clients.
 *
 * The members are added first and authenticated afterwards, because the shared
 * request context keeps the last login's session cookie and would turn later
 * owner-side `addMember` calls into 403s. The owner is logged in again before
 * returning, so the caller can carry on as the owner straight away.
 */
export async function addKeyedMembers(
  apiSdk: ApiSDK,
  count: number,
): Promise<KeyedMember[]> {
  const created = [];
  for (let i = 0; i < count; i++) {
    const { data, userData, status } = await apiSdk.addMember("owner", "User");
    expect(status, "addMember User").toBe(200);
    expect(data.response?.id, "addMember User: no id").toBeDefined();
    created.push({ id: data.response!.id as string, userData });
  }

  const members: KeyedMember[] = [];
  for (const { id, userData } of created) {
    const api = await apiSdk.authenticateMember(userData, "User");
    const token = apiSdk.tokenStore.getToken("user");
    expect(token, "no token after authenticating a member").not.toBe("");
    const self = okBody(await api.profiles.getSelfProfile(), "getSelfProfile");
    expect(self.id, "the client acts as another user").toBe(id);
    const publicKey = "member-pk-" + apiSdk.faker.generateString(12);
    const privateKeyEnc = "member-prv-" + apiSdk.faker.generateString(12);
    const { status } = await api.privacyroom.setKeys({
      encryptionKeyRequestDto: { publicKey, privateKeyEnc },
    });
    expect(status).toBe(201);
    members.push({ id, api, token, publicKey, privateKeyEnc });
  }

  await apiSdk.authenticateOwner();
  return members;
}

/** Creates a private Custom room owned by the owner; returns its id. */
export async function createOwnerPrivateRoom(apiSdk: ApiSDK, title?: string) {
  const { data, status } = await createPrivateRoom(apiSdk, "owner", {
    title: title ?? "Autotest Private " + apiSdk.faker.generateString(6),
    roomType: RoomType.CustomRoom,
  });
  expect(status, "creating the private room").toBe(200);
  const room = data.response!;
  expect(room.private, "the room is not private").toBe(true);
  expect(room.roomType, "the room is not a Custom room").toBe(
    RoomType.CustomRoom,
  );
  return room.id!;
}

/**
 * Uploads a file into a private room and returns its id. Such a room takes
 * content only as an upload marked `encrypted` and named with a GUID: the server
 * sees titles in the clear, so a client sends a generated one.
 *
 * The bytes are not real ciphertext - the portal never reads the content, it
 * only trusts the flag.
 */
export async function uploadPrivateRoomFile(api: Api, folderId: number) {
  const bytes = Buffer.alloc(512, 7);
  const fileName = `${randomUUID()}.docx`;

  const opened = await api.operations.createUploadSessionInFolder({
    folderId,
    sessionRequest: { fileName, fileSize: bytes.length, encrypted: true },
  });
  const sessionId = (opened.data.response as { id?: string } | undefined)?.id;
  expect(
    sessionId,
    `opening a session in ${folderId}: ${opened.status}`,
  ).toBeDefined();

  const sent = await api.operations.uploadSession({
    folderId,
    sessionId: sessionId!,
    file: new File([new Uint8Array(bytes)], fileName),
  });
  const stored = sent.data.response as { id?: number; file?: { id?: number } };
  const fileId = stored?.file?.id ?? stored?.id;
  expect(fileId, `uploading into ${folderId}: ${sent.status}`).toBeDefined();
  return fileId!;
}

/** Creates a file in an ordinary folder; a private room needs uploadPrivateRoomFile. */
export async function createRoomFile(api: Api, roomId: number, title: string) {
  const { data, status } = await api.files.createFile({
    folderId: roomId,
    createFileRequest: { title },
  });
  expect(status, "createFile").toBe(200);
  return data.response!.id!;
}

export async function getOwnerId(api: Api) {
  return okBody(await api.profiles.getSelfProfile(), "getSelfProfile").id!;
}

export function inviteToRoom(
  api: Api,
  roomId: number,
  userId: string,
  access: FileShare,
) {
  return api.rooms.setRoomSecurity({
    id: roomId,
    roomInvitationRequest: {
      invitations: [{ id: userId, access }],
      notify: false,
    },
  });
}

export type PublicKeyEntry = {
  id?: string;
  userId?: string;
  publicKey?: string;
  privateKeyEnc?: string;
};

/**
 * GET /api/2.0/files/file/{fileId}/publickeys (SDK getEncryptionAccess), sent
 * raw so that the caller is explicit. A bearer token
 * (or null for an anonymous call) is sent with an empty Cookie header, so the
 * shared context's session cannot stand in for the caller.
 */
export async function getFilePublicKeys(
  apiSdk: ApiSDK,
  token: string | null,
  fileId: number,
) {
  const headers: Record<string, string> = {
    Cookie: "",
    Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await apiSdk.request.fetch(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/file/${fileId}/publickeys`,
    { method: "GET", headers },
  );
  const text = await response.text();
  const status = response.status();
  // An error answer may have an empty or non-JSON body; a success answer must
  // be JSON with a list, otherwise "no entries" would hide a broken answer.
  let body: { response?: PublicKeyEntry[]; count?: number } | undefined;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (status === 200) {
    expect(
      Array.isArray(body?.response),
      `publickeys of ${fileId}: 200 without a list: ${text.slice(0, 200)}`,
    ).toBe(true);
  }
  return { status, entries: body?.response ?? [], text };
}

/** The ids of the users who hold an entry in a room's access-key set. */
export async function roomKeyHolders(api: Api, roomId: number) {
  const { data, status } = await api.privacyroom.getUserKeysForRoom({
    roomId,
  });
  expect(status, "getUserKeysForRoom").toBe(200);
  expect(Array.isArray(data.response), "access-key list").toBe(true);
  return data.response!.map((k) => k.userId!);
}

/** The room's members as userId -> access level, read back from the portal. */
export async function roomMemberAccess(api: Api, roomId: number) {
  const { data, status } = await api.rooms.getRoomSecurityInfo({ id: roomId });
  expect(status, "getRoomSecurityInfo").toBe(200);
  expect(Array.isArray(data.response), "member list").toBe(true);
  const raw = data.response!.map((m) => [
    (m.sharedTo as { id?: string }).id!,
    m.access,
  ]);
  const ids = raw.map((r) => r[0]);
  expect(
    ids.filter((id, i) => ids.indexOf(id) !== i),
    "a subject is listed more than once",
  ).toEqual([]);
  return new Map(raw as [string, FileShare | undefined][]);
}
