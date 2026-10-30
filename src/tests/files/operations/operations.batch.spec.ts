import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { test } from "@/src/fixtures";
import {
  FileConflictResolveType,
  FileOperationType,
  FileShare,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { downloadFile } from "@/src/helpers/download";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

// Batch operations: copyBatchItems, moveBatchItems, deleteBatchItems, emptyTrash.
//
// Contract used (SDK 4.0.0 JSDoc, confirmed on the portal):
//   * every call queues a background job; the record is read through
//     GET /files/fileops until `finished`, and a failure on one item is reported
//     in the operation's `error`, so the end state is asserted for each job;
//   * access is checked BEFORE the job is queued: anything the caller may not
//     touch is refused with 403 (an unknown id with 404) and nothing at all is
//     done, not even for the items the caller could have handled;
//   * copy leaves the originals, move removes them; conflictResolveType settles
//     name clashes; delete(immediately=false) goes to the caller's Trash, from
//     which items are restored by moving them out; emptyTrash is per account.
//
// Observed and not pinned (the JSDoc is silent): a copy carries the latest
// content only, not the version history; a repeated id in a copy with Duplicate
// produces one copy per occurrence; the status code for moving a folder into
// itself (403 today) is only required to be a client error.

type Api = ReturnType<ApiSDK["forRole"]>;
type Entry = { id?: number; title?: string };

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** Deterministic pseudo-random bytes (xorshift32), so swapped content is caught. */
function makeBytes(length: number, seed: number): Buffer {
  const out = Buffer.allocUnsafe(length);
  let x = Math.imul(seed, 2654435761) >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

async function getMyDocsId(api: Api): Promise<number> {
  const { data, status } = await api.folders.getMyFolder();
  expect(status).toBe(200);
  return data.response!.current!.id!;
}

async function createFolder(api: Api, folderId: number, title: string) {
  const { data, status } = await api.folders.createFolder({
    folderId,
    createFolderRequest: { title },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

async function createRoom(api: Api, title: string) {
  const { data, status } = await api.rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

/**
 * Stores a file with exact bytes through a one-shot upload session (201). With
 * createNewIfExist=false a same-named file gets the bytes as its next version.
 */
async function putFile(
  api: Api,
  folderId: number,
  fileName: string,
  bytes: Buffer,
  createNewIfExist = true,
) {
  const session = await api.operations.createUploadSessionInFolder({
    folderId,
    sessionRequest: { fileName, fileSize: bytes.length, createNewIfExist },
  });
  expect(session.status).toBe(200);
  const sessionId = (session.data.response as { id?: string }).id!;
  const res = await api.operations.uploadSession({
    folderId,
    sessionId,
    file: new File([new Uint8Array(bytes)], fileName),
  });
  expect(res.status).toBe(201);
  const file = (
    res.data.response as { file?: { id?: number; version?: number } }
  ).file!;
  return { id: file.id!, version: file.version! };
}

async function expectContent(
  apiSdk: ApiSDK,
  role: Role,
  fileId: number,
  expected: Buffer,
) {
  const { status, bytes } = await downloadFile(apiSdk, role, fileId);
  expect(status).toBe(200);
  expect(bytes.length).toBe(expected.length);
  expect(sha256(bytes)).toBe(sha256(expected));
}

async function versionsOf(api: Api, fileId: number): Promise<number[]> {
  const { data, status } = await api.files.getFileVersionInfo({ fileId });
  expect(status).toBe(200);
  return (data.response ?? []).map((v) => v.version!).sort((a, b) => a - b);
}

/** Ids and titles of everything directly in a folder, for exact before/after checks. */
async function listing(api: Api, folderId: number): Promise<string[]> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  expect(status).toBe(200);
  const entries = [
    ...(data.response?.files ?? []),
    ...(data.response?.folders ?? []),
  ] as Entry[];
  return entries.map((e) => `${e.id}:${e.title}`).sort();
}

/** Relative path and SHA-256 of every file below a folder. */
async function readTree(
  apiSdk: ApiSDK,
  role: Role,
  api: Api,
  folderId: number,
  prefix = "",
): Promise<string[]> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  expect(status).toBe(200);
  const out: string[] = [];
  for (const file of (data.response?.files ?? []) as Entry[]) {
    const { status: dlStatus, bytes } = await downloadFile(
      apiSdk,
      role,
      file.id!,
    );
    expect(dlStatus).toBe(200);
    out.push(`${prefix}${file.title}:${sha256(bytes)}`);
  }
  for (const folder of (data.response?.folders ?? []) as Entry[]) {
    out.push(
      ...(await readTree(
        apiSdk,
        role,
        api,
        folder.id!,
        `${prefix}${folder.title}/`,
      )),
    );
  }
  return out.sort();
}

async function trashFileIds(api: Api): Promise<number[]> {
  const { data, status } = await api.folders.getTrashFolder();
  expect(status).toBe(200);
  return ((data.response?.files ?? []) as Entry[]).map((f) => f.id!);
}

async function trashFolderIds(api: Api): Promise<number[]> {
  const { data, status } = await api.folders.getTrashFolder();
  expect(status).toBe(200);
  return ((data.response?.folders ?? []) as Entry[]).map((f) => f.id!);
}

/** The end state of the job that was just queued: finished, no error, 100%. */
async function finishedOperation(api: Api, type: FileOperationType) {
  const op = await waitForOperation(api.operations);
  expect(op.finished).toBe(true);
  expect(op.error ?? "").toBe("");
  expect(op.progress).toBe(100);
  expect(op.Operation).toBe(type);
  return op;
}

async function expectNoOperationQueued(api: Api) {
  const { data, status } = await api.operations.getOperationStatuses();
  expect(status).toBe(200);
  expect(data.response ?? []).toEqual([]);
}

function expectClientError(status: number) {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

async function invite(
  api: Api,
  roomId: number,
  userId: string,
  access: FileShare,
) {
  const { status } = await api.rooms.setRoomSecurity({
    id: roomId,
    roomInvitationRequest: {
      invitations: [{ id: userId, access }],
      notify: false,
    },
  });
  expect(status).toBe(200);
}

const copy = (
  api: Api,
  body: {
    fileIds?: number[];
    folderIds?: number[];
    destFolderId: number;
    conflictResolveType?: FileConflictResolveType;
  },
) =>
  api.operations.copyBatchItems({
    batchRequestDto: {
      conflictResolveType: FileConflictResolveType.Skip,
      deleteAfter: false,
      ...body,
    },
  });

const move = (
  api: Api,
  body: {
    fileIds?: number[];
    folderIds?: number[];
    destFolderId: number;
    conflictResolveType?: FileConflictResolveType;
  },
) =>
  api.operations.moveBatchItems({
    batchRequestDto: {
      conflictResolveType: FileConflictResolveType.Skip,
      deleteAfter: false,
      ...body,
    },
  });

const remove = (
  api: Api,
  body: { fileIds?: number[]; folderIds?: number[]; immediately: boolean },
) =>
  api.operations.deleteBatchItems({
    deleteBatchRequestDto: { deleteAfter: false, ...body },
  });

/** A folder with a child, a grandchild and a file, plus a snapshot of My Documents. */
async function nestedFolders(api: Api, myDocs: number, name: string) {
  const root = await createFolder(api, myDocs, name);
  const child = await createFolder(api, root, `${name} Child`);
  const grandchild = await createFolder(api, child, `${name} Grandchild`);
  await putFile(api, root, `${name} File.bin`, makeBytes(64, 1));
  return { root, child, grandchild };
}

test.describe("copyBatchItems", () => {
  for (const target of ["itself", "child", "grandchild"] as const) {
    test(`PUT /api/2.0/files/fileops/copy - A folder cannot be copied into ${target === "itself" ? "itself" : `its ${target}`}: a client error, no job, nothing changes`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const tree = await nestedFolders(
        owner,
        myDocs,
        "Autotest Batch CopyLoop",
      );
      const dest = {
        itself: tree.root,
        child: tree.child,
        grandchild: tree.grandchild,
      }[target];
      const before = {
        myDocs: await listing(owner, myDocs),
        root: await listing(owner, tree.root),
        child: await listing(owner, tree.child),
        grandchild: await listing(owner, tree.grandchild),
      };

      const res = await copy(owner, {
        folderIds: [tree.root],
        destFolderId: dest,
      });

      expectClientError(res.status);
      await expectNoOperationQueued(owner);
      expect({
        myDocs: await listing(owner, myDocs),
        root: await listing(owner, tree.root),
        child: await listing(owner, tree.child),
        grandchild: await listing(owner, tree.grandchild),
      }).toEqual(before);
    });
  }

  test("PUT /api/2.0/files/fileops/copy - A file with two versions is copied with its latest content, as a new file, and the original is untouched", async ({
    apiSdk,
  }, testInfo) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Batch CopyVersions",
    );
    const v1 = makeBytes(500, 11);
    const v2 = makeBytes(700, 22);
    const original = await putFile(owner, dir, "Versioned.bin", v1);
    await putFile(owner, dir, "Versioned.bin", v2, false);
    expect(await versionsOf(owner, original.id)).toEqual([1, 2]);
    const roomId = await createRoom(owner, "Autotest Batch CopyVersions Room");

    const res = await copy(owner, {
      fileIds: [original.id],
      destFolderId: roomId,
    });
    expect(res.status).toBe(200);
    const op = await finishedOperation(owner, FileOperationType.Copy);

    const copied = (op.files ?? []) as Entry[];
    expect(copied).toHaveLength(1);
    expect(copied[0].id).not.toBe(original.id);
    expect(await listing(owner, roomId)).toEqual([
      `${copied[0].id}:Versioned.bin`,
    ]);
    await expectContent(apiSdk, "owner", copied[0].id!, v2);
    await expectContent(apiSdk, "owner", original.id, v2);
    expect(await versionsOf(owner, original.id)).toEqual([1, 2]);
    testInfo.annotations.push({
      type: "observed-not-pinned",
      description: `copy has versions ${JSON.stringify(await versionsOf(owner, copied[0].id!))}, original has [1,2]`,
    });
  });

  test("PUT /api/2.0/files/fileops/copy - The copy is independent: a new version of the original and then its deletion leave the copy byte-for-byte", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Batch CopyIndependent",
    );
    const content = makeBytes(600, 31);
    const original = await putFile(owner, dir, "Independent.bin", content);
    const roomId = await createRoom(
      owner,
      "Autotest Batch CopyIndependent Room",
    );
    await copy(owner, { fileIds: [original.id], destFolderId: roomId });
    const copiedId = (
      (await finishedOperation(owner, FileOperationType.Copy)).files as Entry[]
    )[0].id!;
    await expectContent(apiSdk, "owner", copiedId, content);

    const newer = makeBytes(900, 32);
    await putFile(owner, dir, "Independent.bin", newer, false);
    await expectContent(apiSdk, "owner", original.id, newer);
    await expectContent(apiSdk, "owner", copiedId, content);

    const deleted = await remove(owner, {
      fileIds: [original.id],
      immediately: true,
    });
    expect(deleted.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Delete);
    expect(await listing(owner, dir)).toEqual([]);
    await expectContent(apiSdk, "owner", copiedId, content);
  });

  test("PUT /api/2.0/files/fileops/copy - A nested folder tree is copied with every file byte-for-byte and survives the deletion of the original", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const root = await createFolder(owner, myDocs, "Autotest Batch Tree");
    const level1 = await createFolder(owner, root, "Level1");
    const level2 = await createFolder(owner, level1, "Level2");
    await putFile(owner, root, "root.bin", makeBytes(10, 41));
    await putFile(owner, level1, "one.bin", makeBytes(20, 42));
    await putFile(owner, level2, "two.bin", makeBytes(30, 43));
    const roomId = await createRoom(owner, "Autotest Batch Tree Room");
    const originalTree = await readTree(apiSdk, "owner", owner, root);
    expect(originalTree).toHaveLength(3);

    const res = await copy(owner, { folderIds: [root], destFolderId: roomId });
    expect(res.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Copy);

    const inRoom = await listing(owner, roomId);
    expect(inRoom).toHaveLength(1);
    const copiedRootId = Number(inRoom[0].split(":")[0]);
    expect(copiedRootId).not.toBe(root);
    expect(inRoom[0].endsWith(":Autotest Batch Tree")).toBe(true);
    expect(await readTree(apiSdk, "owner", owner, copiedRootId)).toEqual(
      originalTree,
    );

    await remove(owner, { folderIds: [root], immediately: true });
    await finishedOperation(owner, FileOperationType.Delete);
    expect(await readTree(apiSdk, "owner", owner, copiedRootId)).toEqual(
      originalTree,
    );
  });

  for (const mode of ["Skip", "Overwrite", "Duplicate"] as const) {
    test(`PUT /api/2.0/files/fileops/copy - conflictResolveType ${mode}: the same-named file at the destination is ${{ Skip: "left alone", Overwrite: "replaced by the source content", Duplicate: "kept next to a numbered copy" }[mode]}, the source stays`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const source = await createFolder(
        owner,
        myDocs,
        `Autotest Batch CopyClash Source ${mode}`,
      );
      const dest = await createFolder(
        owner,
        myDocs,
        `Autotest Batch CopyClash Dest ${mode}`,
      );
      const fromSource = makeBytes(200, 1);
      const atDest = makeBytes(300, 2);
      const src = await putFile(owner, source, "same.bin", fromSource);
      const existing = await putFile(owner, dest, "same.bin", atDest);

      const res = await copy(owner, {
        fileIds: [src.id],
        destFolderId: dest,
        conflictResolveType: FileConflictResolveType[mode],
      });
      expect(res.status).toBe(200);
      await finishedOperation(owner, FileOperationType.Copy);

      // The source is never touched by a copy.
      expect(await listing(owner, source)).toEqual([`${src.id}:same.bin`]);
      await expectContent(apiSdk, "owner", src.id, fromSource);

      const atDestAfter = await listing(owner, dest);
      if (mode === "Skip") {
        expect(atDestAfter).toEqual([`${existing.id}:same.bin`]);
        await expectContent(apiSdk, "owner", existing.id, atDest);
      } else if (mode === "Overwrite") {
        expect(atDestAfter).toEqual([`${existing.id}:same.bin`]);
        await expectContent(apiSdk, "owner", existing.id, fromSource);
      } else {
        expect(atDestAfter).toHaveLength(2);
        expect(atDestAfter).toContain(`${existing.id}:same.bin`);
        const added = atDestAfter.find(
          (e) => !e.startsWith(`${existing.id}:`),
        )!;
        expect(added.endsWith(":same (1).bin")).toBe(true);
        await expectContent(apiSdk, "owner", existing.id, atDest);
        await expectContent(
          apiSdk,
          "owner",
          Number(added.split(":")[0]),
          fromSource,
        );
      }
    });
  }

  test("PUT /api/2.0/files/fileops/copy - A repeated id never harms the original and every copy that is made matches it", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Batch CopyRepeat");
    const content = makeBytes(64, 51);
    const original = await putFile(owner, dir, "Repeated.bin", content);
    const roomId = await createRoom(owner, "Autotest Batch CopyRepeat Room");

    const res = await copy(owner, {
      fileIds: [original.id, original.id],
      destFolderId: roomId,
      conflictResolveType: FileConflictResolveType.Duplicate,
    });
    expect(res.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Copy);

    expect(await listing(owner, dir)).toEqual([`${original.id}:Repeated.bin`]);
    await expectContent(apiSdk, "owner", original.id, content);
    const copies = await listing(owner, roomId);
    expect(copies.length).toBeGreaterThanOrEqual(1);
    for (const entry of copies) {
      await expectContent(
        apiSdk,
        "owner",
        Number(entry.split(":")[0]),
        content,
      );
    }
  });

  test("PUT /api/2.0/files/fileops/copy - A set mixing an own file and a file the caller cannot read is refused with 403 as a whole and nothing is copied", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerDir = await getMyDocsId(owner);
    const privateFile = await putFile(
      owner,
      ownerDir,
      "Autotest Batch Private.bin",
      makeBytes(80, 61),
    );
    const roomId = await createRoom(owner, "Autotest Batch CopyMixed Room");
    const { api: user, data: userData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(
      owner,
      roomId,
      userData.response!.id!,
      FileShare.ContentCreator,
    );
    const userDocs = await getMyDocsId(user);
    const ownFile = await putFile(
      user,
      userDocs,
      "Autotest Batch Own.bin",
      makeBytes(90, 62),
    );
    const roomBefore = await listing(owner, roomId);

    // Positive control: the user may copy the own file alone into this room.
    const alone = await copy(user, {
      fileIds: [ownFile.id],
      destFolderId: roomId,
    });
    expect(alone.status).toBe(200);
    await finishedOperation(user, FileOperationType.Copy);
    const afterControl = await listing(owner, roomId);
    expect(afterControl).toHaveLength(roomBefore.length + 1);

    const res = await copy(user, {
      fileIds: [ownFile.id, privateFile.id],
      destFolderId: roomId,
      conflictResolveType: FileConflictResolveType.Duplicate,
    });

    expect(res.status).toBe(403);
    expect(await listing(owner, roomId)).toEqual(afterControl);
    expect(await listing(owner, ownerDir)).toContain(
      `${privateFile.id}:Autotest Batch Private.bin`,
    );
  });
});

test.describe("moveBatchItems", () => {
  for (const target of ["itself", "child", "grandchild"] as const) {
    test(`PUT /api/2.0/files/fileops/move - A folder cannot be moved into ${target === "itself" ? "itself" : `its ${target}`}: a client error, no job, nothing changes`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const tree = await nestedFolders(
        owner,
        myDocs,
        "Autotest Batch MoveLoop",
      );
      const dest = {
        itself: tree.root,
        child: tree.child,
        grandchild: tree.grandchild,
      }[target];
      const snapshot = async () => ({
        myDocs: await listing(owner, myDocs),
        root: await listing(owner, tree.root),
        child: await listing(owner, tree.child),
        grandchild: await listing(owner, tree.grandchild),
      });
      const before = await snapshot();

      const res = await move(owner, {
        folderIds: [tree.root],
        destFolderId: dest,
      });

      expectClientError(res.status);
      await expectNoOperationQueued(owner);
      expect(await snapshot()).toEqual(before);
    });
  }

  test("PUT /api/2.0/files/fileops/move - A moved file keeps its id, its versions and its content, and lives only in the destination", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Batch MoveFile");
    const v1 = makeBytes(300, 71);
    const v2 = makeBytes(400, 72);
    const file = await putFile(owner, dir, "Moved.bin", v1);
    await putFile(owner, dir, "Moved.bin", v2, false);
    const roomId = await createRoom(owner, "Autotest Batch MoveFile Room");

    const res = await move(owner, { fileIds: [file.id], destFolderId: roomId });
    expect(res.status).toBe(200);
    const op = await finishedOperation(owner, FileOperationType.Move);

    expect(((op.files ?? []) as Entry[]).map((f) => f.id)).toEqual([file.id]);
    expect(await listing(owner, dir)).toEqual([]);
    expect(await listing(owner, roomId)).toEqual([`${file.id}:Moved.bin`]);
    const { data } = await owner.files.getFileInfo({ fileId: file.id });
    expect(data.response?.folderId).toBe(roomId);
    expect(await versionsOf(owner, file.id)).toEqual([1, 2]);
    await expectContent(apiSdk, "owner", file.id, v2);
  });

  test("PUT /api/2.0/files/fileops/move - A moved folder tree keeps the ids of its folders and files and every file byte-for-byte", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const root = await createFolder(owner, myDocs, "Autotest Batch MoveTree");
    const inner = await createFolder(owner, root, "Inner");
    const file = await putFile(owner, inner, "inner.bin", makeBytes(120, 81));
    const treeBefore = await readTree(apiSdk, "owner", owner, root);
    const roomId = await createRoom(owner, "Autotest Batch MoveTree Room");

    const res = await move(owner, { folderIds: [root], destFolderId: roomId });
    expect(res.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Move);

    expect(await listing(owner, roomId)).toEqual([
      `${root}:Autotest Batch MoveTree`,
    ]);
    expect(await listing(owner, myDocs)).not.toContain(
      `${root}:Autotest Batch MoveTree`,
    );
    expect(await listing(owner, root)).toEqual([`${inner}:Inner`]);
    expect(await listing(owner, inner)).toEqual([`${file.id}:inner.bin`]);
    expect(await readTree(apiSdk, "owner", owner, root)).toEqual(treeBefore);
  });

  for (const mode of ["Skip", "Overwrite", "Duplicate"] as const) {
    test(`PUT /api/2.0/files/fileops/move - conflictResolveType ${mode}: ${{ Skip: "nothing moves and both files stay as they were", Overwrite: "the destination file takes the source content and the source is gone", Duplicate: "the source arrives as a numbered copy next to the untouched original" }[mode]}`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const source = await createFolder(
        owner,
        myDocs,
        `Autotest Batch MoveClash Source ${mode}`,
      );
      const dest = await createFolder(
        owner,
        myDocs,
        `Autotest Batch MoveClash Dest ${mode}`,
      );
      const fromSource = makeBytes(200, 1);
      const atDest = makeBytes(300, 2);
      const src = await putFile(owner, source, "same.bin", fromSource);
      const existing = await putFile(owner, dest, "same.bin", atDest);

      const res = await move(owner, {
        fileIds: [src.id],
        destFolderId: dest,
        conflictResolveType: FileConflictResolveType[mode],
      });
      expect(res.status).toBe(200);
      await finishedOperation(owner, FileOperationType.Move);

      const atDestAfter = await listing(owner, dest);
      const atSourceAfter = await listing(owner, source);
      if (mode === "Skip") {
        expect(atDestAfter).toEqual([`${existing.id}:same.bin`]);
        expect(atSourceAfter).toEqual([`${src.id}:same.bin`]);
        await expectContent(apiSdk, "owner", existing.id, atDest);
        await expectContent(apiSdk, "owner", src.id, fromSource);
      } else if (mode === "Overwrite") {
        expect(atSourceAfter).toEqual([]);
        expect(atDestAfter).toEqual([`${existing.id}:same.bin`]);
        await expectContent(apiSdk, "owner", existing.id, fromSource);
      } else {
        expect(atSourceAfter).toEqual([]);
        expect(atDestAfter).toHaveLength(2);
        expect(atDestAfter).toContain(`${existing.id}:same.bin`);
        // The moved file keeps its id and takes a numbered name.
        expect(atDestAfter).toContain(`${src.id}:same (1).bin`);
        await expectContent(apiSdk, "owner", existing.id, atDest);
        await expectContent(apiSdk, "owner", src.id, fromSource);
      }
    });
  }

  test("PUT /api/2.0/files/fileops/move - A repeated id moves the file once and leaves nothing behind", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Batch MoveRepeat");
    const content = makeBytes(64, 91);
    const file = await putFile(owner, dir, "Once.bin", content);
    const roomId = await createRoom(owner, "Autotest Batch MoveRepeat Room");

    const res = await move(owner, {
      fileIds: [file.id, file.id],
      destFolderId: roomId,
    });
    expect(res.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Move);

    expect(await listing(owner, dir)).toEqual([]);
    expect(await listing(owner, roomId)).toEqual([`${file.id}:Once.bin`]);
    await expectContent(apiSdk, "owner", file.id, content);
  });

  test("PUT /api/2.0/files/fileops/move - A set mixing an own file and a file the caller cannot touch is refused with 403 as a whole and nothing moves", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerDir = await getMyDocsId(owner);
    const privateFile = await putFile(
      owner,
      ownerDir,
      "Autotest Batch MovePrivate.bin",
      makeBytes(80, 95),
    );
    const roomId = await createRoom(owner, "Autotest Batch MoveMixed Room");
    const { api: user, data: userData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(
      owner,
      roomId,
      userData.response!.id!,
      FileShare.ContentCreator,
    );
    const userDocs = await getMyDocsId(user);
    const ownFile = await putFile(
      user,
      userDocs,
      "Autotest Batch MoveOwn.bin",
      makeBytes(90, 96),
    );

    // Positive control: the same user may move the own file alone.
    const alone = await move(user, {
      fileIds: [ownFile.id],
      destFolderId: roomId,
    });
    expect(alone.status).toBe(200);
    await finishedOperation(user, FileOperationType.Move);
    expect(await listing(owner, roomId)).toEqual([
      `${ownFile.id}:Autotest Batch MoveOwn.bin`,
    ]);
    const second = await putFile(
      user,
      userDocs,
      "Autotest Batch MoveOwn Two.bin",
      makeBytes(91, 97),
    );

    const res = await move(user, {
      fileIds: [second.id, privateFile.id],
      destFolderId: roomId,
    });

    expect(res.status).toBe(403);
    expect(await listing(user, userDocs)).toContain(
      `${second.id}:Autotest Batch MoveOwn Two.bin`,
    );
    expect(await listing(owner, ownerDir)).toContain(
      `${privateFile.id}:Autotest Batch MovePrivate.bin`,
    );
    expect(await listing(owner, roomId)).toEqual([
      `${ownFile.id}:Autotest Batch MoveOwn.bin`,
    ]);
  });
});

test.describe("deleteBatchItems", () => {
  test("PUT /api/2.0/files/fileops/delete - A set with an existing and a non-existent file answers 404 and deletes nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Batch DeleteMixed");
    const content = makeBytes(100, 101);
    const real = await putFile(owner, dir, "Real.bin", content);
    const trashBefore = await trashFileIds(owner);

    const res = await remove(owner, {
      fileIds: [real.id, 99999999],
      immediately: false,
    });

    expect(res.status).toBe(404);
    await expectNoOperationQueued(owner);
    expect(await listing(owner, dir)).toEqual([`${real.id}:Real.bin`]);
    expect(await trashFileIds(owner)).toEqual(trashBefore);
    await expectContent(apiSdk, "owner", real.id, content);
  });

  test("PUT /api/2.0/files/fileops/delete - A repeated id deletes the file once, into the Trash", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Batch DeleteRepeat",
    );
    const file = await putFile(owner, dir, "Twice.bin", makeBytes(100, 102));
    const other = await putFile(owner, dir, "Stays.bin", makeBytes(100, 103));

    const res = await remove(owner, {
      fileIds: [file.id, file.id],
      immediately: false,
    });
    expect(res.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Delete);

    expect(await listing(owner, dir)).toEqual([`${other.id}:Stays.bin`]);
    expect((await trashFileIds(owner)).filter((id) => id === file.id)).toEqual([
      file.id,
    ]);
    await expectContent(apiSdk, "owner", other.id, makeBytes(100, 103));
  });

  test("PUT /api/2.0/files/fileops/delete - A file with two versions goes to the Trash, is not readable there, and restoring it brings back its id, versions and content", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Batch Restore");
    const v1 = makeBytes(111, 111);
    const v2 = makeBytes(222, 112);
    const file = await putFile(owner, dir, "Restore.bin", v1);
    await putFile(owner, dir, "Restore.bin", v2, false);

    const deleted = await remove(owner, {
      fileIds: [file.id],
      immediately: false,
    });
    expect(deleted.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Delete);

    expect(await listing(owner, dir)).toEqual([]);
    expect(await trashFileIds(owner)).toContain(file.id);
    // While it sits in the Trash the content is not handed out.
    const inTrash = await downloadFile(apiSdk, "owner", file.id).catch(() => ({
      status: -1,
    }));
    expect(inTrash.status).not.toBe(200);

    // Restoring is moving the item out of the Trash.
    const restored = await move(owner, {
      fileIds: [file.id],
      destFolderId: dir,
    });
    expect(restored.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Move);

    expect(await trashFileIds(owner)).not.toContain(file.id);
    expect(await listing(owner, dir)).toEqual([`${file.id}:Restore.bin`]);
    expect(await versionsOf(owner, file.id)).toEqual([1, 2]);
    await expectContent(apiSdk, "owner", file.id, v2);
  });

  test("PUT /api/2.0/files/fileops/delete - Repeating the call with the same id deletes what was restored in the meantime (documented, not idempotent)", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Batch DeleteAgain");
    const file = await putFile(owner, dir, "Again.bin", makeBytes(50, 121));

    await remove(owner, { fileIds: [file.id], immediately: false });
    await finishedOperation(owner, FileOperationType.Delete);
    await move(owner, { fileIds: [file.id], destFolderId: dir });
    await finishedOperation(owner, FileOperationType.Move);
    expect(await listing(owner, dir)).toEqual([`${file.id}:Again.bin`]);

    const again = await remove(owner, {
      fileIds: [file.id],
      immediately: false,
    });
    expect(again.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Delete);

    expect(await listing(owner, dir)).toEqual([]);
    expect(await trashFileIds(owner)).toContain(file.id);
    expect(apiSdk).toBeDefined();
  });

  test("PUT /api/2.0/files/fileops/delete - A set mixing an own file and a file the caller cannot delete is refused with 403 as a whole and nothing is deleted", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const ownerDir = await getMyDocsId(owner);
    const content = makeBytes(80, 131);
    const foreign = await putFile(
      owner,
      ownerDir,
      "Autotest Batch DeleteForeign.bin",
      content,
    );
    const { api: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    const userDocs = await getMyDocsId(user);
    const ownFile = await putFile(
      user,
      userDocs,
      "Autotest Batch DeleteOwn.bin",
      makeBytes(90, 132),
    );

    const res = await remove(user, {
      fileIds: [ownFile.id, foreign.id],
      immediately: true,
    });

    expect(res.status).toBe(403);
    await expectNoOperationQueued(user);
    expect(await listing(user, userDocs)).toContain(
      `${ownFile.id}:Autotest Batch DeleteOwn.bin`,
    );
    expect(await listing(owner, ownerDir)).toContain(
      `${foreign.id}:Autotest Batch DeleteForeign.bin`,
    );
    await expectContent(apiSdk, "owner", foreign.id, content);
    await expectContent(apiSdk, "user", ownFile.id, makeBytes(90, 132));
  });

  test("PUT /api/2.0/files/fileops/delete - Another user cannot delete a file out of the owner's Trash", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const file = await putFile(
      owner,
      myDocs,
      "Autotest Batch TrashGuard.bin",
      makeBytes(40, 141),
    );
    await remove(owner, { fileIds: [file.id], immediately: false });
    await finishedOperation(owner, FileOperationType.Delete);
    expect(await trashFileIds(owner)).toContain(file.id);
    const { api: user } = await apiSdk.addAuthenticatedMember("owner", "User");

    const res = await remove(user, { fileIds: [file.id], immediately: true });

    expectClientError(res.status);
    expect(await trashFileIds(owner)).toContain(file.id);
    const restored = await move(owner, {
      fileIds: [file.id],
      destFolderId: myDocs,
    });
    expect(restored.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Move);
    await expectContent(apiSdk, "owner", file.id, makeBytes(40, 141));
  });
});

test.describe("emptyTrash", () => {
  test("PUT /api/2.0/files/fileops/emptytrash - Emptying removes trashed files and folders for good: gone from the Trash, from every lookup and from restore", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Batch EmptyGone");
    const file = await putFile(owner, dir, "Gone.bin", makeBytes(60, 151));
    const folder = await createFolder(owner, dir, "Gone Folder");
    const nested = await putFile(
      owner,
      folder,
      "Nested.bin",
      makeBytes(61, 152),
    );
    await remove(owner, {
      fileIds: [file.id],
      folderIds: [folder],
      immediately: false,
    });
    await finishedOperation(owner, FileOperationType.Delete);
    expect(await trashFileIds(owner)).toContain(file.id);
    expect(await trashFolderIds(owner)).toContain(folder);

    const res = await owner.operations.emptyTrash({});
    expect(res.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Delete);

    expect(await trashFileIds(owner)).toEqual([]);
    expect(await trashFolderIds(owner)).toEqual([]);
    expect((await owner.files.getFileInfo({ fileId: file.id })).status).toBe(
      404,
    );
    expect((await owner.files.getFileInfo({ fileId: nested.id })).status).toBe(
      404,
    );
    expect(
      (await owner.folders.getFolderInfo({ folderId: folder })).status,
    ).toBe(404);
    const download = await downloadFile(apiSdk, "owner", file.id).catch(() => ({
      status: -1,
    }));
    expect(download.status).not.toBe(200);
    const restore = await move(owner, {
      fileIds: [file.id],
      destFolderId: dir,
    });
    expectClientError(restore.status);
    expect(await listing(owner, dir)).toEqual([]);
  });

  test("PUT /api/2.0/files/fileops/emptytrash - Files outside the Trash, in documents and in rooms, are untouched, versions included", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Batch EmptyOutside",
    );
    const roomId = await createRoom(owner, "Autotest Batch EmptyOutside Room");
    const v1 = makeBytes(70, 161);
    const v2 = makeBytes(71, 162);
    const keep = await putFile(owner, dir, "Keep.bin", v1);
    await putFile(owner, dir, "Keep.bin", v2, false);
    const inRoom = await putFile(
      owner,
      roomId,
      "InRoom.bin",
      makeBytes(72, 163),
    );
    const doomed = await putFile(owner, dir, "Doomed.bin", makeBytes(73, 164));
    await remove(owner, { fileIds: [doomed.id], immediately: false });
    await finishedOperation(owner, FileOperationType.Delete);
    const dirBefore = await listing(owner, dir);
    const roomBefore = await listing(owner, roomId);

    const res = await owner.operations.emptyTrash({});
    expect(res.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Delete);

    expect(await trashFileIds(owner)).toEqual([]);
    expect(await listing(owner, dir)).toEqual(dirBefore);
    expect(await listing(owner, roomId)).toEqual(roomBefore);
    expect(await versionsOf(owner, keep.id)).toEqual([1, 2]);
    await expectContent(apiSdk, "owner", keep.id, v2);
    await expectContent(apiSdk, "owner", inRoom.id, makeBytes(72, 163));
  });

  test("PUT /api/2.0/files/fileops/emptytrash - Emptying an already empty Trash answers 200 and changes nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const file = await putFile(
      owner,
      myDocs,
      "Autotest Batch EmptyTwice.bin",
      makeBytes(30, 171),
    );
    await remove(owner, { fileIds: [file.id], immediately: false });
    await finishedOperation(owner, FileOperationType.Delete);
    const kept = await putFile(
      owner,
      myDocs,
      "Autotest Batch EmptyTwice Keep.bin",
      makeBytes(31, 172),
    );
    await owner.operations.emptyTrash({});
    await finishedOperation(owner, FileOperationType.Delete);
    expect(await trashFileIds(owner)).toEqual([]);
    const before = await listing(owner, myDocs);

    const again = await owner.operations.emptyTrash({});

    expect(again.status).toBe(200);
    expect(await trashFileIds(owner)).toEqual([]);
    expect(await listing(owner, myDocs)).toEqual(before);
    await expectContent(apiSdk, "owner", kept.id, makeBytes(31, 172));
  });

  test("PUT /api/2.0/files/fileops/emptytrash - One account emptying its Trash leaves another account's Trash and its restorable files alone", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const v1 = makeBytes(80, 181);
    const v2 = makeBytes(81, 182);
    const ownerFile = await putFile(
      owner,
      myDocs,
      "Autotest Batch TrashIso.bin",
      v1,
    );
    await putFile(owner, myDocs, "Autotest Batch TrashIso.bin", v2, false);
    await remove(owner, { fileIds: [ownerFile.id], immediately: false });
    await finishedOperation(owner, FileOperationType.Delete);

    const { api: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    const userDocs = await getMyDocsId(user);
    const userFile = await putFile(
      user,
      userDocs,
      "Autotest Batch UserTrash.bin",
      makeBytes(82, 183),
    );
    await remove(user, { fileIds: [userFile.id], immediately: false });
    await finishedOperation(user, FileOperationType.Delete);
    expect(await trashFileIds(user)).toContain(userFile.id);

    const res = await user.operations.emptyTrash({});
    expect(res.status).toBe(200);
    await finishedOperation(user, FileOperationType.Delete);

    expect(await trashFileIds(user)).toEqual([]);
    expect(await trashFileIds(owner)).toEqual([ownerFile.id]);
    const restored = await move(owner, {
      fileIds: [ownerFile.id],
      destFolderId: myDocs,
    });
    expect(restored.status).toBe(200);
    await finishedOperation(owner, FileOperationType.Move);
    expect(await versionsOf(owner, ownerFile.id)).toEqual([1, 2]);
    await expectContent(apiSdk, "owner", ownerFile.id, v2);
  });
});

test.describe("Batch operations end to end", () => {
  test("PUT /api/2.0/files/fileops/copy, move, duplicate, delete, emptytrash - A file goes through every step with its bytes intact and the survivors are untouched by the final purge", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dirA = await createFolder(owner, myDocs, "Autotest Batch Flow A");
    const dirB = await createFolder(owner, myDocs, "Autotest Batch Flow B");
    const roomId = await createRoom(owner, "Autotest Batch Flow Room");
    const content = makeBytes(256, 191);
    const file = await putFile(owner, dirA, "Flow.bin", content);

    await test.step("copy into the room: a new file with the same bytes", async () => {
      expect(
        (await copy(owner, { fileIds: [file.id], destFolderId: roomId }))
          .status,
      ).toBe(200);
      const op = await finishedOperation(owner, FileOperationType.Copy);
      const copyId = (op.files as Entry[])[0].id!;
      expect(copyId).not.toBe(file.id);
      await expectContent(apiSdk, "owner", copyId, content);
    });

    await test.step("move the original to the other folder: same id, same bytes", async () => {
      expect(
        (await move(owner, { fileIds: [file.id], destFolderId: dirB })).status,
      ).toBe(200);
      await finishedOperation(owner, FileOperationType.Move);
      expect(await listing(owner, dirA)).toEqual([]);
      expect(await listing(owner, dirB)).toEqual([`${file.id}:Flow.bin`]);
      await expectContent(apiSdk, "owner", file.id, content);
    });

    await test.step("duplicate it in place: two files, both with the same bytes", async () => {
      const res = await owner.operations.duplicateBatchItems({
        duplicateRequestDto: { fileIds: [file.id as never] },
      });
      expect(res.status).toBe(200);
      await finishedOperation(owner, FileOperationType.Duplicate);
      const inB = await listing(owner, dirB);
      expect(inB).toHaveLength(2);
      for (const entry of inB) {
        await expectContent(
          apiSdk,
          "owner",
          Number(entry.split(":")[0]),
          content,
        );
      }
    });

    await test.step("delete both into the Trash, then empty it", async () => {
      const ids = (await listing(owner, dirB)).map((e) =>
        Number(e.split(":")[0]),
      );
      expect(
        (await remove(owner, { fileIds: ids, immediately: false })).status,
      ).toBe(200);
      await finishedOperation(owner, FileOperationType.Delete);
      expect(await listing(owner, dirB)).toEqual([]);
      expect((await trashFileIds(owner)).sort()).toEqual([...ids].sort());
      expect((await owner.operations.emptyTrash({})).status).toBe(200);
      await finishedOperation(owner, FileOperationType.Delete);
      expect(await trashFileIds(owner)).toEqual([]);
    });

    await test.step("the copy in the room survived the purge", async () => {
      const inRoom = await listing(owner, roomId);
      expect(inRoom).toHaveLength(1);
      await expectContent(
        apiSdk,
        "owner",
        Number(inRoom[0].split(":")[0]),
        content,
      );
    });
  });
});
