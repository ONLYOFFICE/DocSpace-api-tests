import { expect } from "@playwright/test";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { createPrivateRoom } from "./rooms";

export const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

export type Api = ReturnType<ApiSDK["forRole"]>;

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
    const { data, userData } = await apiSdk.addMember("owner", "User");
    expect(data.response?.id).toBeDefined();
    created.push({ id: data.response!.id as string, userData });
  }

  const members: KeyedMember[] = [];
  for (const { id, userData } of created) {
    const api = await apiSdk.authenticateMember(userData, "User");
    const token = apiSdk.tokenStore.getToken("user");
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
  expect(status).toBe(200);
  return data.response!.id!;
}

export async function createRoomFile(api: Api, roomId: number, title: string) {
  const { data, status } = await api.files.createFile({
    folderId: roomId,
    createFileRequest: { title },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

export async function getOwnerId(api: Api) {
  const { data } = await api.profiles.getSelfProfile();
  return data.response!.id!;
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
  let body: { response?: PublicKeyEntry[]; count?: number } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // an empty or non-JSON error body
  }
  return { status: response.status(), entries: body.response ?? [], text };
}

/** The ids of the users who hold an entry in a room's access-key set. */
export async function roomKeyHolders(api: Api, roomId: number) {
  const { data, status } = await api.privacyroom.getUserKeysForRoom({
    roomId,
  });
  expect(status).toBe(200);
  return data.response!.map((k) => k.userId!);
}

/** The room's members as userId -> access level, read back from the portal. */
export async function roomMemberAccess(api: Api, roomId: number) {
  const { data, status } = await api.rooms.getRoomSecurityInfo({ id: roomId });
  expect(status).toBe(200);
  return new Map(
    (data.response ?? []).map((m) => [
      (m.sharedTo as { id?: string }).id!,
      m.access,
    ]),
  );
}
