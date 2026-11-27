import { expect } from "@playwright/test";
import { FileShare, SearchArea } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import {
  Api,
  ZERO_GUID,
  createOwnerPrivateRoom,
  okBody,
  okList,
} from "./private-rooms";
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
export const rawMembers = async (owner: Api, room: number) =>
  okList(
    await owner.rooms.getRoomSecurityInfo({ id: room }),
    "getRoomSecurityInfo",
  ).map((m) => {
    const id = (m.sharedTo as { id?: string } | undefined)?.id;
    expect(id, "a member record without an id").toBeDefined();
    return { id: id!, access: m.access };
  });

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

/**
 * A caller's own wrapped keys of a file (a caller only ever sees their own), as
 * one comparable string. The read must succeed: an error answer is NOT "no keys".
 */
export const keysOf = async (api: Api, fileId: number) => {
  const info = okBody(
    await api.files.getEncryptionInfo({ fileId }),
    `getEncryptionInfo(${fileId})`,
  );
  return JSON.stringify(
    (info.fileKeys ?? []).map((k) => [k.userId, k.privateKeyEnc]).sort(),
  );
};

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

/**
 * The room as the caller can reach it: the HTTP status of every step from the
 * room down to a file, and whether the room is listed (read through ALL pages,
 * the list request itself must succeed).
 */
export type Reach = {
  room: number;
  content: number;
  nested: number;
  file: number;
  fileKeys: number;
  publicKeys: number;
  newAddress: number;
  inPrivateRooms: boolean;
  inAllRooms: boolean;
};

const PAGE = 100;

/** The ids of every room the caller lists in an area, read through all pages; the requests must succeed. */
export const listRoomIds = async (api: Api, area: SearchArea) => {
  const found: number[] = [];
  for (let startIndex = 0; ; startIndex += PAGE) {
    const body = okBody(
      await api.rooms.getRoomsFolder({
        searchArea: area,
        count: PAGE,
        startIndex,
      }),
      `getRoomsFolder(${area}) from ${startIndex}`,
    );
    const folders = (body.folders ?? []) as { id?: number }[];
    found.push(...folders.map((f) => f.id!));
    if (folders.length === 0 || startIndex + PAGE >= (body.total ?? 0))
      return found;
  }
};

const listed = async (api: Api, area: SearchArea, roomId: number) =>
  (await listRoomIds(api, area)).includes(roomId);

export const reach = async (api: Api, s: Scene): Promise<Reach> => ({
  room: (await api.rooms.getRoomInfo({ id: s.roomId })).status,
  content: (await api.folders.getFolderByFolderId({ folderId: s.roomId }))
    .status,
  nested: (await api.folders.getFolderByFolderId({ folderId: s.innerId }))
    .status,
  file: (await api.files.getFileInfo({ fileId: s.rootFile.id })).status,
  fileKeys: (await api.files.getEncryptionInfo({ fileId: s.rootFile.id }))
    .status,
  publicKeys: (await api.sharing.getEncryptionAccess({ fileId: s.rootFile.id }))
    .status,
  newAddress: (await api.files.getPresignedUri({ fileId: s.rootFile.id }))
    .status,
  inPrivateRooms: await listed(api, SearchArea.PrivateRooms, s.roomId),
  inAllRooms: await listed(api, SearchArea.Any, s.roomId),
});

/**
 * What `reach` must return: every step answers 200 for a member; for a
 * non-member every step answers 403 (the contract of the isolation spec) and
 * the room is in no list.
 */
export const ALL = (allowed: boolean): Reach => {
  const status = allowed ? 200 : 403;
  return {
    room: status,
    content: status,
    nested: status,
    file: status,
    fileKeys: status,
    publicKeys: status,
    newAddress: status,
    inPrivateRooms: allowed,
    inAllRooms: allowed,
  };
};

/** A private room of the owner with a nested folder chain and two files. */
export const newScene = async (apiSdk: ApiSDK, title: string) => {
  const owner = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const roomId = await createOwnerPrivateRoom(apiSdk, title);
  const scene = await buildScene(owner, ownerToken, roomId, title);
  return { owner, scene, roomId, ownerToken };
};

export const ownerOf = async (owner: Api, room: number) =>
  okBody(await owner.rooms.getRoomInfo({ id: room }), "getRoomInfo").createdBy
    ?.id;
