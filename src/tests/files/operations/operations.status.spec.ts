import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  DistributedTaskStatus,
  FileConflictResolveType,
  FileOperationDto,
  FileOperationType,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import type { ApiSDK } from "@/src/services/api-sdk";

// Operation statuses and termination: getOperationStatuses,
// getOperationStatusesByType, terminateTasks.
//
// Contract used (SDK 4.0.0 JSDoc, confirmed on the portal):
//   * a started operation is `Created` (progress 0) and then `Running`, ending as
//     `Completed` with progress 100; `error` is the only sign of a failed item;
//   * a finished record is handed out ONCE (by any read, or by the answer to the
//     next start of the same group) and is then dropped; deleteAfter=true never
//     hands it out;
//   * operations are private to the account that started them;
//   * `id` is the operation id from the start answer; terminate with an empty id
//     stops everything the caller runs, an id that is not theirs stops nothing
//     and is not an error; cancelling does not undo what was already done.
//
// Observed and deliberately not pinned (the JSDoc differs or is silent):
//   * a cancelled record shows up a moment after the call, not "at once";
//   * byType(Move) does return an active move although the JSDoc says kind 0
//     cannot be read through that route;
//   * terminating a finished, unread operation consumes its record;
//   * a failing item is refused with 403 before any job exists, so the only
//     reachable `error` is the cancellation one; a crashed (Failted) task could
//     not be provoked on the test portal.
//
// Operations that are too fast to cancel on the test portal (a delete of 150
// files and the archiving of a room take under a second) are tested for the
// invariants that must hold either way, never for "was cancelled".

type Api = ReturnType<ApiSDK["forRole"]>;
type Entry = { id?: number; title?: string };

const LONG_FILES = 60;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function createFile(api: Api, folderId: number, title: string) {
  const { data, status } = await api.files.createFile({
    folderId,
    createFileRequest: { title },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

/** A folder with `count` empty documents, created ten at a time. */
async function seedFolder(
  api: Api,
  parent: number,
  title: string,
  count: number,
) {
  const folderId = await createFolder(api, parent, title);
  const fileIds: number[] = [];
  for (let i = 0; i < count; i += 10) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(10, count - i) }, (_, k) =>
        createFile(api, folderId, `file ${i + k}.docx`),
      ),
    );
    fileIds.push(...batch);
  }
  return { folderId, fileIds };
}

async function countFiles(api: Api, folderId: number): Promise<number> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  if (status !== 200) return 0;
  let total = (data.response?.files ?? []).length;
  for (const folder of (data.response?.folders ?? []) as Entry[]) {
    total += await countFiles(api, folder.id!);
  }
  return total;
}

/** Waits until a count stops changing; the bound keeps a runaway job from hanging the test. */
async function settled(read: () => Promise<number>, quietReads = 4) {
  let last = -1;
  let same = 0;
  const started = Date.now();
  while (Date.now() - started < 40_000) {
    const value = await read();
    same = value === last ? same + 1 : 1;
    last = value;
    if (same >= quietReads) return value;
    await sleep(500);
  }
  throw new Error("the count never settled: something is still working");
}

async function operations(api: Api, id?: string): Promise<FileOperationDto[]> {
  const { data, status } = await api.operations.getOperationStatuses(
    id === undefined ? {} : { id },
  );
  expect(status).toBe(200);
  return data.response ?? [];
}

/** The operation that was just queued: the unfinished one of its kind at progress 0. */
function startedOperation(
  response: FileOperationDto[] | FileOperationDto | undefined,
  type: FileOperationType,
): FileOperationDto {
  const all = Array.isArray(response) ? response : response ? [response] : [];
  const fresh = all.filter(
    (o) => o.Operation === type && !o.finished && o.progress === 0,
  );
  expect(fresh, "exactly one fresh operation of the kind").toHaveLength(1);
  return fresh[0];
}

/** Polls one operation until `done` holds; returns the record that satisfied it. */
async function pollOperation(
  api: Api,
  id: string,
  done: (op: FileOperationDto) => boolean,
  timeout = 60_000,
): Promise<FileOperationDto> {
  let found: FileOperationDto | undefined;
  await expect(async () => {
    const [op] = await operations(api, id);
    expect(op, "the operation is still known").toBeDefined();
    expect(done(op)).toBe(true);
    found = op;
  }).toPass({ intervals: [50, 100, 200], timeout });
  return found!;
}

/** The finished record of an operation, read once (this also hands it out). */
const finishedRecord = (api: Api, id: string, timeout?: number) =>
  pollOperation(api, id, (op) => op.finished === true, timeout);

async function expectNothingRunning(api: Api) {
  await expect
    .poll(
      async () => (await operations(api)).filter((o) => !o.finished).length,
      {
        timeout: 30_000,
      },
    )
    .toBe(0);
}

const startCopy = (api: Api, folderId: number, destFolderId: number) =>
  api.operations.copyBatchItems({
    batchRequestDto: {
      folderIds: [folderId],
      destFolderId,
      conflictResolveType: FileConflictResolveType.Skip,
      deleteAfter: false,
    },
  });

const startDuplicate = (api: Api, folderId: number) =>
  api.operations.duplicateBatchItems({
    duplicateRequestDto: { folderIds: [folderId as never] },
  });

const startDownload = (api: Api, folderIds: number[]) =>
  api.operations.bulkDownload({
    downloadRequestDto: { folderIds: folderIds as never[] },
  });

/** Called after the setup assertions: from here only the violated condition may fail. */
function knownDefect(label: string) {
  test.fail(true, label);
}

test.describe("getOperationStatuses", () => {
  test("GET /api/2.0/files/fileops - A started operation is Created at progress 0, then reaches Completed at 100 with the same id and no error", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Status Shape.docx",
    );
    const roomId = await createRoom(owner, "Autotest Status Shape Room");

    const res = await owner.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });
    expect(res.status).toBe(200);
    const started = startedOperation(res.data.response, FileOperationType.Copy);
    expect(started.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(started.status).toBe(DistributedTaskStatus.Created);
    expect(started.progress).toBe(0);
    expect(started.processed).toBe("0");
    expect(started.error ?? "").toBe("");
    expect(started.finished).toBe(false);

    const done = await finishedRecord(owner, started.id!);

    expect(done.id).toBe(started.id);
    expect(done.Operation).toBe(FileOperationType.Copy);
    expect(done.status).toBe(DistributedTaskStatus.Completed);
    expect(done.progress).toBe(100);
    expect(done.processed).toBe("1");
    expect(done.error ?? "").toBe("");
    expect(done.finished).toBe(true);
    expect(done.files).toHaveLength(1);
    expect(done.url ?? "").toBe("");
  });

  test("GET /api/2.0/files/fileops - A long copy moves through Running with progress and processed that only grow, repeated reads change nothing, and it ends at 100", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Status Timeline",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Status Timeline Room");
    const res = await startCopy(owner, folderId, roomId);
    const op = startedOperation(res.data.response, FileOperationType.Copy);

    const samples: FileOperationDto[] = [];
    const started = Date.now();
    while (Date.now() - started < 60_000) {
      // Two reads in a row: the second must not differ in identity or lose the record.
      const [first] = await operations(owner, op.id!);
      const [second] = await operations(owner, op.id!);
      if (first) samples.push(first);
      if (first && !first.finished) {
        expect(second, "a running record survives being read").toBeDefined();
        expect(second.id).toBe(first.id);
      }
      if (!first || first.finished) break;
      await sleep(100);
    }

    const running = samples.filter((s) => !s.finished);
    expect(running.length).toBeGreaterThan(1);
    expect(
      running.some((s) => s.progress! > 0 && s.progress! < 100),
      "an intermediate progress was observed",
    ).toBe(true);
    for (const sample of running) {
      expect(sample.id).toBe(op.id);
      expect(sample.status).toBe(DistributedTaskStatus.Running);
      expect(sample.error ?? "").toBe("");
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].progress!).toBeGreaterThanOrEqual(
        samples[i - 1].progress!,
      );
      expect(Number(samples[i].processed)).toBeGreaterThanOrEqual(
        Number(samples[i - 1].processed),
      );
    }
    const last = samples[samples.length - 1];
    expect(last.finished).toBe(true);
    expect(last.progress).toBe(100);
    expect(last.status).toBe(DistributedTaskStatus.Completed);
    expect(last.error ?? "").toBe("");
    expect(await countFiles(owner, roomId)).toBe(LONG_FILES);
  });

  test("GET /api/2.0/files/fileops - A finished record is handed out once and then dropped", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(owner, myDocs, "Autotest Status Once.docx");
    const roomId = await createRoom(owner, "Autotest Status Once Room");
    const res = await owner.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });
    const op = startedOperation(res.data.response, FileOperationType.Copy);

    const handedOut = await finishedRecord(owner, op.id!);
    expect(handedOut.finished).toBe(true);

    expect(await operations(owner)).toEqual([]);
    expect(await operations(owner, op.id!)).toEqual([]);
    expect(await countFiles(owner, roomId)).toBe(1);
  });

  test("GET /api/2.0/files/fileops - deleteAfter=true never reports the finished operation", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Status DeleteAfter.docx",
    );
    const roomId = await createRoom(owner, "Autotest Status DeleteAfter Room");

    const res = await owner.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: true,
      },
    });
    expect(res.status).toBe(200);

    // The work is done when the file is there; the record must never have been kept.
    await expect
      .poll(() => countFiles(owner, roomId), { timeout: 30_000 })
      .toBe(1);
    await expectNothingRunning(owner);
    expect(await operations(owner)).toEqual([]);
  });

  test("GET /api/2.0/files/fileops - Operations of different kinds are listed together, grouped as documented, and filtering by id returns only that one", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Status Kinds Big",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Status Kinds Room");
    const moveRoom = await createRoom(owner, "Autotest Status Kinds Move Room");
    const small = await createFolder(
      owner,
      myDocs,
      "Autotest Status Kinds Small",
    );
    const toMove = await createFile(owner, small, "move.docx");
    const toDelete = await createFile(owner, small, "delete.docx");
    const toDuplicate = await createFile(owner, small, "duplicate.docx");
    const toDownload = await createFile(owner, small, "download.docx");

    const copy = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    const move = startedOperation(
      (
        await owner.operations.moveBatchItems({
          batchRequestDto: {
            fileIds: [toMove],
            destFolderId: moveRoom,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Move,
    );
    const del = startedOperation(
      (
        await owner.operations.deleteBatchItems({
          deleteBatchRequestDto: {
            fileIds: [toDelete],
            immediately: false,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Delete,
    );
    const dup = startedOperation(
      (
        await owner.operations.duplicateBatchItems({
          duplicateRequestDto: { fileIds: [toDuplicate as never] },
        })
      ).data.response,
      FileOperationType.Duplicate,
    );
    const download = startedOperation(
      (
        await owner.operations.bulkDownload({
          downloadRequestDto: {
            fileConvertIds: [{ key: toDownload as never, value: "" }],
          },
        })
      ).data.response,
      FileOperationType.Download,
    );

    // The long copy is still running, the short ones have left unread records.
    const all = await operations(owner);
    const ids = all.map((o) => o.id).sort();
    expect(ids).toEqual([copy.id, move.id, del.id, dup.id, download.id].sort());
    // Documented order: duplications, moves and copies, deletions, downloads.
    const rank = (type?: number) =>
      ({
        [FileOperationType.Duplicate]: 0,
        [FileOperationType.Move]: 1,
        [FileOperationType.Copy]: 1,
        [FileOperationType.Delete]: 2,
        [FileOperationType.Download]: 3,
      })[type ?? -1] ?? 99;
    const ranks = all.map((o) => rank(o.Operation));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(all.find((o) => o.id === download.id)?.finished).toBe(true);
    expect(all.find((o) => o.id === download.id)?.url).toBeTruthy();
    expect(all.find((o) => o.id === copy.id)?.finished).toBe(false);

    // Filtering by id: only that operation is returned.
    const only = await operations(owner, copy.id!);
    expect(only.map((o) => o.id)).toEqual([copy.id]);
    await finishedRecord(owner, copy.id!);
  });

  test("GET /api/2.0/files/fileops - The answer to a start also carries the earlier finished records, once, and the new operation comes last", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const roomId = await createRoom(owner, "Autotest Status Handout Room");
    const first = await createFile(
      owner,
      myDocs,
      "Autotest Status Handout One.docx",
    );
    const second = await createFile(
      owner,
      myDocs,
      "Autotest Status Handout Two.docx",
    );
    const copy = (fileId: number) =>
      owner.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId: roomId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
    const one = startedOperation(
      (await copy(first)).data.response,
      FileOperationType.Copy,
    );
    // Wait for the first copy to land without reading its record.
    await expect
      .poll(() => countFiles(owner, roomId), { timeout: 30_000 })
      .toBe(1);

    const res = await copy(second);
    const answer = res.data.response ?? [];

    expect(answer.length).toBeGreaterThanOrEqual(2);
    const earlier = answer.find((o) => o.id === one.id);
    expect(earlier?.finished).toBe(true);
    const fresh = startedOperation(answer, FileOperationType.Copy);
    expect(fresh.id).not.toBe(one.id);
    expect(answer[answer.length - 1].id).toBe(fresh.id);
    // The earlier record was handed out by that answer and is not reported again.
    await finishedRecord(owner, fresh.id!);
    expect(await operations(owner)).toEqual([]);
  });

  test("GET /api/2.0/files/fileops - Another account sees none of the owner's operations by any read, and cannot stop them", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Status Isolation",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Status Isolation Room");
    const op = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    const { api: admin } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Positive control: the owner sees the running operation.
    const own = await pollOperation(
      owner,
      op.id!,
      (o) => !o.finished || o.finished,
    );
    expect(own.id).toBe(op.id);

    expect(await operations(admin)).toEqual([]);
    expect(await operations(admin, op.id!)).toEqual([]);
    const byType = await admin.operations.getOperationStatusesByType({
      operationType: FileOperationType.Copy,
    });
    expect(byType.status).toBe(200);
    expect(byType.data.response ?? []).toEqual([]);

    const stopOne = await admin.operations.terminateTasks({ id: op.id! });
    expect(stopOne.status).toBe(200);
    expect(stopOne.data.response ?? []).toEqual([]);
    const stopAll = await admin.operations.terminateTasks({ id: "" });
    expect(stopAll.status).toBe(200);

    const done = await finishedRecord(owner, op.id!);
    expect(done.error ?? "").toBe("");
    expect(done.progress).toBe(100);
    expect(await countFiles(owner, roomId)).toBe(LONG_FILES);
  });
});

test.describe("getOperationStatusesByType", () => {
  test("GET /api/2.0/files/fileops/{operationType} - Each kind returns only its own record and hands out only that one", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const roomId = await createRoom(owner, "Autotest ByType Room");
    const dir = await createFolder(owner, myDocs, "Autotest ByType Files");
    const toCopy = await createFile(owner, dir, "copy.docx");
    const toDelete = await createFile(owner, dir, "delete.docx");
    const toDuplicate = await createFile(owner, dir, "duplicate.docx");
    const toDownload = await createFile(owner, dir, "download.docx");

    const copy = startedOperation(
      (
        await owner.operations.copyBatchItems({
          batchRequestDto: {
            fileIds: [toCopy],
            destFolderId: roomId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Copy,
    );
    const del = startedOperation(
      (
        await owner.operations.deleteBatchItems({
          deleteBatchRequestDto: {
            fileIds: [toDelete],
            immediately: false,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Delete,
    );
    const dup = startedOperation(
      (
        await owner.operations.duplicateBatchItems({
          duplicateRequestDto: { fileIds: [toDuplicate as never] },
        })
      ).data.response,
      FileOperationType.Duplicate,
    );
    const download = startedOperation(
      (
        await owner.operations.bulkDownload({
          downloadRequestDto: {
            fileConvertIds: [{ key: toDownload as never, value: "" }],
          },
        })
      ).data.response,
      FileOperationType.Download,
    );

    for (const [type, started] of [
      [FileOperationType.Download, download],
      [FileOperationType.Duplicate, dup],
    ] as const) {
      let record: FileOperationDto | undefined;
      await expect(async () => {
        const res = await owner.operations.getOperationStatusesByType({
          operationType: type,
        });
        expect(res.status).toBe(200);
        const list = res.data.response ?? [];
        expect(list.map((o) => o.Operation)).toEqual([type]);
        expect(list[0].finished).toBe(true);
        record = list[0];
      }).toPass({ intervals: [100, 200, 500], timeout: 30_000 });
      expect(record!.id).toBe(started.id);
    }

    // The two kinds that were read are gone; the others are still there.
    const rest = await operations(owner);
    expect(rest.map((o) => o.id).sort()).toEqual([copy.id, del.id].sort());
  });

  test("GET /api/2.0/files/fileops/{operationType} - A kind other than the record's, or the right kind with another id, answers 200 with an empty array and keeps the record", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest ByType Mismatch.docx",
    );
    const del = startedOperation(
      (
        await owner.operations.deleteBatchItems({
          deleteBatchRequestDto: {
            fileIds: [fileId],
            immediately: false,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Delete,
    );

    const wrongKind = await owner.operations.getOperationStatusesByType({
      operationType: FileOperationType.Copy,
      id: del.id!,
    });
    expect(wrongKind.status).toBe(200);
    expect(wrongKind.data.response ?? []).toEqual([]);
    const wrongId = await owner.operations.getOperationStatusesByType({
      operationType: FileOperationType.Delete,
      id: "00000000-0000-0000-0000-000000000000",
    });
    expect(wrongId.status).toBe(200);
    expect(wrongId.data.response ?? []).toEqual([]);

    // Neither read touched the record: the right pair still returns it.
    let record: FileOperationDto | undefined;
    await expect(async () => {
      const res = await owner.operations.getOperationStatusesByType({
        operationType: FileOperationType.Delete,
        id: del.id!,
      });
      expect(res.data.response ?? []).toHaveLength(1);
      expect(res.data.response![0].finished).toBe(true);
      record = res.data.response![0];
    }).toPass({ intervals: [100, 200, 500], timeout: 30_000 });
    expect(record!.id).toBe(del.id);
  });

  test("GET /api/2.0/files/fileops/{operationType} - An active move is not mixed into the copy kind, and the general list reports it as a Move", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest ByType Move",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest ByType Move Room");
    const move = startedOperation(
      (
        await owner.operations.moveBatchItems({
          batchRequestDto: {
            folderIds: [folderId],
            content: true,
            destFolderId: roomId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Move,
    );

    const asCopy = await owner.operations.getOperationStatusesByType({
      operationType: FileOperationType.Copy,
    });
    expect(asCopy.status).toBe(200);
    expect(asCopy.data.response ?? []).toEqual([]);
    const general = await pollOperation(owner, move.id!, () => true);
    expect(general.Operation).toBe(FileOperationType.Move);

    const done = await finishedRecord(owner, move.id!);
    expect(done.error ?? "").toBe("");
    expect(await countFiles(owner, roomId)).toBe(LONG_FILES);
  });

  for (const invalid of [9, -1, "abc"]) {
    test(`GET /api/2.0/files/fileops/{operationType} - The kind ${JSON.stringify(invalid)} is rejected as an invalid request`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");

      const res = await owner.operations.getOperationStatusesByType({
        operationType: invalid as never,
      });

      expect(res.status).toBe(400);
    });
  }

  test("GET /api/2.0/files/fileops/{operationType} - An empty queue of a kind answers 200 with an empty array for every kind that can be asked", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    for (const type of [
      FileOperationType.Move,
      FileOperationType.Copy,
      FileOperationType.Delete,
      FileOperationType.Download,
      FileOperationType.MarkAsRead,
      FileOperationType.Duplicate,
    ]) {
      const res = await owner.operations.getOperationStatusesByType({
        operationType: type,
      });
      expect(res.status, `kind ${type}`).toBe(200);
      expect(res.data.response ?? [], `kind ${type}`).toEqual([]);
    }
  });
});

test.describe("terminateTasks", () => {
  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling a copy half way stops it for good: part of the files arrive, the source is whole, nothing keeps running", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Copy",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Copy Room");
    const op = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    await pollOperation(
      owner,
      op.id!,
      (o) => o.progress! >= 15 || o.finished === true,
    );

    const res = await owner.operations.terminateTasks({ id: op.id! });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.response)).toBe(true);
    const record = await finishedRecord(owner, op.id!);
    expect(record.progress).toBe(100);
    expect(record.error, "the cancellation is reported in error").toBeTruthy();
    const landed = await settled(() => countFiles(owner, roomId));
    expect(landed, "stopped before the end").toBeLessThan(LONG_FILES);
    expect(landed, "what was copied stays").toBeGreaterThan(0);
    expect(await countFiles(owner, folderId)).toBe(LONG_FILES);
    await expectNothingRunning(owner);
    const byKind = await owner.operations.getOperationStatusesByType({
      operationType: FileOperationType.Copy,
    });
    expect(byKind.data.response ?? []).toEqual([]);
  });

  test("BUG-PENDING: PUT /api/2.0/files/fileops/terminate/{id} - A cancelled operation reports the Canceled task status", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Status",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Status Room");
    const op = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    await pollOperation(
      owner,
      op.id!,
      (o) => o.progress! >= 10 || o.finished === true,
    );
    expect((await owner.operations.terminateTasks({ id: op.id! })).status).toBe(
      200,
    );
    const record = await finishedRecord(owner, op.id!);
    // Premise: the record is the cancelled one.
    expect(record.error).toBeTruthy();
    expect(record.finished).toBe(true);

    knownDefect(
      "DTO: status tells a cancelled task from one that ran to its end, but a cancelled one reports Completed (2)",
    );
    expect(record.status).toBe(DistributedTaskStatus.Canceled);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling a move half way loses nothing: every file is in the source or the destination, once, and nothing moves afterwards", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Move",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Move Room");
    const op = startedOperation(
      (
        await owner.operations.moveBatchItems({
          batchRequestDto: {
            folderIds: [folderId],
            content: true,
            destFolderId: roomId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Move,
    );
    await pollOperation(
      owner,
      op.id!,
      (o) => o.progress! >= 15 || o.finished === true,
    );

    expect((await owner.operations.terminateTasks({ id: op.id! })).status).toBe(
      200,
    );
    await finishedRecord(owner, op.id!);

    const inDest = await settled(() => countFiles(owner, roomId));
    const inSource = await settled(() => countFiles(owner, folderId));
    expect(inDest + inSource).toBe(LONG_FILES);
    expect(inDest).toBeGreaterThan(0);
    expect(inSource, "stopped before the end").toBeGreaterThan(0);
    await expectNothingRunning(owner);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling a duplication half way leaves the original whole and a partial copy that stops growing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Duplicate",
      LONG_FILES,
    );
    const op = startedOperation(
      (await startDuplicate(owner, folderId)).data.response,
      FileOperationType.Duplicate,
    );
    await pollOperation(
      owner,
      op.id!,
      (o) => o.progress! >= 15 || o.finished === true,
    );

    expect((await owner.operations.terminateTasks({ id: op.id! })).status).toBe(
      200,
    );
    await finishedRecord(owner, op.id!);

    expect(await countFiles(owner, folderId)).toBe(LONG_FILES);
    const { data } = await owner.folders.getFolderByFolderId({
      folderId: myDocs,
    });
    const copies = ((data.response?.folders ?? []) as Entry[]).filter(
      (f) =>
        f.id !== folderId &&
        (f.title ?? "").startsWith("Autotest Terminate Duplicate"),
    );
    expect(copies).toHaveLength(1);
    const copied = await settled(() => countFiles(owner, copies[0].id!));
    expect(copied).toBeLessThan(LONG_FILES);
    await expectNothingRunning(owner);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling a download half way ends it for good without ever handing out an archive address", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Download",
      LONG_FILES,
    );
    const op = startedOperation(
      (await startDownload(owner, [folderId])).data.response,
      FileOperationType.Download,
    );
    await pollOperation(
      owner,
      op.id!,
      (o) => o.progress! >= 10 || o.finished === true,
    );

    const res = await owner.operations.terminateTasks({ id: op.id! });

    expect(res.status).toBe(200);
    // A cancelled download is reported differently from a cancelled copy (its record
    // may never turn `finished`), so only what must hold either way is asserted:
    // no sample ever carries an archive address, and the record goes away.
    const samples: FileOperationDto[] = [];
    await expect(async () => {
      const [record] = await operations(owner, op.id!);
      if (record) samples.push(record);
      expect(record === undefined || record.finished === true).toBe(true);
    }).toPass({ intervals: [30, 50, 100], timeout: 30_000 });
    for (const sample of samples) {
      expect(sample.url ?? "").toBe("");
    }
    await expectNothingRunning(owner);
    const byKind = await owner.operations.getOperationStatusesByType({
      operationType: FileOperationType.Download,
    });
    expect(byKind.data.response ?? []).toEqual([]);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling right after the start stops the copy before it completes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Early",
      40,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Early Room");
    const op = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );

    const res = await owner.operations.terminateTasks({ id: op.id! });

    expect(res.status).toBe(200);
    const record = await finishedRecord(owner, op.id!);
    expect(record.error).toBeTruthy();
    expect(await settled(() => countFiles(owner, roomId))).toBeLessThan(40);
    expect(await countFiles(owner, folderId)).toBe(40);
    await expectNothingRunning(owner);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling a delete or an archiving that finishes too fast leaves a consistent state either way", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);

    await test.step("a delete of 100 files: each file is in the Trash or still in place, never lost", async () => {
      const { folderId, fileIds } = await seedFolder(
        owner,
        myDocs,
        "Autotest Terminate Delete",
        100,
      );
      const del = startedOperation(
        (
          await owner.operations.deleteBatchItems({
            deleteBatchRequestDto: {
              fileIds,
              immediately: false,
              deleteAfter: false,
            },
          })
        ).data.response,
        FileOperationType.Delete,
      );
      expect(
        (await owner.operations.terminateTasks({ id: del.id! })).status,
      ).toBe(200);
      await expectNothingRunning(owner);
      const inPlace = await settled(() => countFiles(owner, folderId));
      const { data } = await owner.folders.getTrashFolder();
      const trashed = ((data.response?.files ?? []) as Entry[]).filter((f) =>
        fileIds.includes(f.id!),
      ).length;
      expect(inPlace + trashed).toBe(100);
    });

    await test.step("an archiving: the room is archived whole or not at all, its files intact", async () => {
      const roomId = await createRoom(owner, "Autotest Terminate Archive Room");
      for (let i = 0; i < 20; i += 10) {
        await Promise.all(
          Array.from({ length: 10 }, (_, k) =>
            createFile(owner, roomId, `a${i + k}.docx`),
          ),
        );
      }
      const res = await owner.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      expect(res.status).toBe(200);
      const op = res.data.response as FileOperationDto;
      expect(
        (await owner.operations.terminateTasks({ id: op.id! })).status,
      ).toBe(200);
      await expectNothingRunning(owner);
      const { data } = await owner.rooms.getRoomInfo({ id: roomId });
      expect([20, 14]).toContain(data.response?.rootFolderType);
      expect(await settled(() => countFiles(owner, roomId))).toBe(20);
    });
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling a finished operation undoes nothing: the files stay where the operation put them", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Terminate Finished.docx",
    );
    const roomId = await createRoom(owner, "Autotest Terminate Finished Room");
    const op = startedOperation(
      (
        await owner.operations.copyBatchItems({
          batchRequestDto: {
            fileIds: [fileId],
            destFolderId: roomId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: false,
          },
        })
      ).data.response,
      FileOperationType.Copy,
    );
    await expect
      .poll(() => countFiles(owner, roomId), { timeout: 30_000 })
      .toBe(1);

    const res = await owner.operations.terminateTasks({ id: op.id! });

    expect(res.status).toBe(200);
    expect(await countFiles(owner, roomId)).toBe(1);
    expect(await countFiles(owner, myDocs)).toBeGreaterThanOrEqual(1);
    await expectNothingRunning(owner);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling the same operation twice is harmless: the second call answers 200 and nothing changes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Twice",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Twice Room");
    const op = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    await pollOperation(
      owner,
      op.id!,
      (o) => o.progress! >= 10 || o.finished === true,
    );
    expect((await owner.operations.terminateTasks({ id: op.id! })).status).toBe(
      200,
    );
    await finishedRecord(owner, op.id!);
    const landed = await settled(() => countFiles(owner, roomId));

    const again = await owner.operations.terminateTasks({ id: op.id! });

    expect(again.status).toBe(200);
    expect(again.data.response ?? []).toEqual([]);
    expect(await settled(() => countFiles(owner, roomId))).toBe(landed);
    expect(await countFiles(owner, folderId)).toBe(LONG_FILES);
  });

  test("BUG-PENDING: PUT /api/2.0/files/fileops/terminate/{id} - A whitespace-only id cancels nothing, like any id that is not the caller's operation", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Blank",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Blank Room");
    const op = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    const running = await pollOperation(
      owner,
      op.id!,
      (o) => o.progress! >= 5 && o.finished === false,
    );
    expect(running.status).toBe(DistributedTaskStatus.Running);

    const res = await owner.operations.terminateTasks({ id: " " });
    expect(res.status).toBe(200);
    const done = await finishedRecord(owner, op.id!);

    knownDefect(
      "a blank id is read as the omitted id and stops every operation of the caller",
    );
    expect(done.error ?? "").toBe("");
    expect(done.status).toBe(DistributedTaskStatus.Completed);
    expect(await countFiles(owner, roomId)).toBe(LONG_FILES);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Ids that are not the caller's operations cancel nothing: a running copy goes on to complete in full", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { folderId } = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Junk",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Junk Room");
    const op = startedOperation(
      (await startCopy(owner, folderId, roomId)).data.response,
      FileOperationType.Copy,
    );

    for (const id of [
      "00000000-0000-0000-0000-000000000000",
      "abc",
      "0",
      "-1",
      "x".repeat(300),
      "%00",
      "../fileops",
      "'; drop table",
    ]) {
      const res = await owner.operations.terminateTasks({ id });
      expect(res.status, `id ${JSON.stringify(id).slice(0, 24)}`).toBe(200);
      expect(Array.isArray(res.data.response)).toBe(true);
    }

    const done = await finishedRecord(owner, op.id!);
    expect(done.error ?? "").toBe("");
    expect(done.progress).toBe(100);
    expect(done.status).toBe(DistributedTaskStatus.Completed);
    expect(await countFiles(owner, roomId)).toBe(LONG_FILES);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Cancelling one operation leaves the other, of another kind, running to its full end", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const a = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Pair A",
      LONG_FILES,
    );
    const b = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate Pair B",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate Pair Room");
    const copy = startedOperation(
      (await startCopy(owner, a.folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    const dup = startedOperation(
      (await startDuplicate(owner, b.folderId)).data.response,
      FileOperationType.Duplicate,
    );
    await pollOperation(
      owner,
      copy.id!,
      (o) => o.progress! >= 10 || o.finished === true,
    );

    expect(
      (await owner.operations.terminateTasks({ id: copy.id! })).status,
    ).toBe(200);

    const copyRecord = await finishedRecord(owner, copy.id!);
    expect(copyRecord.error).toBeTruthy();
    const dupRecord = await finishedRecord(owner, dup.id!);
    expect(dupRecord.error ?? "").toBe("");
    expect(dupRecord.status).toBe(DistributedTaskStatus.Completed);
    expect(await settled(() => countFiles(owner, roomId))).toBeLessThan(
      LONG_FILES,
    );
    const { data } = await owner.folders.getFolderByFolderId({
      folderId: myDocs,
    });
    const duplicate = ((data.response?.folders ?? []) as Entry[]).find(
      (f) =>
        f.id !== b.folderId &&
        (f.title ?? "").startsWith("Autotest Terminate Pair B"),
    );
    expect(duplicate).toBeDefined();
    expect(await countFiles(owner, duplicate!.id!)).toBe(LONG_FILES);
    expect(await countFiles(owner, a.folderId)).toBe(LONG_FILES);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminating with an empty id stops every operation the caller is running", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const a = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate All A",
      LONG_FILES,
    );
    const b = await seedFolder(
      owner,
      myDocs,
      "Autotest Terminate All B",
      LONG_FILES,
    );
    const roomId = await createRoom(owner, "Autotest Terminate All Room");
    const copy = startedOperation(
      (await startCopy(owner, a.folderId, roomId)).data.response,
      FileOperationType.Copy,
    );
    const dup = startedOperation(
      (await startDuplicate(owner, b.folderId)).data.response,
      FileOperationType.Duplicate,
    );
    await pollOperation(
      owner,
      copy.id!,
      (o) => o.progress! >= 8 || o.finished === true,
    );
    await pollOperation(
      owner,
      dup.id!,
      (o) => o.progress! >= 5 || o.finished === true,
    );

    const res = await owner.operations.terminateTasks({ id: "" });

    expect(res.status).toBe(200);
    const copyRecord = await finishedRecord(owner, copy.id!);
    const dupRecord = await finishedRecord(owner, dup.id!);
    expect(copyRecord.error).toBeTruthy();
    expect(dupRecord.error).toBeTruthy();
    expect(await settled(() => countFiles(owner, roomId))).toBeLessThan(
      LONG_FILES,
    );
    await expectNothingRunning(owner);
    expect(await countFiles(owner, a.folderId)).toBe(LONG_FILES);
    expect(await countFiles(owner, b.folderId)).toBe(LONG_FILES);
  });
});
