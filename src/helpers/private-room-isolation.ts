import { randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { ApiSDK } from "../services/api-sdk";
import { Api, ZERO_GUID, okBody, okList } from "./private-rooms";
import {
  UploadedFile,
  markedBytes,
  uploadEncrypted,
} from "./private-room-download";

/**
 * Helpers for the isolation tests of private rooms through the GENERAL Rooms,
 * Folders, Files and Sharing APIs (privacyroom.isolation.spec.ts and friends).
 *
 * A "scene" is one private room with a nested folder chain and two uploaded
 * files, all carrying unique names, so a refusal can be searched for every
 * piece of the protected objects. The bytes are dummy buffers (see
 * private-room-download.ts).
 */

/** Marker put into the file key entries the tests issue. */
export const KEY_MARKER = "p3sec-fk-";

export type Scene = {
  roomId: number;
  roomTitle: string;
  outerId: number;
  outerName: string;
  innerId: number;
  innerName: string;
  /** A file in the room root. */
  rootFile: UploadedFile;
  /** A file two folders deep. */
  deepFile: UploadedFile;
  /** The account that built the scene (a room member by creation). */
  creator: Api;
  creatorToken: string;
};

/** Builds a scene in a room `creator` already owns. */
export async function buildScene(
  creator: Api,
  creatorToken: string,
  roomId: number,
  roomTitle: string,
): Promise<Scene> {
  const suffix = randomUUID().slice(0, 6);
  const outerName = `p3outer${suffix}`;
  const innerName = `p3inner${suffix}`;
  const outer = await creator.folders.createFolder({
    folderId: roomId,
    createFolderRequest: { title: outerName },
  });
  expect(outer.status, "creating the outer folder").toBe(200);
  const outerId = outer.data.response!.id!;
  const inner = await creator.folders.createFolder({
    folderId: outerId,
    createFolderRequest: { title: innerName },
  });
  expect(inner.status, "creating the inner folder").toBe(200);
  const innerId = inner.data.response!.id!;
  const rootFile = await uploadEncrypted(creator, roomId, {
    bytes: markedBytes("P3ROOT"),
  });
  const deepFile = await uploadEncrypted(creator, innerId, {
    bytes: markedBytes("P3DEEP"),
  });
  return {
    roomId,
    roomTitle,
    outerId,
    outerName,
    innerId,
    innerName,
    rootFile,
    deepFile,
    creator,
    creatorToken,
  };
}

/** Issues a file key entry carrying the marker, for `userId`, on both files. */
export async function issueMarkedKeys(
  issuer: Api,
  scene: Scene,
  userId: string,
) {
  for (const file of [scene.rootFile, scene.deepFile]) {
    const { status } = await issuer.files.setEncryptionInfo({
      fileId: file.id,
      accessRequestKeyDto: [
        {
          userId,
          publicKeyId: ZERO_GUID,
          privateKeyEnc: KEY_MARKER + userId.slice(0, 8),
        },
      ],
    });
    expect(status, "issuing a file key").toBe(200);
  }
}

/** Pieces of the protected objects that must not appear in a refusal. */
export const protectedStrings = (s: Scene) => [
  s.roomTitle,
  s.outerName,
  s.innerName,
  s.rootFile.serverName,
  s.deepFile.serverName,
  KEY_MARKER,
];

/** The protected strings found in a response body. */
export const leaks = (s: Scene, body: unknown): string[] => {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return protectedStrings(s).filter((piece) => text.includes(piece));
};

export type Reply = { status: number; data: unknown };
export type Reader = {
  name: string;
  call: (a: Api, s: Scene) => Promise<Reply>;
};

/**
 * The general read methods that take a room, folder or file id. Every one of
 * them answers a room manager with 200 and an outsider with 403.
 */
export const READERS: Reader[] = [
  {
    name: "rooms.getRoomInfo",
    call: (a, s) => a.rooms.getRoomInfo({ id: s.roomId }),
  },
  {
    name: "folders.getFolderByFolderId(room)",
    call: (a, s) => a.folders.getFolderByFolderId({ folderId: s.roomId }),
  },
  {
    name: "folders.getFolderByFolderId(room, filterValue)",
    call: (a, s) =>
      a.folders.getFolderByFolderId({
        folderId: s.roomId,
        filterValue: s.rootFile.serverName.slice(0, 8),
      }),
  },
  {
    name: "folders.getFolderInfo(room)",
    call: (a, s) => a.folders.getFolderInfo({ folderId: s.roomId }),
  },
  {
    name: "folders.getFolders(room)",
    call: (a, s) => a.folders.getFolders({ folderId: s.roomId }),
  },
  {
    name: "folders.getFolderPath(room)",
    call: (a, s) => a.folders.getFolderPath({ folderId: s.roomId }),
  },
  {
    name: "folders.getFolderHistory(room)",
    call: (a, s) => a.folders.getFolderHistory({ folderId: s.roomId }),
  },
  {
    name: "folders.getFolderLinks(room)",
    call: (a, s) => a.folders.getFolderLinks({ id: s.roomId }),
  },
  {
    name: "rooms.getRoomSecurityInfo",
    call: (a, s) => a.rooms.getRoomSecurityInfo({ id: s.roomId }),
  },
  {
    name: "rooms.getRoomLinks",
    call: (a, s) => a.rooms.getRoomLinks({ id: s.roomId }),
  },
  {
    name: "rooms.getNewRoomItems",
    call: (a, s) => a.rooms.getNewRoomItems({ id: s.roomId }),
  },
  {
    name: "sharing.getFolderSecurityInfo(room)",
    call: (a, s) => a.sharing.getFolderSecurityInfo({ id: s.roomId }),
  },
  {
    name: "folders.getFolderInfo(inner)",
    call: (a, s) => a.folders.getFolderInfo({ folderId: s.innerId }),
  },
  {
    name: "folders.getFolderByFolderId(inner)",
    call: (a, s) => a.folders.getFolderByFolderId({ folderId: s.innerId }),
  },
  {
    name: "folders.getFolders(outer)",
    call: (a, s) => a.folders.getFolders({ folderId: s.outerId }),
  },
  {
    name: "folders.getFolderPath(inner)",
    call: (a, s) => a.folders.getFolderPath({ folderId: s.innerId }),
  },
  {
    name: "sharing.getFolderSecurityInfo(inner)",
    call: (a, s) => a.sharing.getFolderSecurityInfo({ id: s.innerId }),
  },
  {
    name: "files.getFileInfo(root file)",
    call: (a, s) => a.files.getFileInfo({ fileId: s.rootFile.id }),
  },
  {
    name: "files.getFileInfo(nested file)",
    call: (a, s) => a.files.getFileInfo({ fileId: s.deepFile.id }),
  },
  {
    name: "files.getFileHistory",
    call: (a, s) => a.files.getFileHistory({ fileId: s.rootFile.id }),
  },
  {
    name: "files.getFileVersionInfo",
    call: (a, s) => a.files.getFileVersionInfo({ fileId: s.rootFile.id }),
  },
  {
    name: "files.getEditHistory",
    call: (a, s) => a.files.getEditHistory({ fileId: s.rootFile.id }),
  },
  {
    name: "sharing.getFileSecurityInfo",
    call: (a, s) => a.sharing.getFileSecurityInfo({ id: s.rootFile.id }),
  },
  {
    name: "sharing.getSharedUsers",
    call: (a, s) => a.sharing.getSharedUsers({ fileId: s.rootFile.id }),
  },
  {
    name: "files.getFileLinks",
    call: (a, s) => a.files.getFileLinks({ id: s.rootFile.id }),
  },
  {
    name: "files.getEncryptionInfo(root file)",
    call: (a, s) => a.files.getEncryptionInfo({ fileId: s.rootFile.id }),
  },
  {
    name: "files.getEncryptionInfo(nested file)",
    call: (a, s) => a.files.getEncryptionInfo({ fileId: s.deepFile.id }),
  },
  {
    name: "sharing.getEncryptionAccess",
    call: (a, s) => a.sharing.getEncryptionAccess({ fileId: s.rootFile.id }),
  },
  {
    name: "files.getPresignedUri",
    call: (a, s) => a.files.getPresignedUri({ fileId: s.rootFile.id }),
  },
  {
    name: "files.getPresignedFileUri",
    call: (a, s) => a.files.getPresignedFileUri({ fileId: s.rootFile.id }),
  },
];

/** What a caller may change in the room, tried by the isolation tests (the full matrix is another package). */
export const folderAttempt = (a: Api, folderId: number, title: string) =>
  a.folders.createFolder({ folderId, createFolderRequest: { title } });

const idsOfEntries = (entries?: unknown[] | null) =>
  ((entries ?? []) as { id?: number }[]).map((x) => x.id);

/** The state of a scene as the owner of the room sees it. */
export async function snapshot(reader: Api, s: Scene) {
  const room = okBody(
    await reader.folders.getFolderByFolderId({ folderId: s.roomId }),
    "getFolderByFolderId(room)",
  );
  const inner = okBody(
    await reader.folders.getFolderByFolderId({ folderId: s.innerId }),
    "getFolderByFolderId(inner)",
  );
  const members = okList(
    await reader.rooms.getRoomSecurityInfo({ id: s.roomId }),
    "getRoomSecurityInfo",
  );
  const infos = [];
  for (const file of [s.rootFile, s.deepFile]) {
    const f = okBody(
      await reader.files.getFileInfo({ fileId: file.id }),
      `getFileInfo(${file.id})`,
    );
    infos.push([
      f.id,
      f.title,
      f.version,
      f.encrypted,
      f.folderId,
      f.createdBy?.id,
      f.pureContentLength,
    ]);
  }
  return {
    roomFolders: idsOfEntries(room.folders),
    roomFiles: idsOfEntries(room.files),
    innerFiles: idsOfEntries(inner.files),
    innerFolders: idsOfEntries(inner.folders),
    members: members.map((m) => [(m.sharedTo as { id?: string }).id, m.access]),
    files: infos,
  };
}

/** A GET with no credentials and no session cookie. */
export async function anonymousGet(apiSdk: ApiSDK, path: string) {
  const response = await apiSdk.request.fetch(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/${path}`,
    {
      method: "GET",
      headers: {
        Cookie: "",
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );
  return { status: response.status(), text: await response.text() };
}

/** True when the response text names `id` as an object id (`"id":123`). */
export const mentionsId = (body: unknown, id: number) =>
  new RegExp(`"id":${id}[,}]`).test(
    typeof body === "string" ? body : JSON.stringify(body ?? ""),
  );
