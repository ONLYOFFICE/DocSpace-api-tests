import { expect } from "@playwright/test";
import { FileShare, RoomType, SearchArea } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Api, createOwnerPrivateRoom, inviteToRoom } from "./private-rooms";
import { KitRole } from "./private-room-forbidden";
import {
  UploadedFile,
  addAccounts,
  markedBytes,
  uploadEncrypted,
} from "./private-room-download";
import { ensureEncryptionKeys } from "./rooms";

/**
 * Helpers for the room-level forbidden-operation tests
 * (privacyroom.forbidden.spec.ts).
 *
 * A room kit holds an ordinary Custom room and a private Custom room, both with
 * a file and a subfolder, plus an empty room of each kind, with the caller under
 * test holding the role named in all of them. Every operation is tried on the
 * ordinary room first (the positive control) and then on the private one, and
 * the private room is read back before and after.
 */

export type RoomKit = {
  role: KitRole;
  actor: Api;
  actorToken: string;
  actorId: string;
  /** The rooms' creator, who reads everything back. */
  admin: Api;
  plain: number;
  priv: number;
  emptyPlain: number;
  emptyPriv: number;
  plainSub: number;
  privSub: number;
  privFile: UploadedFile;
};

export async function buildRoomKit(
  apiSdk: ApiSDK,
  role: KitRole,
): Promise<RoomKit> {
  const ownerApi = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const ownerId = (await ownerApi.profiles.getSelfProfile()).data.response!.id!;
  const specs =
    role === "manager"
      ? [{ type: "RoomAdmin" as const, key: true }]
      : role === "dsaMember" || role === "portalOwnerMember"
        ? [{ type: "DocSpaceAdmin" as const, key: true }]
        : [];
  const [account] = await addAccounts(apiSdk, specs);
  const admin = role === "portalOwnerMember" ? account.api : ownerApi;
  const ownerActs = role === "owner" || role === "portalOwnerMember";
  const actor = ownerActs ? ownerApi : account.api;
  const actorToken = ownerActs ? ownerToken : account.token;
  const actorId = ownerActs ? ownerId : account.id;

  const mkPlain = async (title: string) => {
    const { data, status } = await admin.rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
    });
    expect(status, `creating ${title}`).toBe(200);
    return data.response!.id!;
  };
  const mkPrivate = async (title: string) => {
    if (role !== "portalOwnerMember")
      return createOwnerPrivateRoom(apiSdk, title);
    await ensureEncryptionKeys(apiSdk, "owner");
    const { data, status } = await admin.rooms.createRoom({
      createRoomRequestDto: {
        title,
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    expect(status, `creating ${title}`).toBe(200);
    return data.response!.id!;
  };

  const plain = await mkPlain("Autotest RoomOps Plain");
  const emptyPlain = await mkPlain("Autotest RoomOps Empty Plain");
  const priv = await mkPrivate("Autotest RoomOps Private");
  const emptyPriv = await mkPrivate("Autotest RoomOps Empty Private");
  if (role !== "owner")
    for (const roomId of [plain, emptyPlain, priv, emptyPriv])
      expect(
        (await inviteToRoom(admin, roomId, actorId, FileShare.RoomManager))
          .status,
        `inviting the actor into ${roomId}`,
      ).toBe(200);

  const folder = async (parent: number) => {
    const { data, status } = await admin.folders.createFolder({
      folderId: parent,
      createFolderRequest: { title: "nested" },
    });
    expect(status).toBe(200);
    return data.response!.id!;
  };
  const plainSub = await folder(plain);
  const privSub = await folder(priv);
  expect(
    (
      await admin.files.createFile({
        folderId: plain,
        createFileRequest: { title: "Autotest.docx" },
      })
    ).status,
  ).toBe(200);
  const privFile = await uploadEncrypted(admin, priv, {
    ext: "docx",
    bytes: markedBytes("ROOMOPS"),
  });
  return {
    role,
    actor,
    actorToken,
    actorId,
    admin,
    plain,
    priv,
    emptyPlain,
    emptyPriv,
    plainSub,
    privSub,
    privFile,
  };
}

const ids = (entries?: unknown[] | null) =>
  ((entries ?? []) as { id?: number }[]).map((e) => e.id).sort();

/** The parts of a room the forbidden operations must not change. */
export async function roomState(reader: Api, roomId: number) {
  const info = (await reader.rooms.getRoomInfo({ id: roomId })).data.response!;
  const content = (
    await reader.folders.getFolderByFolderId({ folderId: roomId })
  ).data.response;
  const members = (await reader.rooms.getRoomSecurityInfo({ id: roomId })).data
    .response;
  const links = (await reader.rooms.getRoomLinks({ id: roomId })).data.response;
  const files = (content?.files ?? []) as {
    id?: number;
    encrypted?: boolean;
  }[];
  const keys: string[] = [];
  for (const f of files)
    keys.push(
      JSON.stringify(
        (await reader.files.getEncryptionInfo({ fileId: f.id! })).data.response
          ?.fileKeys ?? [],
      ),
    );
  return {
    info: {
      roomType: info.roomType,
      private: info.private,
      indexing: info.indexing,
      denyDownload: info.denyDownload,
      lifetime: JSON.stringify(info.lifetime ?? null),
      watermark: JSON.stringify(info.watermark ?? null),
      filesCount: info.filesCount,
      foldersCount: info.foldersCount,
    },
    files: ids(files),
    encrypted: files.map((f) => f.encrypted === true),
    folders: ids(content?.folders),
    members: (members ?? [])
      .map((m) => `${(m.sharedTo as { id?: string }).id}:${m.access}`)
      .sort(),
    links: ids(links),
    keys,
  };
}

/** The rooms and templates the caller can list, by id. */
export async function portalState(actor: Api, admin: Api) {
  const roomsOf = async (api: Api, area?: SearchArea) =>
    ids(
      (await api.rooms.getRoomsFolder({ searchArea: area, count: 100 })).data
        .response?.folders,
    );
  return {
    any: await roomsOf(admin, SearchArea.Any),
    privateRooms: await roomsOf(admin, SearchArea.PrivateRooms),
    archive: await roomsOf(admin, SearchArea.Archive),
    templates: await roomsOf(actor, SearchArea.Templates),
  };
}
