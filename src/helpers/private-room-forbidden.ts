import { readFileSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { ensureEncryptionKeys } from "./rooms";
import {
  Api,
  createOwnerPrivateRoom,
  getOwnerId,
  inviteToRoom,
  okBody,
} from "./private-rooms";
import {
  addAccounts,
  downloadVia,
  uploadEncrypted,
} from "./private-room-download";
import {
  filesIn,
  openSession,
  sendNext,
  storedFileId,
  unfinishedOperations,
} from "./private-room-upload";

/**
 * Helpers for the forbidden-operation tests of private-room files
 * (fileEncryption.forbidden.spec.ts).
 *
 * Every operation is tried on a PAIR of files: an ordinary file in an ordinary
 * room, where the operation works (the positive control), and the same kind of
 * file in a private room. The private file's content is REAL document bytes
 * (a .docx, an .rtf, a PDF form) uploaded as an `encrypted` file - the portal
 * never reads an encrypted upload, so these are not ciphertext, but they are
 * bytes an operation could really work on, so a refusal is the portal's doing
 * and not a failure to parse junk.
 */

export type KitRole =
  | "owner"
  | "manager"
  | "creator"
  | "dsaMember"
  | "portalOwnerMember";

export const KIT_ROLES: { role: KitRole; label: string }[] = [
  { role: "owner", label: "the owner of the room" },
  { role: "manager", label: "a RoomManager" },
  { role: "creator", label: "a ContentCreator who authored the file" },
  { role: "dsaMember", label: "a DocSpaceAdmin who is a member" },
  { role: "portalOwnerMember", label: "the Portal Owner who is a member" },
];

export type Pair = {
  /** The ordinary file, where the operation works. */
  plain: number;
  /** The file of the private room. */
  priv: number;
  /** The server name (title) of the private file. */
  privTitle: string;
  bytes: Buffer;
};

export type Kit = {
  role: KitRole;
  /** The caller under test. */
  actor: Api;
  actorToken: string;
  actorId: string;
  /** The room's creator, who reads everything back. */
  admin: Api;
  adminToken: string;
  plainRoom: number;
  privRoom: number;
  /** An ordinary room to use as a destination. */
  otherRoom: number;
  docx: Pair;
  rtf: Pair;
  form: Pair;
};

const ROOM_ACCESS = (role: KitRole) =>
  role === "creator" ? FileShare.ContentCreator : FileShare.RoomManager;

/** Uploads a plain (unencrypted) file into an ordinary room through a session. */
export async function uploadPlain(
  api: Api,
  roomId: number,
  name: string,
  bytes: Buffer,
) {
  const opened = await openSession(api, roomId, {
    size: bytes.length,
    fileName: name,
    encrypted: false,
  });
  expect(opened.status, `opening a session for ${name}`).toBe(200);
  const sent = await sendNext(api, roomId, opened.id!, bytes);
  expect(sent.status, `uploading ${name}`).toBe(201);
  return storedFileId(sent);
}

const RTF = Buffer.from("{\\rtf1\\ansi Forbidden operations probe}");
const FORM = () =>
  readFileSync(path.join(__dirname, "../assets/oo-form-empty.pdf"));

/**
 * One ordinary room, one private room and one more ordinary room, all of them
 * with the caller under test in the role named, and a pair of files of each kind
 * (.docx, .rtf, PDF form).
 */
export async function buildKit(apiSdk: ApiSDK, role: KitRole): Promise<Kit> {
  const ownerApi = apiSdk.forRole("owner");
  const ownerToken = apiSdk.tokenStore.getToken("owner");
  const ownerId = await getOwnerId(ownerApi);

  const specs =
    role === "manager"
      ? [{ type: "RoomAdmin" as const, key: true }]
      : role === "creator"
        ? [{ type: "User" as const, key: true }]
        : role === "dsaMember" || role === "portalOwnerMember"
          ? [{ type: "DocSpaceAdmin" as const, key: true }]
          : [];
  const [account] = await addAccounts(apiSdk, specs);

  // The room's creator: the owner, except where the Portal Owner is only a member.
  const admin = role === "portalOwnerMember" ? account.api : ownerApi;
  const adminToken = role === "portalOwnerMember" ? account.token : ownerToken;
  const actor =
    role === "portalOwnerMember" || role === "owner" ? ownerApi : account.api;
  const actorToken =
    role === "portalOwnerMember" || role === "owner"
      ? ownerToken
      : account.token;
  const actorId =
    role === "owner" || role === "portalOwnerMember" ? ownerId : account.id;

  const mkRoom = async (title: string) => {
    const { data, status } = await admin.rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
    });
    expect(status, `creating ${title}`).toBe(200);
    return data.response!.id!;
  };
  const plainRoom = await mkRoom("Autotest Forbidden Plain");
  const otherRoom = await mkRoom("Autotest Forbidden Other");
  let privRoom: number;
  if (role === "portalOwnerMember") {
    await ensureEncryptionKeys(apiSdk, "owner");
    const { data, status } = await admin.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Forbidden Private",
        roomType: RoomType.CustomRoom,
        private: true,
      },
    });
    expect(status).toBe(200);
    privRoom = data.response!.id!;
  } else {
    privRoom = await createOwnerPrivateRoom(
      apiSdk,
      "Autotest Forbidden Private",
    );
  }
  if (role !== "owner") {
    for (const roomId of [plainRoom, otherRoom, privRoom])
      expect(
        (await inviteToRoom(admin, roomId, actorId, ROOM_ACCESS(role))).status,
        `inviting the actor into ${roomId}`,
      ).toBe(200);
  }

  // Files are authored by the actor when the role is the author, otherwise by the room's creator.
  const author = role === "creator" ? actor : admin;
  const created = await author.files.createFile({
    folderId: plainRoom,
    createFileRequest: { title: "Autotest.docx" },
  });
  expect(created.status).toBe(200);
  const docxPlain = created.data.response!.id!;
  const downloaded = await downloadVia(admin, adminToken, docxPlain);
  expect(downloaded.issued, "presigned address of the template docx").toBe(200);
  expect(downloaded.fetched, "fetching the template docx").toBe(200);
  const docxBytes = downloaded.bytes!;
  expect(docxBytes.length, "the template docx is empty").toBeGreaterThan(0);
  const docxPriv = await uploadEncrypted(author, privRoom, {
    ext: "docx",
    bytes: docxBytes,
  });

  const rtfPlain = await uploadPlain(author, plainRoom, "probe.rtf", RTF);
  const rtfPriv = await uploadEncrypted(author, privRoom, {
    ext: "rtf",
    bytes: RTF,
  });
  const formBytes = FORM();
  const formPlain = await uploadPlain(author, plainRoom, "form.pdf", formBytes);
  const formPriv = await uploadEncrypted(author, privRoom, {
    ext: "pdf",
    bytes: formBytes,
  });

  return {
    role,
    actor,
    actorToken,
    actorId,
    admin,
    adminToken,
    plainRoom,
    privRoom,
    otherRoom,
    docx: {
      plain: docxPlain,
      priv: docxPriv.id,
      privTitle: docxPriv.serverName,
      bytes: docxBytes,
    },
    rtf: {
      plain: rtfPlain,
      priv: rtfPriv.id,
      privTitle: rtfPriv.serverName,
      bytes: RTF,
    },
    form: {
      plain: formPlain,
      priv: formPriv.id,
      privTitle: formPriv.serverName,
      bytes: formBytes,
    },
  };
}

/** Everything the portal says about a file, as one string, for before/after comparison. */
export async function fileJson(api: Api, fileId: number) {
  const { data, status } = await api.files.getFileInfo({ fileId });
  expect(status, `getFileInfo(${fileId})`).toBe(200);
  // `fileStatus` is the per-viewer "new" flag, which reading a file clears.
  const { fileStatus, ...rest } = (data.response ?? {}) as Record<
    string,
    unknown
  >;
  void fileStatus;
  return JSON.stringify(rest);
}

/** The file keys the caller holds for a file, as one string. */
export async function keysJson(api: Api, fileId: number) {
  const info = okBody(
    await api.files.getEncryptionInfo({ fileId }),
    `getEncryptionInfo(${fileId})`,
  );
  return JSON.stringify(info.fileKeys ?? []);
}

/** The ids of the files directly inside a room. */
export async function roomFileIds(api: Api, roomId: number) {
  return (await filesIn(api, roomId)).map((f) => f.id).sort();
}

/** Waits until no file operation of the caller is left running (an empty list is fine). */
export const settle = (api: Api) =>
  expect
    .poll(async () => (await unfinishedOperations(api)).length, {
      timeout: 30_000,
      intervals: [300, 500, 1000, 2000],
    })
    .toBe(0);

export { unfinishedOperations };
