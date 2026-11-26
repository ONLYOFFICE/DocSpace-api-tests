import { randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, FolderType } from "@onlyoffice/docspace-api-sdk";
import {
  ZERO_GUID,
  inviteToRoom,
  roomMemberAccess,
} from "@/src/helpers/private-rooms";
import {
  Arena,
  DEFAULT_MEMBERS,
  Kind,
  Member,
  MemberDef,
  buildArena,
  putFile,
} from "@/src/helpers/private-room-arena";
import { settle } from "@/src/helpers/private-room-forbidden";

/**
 * The role matrix of a private room (PR-ACL/ROOM/MEM/INV/OWN, PR-H role table).
 *
 * One portal holds an ordinary Custom room and a private Custom room with the
 * same members in the same roles; every operation is tried by every role in
 * both. Three things are kept apart: the account's GLOBAL role on the portal,
 * its LOCAL role in the rooms, and whether it holds a key. Authorship of a file
 * is whoever uploaded it.
 *
 * Where the expectation comes from:
 *  - the product guide's role table (private-rooms-onboarding.html): only the
 *    owner transfers the room; only a room manager invites, removes members and
 *    changes roles and re-issues keys; a content creator uploads; any member
 *    opens, downloads and leaves; a guest or a group is never a member;
 *  - the SDK JSDoc where it states who may do an operation (createFolder,
 *    renameFolder, moveBatchItems, deleteBatchItems, updateRoom, archiveRoom,
 *    getRoomCandidateKeys, removeSecurityInfo).
 * Where both are silent the private room must give the same answer as the
 * ordinary room (privacy takes nothing away and gives nothing extra), and that
 * is all that is asserted.
 *
 * The last check of every operation is independence: a DocSpaceAdmin or a
 * RoomAdmin holding only a Read or ContentCreator role in the room may do exactly
 * what a plain User with that role may do.
 *
 * An operation that the owner cannot do in the private room, so there is no
 * positive control, is reported as NO CONTROL and not counted as covered.
 */

const observe = (what: string) =>
  test.info().annotations.push({ type: "observation", description: what });

const isOk = (status: number) => status >= 200 && status < 300;
const isOwner = (m: Member) => m.local === "owner";
const isManager = (m: Member) =>
  isOwner(m) || m.local === FileShare.RoomManager;
const canCreate = (m: Member) =>
  isManager(m) || m.local === FileShare.ContentCreator;

type Cell = { status: number; applied: boolean; other?: boolean };

/** After an accepted request the effect may lag (a queued job); a refusal is read once. */
const effect = async (accepted: boolean, check: () => Promise<boolean>) => {
  if (!accepted) return check();
  try {
    await expect
      .poll(check, { timeout: 20_000, intervals: [300, 600, 1000, 2000] })
      .toBe(true);
    return true;
  } catch {
    return false;
  }
};

const roomOf = (a: Arena, k: Kind) => (k === "priv" ? a.priv : a.plain);
const subOf = (a: Arena, k: Kind) => (k === "priv" ? a.subPriv : a.subPlain);

const folderTitles = async (a: Arena, folderId: number) =>
  (
    ((await a.admin.folders.getFolderByFolderId({ folderId })).data.response
      ?.folders ?? []) as { title?: string }[]
  ).map((f) => f.title);
const fileGone = async (a: Arena, id: number) =>
  (await a.admin.files.getFileInfo({ fileId: id })).status === 404;
const folderGone = async (a: Arena, id: number) =>
  (await a.admin.folders.getFolderInfo({ folderId: id })).status === 404;
const adminFolder = async (a: Arena, parent: number) => {
  const r = await a.admin.folders.createFolder({
    folderId: parent,
    createFolderRequest: { title: `f-${randomUUID().slice(0, 8)}` },
  });
  expect(r.status, "setup: a folder").toBe(200);
  return r.data.response!.id!;
};

type FileOp = {
  name: string;
  /** What the documentation says for the PRIVATE room, if it says anything. */
  allowed?: (m: Member) => boolean;
  run: (a: Arena, who: Member, k: Kind) => Promise<Cell | undefined>;
};

const own = async (who: Member, k: Kind, folder: number) =>
  putFile(who.api, k, folder);

const move = async (
  a: Arena,
  who: Member,
  k: Kind,
  fileIds: number[],
  folderIds: number[],
  dest: number,
) => {
  const r = await who.api.operations.moveBatchItems({
    batchRequestDto: {
      fileIds: fileIds as never,
      folderIds: folderIds as never,
      destFolderId: dest as never,
      deleteAfter: true,
    },
  });
  void a;
  void k;
  return r.status;
};
const remove = async (who: Member, fileIds: number[], folderIds: number[]) =>
  (
    await who.api.operations.deleteBatchItems({
      deleteBatchRequestDto: {
        fileIds: fileIds as never,
        folderIds: folderIds as never,
        deleteAfter: false,
        immediately: true,
      },
    })
  ).status;

const FILE_OPS: Record<string, FileOp> = {
  createRoot: {
    name: "createFolder in the room root",
    allowed: canCreate,
    run: async (a, who, k) => {
      const title = `c-${randomUUID().slice(0, 8)}`;
      const r = await who.api.folders.createFolder({
        folderId: roomOf(a, k),
        createFolderRequest: { title },
      });
      return {
        status: r.status,
        applied: await effect(isOk(r.status), async () =>
          (await folderTitles(a, roomOf(a, k))).includes(title),
        ),
      };
    },
  },
  createNested: {
    name: "createFolder in a nested folder",
    allowed: canCreate,
    run: async (a, who, k) => {
      const title = `n-${randomUUID().slice(0, 8)}`;
      const r = await who.api.folders.createFolder({
        folderId: subOf(a, k),
        createFolderRequest: { title },
      });
      return {
        status: r.status,
        applied: await effect(isOk(r.status), async () =>
          (await folderTitles(a, subOf(a, k))).includes(title),
        ),
      };
    },
  },
  upload: {
    name: "upload a file",
    allowed: canCreate,
    run: async (a, who, k) => {
      const id = await own(who, k, roomOf(a, k));
      return { status: id ? 201 : 0, applied: !!id };
    },
  },
  renameOthers: {
    name: "rename a folder made by someone else",
    allowed: isManager,
    run: async (a, who, k) => {
      const folderId = await adminFolder(a, roomOf(a, k));
      const title = `r-${randomUUID().slice(0, 8)}`;
      const r = await who.api.folders.renameFolder({
        folderId,
        createFolderRequest: { title },
      });
      return {
        status: r.status,
        applied: await effect(
          isOk(r.status),
          async () =>
            (await a.admin.folders.getFolderInfo({ folderId })).data.response
              ?.title === title,
        ),
      };
    },
  },
  renameOwn: {
    name: "rename a folder the caller made",
    allowed: canCreate,
    run: async (a, who, k) => {
      const made = await who.api.folders.createFolder({
        folderId: roomOf(a, k),
        createFolderRequest: { title: `o-${randomUUID().slice(0, 8)}` },
      });
      if (!isOk(made.status)) return undefined;
      const folderId = made.data.response!.id!;
      const title = `r-${randomUUID().slice(0, 8)}`;
      const r = await who.api.folders.renameFolder({
        folderId,
        createFolderRequest: { title },
      });
      return {
        status: r.status,
        applied: await effect(
          isOk(r.status),
          async () =>
            (await a.admin.folders.getFolderInfo({ folderId })).data.response
              ?.title === title,
        ),
      };
    },
  },
  moveOthersFile: {
    name: "move a file made by someone else into a subfolder",
    allowed: isManager,
    run: async (a, who, k) => {
      const id = (await putFile(a.admin, k, roomOf(a, k)))!;
      const status = await move(a, who, k, [id], [], subOf(a, k));
      return {
        status,
        applied: await effect(
          isOk(status),
          async () =>
            (await a.admin.files.getFileInfo({ fileId: id })).data.response
              ?.folderId === subOf(a, k),
        ),
      };
    },
  },
  moveOwnFile: {
    name: "move a file the caller uploaded into a subfolder",
    // The guide: the author of a file may move it. The JSDoc of moveBatchItems says a content
    // creator cannot move at all; the ordinary room agrees with the guide (recorded in the audit).
    allowed: canCreate,
    run: async (a, who, k) => {
      const id = await own(who, k, roomOf(a, k));
      if (!id) return undefined;
      const status = await move(a, who, k, [id], [], subOf(a, k));
      return {
        status,
        applied: await effect(
          isOk(status),
          async () =>
            (await a.admin.files.getFileInfo({ fileId: id })).data.response
              ?.folderId === subOf(a, k),
        ),
      };
    },
  },
  moveOthersFolder: {
    name: "move a folder made by someone else into a subfolder",
    allowed: isManager,
    run: async (a, who, k) => {
      const folderId = await adminFolder(a, roomOf(a, k));
      const status = await move(a, who, k, [], [folderId], subOf(a, k));
      return {
        status,
        applied: await effect(
          isOk(status),
          async () =>
            (await a.admin.folders.getFolderInfo({ folderId })).data.response
              ?.parentId === subOf(a, k),
        ),
      };
    },
  },
  moveOwnFolder: {
    name: "move a folder the caller made into a subfolder",
    allowed: canCreate,
    run: async (a, who, k) => {
      const made = await who.api.folders.createFolder({
        folderId: roomOf(a, k),
        createFolderRequest: { title: `m-${randomUUID().slice(0, 8)}` },
      });
      if (!isOk(made.status)) return undefined;
      const folderId = made.data.response!.id!;
      const status = await move(a, who, k, [], [folderId], subOf(a, k));
      return {
        status,
        applied: await effect(
          isOk(status),
          async () =>
            (await a.admin.folders.getFolderInfo({ folderId })).data.response
              ?.parentId === subOf(a, k),
        ),
      };
    },
  },
  deleteOthersFile: {
    name: "delete a file made by someone else",
    run: async (a, who, k) => {
      const id = (await putFile(a.admin, k, roomOf(a, k)))!;
      const status = await remove(who, [id], []);
      return {
        status,
        applied: await effect(isOk(status), () => fileGone(a, id)),
      };
    },
  },
  deleteOwnFile: {
    name: "delete a file the caller uploaded",
    allowed: canCreate,
    run: async (a, who, k) => {
      const id = await own(who, k, roomOf(a, k));
      if (!id) return undefined;
      const status = await remove(who, [id], []);
      return {
        status,
        applied: await effect(isOk(status), () => fileGone(a, id)),
      };
    },
  },
  deleteOthersFolder: {
    name: "delete a folder made by someone else",
    run: async (a, who, k) => {
      const folderId = await adminFolder(a, roomOf(a, k));
      const status = await remove(who, [], [folderId]);
      return {
        status,
        applied: await effect(isOk(status), () => folderGone(a, folderId)),
      };
    },
  },
  deleteOwnFolder: {
    name: "delete a folder the caller made",
    allowed: canCreate,
    run: async (a, who, k) => {
      const made = await who.api.folders.createFolder({
        folderId: roomOf(a, k),
        createFolderRequest: { title: `d-${randomUUID().slice(0, 8)}` },
      });
      if (!isOk(made.status)) return undefined;
      const folderId = made.data.response!.id!;
      const status = await remove(who, [], [folderId]);
      return {
        status,
        applied: await effect(isOk(status), () => folderGone(a, folderId)),
      };
    },
  },
  deleteFolderWithOthersFile: {
    name: "delete a folder holding files of other authors",
    run: async (a, who, k) => {
      const folderId = await adminFolder(a, roomOf(a, k));
      const fileId = (await putFile(a.admin, k, folderId))!;
      const status = await remove(who, [], [folderId]);
      return {
        status,
        applied: await effect(isOk(status), () => folderGone(a, folderId)),
        other: await fileGone(a, fileId),
      };
    },
  },
  deleteMixedBatch: {
    name: "delete a batch of the caller's own and someone else's file",
    run: async (a, who, k) => {
      const mine = await own(who, k, roomOf(a, k));
      if (!mine) return undefined;
      const theirs = (await putFile(a.admin, k, roomOf(a, k)))!;
      const status = await remove(who, [mine, theirs], []);
      return {
        status,
        applied: await effect(isOk(status), () => fileGone(a, mine)),
        other: await effect(isOk(status), () => fileGone(a, theirs)),
      };
    },
  },
};

/** Pairs whose only difference is the GLOBAL role: they must get the same answers. */
const INDEPENDENCE: [string, string][] = [
  ["dsaReader", "reader"],
  ["raReader", "reader"],
  ["dsaCC", "ccOther"],
  ["raCC", "ccOther"],
];

type Table = Record<string, Record<string, { priv?: Cell; plain?: Cell }>>;

const runOps = async (
  a: Arena,
  ops: FileOp[],
  roles: Member[],
): Promise<Table> => {
  const table: Table = {};
  for (const op of ops) {
    table[op.name] = {};
    for (const who of roles) {
      const priv = await op.run(a, who, "priv");
      const plain = await op.run(a, who, "plain");
      table[op.name][who.key] = { priv, plain };
      await settle(a.admin).catch(() => undefined);
    }
  }
  return table;
};

const verify = (
  a: Arena,
  ops: FileOp[],
  table: Table,
  roles: Member[],
  pairs: [string, string][] = INDEPENDENCE,
) => {
  for (const op of ops) {
    const row = table[op.name];
    const control = row["owner"]?.priv ?? row[roles[0].key]?.priv;
    const lines: string[] = [];
    for (const who of roles) {
      const cell = row[who.key];
      if (!cell?.priv || !cell.plain) {
        lines.push(`${who.key}: n/a`);
        continue;
      }
      lines.push(
        `${who.key}: ${cell.priv.applied ? "yes" : "no"}${cell.priv.other !== undefined ? `/${cell.priv.other ? "yes" : "no"}` : ""} (${cell.priv.status})`,
      );
    }
    observe(`${op.name}: ${lines.join(", ")}`);
    if (!control?.applied) {
      observe(
        `${op.name}: NO CONTROL (the room owner could not do it in the private room); not counted as covered`,
      );
      continue;
    }
    for (const who of roles) {
      const cell = row[who.key];
      if (!cell?.priv || !cell.plain) continue;
      expect
        .soft(
          cell.priv.applied,
          `${op.name} - ${who.key}: private room differs from the ordinary room`,
        )
        .toBe(cell.plain.applied);
      if (cell.priv.other !== undefined)
        expect
          .soft(
            cell.priv.other,
            `${op.name} - ${who.key}: second item, private room differs from the ordinary room`,
          )
          .toBe(cell.plain.other);
      if (op.allowed)
        expect
          .soft(
            cell.priv.applied,
            `${op.name} - ${who.key}: documented permission`,
          )
          .toBe(op.allowed(who));
    }
    for (const [globalAdmin, plainUser] of pairs) {
      const x = row[globalAdmin]?.priv;
      const y = row[plainUser]?.priv;
      if (x && y)
        expect
          .soft(
            [x.applied, x.other],
            `${op.name}: ${globalAdmin} gets more or less than ${plainUser} (global role must not matter)`,
          )
          .toEqual([y.applied, y.other]);
    }
  }
  void a;
};

const GROUPS: [string, string[]][] = [
  [
    "create folders, upload and rename",
    ["createRoot", "createNested", "upload", "renameOthers", "renameOwn"],
  ],
  [
    "move files and folders inside the room",
    ["moveOthersFile", "moveOwnFile", "moveOthersFolder", "moveOwnFolder"],
  ],
  [
    "delete files and folders",
    [
      "deleteOthersFile",
      "deleteOwnFile",
      "deleteOthersFolder",
      "deleteOwnFolder",
      "deleteFolderWithOthersFile",
      "deleteMixedBatch",
    ],
  ],
];

test.describe("Role matrix - files and folders of a private room", () => {
  for (const [title, keys] of GROUPS) {
    test(`Rooms API - Every role: ${title}, and the answers of the ordinary room`, async ({
      apiSdk,
    }) => {
      test.setTimeout(600_000);
      const arena = await buildArena(apiSdk);
      const ops = keys.map((k) => FILE_OPS[k]);
      const table = await runOps(arena, ops, arena.members);
      verify(arena, ops, table, arena.members);
    });
  }
});

const memberIds = async (a: Arena, room: number) => [
  ...(await roomMemberAccess(a.admin, room)).keys(),
];

test.describe("Role matrix - members, keys and settings of a private room", () => {
  test("PUT /files/rooms/:id/share - Every role: invite, change a role, remove, leave", async ({
    apiSdk,
  }) => {
    test.setTimeout(600_000);
    const defs: MemberDef[] = [
      ...DEFAULT_MEMBERS,
      {
        key: "target",
        label: "a Read member to manage",
        global: "User",
        local: FileShare.Read,
      },
    ];
    const a = await buildArena(apiSdk, { members: defs, extras: 1 });
    const candidate = a.extras[0];
    const target = a.by("target");
    const actors = a.members.filter((m) => m.key !== "target");
    const set = (m: Member, room: number, id: string, access: FileShare) =>
      m.api.rooms.setRoomSecurity({
        id: room,
        roomInvitationRequest: { invitations: [{ id, access }], notify: false },
      });
    type R = Record<string, { priv: boolean; plain: boolean }>;
    const out: Record<string, R> = {
      invite: {},
      changeRole: {},
      remove: {},
      leave: {},
    };

    for (const m of actors) {
      for (const k of ["priv", "plain"] as const) {
        const room = k === "priv" ? a.priv : a.plain;
        // invite a keyed user who is not a member
        const inv = await set(m, room, candidate.id, FileShare.Read);
        const invited = (await memberIds(a, room)).includes(candidate.id);
        (out.invite[m.key] ??= { priv: false, plain: false })[k] = invited;
        observe(
          `invite (${k}) by ${m.key}: ${inv.status}, member now: ${invited}`,
        );
        if (invited)
          await inviteToRoom(a.admin, room, candidate.id, FileShare.None);
        // change the role of a member
        const ch = await set(m, room, target.id, FileShare.Editing);
        const changed =
          (await roomMemberAccess(a.admin, room)).get(target.id) ===
          FileShare.Editing;
        (out.changeRole[m.key] ??= { priv: false, plain: false })[k] = changed;
        observe(
          `change role (${k}) by ${m.key}: ${ch.status}, changed: ${changed}`,
        );
        if (changed)
          await inviteToRoom(a.admin, room, target.id, FileShare.Read);
        // remove a member
        const rm = await set(m, room, target.id, FileShare.None);
        const removed = !(await memberIds(a, room)).includes(target.id);
        (out.remove[m.key] ??= { priv: false, plain: false })[k] = removed;
        observe(
          `remove member (${k}) by ${m.key}: ${rm.status}, removed: ${removed}`,
        );
        if (removed)
          await inviteToRoom(a.admin, room, target.id, FileShare.Read);
      }
    }
    // leave: a member below manager drops themselves with removeSecurityInfo; the owner re-invites them afterwards.
    // A manager is different: for a caller who may change the access the call revokes EVERYONE (JSDoc), so
    // managers are tried last and the room is rebuilt after them.
    for (const m of actors.filter((x) => !isOwner(x) && !isManager(x))) {
      for (const k of ["priv", "plain"] as const) {
        const room = k === "priv" ? a.priv : a.plain;
        expect(
          await memberIds(a, room),
          `setup: ${m.key} is a member before leaving (${k})`,
        ).toContain(m.id);
        const before = (await memberIds(a, room)).length;
        const r = await m.api.sharing.removeSecurityInfo({
          baseBatchRequestDto: { folderIds: [room] as never },
        });
        const left = !(await memberIds(a, room)).includes(m.id);
        const others = (await memberIds(a, room)).length;
        (out.leave[m.key] ??= { priv: false, plain: false })[k] = left;
        observe(
          `leave (${k}) by ${m.key}: ${r.status}, left: ${left}, other members kept: ${others === before - 1}`,
        );
        // A portal administrator's call may revoke everyone in an ORDINARY room (the JSDoc lets an
        // administrator change the access); in the private room only the caller may leave.
        if (k === "priv")
          expect
            .soft(others, `leave (priv) by ${m.key}: only the caller leaves`)
            .toBe(left ? before - 1 : before);
        for (const other of actors.filter((x) => !isOwner(x)))
          if (!(await memberIds(a, room)).includes(other.id))
            await inviteToRoom(
              a.admin,
              room,
              other.id,
              other.local as FileShare,
            );
      }
    }
    for (const k of ["priv", "plain"] as const) {
      const room = k === "priv" ? a.priv : a.plain;
      const mgr = a.by("mgr");
      const before = await memberIds(a, room);
      const r = await mgr.api.sharing.removeSecurityInfo({
        baseBatchRequestDto: { folderIds: [room] as never },
      });
      const after = await memberIds(a, room);
      observe(
        `removeSecurityInfo by a manager (${k}): ${r.status}; members before ${before.length}, after ${after.length}`,
      );
      for (const m of actors.filter((x) => !isOwner(x)))
        if (!(await memberIds(a, room)).includes(m.id))
          await inviteToRoom(a.admin, room, m.id, m.local as FileShare);
    }
    for (const m of actors.filter((x) => !isOwner(x) && !isManager(x))) {
      expect
        .soft(out.leave[m.key].priv, `leave - ${m.key}: any member may leave`)
        .toBe(true);
      expect
        .soft(
          out.leave[m.key].priv,
          `leave - ${m.key}: private room differs from the ordinary room`,
        )
        .toBe(out.leave[m.key].plain);
    }

    for (const op of ["invite", "changeRole", "remove"] as const) {
      expect(
        out[op]["owner"].priv,
        `${op}: the owner is the positive control`,
      ).toBe(true);
      for (const m of actors) {
        const cell = out[op][m.key];
        expect
          .soft(
            cell.priv,
            `${op} - ${m.key}: documented permission (manager and owner only)`,
          )
          .toBe(isManager(m));
        expect
          .soft(
            cell.priv,
            `${op} - ${m.key}: private room differs from the ordinary room`,
          )
          .toBe(cell.plain);
      }
      for (const [g, p] of INDEPENDENCE)
        expect
          .soft(out[op][g].priv, `${op}: ${g} versus ${p}`)
          .toBe(out[op][p].priv);
    }
  });

  test("GET /privacyroom/:roomId/access/candidates - Only the owner and a room manager read the candidates' keys; every role's view of the missing file keys is recorded", async ({
    apiSdk,
  }) => {
    test.setTimeout(400_000);
    const a = await buildArena(apiSdk, { extras: 1 });
    const candidate = a.extras[0];
    const results: Record<string, number> = {};
    for (const m of a.members) {
      const cand = await m.api.privacyroom.getRoomCandidateKeys({
        roomId: a.priv,
        userIds: [candidate.id],
      });
      const miss = await m.api.privacyroom.getRoomMissingFileKeys({
        roomId: a.priv,
        userIds: [candidate.id],
      });
      results[m.key] = cand.status;
      observe(
        `${m.key}: candidates ${cand.status}, missing file keys ${miss.status}`,
      );
      if (isManager(m))
        expect.soft(cand.status, `candidates - ${m.key}`).toBe(200);
      else
        expect
          .soft(
            cand.status,
            `candidates - ${m.key}: documented refusal for other members`,
          )
          .not.toBe(200);
    }
    for (const [g, p] of INDEPENDENCE)
      expect
        .soft(results[g] === 200, `candidates: ${g} versus ${p}`)
        .toBe(results[p] === 200);
  });

  test("PUT /files/:fileId/access - Who may issue file keys: the uploader for their own file, a manager for any, a reader never", async ({
    apiSdk,
  }) => {
    test.setTimeout(500_000);
    const defs: MemberDef[] = [
      ...DEFAULT_MEMBERS,
      {
        key: "target",
        label: "a Read member to receive keys",
        global: "User",
        local: FileShare.Read,
      },
    ];
    const a = await buildArena(apiSdk, { members: defs });
    const target = a.by("target");
    const authorFile = (await putFile(a.by("ccAuthor").api, "priv", a.priv))!;
    const ownerFile = (await putFile(a.admin, "priv", a.priv))!;
    expect(authorFile && ownerFile, "setup: two files").toBeTruthy();
    const issue = async (m: Member, fileId: number) => {
      const marker = `rk-${m.key}-${fileId}`;
      const r = await m.api.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          { userId: target.id, publicKeyId: ZERO_GUID, privateKeyEnc: marker },
        ],
      });
      const seen = await target.api.files.getEncryptionInfo({ fileId });
      const applied = (seen.data.response?.fileKeys ?? []).some(
        (k) => k.privateKeyEnc === marker,
      );
      return { status: r.status, applied };
    };
    const rows: Record<string, { author: boolean; owner: boolean }> = {};
    for (const m of a.members.filter((x) => x.key !== "target")) {
      const onAuthor = await issue(m, authorFile);
      const onOwner = await issue(m, ownerFile);
      rows[m.key] = { author: onAuthor.applied, owner: onOwner.applied };
      observe(
        `${m.key}: keys for the ContentCreator's file ${onAuthor.status} (${onAuthor.applied ? "stored" : "not stored"}), for the owner's file ${onOwner.status} (${onOwner.applied ? "stored" : "not stored"})`,
      );
    }
    expect(
      rows["owner"].owner,
      "the owner issues keys (positive control)",
    ).toBe(true);
    for (const m of a.members.filter((x) => x.key !== "target")) {
      if (isManager(m)) {
        expect
          .soft(rows[m.key].owner, `${m.key}: manager issues keys for any file`)
          .toBe(true);
        expect
          .soft(
            rows[m.key].author,
            `${m.key}: manager issues keys for the ContentCreator's file`,
          )
          .toBe(true);
      }
      if (m.local === FileShare.Read) {
        expect
          .soft(
            rows[m.key].owner,
            `${m.key}: a Read member issues nothing (owner's file)`,
          )
          .toBe(false);
        expect
          .soft(
            rows[m.key].author,
            `${m.key}: a Read member issues nothing (author's file)`,
          )
          .toBe(false);
      }
    }
    // The author issues keys for their own file (the guide: the uploader wraps the keys for the members).
    expect
      .soft(
        rows["ccAuthor"].author,
        "ccAuthor: primary issue for their own file",
      )
      .toBe(true);
    // Whether a ContentCreator may issue keys for a file somebody else uploaded is not in the guide: recorded.
    observe(
      `a ContentCreator who is not the author issues keys for someone else's file: ${rows["ccOther"].author}; for the owner's file: ${rows["ccOther"].owner}`,
    );
    observe(
      `an Editor issues keys: for the owner's file ${rows["editor"].owner}`,
    );
    for (const [g, p] of INDEPENDENCE) {
      expect
        .soft(rows[g].owner, `${g} versus ${p} (owner's file)`)
        .toBe(rows[p].owner);
      expect
        .soft(rows[g].author, `${g} versus ${p} (author's file)`)
        .toBe(rows[p].author);
    }
  });

  test("PUT /files/rooms/:id - Settings, archive and restore: every role against the manager's rights", async ({
    apiSdk,
  }) => {
    test.setTimeout(600_000);
    const a = await buildArena(apiSdk);
    const state = async (room: number) => {
      const i = (await a.admin.rooms.getRoomInfo({ id: room })).data.response!;
      return { title: i.title, root: i.rootFolderType };
    };
    const updated: Record<string, { priv: boolean; plain: boolean }> = {};
    for (const m of a.members) {
      for (const k of ["priv", "plain"] as const) {
        const room = roomOf(a, k);
        const title = `renamed-${m.key}-${k}`;
        const r = await m.api.rooms.updateRoom({
          id: room,
          updateRoomRequest: { title, tags: [`t-${m.key}`] },
        });
        const applied = await effect(
          isOk(r.status),
          async () => (await state(room)).title === title,
        );
        observe(
          `updateRoom (${k}) by ${m.key}: ${r.status}, applied: ${applied}`,
        );
        (updated[m.key] ??= { priv: false, plain: false })[k] = applied;
        if (k === "priv")
          expect
            .soft(
              applied,
              `updateRoom - ${m.key}: documented permission (managers)`,
            )
            .toBe(isManager(m));
        else
          expect
            .soft(
              updated[m.key].priv,
              `updateRoom - ${m.key}: private room differs from the ordinary room`,
            )
            .toBe(applied);
      }
    }
    // Archive and restore: the manager's rights, tried by every role; the owner restores after each success.
    const inArchive = async (room: number) =>
      (await a.admin.rooms.getRoomInfo({ id: room })).data.response!
        .rootFolderType === FolderType.Archive;
    for (const m of a.members) {
      const outcome: Record<string, boolean> = {};
      const answers: Record<string, string> = {};
      for (const k of ["priv", "plain"] as const) {
        const room = roomOf(a, k);
        const res = await m.api.rooms.archiveRoom({
          id: room,
          archiveRoomRequest: { deleteAfter: false },
        });
        const archived = await effect(isOk(res.status), () => inArchive(room));
        outcome[k] = archived;
        answers[k] = String(res.status);
        if (archived) {
          await a.admin.rooms.unarchiveRoom({
            id: room,
            archiveRoomRequest: { deleteAfter: false },
          });
          await expect
            .poll(() => inArchive(room), { timeout: 30_000 })
            .toBe(false);
        }
      }
      observe(
        `archive by ${m.key}: private ${outcome.priv} (${answers.priv}), ordinary ${outcome.plain} (${answers.plain})`,
      );
      if (m.key === "owner")
        expect(outcome.priv, "the owner archives (positive control)").toBe(
          true,
        );
      // The JSDoc says a room manager may archive; whether that holds is recorded above. What is
      // asserted: a member below manager never archives a private room, and privacy never grants more
      // than the ordinary room does.
      if (!isManager(m))
        expect
          .soft(outcome.priv, `archive - ${m.key}: below manager`)
          .toBe(false);
      if (outcome.priv)
        expect
          .soft(
            outcome.plain,
            `archive - ${m.key}: private allowed, ordinary refused`,
          )
          .toBe(true);
    }
  });
});

const manageProbe = async (a: Arena, m: Member) => {
  const cand = a.extras[0];
  const target = a.by("target");
  const mgr = a.by("mgr");
  const out: Record<string, boolean | undefined> = {};
  const room = a.priv;
  const set = (id: string, access: FileShare) =>
    m.api.rooms.setRoomSecurity({
      id: room,
      roomInvitationRequest: { invitations: [{ id, access }], notify: false },
    });
  await set(cand.id, FileShare.Read);
  out.invite = (await memberIds(a, room)).includes(cand.id);
  if (out.invite) await inviteToRoom(a.admin, room, cand.id, FileShare.None);

  await set(target.id, FileShare.Editing);
  out.changeRole =
    (await roomMemberAccess(a.admin, room)).get(target.id) ===
    FileShare.Editing;
  if (out.changeRole)
    await inviteToRoom(a.admin, room, target.id, FileShare.Read);

  await set(target.id, FileShare.None);
  out.remove = !(await memberIds(a, room)).includes(target.id);
  if (out.remove) await inviteToRoom(a.admin, room, target.id, FileShare.Read);

  const title = `po-${m.key}-${Math.random().toString(36).slice(2, 7)}`;
  await m.api.rooms.updateRoom({ id: room, updateRoomRequest: { title } });
  out.updateRoom =
    (await a.admin.rooms.getRoomInfo({ id: room })).data.response?.title ===
    title;

  await m.api.rooms.archiveRoom({
    id: room,
    archiveRoomRequest: { deleteAfter: false },
  });
  const archived = async () =>
    (await a.admin.rooms.getRoomInfo({ id: room })).data.response!
      .rootFolderType === FolderType.Archive;
  out.archive = await effect(true, archived);
  if (out.archive) {
    await a.admin.rooms.unarchiveRoom({
      id: room,
      archiveRoomRequest: { deleteAfter: false },
    });
    await expect.poll(archived, { timeout: 30_000 }).toBe(false);
    await settle(a.admin).catch(() => undefined);
  }

  if (m.key !== "mgr") {
    // The guide: the owner first gives the candidate the keys of every encrypted file, then transfers.
    for (const folder of [room, a.subPriv]) {
      const files = ((
        await a.admin.folders.getFolderByFolderId({ folderId: folder })
      ).data.response?.files ?? []) as { id?: number }[];
      for (const f of files)
        await a.admin.files.setEncryptionInfo({
          fileId: f.id!,
          accessRequestKeyDto: [
            {
              userId: mgr.id,
              publicKeyId: ZERO_GUID,
              privateKeyEnc: `grant-${f.id}`,
            },
          ],
        });
    }
    const ownerOf = async () =>
      (await a.admin.rooms.getRoomInfo({ id: room })).data.response!.createdBy
        ?.id;
    const before = await ownerOf();
    const moved = await m.api.sharing.changeFileOwner({
      changeOwnerRequestDto: { folderIds: [room] as never, userId: mgr.id },
    });
    observe(
      `transfer by ${m.key}: ${moved.status} ${moved.status === 200 ? "" : JSON.stringify(moved.data).slice(0, 160)}`,
    );
    out.transfer = (await ownerOf()) !== before;
    if (out.transfer) {
      // The new owner gives the previous one the keys of every encrypted file, then hands the room back.
      for (const folder of [room, a.subPriv]) {
        const files = ((
          await mgr.api.folders.getFolderByFolderId({ folderId: folder })
        ).data.response?.files ?? []) as { id?: number }[];
        for (const f of files)
          await mgr.api.files.setEncryptionInfo({
            fileId: f.id!,
            accessRequestKeyDto: [
              {
                userId: a.adminId,
                publicKeyId: ZERO_GUID,
                privateKeyEnc: `back-${f.id}`,
              },
            ],
          });
      }
      const back = await mgr.api.sharing.changeFileOwner({
        changeOwnerRequestDto: {
          folderIds: [room] as never,
          userId: a.adminId,
        },
      });
      expect(back.status, "setup: the room is handed back to its creator").toBe(
        200,
      );
      expect(await ownerOf(), "setup: the creator owns the room again").toBe(
        before,
      );
    }
  }

  const fileId = (await putFile(a.admin, "priv", room))!;
  const marker = `po-fk-${m.key}-${fileId}`;
  await m.api.files.setEncryptionInfo({
    fileId,
    accessRequestKeyDto: [
      { userId: target.id, publicKeyId: ZERO_GUID, privateKeyEnc: marker },
    ],
  });
  out.issueKeys = (
    (await target.api.files.getEncryptionInfo({ fileId })).data.response
      ?.fileKeys ?? []
  ).some((k) => k.privateKeyEnc === marker);
  return out;
};

test.describe("Role matrix - a portal administrator holds only the local role they were given", () => {
  test("Rooms API - The Portal Owner as a Read member and as a ContentCreator of a DocSpaceAdmin's private room", async ({
    apiSdk,
  }) => {
    test.setTimeout(900_000);
    const defs: MemberDef[] = [
      {
        key: "mgr",
        label: "a RoomManager",
        global: "RoomAdmin",
        local: FileShare.RoomManager,
      },
      {
        key: "po",
        label: "the Portal Owner",
        global: "Owner",
        local: FileShare.Read,
      },
      {
        key: "reader",
        label: "a Read member",
        global: "User",
        local: FileShare.Read,
      },
      {
        key: "ccOther",
        label: "a ContentCreator",
        global: "User",
        local: FileShare.ContentCreator,
      },
      {
        key: "target",
        label: "a Read member to manage",
        global: "User",
        local: FileShare.Read,
      },
    ];
    const a = await buildArena(apiSdk, {
      members: defs,
      adminIsDsa: true,
      extras: 1,
    });
    const po = a.by("po");
    const control: Member = {
      key: "admin",
      label: "the room owner (a DocSpaceAdmin)",
      global: "DocSpaceAdmin",
      local: "owner",
      api: a.admin,
      token: a.adminToken,
      id: a.adminId,
    };
    const ops = [
      FILE_OPS.createRoot,
      FILE_OPS.upload,
      FILE_OPS.renameOthers,
      FILE_OPS.moveOthersFile,
      FILE_OPS.deleteOthersFile,
      FILE_OPS.deleteOwnFile,
    ];

    for (const [phase, local, baseline] of [
      ["Read", FileShare.Read, "reader"],
      ["ContentCreator", FileShare.ContentCreator, "ccOther"],
    ] as const) {
      if (local !== FileShare.Read)
        for (const room of [a.plain, a.priv])
          expect((await inviteToRoom(a.admin, room, po.id, local)).status).toBe(
            200,
          );
      po.local = local;
      const roles = [a.by("mgr"), po, a.by(baseline)];
      const table = await runOps(a, ops, roles);
      verify(a, ops, table, roles, [["po", baseline]]);

      const probes: Record<string, Record<string, boolean | undefined>> = {};
      for (const m of [control, a.by("mgr"), po, a.by(baseline)]) {
        probes[m.key] = await manageProbe(a, m);
        observe(`${phase}: ${m.key}: ${JSON.stringify(probes[m.key])}`);
      }
      for (const op of Object.keys(probes.admin)) {
        expect(
          probes.admin[op],
          `${phase}: the room owner does ${op} (positive control)`,
        ).toBe(true);
        expect
          .soft(
            probes.po[op],
            `${phase}: the Portal Owner versus ${baseline}: ${op}`,
          )
          .toBe(probes[baseline][op]);
      }
    }
  });
});
