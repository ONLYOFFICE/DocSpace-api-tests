import { randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK, UserType } from "../services/api-sdk";
import { Api, createOwnerPrivateRoom, inviteToRoom } from "./private-rooms";
import {
  addAccounts,
  markedBytes,
  uploadEncrypted,
} from "./private-room-download";
import { uploadPlain } from "./private-room-forbidden";
import { ensureEncryptionKeys } from "./rooms";

/**
 * The arena of the role-matrix tests (privacyroom.roles.spec.ts): ONE portal
 * holding an ordinary Custom room and a private Custom room with the same
 * members in the same roles, so every operation can be tried by every role in
 * both rooms - the private room against the role's rights, the ordinary room as
 * the reference for what the role may do when privacy is not in play.
 *
 * Three characteristics stay separate on purpose: the GLOBAL role of the account
 * on the portal, its LOCAL role in the rooms, and whether it holds an account
 * key. Authorship of a file is decided by who uploaded it.
 */

export type Local = "owner" | FileShare;

export type MemberDef = {
  key: string;
  label: string;
  /** The account's role on the portal; "Owner" is the Portal Owner. */
  global: UserType | "Owner";
  local: Local;
};

export type Member = MemberDef & { api: Api; token: string; id: string };

export const DEFAULT_MEMBERS: MemberDef[] = [
  { key: "owner", label: "the room owner", global: "Owner", local: "owner" },
  {
    key: "mgr",
    label: "a RoomManager",
    global: "RoomAdmin",
    local: FileShare.RoomManager,
  },
  {
    key: "ccAuthor",
    label: "a ContentCreator (author of the files)",
    global: "User",
    local: FileShare.ContentCreator,
  },
  {
    key: "ccOther",
    label: "a ContentCreator (not the author)",
    global: "User",
    local: FileShare.ContentCreator,
  },
  {
    key: "editor",
    label: "an Editor",
    global: "User",
    local: FileShare.Editing,
  },
  {
    key: "reader",
    label: "a Read member",
    global: "User",
    local: FileShare.Read,
  },
  {
    key: "dsaReader",
    label: "a DocSpaceAdmin who is a Read member",
    global: "DocSpaceAdmin",
    local: FileShare.Read,
  },
  {
    key: "dsaCC",
    label: "a DocSpaceAdmin who is a ContentCreator",
    global: "DocSpaceAdmin",
    local: FileShare.ContentCreator,
  },
  {
    key: "raReader",
    label: "a RoomAdmin who is a Read member",
    global: "RoomAdmin",
    local: FileShare.Read,
  },
  {
    key: "raCC",
    label: "a RoomAdmin who is a ContentCreator",
    global: "RoomAdmin",
    local: FileShare.ContentCreator,
  },
];

export type Arena = {
  admin: Api;
  adminToken: string;
  adminId: string;
  members: Member[];
  /** Keyed User accounts that are not invited to the rooms. */
  extras: Member[];
  by: (key: string) => Member;
  plain: number;
  priv: number;
  subPlain: number;
  subPriv: number;
};

export async function buildArena(
  apiSdk: ApiSDK,
  opts: { members?: MemberDef[]; adminIsDsa?: boolean; extras?: number } = {},
): Promise<Arena> {
  const defs = opts.members ?? DEFAULT_MEMBERS;
  const ownerApi = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const ownerId = (await ownerApi.profiles.getSelfProfile()).data.response!.id!;

  const accountDefs = defs.filter((d) => d.global !== "Owner");
  const specs = [
    ...(opts.adminIsDsa
      ? [{ type: "DocSpaceAdmin" as UserType, key: true }]
      : []),
    ...accountDefs.map((d) => ({ type: d.global as UserType, key: true })),
    ...Array.from({ length: opts.extras ?? 0 }, () => ({
      type: "User" as UserType,
      key: true,
    })),
  ];
  const accounts = await addAccounts(apiSdk, specs);
  const adminAccount = opts.adminIsDsa ? accounts.shift()! : undefined;
  const admin = adminAccount ? adminAccount.api : ownerApi;
  const adminToken = adminAccount ? adminAccount.token : ownerToken;
  const adminId = adminAccount ? adminAccount.id : ownerId;

  let next = 0;
  const members: Member[] = defs.map((d) => {
    if (d.global === "Owner")
      return { ...d, api: ownerApi, token: ownerToken, id: ownerId };
    const a = accounts[next++];
    return { ...d, api: a.api, token: a.token, id: a.id };
  });

  const extras: Member[] = Array.from({ length: opts.extras ?? 0 }, (_, i) => {
    const a = accounts[next++];
    return {
      key: `extra${i}`,
      label: `an uninvited User ${i}`,
      global: "User" as const,
      local: FileShare.Read,
      api: a.api,
      token: a.token,
      id: a.id,
    };
  });
  const created = await admin.rooms.createRoom({
    createRoomRequestDto: {
      title: "Autotest Roles Plain",
      roomType: RoomType.CustomRoom,
    },
  });
  expect(created.status).toBe(200);
  const plain = created.data.response!.id!;
  let priv: number;
  if (adminAccount) {
    await ensureEncryptionKeys(apiSdk, "owner");
    const p = await admin.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Roles Private",
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    expect(p.status).toBe(200);
    priv = p.data.response!.id!;
  } else {
    priv = await createOwnerPrivateRoom(apiSdk, "Autotest Roles Private");
  }
  for (const m of members) {
    if (m.local === "owner" || m.id === adminId) continue;
    for (const room of [plain, priv])
      expect(
        (await inviteToRoom(admin, room, m.id, m.local as FileShare)).status,
        `inviting ${m.key} into ${room}`,
      ).toBe(200);
  }
  const sub = async (room: number) => {
    const r = await admin.folders.createFolder({
      folderId: room,
      createFolderRequest: { title: "arena-sub" },
    });
    expect(r.status).toBe(200);
    return r.data.response!.id!;
  };
  return {
    admin,
    adminToken,
    adminId,
    members,
    extras,
    by: (key) => {
      const m = members.find((x) => x.key === key);
      if (!m) throw new Error(`no member ${key}`);
      return m;
    },
    plain,
    priv,
    subPlain: await sub(plain),
    subPriv: await sub(priv),
  };
}

export type Kind = "priv" | "plain";

/** Puts a file into a room as `api`: an encrypted one into the private room, a plain one into the ordinary room. */
export async function putFile(
  api: Api,
  kind: Kind,
  folderId: number,
): Promise<number | undefined> {
  try {
    if (kind === "priv")
      return (
        await uploadEncrypted(api, folderId, { bytes: markedBytes("ARENA") })
      ).id;
    return await uploadPlain(
      api,
      folderId,
      `${randomUUID()}.docx`,
      markedBytes("ARENA"),
    );
  } catch {
    return undefined;
  }
}
