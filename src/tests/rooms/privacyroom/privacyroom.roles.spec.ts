import { randomUUID } from "crypto";
import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  assertUniqueIds,
  expectNoServerError,
  expectRefused,
  rawMembers,
} from "@/src/helpers/private-room-lifecycle";
import { FileShare, FolderType } from "@onlyoffice/docspace-api-sdk";
import {
  ZERO_GUID,
  inviteToRoom,
  okBody,
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
  putFileOrRefusal,
  tryPut,
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

const isOk = (status: number) => status >= 200 && status < 300;
const isOwner = (m: Member) => m.local === "owner";
const isManager = (m: Member) =>
  isOwner(m) || m.local === FileShare.RoomManager;
const canCreate = (m: Member) =>
  isManager(m) || m.local === FileShare.ContentCreator;

type Cell = { status: number; applied: boolean; other?: boolean };

/**
 * After an accepted request the effect may lag (a queued job); a refusal is read once.
 * Returns whether the effect showed up within the window. An error thrown by `check`
 * itself (a failed read, a server error) is NOT "not applied": it propagates and fails the test.
 */
const effect = async (accepted: boolean, check: () => Promise<boolean>) => {
  if (!accepted) return check();
  const deadline = Date.now() + 20_000;
  for (const wait of [300, 600, 1000]) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return check();
};

const roomOf = (a: Arena, k: Kind) => (k === "priv" ? a.priv : a.plain);
const subOf = (a: Arena, k: Kind) => (k === "priv" ? a.subPriv : a.subPlain);

const folderTitles = async (a: Arena, folderId: number) =>
  (
    (okBody(
      await a.admin.folders.getFolderByFolderId({ folderId }),
      `getFolderByFolderId(${folderId})`,
    ).folders ?? []) as { title?: string }[]
  ).map((f) => f.title);
/** Gone means 404; still there means 200; any other answer is an error, not "still there". */
const fileGone = async (a: Arena, id: number) => {
  const { status } = await a.admin.files.getFileInfo({ fileId: id });
  expect([200, 404], `getFileInfo(${id}) by the room owner`).toContain(status);
  return status === 404;
};
const folderGone = async (a: Arena, id: number) => {
  const { status } = await a.admin.folders.getFolderInfo({ folderId: id });
  expect([200, 404], `getFolderInfo(${id}) by the room owner`).toContain(
    status,
  );
  return status === 404;
};
const folderInfo = async (a: Arena, folderId: number) =>
  okBody(
    await a.admin.folders.getFolderInfo({ folderId }),
    `getFolderInfo(${folderId})`,
  );
const fileInfo = async (a: Arena, fileId: number) =>
  okBody(await a.admin.files.getFileInfo({ fileId }), `getFileInfo(${fileId})`);
/** The caller makes a folder: its id, or undefined after a 4xx refusal (a 5xx or an answer with no id fails the test). */
const makeFolder = async (who: Member, parent: number, prefix: string) => {
  const made = await who.api.folders.createFolder({
    folderId: parent,
    createFolderRequest: { title: `${prefix}-${randomUUID().slice(0, 8)}` },
  });
  if (isOk(made.status)) {
    const id = made.data.response?.id;
    expect(id, `${who.key}: createFolder carries no id`).toBeGreaterThan(0);
    return id!;
  }
  expectRefused(made.status, `${who.key}: createFolder in ${parent}`);
  return undefined;
};
const inviteOk = async (
  api: Arena["admin"],
  room: number,
  id: string,
  access: FileShare,
  label: string,
) =>
  expect(
    (await inviteToRoom(api, room, id, access)).status,
    `${label}: the owner's own invitation`,
  ).toBe(200);
const adminFolder = async (a: Arena, parent: number) => {
  const r = await a.admin.folders.createFolder({
    folderId: parent,
    createFolderRequest: { title: `f-${randomUUID().slice(0, 8)}` },
  });
  return okBody(r, "setup: a folder").id!;
};

type FileOp = {
  name: string;
  /** What the documentation says for the PRIVATE room, if it says anything. */
  allowed?: (m: Member) => boolean;
  run: (a: Arena, who: Member, k: Kind) => Promise<Cell | undefined>;
};

/** The id of the caller's own upload, or undefined after a 4xx refusal (anything else fails the test). */
const own = async (who: Member, k: Kind, folder: number) =>
  putFileOrRefusal(who.api, k, folder);

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
      const put = await tryPut(who.api, k, roomOf(a, k));
      return {
        status: put.stored ? 201 : put.status,
        applied: put.stored,
      };
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
          async () => (await folderInfo(a, folderId)).title === title,
        ),
      };
    },
  },
  renameOwn: {
    name: "rename a folder the caller made",
    allowed: canCreate,
    run: async (a, who, k) => {
      const folderId = await makeFolder(who, roomOf(a, k), "o");
      if (!folderId) return undefined;
      const title = `r-${randomUUID().slice(0, 8)}`;
      const r = await who.api.folders.renameFolder({
        folderId,
        createFolderRequest: { title },
      });
      return {
        status: r.status,
        applied: await effect(
          isOk(r.status),
          async () => (await folderInfo(a, folderId)).title === title,
        ),
      };
    },
  },
  moveOthersFile: {
    name: "move a file made by someone else into a subfolder",
    allowed: isManager,
    run: async (a, who, k) => {
      const id = await putFile(a.admin, k, roomOf(a, k));
      const status = await move(a, who, k, [id], [], subOf(a, k));
      return {
        status,
        applied: await effect(
          isOk(status),
          async () => (await fileInfo(a, id)).folderId === subOf(a, k),
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
          async () => (await fileInfo(a, id)).folderId === subOf(a, k),
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
          async () => (await folderInfo(a, folderId)).parentId === subOf(a, k),
        ),
      };
    },
  },
  moveOwnFolder: {
    name: "move a folder the caller made into a subfolder",
    allowed: canCreate,
    run: async (a, who, k) => {
      const folderId = await makeFolder(who, roomOf(a, k), "m");
      if (!folderId) return undefined;
      const status = await move(a, who, k, [], [folderId], subOf(a, k));
      return {
        status,
        applied: await effect(
          isOk(status),
          async () => (await folderInfo(a, folderId)).parentId === subOf(a, k),
        ),
      };
    },
  },
  deleteOthersFile: {
    name: "delete a file made by someone else",
    run: async (a, who, k) => {
      const id = await putFile(a.admin, k, roomOf(a, k));
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
      const folderId = await makeFolder(who, roomOf(a, k), "d");
      if (!folderId) return undefined;
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
      const fileId = await putFile(a.admin, k, folderId);
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
      const theirs = await putFile(a.admin, k, roomOf(a, k));
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
      // A stuck file operation of the admin is a failure: the next cell would read a half-done state.
      await settle(a.admin);
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
    // The positive control is part of the test: when the room owner cannot do the operation in the
    // private room nothing below proves anything, so that is a failure, not a quiet skip.
    expect
      .soft(
        control?.applied,
        `${op.name}: positive control - the room owner does it in the private room`,
      )
      .toBe(true);
    if (!control?.applied) continue;
    for (const who of roles) {
      const cell = row[who.key];
      if (!cell?.priv || !cell.plain) {
        // No cell means the caller could not make the object the operation acts on. That is legitimate only
        // for a role that may not create anything; for any other role it is a broken setup, not a skip.
        expect
          .soft(
            !canCreate(who),
            `${op.name} - ${who.key}: the object to act on could not be made although the role may create`,
          )
          .toBe(true);
        continue;
      }
      // A crash is never a correct refusal.
      expectNoServerError(
        cell.priv.status,
        `${op.name} - ${who.key} (private)`,
      );
      expectNoServerError(
        cell.plain.status,
        `${op.name} - ${who.key} (ordinary)`,
      );
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

// The raw list, uniqueness proved on it (a Map would hide a subject listed twice).
const memberIds = async (a: Arena, room: number) =>
  assertUniqueIds((await rawMembers(a.admin, room)).map((m) => m.id));

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
        expectNoServerError(inv.status, `invite (${k}) by ${m.key}`);
        if (invited)
          await inviteOk(a.admin, room, candidate.id, FileShare.None, "undo");
        else expectRefused(inv.status, `invite (${k}) by ${m.key}`);
        // change the role of a member
        const ch = await set(m, room, target.id, FileShare.Editing);
        const changed =
          (await roomMemberAccess(a.admin, room)).get(target.id) ===
          FileShare.Editing;
        (out.changeRole[m.key] ??= { priv: false, plain: false })[k] = changed;
        expectNoServerError(ch.status, `change role (${k}) by ${m.key}`);
        if (changed)
          await inviteOk(a.admin, room, target.id, FileShare.Read, "undo");
        else expectRefused(ch.status, `change role (${k}) by ${m.key}`);
        // remove a member
        const rm = await set(m, room, target.id, FileShare.None);
        const removed = !(await memberIds(a, room)).includes(target.id);
        (out.remove[m.key] ??= { priv: false, plain: false })[k] = removed;
        expectNoServerError(rm.status, `remove member (${k}) by ${m.key}`);
        if (removed)
          await inviteOk(a.admin, room, target.id, FileShare.Read, "undo");
        else expectRefused(rm.status, `remove member (${k}) by ${m.key}`);
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
        // removeSecurityInfo always answers true (JSDoc): a member leaving gets 200.
        expect.soft(r.status, `leave (${k}) by ${m.key}: status`).toBe(200);
        // A portal administrator's call may revoke everyone in an ORDINARY room (the JSDoc lets an
        // administrator change the access); in the private room only the caller may leave.
        if (k === "priv")
          expect
            .soft(others, `leave (priv) by ${m.key}: only the caller leaves`)
            .toBe(left ? before - 1 : before);
        for (const other of actors.filter((x) => !isOwner(x)))
          if (!(await memberIds(a, room)).includes(other.id))
            await inviteOk(
              a.admin,
              room,
              other.id,
              other.local as FileShare,
              "restore",
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
      // Documented mass revoke (JSDoc): the call by someone who may change the access removes everyone
      // but the owner. This is the manager's call, not a member leaving; it is kept apart from them.
      expect(r.status, `removeSecurityInfo by a manager (${k})`).toBe(200);
      expect(
        before.length,
        `setup: several members before (${k})`,
      ).toBeGreaterThan(1);
      expect(
        after,
        `removeSecurityInfo by a manager (${k}): members after`,
      ).toEqual([a.by("owner").id]);
      for (const m of actors.filter((x) => !isOwner(x)))
        if (!(await memberIds(a, room)).includes(m.id))
          await inviteOk(a.admin, room, m.id, m.local as FileShare, "restore");
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

  test("GET /privacyroom/:roomId/access/candidates - Only the owner and a room manager read the candidates' keys and the missing file keys", async ({
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
      if (isManager(m)) {
        expect.soft(cand.status, `candidates - ${m.key}`).toBe(200);
        expect.soft(miss.status, `missing file keys - ${m.key}`).toBe(200);
      } else {
        // Refused for other members (JSDoc); the exact status is not fixed here, so a 4xx and never a crash.
        expect
          .soft(cand.status, `candidates - ${m.key}: refusal`)
          .toBeGreaterThanOrEqual(400);
        expect
          .soft(cand.status, `candidates - ${m.key}: refusal, not a crash`)
          .toBeLessThan(500);
        expect
          .soft(miss.status, `missing file keys - ${m.key}: refusal`)
          .toBeGreaterThanOrEqual(400);
        expect
          .soft(
            miss.status,
            `missing file keys - ${m.key}: refusal, not a crash`,
          )
          .toBeLessThan(500);
      }
    }
    for (const [g, p] of INDEPENDENCE) {
      expect(results[g], `candidates: ${g} answered`).toBeDefined();
      expect(results[p], `candidates: ${p} answered`).toBeDefined();
      expect
        .soft(results[g] === 200, `candidates: ${g} versus ${p}`)
        .toBe(results[p] === 200);
    }
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
    const authorFile = await putFile(a.by("ccAuthor").api, "priv", a.priv);
    const ownerFile = await putFile(a.admin, "priv", a.priv);
    expect(authorFile && ownerFile, "setup: two files").toBeTruthy();
    const issue = async (m: Member, fileId: number) => {
      const marker = `rk-${m.key}-${fileId}`;
      const r = await m.api.files.setEncryptionInfo({
        fileId,
        accessRequestKeyDto: [
          { userId: target.id, publicKeyId: ZERO_GUID, privateKeyEnc: marker },
        ],
      });
      const seen = okBody(
        await target.api.files.getEncryptionInfo({ fileId }),
        `getEncryptionInfo(${fileId}) by the target`,
      );
      const applied = (seen.fileKeys ?? []).some(
        (k) => k.privateKeyEnc === marker,
      );
      return { status: r.status, applied };
    };
    const rows: Record<string, { author: boolean; owner: boolean }> = {};
    for (const m of a.members.filter((x) => x.key !== "target")) {
      const onAuthor = await issue(m, authorFile);
      const onOwner = await issue(m, ownerFile);
      rows[m.key] = { author: onAuthor.applied, owner: onOwner.applied };
      expectNoServerError(
        onAuthor.status,
        `${m.key}: issuing keys (author's file)`,
      );
      expectNoServerError(
        onOwner.status,
        `${m.key}: issuing keys (owner's file)`,
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
    // Whether a ContentCreator who is not the author, or an Editor, may issue keys for someone
    // else's file is not in the guide: it is not asserted here (research result kept in the audit).
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
      const i = okBody(
        await a.admin.rooms.getRoomInfo({ id: room }),
        `getRoomInfo(${room})`,
      );
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
        expectNoServerError(r.status, `updateRoom (${k}) by ${m.key}`);
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
      (await state(room)).root === FolderType.Archive;
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
      for (const [k, status] of Object.entries(answers))
        expectNoServerError(Number(status), `archive (${k}) by ${m.key}`);
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
  const tried = (res: { status: number }, what: string) =>
    expectNoServerError(res.status, `${what} by ${m.key}`);
  tried(await set(cand.id, FileShare.Read), "probe: invite");
  out.invite = (await memberIds(a, room)).includes(cand.id);
  if (out.invite)
    await inviteOk(a.admin, room, cand.id, FileShare.None, "probe undo");

  tried(await set(target.id, FileShare.Editing), "probe: change role");
  out.changeRole =
    (await roomMemberAccess(a.admin, room)).get(target.id) ===
    FileShare.Editing;
  if (out.changeRole)
    await inviteOk(a.admin, room, target.id, FileShare.Read, "probe undo");

  tried(await set(target.id, FileShare.None), "probe: remove");
  out.remove = !(await memberIds(a, room)).includes(target.id);
  if (out.remove)
    await inviteOk(a.admin, room, target.id, FileShare.Read, "probe undo");

  const title = `po-${m.key}-${Math.random().toString(36).slice(2, 7)}`;
  tried(
    await m.api.rooms.updateRoom({ id: room, updateRoomRequest: { title } }),
    "probe: updateRoom",
  );
  out.updateRoom =
    okBody(await a.admin.rooms.getRoomInfo({ id: room }), "getRoomInfo")
      .title === title;

  const archiveRes = await m.api.rooms.archiveRoom({
    id: room,
    archiveRoomRequest: { deleteAfter: false },
  });
  tried(archiveRes, "probe: archiveRoom");
  const archived = async () =>
    okBody(await a.admin.rooms.getRoomInfo({ id: room }), "getRoomInfo")
      .rootFolderType === FolderType.Archive;
  out.archive = await effect(isOk(archiveRes.status), archived);
  if (out.archive) {
    await a.admin.rooms.unarchiveRoom({
      id: room,
      archiveRoomRequest: { deleteAfter: false },
    });
    await expect.poll(archived, { timeout: 30_000 }).toBe(false);
    await settle(a.admin);
  }

  if (m.key !== "mgr") {
    // The guide: the owner first gives the candidate the keys of every encrypted file, then transfers.
    for (const folder of [room, a.subPriv]) {
      const files = (okBody(
        await a.admin.folders.getFolderByFolderId({ folderId: folder }),
        `getFolderByFolderId(${folder})`,
      ).files ?? []) as { id?: number }[];
      for (const f of files)
        expect(
          (
            await a.admin.files.setEncryptionInfo({
              fileId: f.id!,
              accessRequestKeyDto: [
                {
                  userId: mgr.id,
                  publicKeyId: ZERO_GUID,
                  privateKeyEnc: `grant-${f.id}`,
                },
              ],
            })
          ).status,
          `setup: the owner grants the keys of file ${f.id}`,
        ).toBe(200);
    }
    const ownerOf = async () =>
      okBody(await a.admin.rooms.getRoomInfo({ id: room }), "getRoomInfo")
        .createdBy?.id;
    const before = await ownerOf();
    const moved = await m.api.sharing.changeFileOwner({
      changeOwnerRequestDto: { folderIds: [room] as never, userId: mgr.id },
    });
    expectNoServerError(moved.status, `transfer by ${m.key}`);
    out.transfer = (await ownerOf()) !== before;
    if (out.transfer) {
      // The new owner gives the previous one the keys of every encrypted file, then hands the room back.
      for (const folder of [room, a.subPriv]) {
        const files = (okBody(
          await mgr.api.folders.getFolderByFolderId({ folderId: folder }),
          `getFolderByFolderId(${folder}) by the new owner`,
        ).files ?? []) as { id?: number }[];
        for (const f of files)
          expect(
            (
              await mgr.api.files.setEncryptionInfo({
                fileId: f.id!,
                accessRequestKeyDto: [
                  {
                    userId: a.adminId,
                    publicKeyId: ZERO_GUID,
                    privateKeyEnc: `back-${f.id}`,
                  },
                ],
              })
            ).status,
            `setup: the new owner grants the keys of file ${f.id} back`,
          ).toBe(200);
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

  const fileId = await putFile(a.admin, "priv", room);
  const marker = `po-fk-${m.key}-${fileId}`;
  tried(
    await m.api.files.setEncryptionInfo({
      fileId,
      accessRequestKeyDto: [
        { userId: target.id, publicKeyId: ZERO_GUID, privateKeyEnc: marker },
      ],
    }),
    "probe: setEncryptionInfo",
  );
  out.issueKeys = (
    okBody(
      await target.api.files.getEncryptionInfo({ fileId }),
      "getEncryptionInfo by the target",
    ).fileKeys ?? []
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
