import { expect } from "@playwright/test";
import { FileShare, SearchArea } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Api, ZERO_GUID, createOwnerPrivateRoom } from "./private-rooms";
import { Scene, buildScene } from "./private-room-isolation";

/**
 * Helpers of the membership-lifecycle tests (privacyroom.lifecycle*.spec.ts).
 *
 * Membership, the account key and the file key entries are three separate
 * things; these read each of them back.
 */

export const isOk = (s: number) => s >= 200 && s < 300;

/**
 * The room's members exactly as the portal lists them (the raw array, one
 * element per listed subject), read as the owner. Uniqueness is proved on THIS
 * array: a Map keyed by id would hide a subject listed twice.
 */
export const rawMembers = async (owner: Api, room: number) => {
  const { data, status } = await owner.rooms.getRoomSecurityInfo({ id: room });
  expect(status, "getRoomSecurityInfo").toBe(200);
  return (data.response ?? []).map((m) => ({
    id: (m.sharedTo as { id?: string }).id!,
    access: m.access,
  }));
};

/** Fails when the same subject is listed more than once; returns the ids. */
export const assertUniqueIds = (ids: string[], label = "members") => {
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(dups, `${label}: a subject is listed more than once`).toEqual([]);
  return ids;
};

/** The ids of every member, uniqueness already proved on the raw list. */
export const memberIds = async (owner: Api, room: number) =>
  assertUniqueIds((await rawMembers(owner, room)).map((m) => m.id));

/** userId -> access of every member (Map for lookups only; built after the raw uniqueness check). */
export const accessOf = async (owner: Api, room: number) => {
  const raw = await rawMembers(owner, room);
  assertUniqueIds(raw.map((m) => m.id));
  return new Map(raw.map((m) => [m.id, m.access]));
};

/**
 * A refusal whose exact HTTP status the guide and the JSDoc do not fix: any
 * 4xx, never 5xx and never success. Always combine it with a state check.
 */
export const expectRefused = (status: number, label: string) => {
  expect(status, `${label}: must be refused with a 4xx`).toBeGreaterThanOrEqual(
    400,
  );
  expect(
    status,
    `${label}: must be refused with a 4xx, not a server error`,
  ).toBeLessThan(500);
};

/** A request that must not crash the server (additional guard, never the only assertion). */
export const expectNoServerError = (status: number, label: string) =>
  expect(status, `${label}: server error`).toBeLessThan(500);

/** A caller's own wrapped keys of a file (a caller only ever sees their own), as one comparable string. */
export const keysOf = async (api: Api, fileId: number) =>
  JSON.stringify(
    (
      (await api.files.getEncryptionInfo({ fileId })).data.response?.fileKeys ??
      []
    )
      .map((k) => [k.userId, k.privateKeyEnc])
      .sort(),
  );

/** Writes a dummy wrapped key for `userId` on every file. */
export const issue = async (
  owner: Api,
  fileIds: number[],
  userId: string,
  tag: string,
) => {
  for (const fileId of fileIds)
    expect(
      (
        await owner.files.setEncryptionInfo({
          fileId,
          accessRequestKeyDto: [
            {
              userId,
              publicKeyId: ZERO_GUID,
              privateKeyEnc: `${tag}-${fileId}`,
            },
          ],
        })
      ).status,
      `issuing a file key for ${userId}`,
    ).toBe(200);
};

/** setRoomSecurity for one subject: an invitation, a role change or (None) a removal. */
export const invite = (
  owner: Api,
  room: number,
  id: string,
  access: FileShare,
) =>
  owner.rooms.setRoomSecurity({
    id: room,
    roomInvitationRequest: { invitations: [{ id, access }], notify: false },
  });

/** DELETE /files/share with the room id: the call the SDK offers as "remove sharing rights". */
export const leave = (who: Api, room: number) =>
  who.sharing.removeSecurityInfo({
    baseBatchRequestDto: { folderIds: [room] as never },
  });

/** The room as the caller can reach it: the steps from allowed to forbidden. */
export const reach = async (api: Api, s: Scene) => {
  const ok = async (fn: () => Promise<{ status: number }>) => {
    try {
      return (await fn()).status === 200;
    } catch {
      return false;
    }
  };
  const listed = async (area: SearchArea) =>
    (
      ((await api.rooms.getRoomsFolder({ searchArea: area, count: 100 })).data
        .response?.folders ?? []) as { id?: number }[]
    ).some((f) => f.id === s.roomId);
  return {
    room: await ok(() => api.rooms.getRoomInfo({ id: s.roomId })),
    content: await ok(() =>
      api.folders.getFolderByFolderId({ folderId: s.roomId }),
    ),
    nested: await ok(() =>
      api.folders.getFolderByFolderId({ folderId: s.innerId }),
    ),
    file: await ok(() => api.files.getFileInfo({ fileId: s.rootFile.id })),
    fileKeys: await ok(() =>
      api.files.getEncryptionInfo({ fileId: s.rootFile.id }),
    ),
    publicKeys: await ok(() =>
      api.sharing.getEncryptionAccess({ fileId: s.rootFile.id }),
    ),
    newAddress: await ok(() =>
      api.files.getPresignedUri({ fileId: s.rootFile.id }),
    ),
    inPrivateRooms: await listed(SearchArea.PrivateRooms),
    inAllRooms: await listed(SearchArea.Any),
  };
};
export const ALL = (v: boolean) => ({
  room: v,
  content: v,
  nested: v,
  file: v,
  fileKeys: v,
  publicKeys: v,
  newAddress: v,
  inPrivateRooms: v,
  inAllRooms: v,
});

/** A private room of the owner with a nested folder chain and two files. */
export const newScene = async (apiSdk: ApiSDK, title: string) => {
  const owner = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const roomId = await createOwnerPrivateRoom(apiSdk, title);
  const scene = await buildScene(owner, ownerToken, roomId, title);
  return { owner, scene, roomId, ownerToken };
};

export const ownerOf = async (owner: Api, room: number) =>
  (await owner.rooms.getRoomInfo({ id: room })).data.response!.createdBy?.id;
