import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { test } from "@/src/fixtures";
import {
  FileOperationType,
  FileShare,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { downloadAs, downloadFile } from "@/src/helpers/download";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

// bulkDownload, duplicateBatchItems, deleteFileVersions.
//
// Contract used (SDK 4.0.0 JSDoc, confirmed on the portal):
//   * bulkDownload packs the selection into one archive whose address is `url`
//     of the finished operation; only one download per caller at a time (a
//     second one while the first runs is refused with 403);
//   * duplicate copies each item next to itself under a numbered name, every
//     repetition adds a copy, a folder is copied with its content; it needs the
//     right to create in that folder (403 otherwise);
//   * deleteFileVersions removes the listed versions for good; the current
//     version is refused before anything is queued, versions that no longer
//     exist are passed over, and an EMPTY or null list is not an empty request:
//     it deletes the whole file.
//
// Observed and deliberately not pinned (the JSDoc is silent or differs):
//   * a single file "archive" is the file itself, not a zip;
//   * a single folder is packed without its own name as a path prefix, several
//     items with it (paths are compared with the prefix normalised);
//   * the numbered names given to same-named files (`same (1).bin`);
//   * where the whole file goes after an empty-list deleteFileVersions.
//
// Not applicable: "a mixed set of accessible and inaccessible files" for
// deleteFileVersions, because the method takes exactly one file.

type Api = ReturnType<ApiSDK["forRole"]>;
type Entry = { id?: number; title?: string };
type FileRef = { id?: number; version?: number };

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

/** Stores a file with exact bytes; createNewIfExist=false adds the bytes as the next version. */
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
  const res = await api.operations.uploadSession({
    folderId,
    sessionId: (session.data.response as { id?: string }).id!,
    file: new File([new Uint8Array(bytes)], fileName),
  });
  expect(res.status).toBe(201);
  const file = (res.data.response as { file?: FileRef }).file!;
  return { id: file.id!, version: file.version! };
}

/** A file whose versions 1..n hold the given contents. */
async function putVersions(
  api: Api,
  folderId: number,
  fileName: string,
  contents: Buffer[],
) {
  const first = await putFile(api, folderId, fileName, contents[0]);
  for (const bytes of contents.slice(1)) {
    await putFile(api, folderId, fileName, bytes, false);
  }
  return first.id;
}

async function listing(api: Api, folderId: number): Promise<string[]> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  expect(status).toBe(200);
  return [
    ...((data.response?.files ?? []) as Entry[]),
    ...((data.response?.folders ?? []) as Entry[]),
  ]
    .map((e) => `${e.id}:${e.title}`)
    .sort();
}

async function versionNumbers(api: Api, fileId: number): Promise<number[]> {
  const { data, status } = await api.files.getFileVersionInfo({ fileId });
  expect(status).toBe(200);
  return (data.response ?? []).map((v) => v.version!).sort((a, b) => a - b);
}

/** The bytes of one stored version, through the file's download address. */
async function versionBytes(
  apiSdk: ApiSDK,
  role: Role,
  api: Api,
  fileId: number,
  version: number,
) {
  const { data, status } = await api.files.getFileInfo({ fileId });
  expect(status).toBe(200);
  const { status: dlStatus, bytes } = await downloadAs(
    apiSdk,
    role,
    `${data.response!.viewUrl}&version=${version}`,
  );
  expect(dlStatus).toBe(200);
  return bytes;
}

async function expectContent(
  apiSdk: ApiSDK,
  role: Role,
  fileId: number,
  expected: Buffer,
) {
  const { status, bytes } = await downloadFile(apiSdk, role, fileId);
  expect(status).toBe(200);
  expect(sha256(bytes)).toBe(sha256(expected));
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

/** Minimal zip reader: file entries (path to bytes) and directory entries. */
function readZip(buffer: Buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd, "a zip end-of-central-directory record").toBeGreaterThanOrEqual(
    0,
  );
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  const directories: string[] = [];
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");
    const dataStart =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(dataStart, dataStart + compressed);
    if (name.endsWith("/")) directories.push(name);
    else files.set(name, method === 8 ? zlib.inflateRawSync(data) : data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { files, directories };
}

/** Starts a download, waits for it, fetches the archive as `role`. */
async function downloadArchive(
  apiSdk: ApiSDK,
  api: Api,
  role: Role,
  body: { fileIds?: number[]; folderIds?: number[] },
) {
  const res = await api.operations.bulkDownload({
    downloadRequestDto: body as never,
  });
  expect(res.status).toBe(200);
  const op = await waitForOperation(api.operations);
  expect(op.Operation).toBe(FileOperationType.Download);
  expect(op.finished).toBe(true);
  expect(op.error ?? "").toBe("");
  expect(op.url).toBeTruthy();
  const { status, bytes } = await downloadAs(apiSdk, role, op.url!);
  expect(status).toBe(200);
  return bytes;
}

/** Paths and SHA-256 of the files of an archive; a single common top folder is dropped. */
function archiveEntries(archive: Buffer): string[] {
  const { files } = readZip(archive);
  const paths = [...files.keys()];
  const tops = new Set(
    paths.map((p) => (p.includes("/") ? p.split("/")[0] : "")),
  );
  const strip = tops.size === 1 && !tops.has("");
  return paths
    .map(
      (p) =>
        `${strip ? p.split("/").slice(1).join("/") : p}:${sha256(files.get(p)!)}`,
    )
    .sort();
}

/** The first file entry an operation reports. */
function firstFile(op: { files?: unknown }): Entry {
  return ((op.files ?? []) as Entry[])[0];
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

/** Called after the setup assertions: from here only the violated condition may fail. */
function knownDefect(label: string) {
  test.fail(true, label);
}

test.describe("bulkDownload", () => {
  test("PUT /api/2.0/files/fileops/bulkdownload - Two files come back in one zip with every file byte-for-byte, and the sources are untouched", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Download Two");
    const one = makeBytes(300, 1);
    const two = makeBytes(400, 2);
    const a = await putFile(owner, dir, "one.bin", one);
    const b = await putFile(owner, dir, "two.bin", two);
    const before = await listing(owner, dir);

    const archive = await downloadArchive(apiSdk, owner, "owner", {
      fileIds: [a.id, b.id],
    });

    const { files } = readZip(archive);
    expect([...files.keys()].sort()).toEqual(["one.bin", "two.bin"]);
    expect(sha256(files.get("one.bin")!)).toBe(sha256(one));
    expect(sha256(files.get("two.bin")!)).toBe(sha256(two));
    expect(await listing(owner, dir)).toEqual(before);
    await expectContent(apiSdk, "owner", a.id, one);
    expect(await versionNumbers(owner, a.id)).toEqual([1]);
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - A single file is delivered with its exact bytes, as the file or as a zip holding it", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const content = makeBytes(500, 3);
    const file = await putFile(
      owner,
      myDocs,
      "Autotest Download Single.bin",
      content,
    );

    const res = await owner.operations.bulkDownload({
      downloadRequestDto: { fileIds: [file.id] } as never,
    });
    expect(res.status).toBe(200);
    const op = await waitForOperation(owner.operations);
    const { status, bytes } = await downloadAs(apiSdk, "owner", op.url!);

    expect(status).toBe(200);
    // Observed: the file itself, not a zip (the JSDoc speaks of an archive).
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    const delivered = isZip ? [...readZip(bytes).files.values()][0] : bytes;
    expect(sha256(delivered)).toBe(sha256(content));
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Files with the same name from two folders both arrive, under different names, with their own content", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dirA = await createFolder(owner, myDocs, "Autotest Download SameA");
    const dirB = await createFolder(owner, myDocs, "Autotest Download SameB");
    const fromA = makeBytes(100, 11);
    const fromB = makeBytes(120, 12);
    const a = await putFile(owner, dirA, "same.bin", fromA);
    const b = await putFile(owner, dirB, "same.bin", fromB);

    const archive = await downloadArchive(apiSdk, owner, "owner", {
      fileIds: [a.id, b.id],
    });

    const { files } = readZip(archive);
    expect(files.size).toBe(2);
    for (const name of files.keys()) expect(name.startsWith("same")).toBe(true);
    expect([...files.values()].map(sha256).sort()).toEqual(
      [sha256(fromA), sha256(fromB)].sort(),
    );
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - A folder tree is packed with every nested file at its relative path and byte-for-byte", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const root = await createFolder(owner, myDocs, "Autotest Download Tree");
    const inner = await createFolder(owner, root, "inner");
    await putFile(owner, root, "top.bin", makeBytes(60, 21));
    await putFile(owner, inner, "deep.bin", makeBytes(70, 22));
    const expected = await readTree(apiSdk, "owner", owner, root);

    const archive = await downloadArchive(apiSdk, owner, "owner", {
      folderIds: [root],
    });

    expect(archiveEntries(archive)).toEqual(expected);
    // Folders are real entries of the archive, so the structure survives extraction.
    expect(readZip(archive).directories.some((d) => d.endsWith("inner/"))).toBe(
      true,
    );
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - A mix of a file and a folder keeps the folder's files under the folder name and the file at the top", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Download Mixed Dir",
    );
    const nested = await createFolder(owner, dir, "nested");
    const loose = await putFile(
      owner,
      myDocs,
      "Autotest Download Loose.bin",
      makeBytes(50, 31),
    );
    const inDir = makeBytes(55, 32);
    const inNested = makeBytes(66, 33);
    await putFile(owner, dir, "in-dir.bin", inDir);
    await putFile(owner, nested, "in-nested.bin", inNested);

    const archive = await downloadArchive(apiSdk, owner, "owner", {
      fileIds: [loose.id],
      folderIds: [dir],
    });

    const { files } = readZip(archive);
    expect([...files.keys()].sort()).toEqual([
      "Autotest Download Loose.bin",
      "Autotest Download Mixed Dir/in-dir.bin",
      "Autotest Download Mixed Dir/nested/in-nested.bin",
    ]);
    expect(sha256(files.get("Autotest Download Mixed Dir/in-dir.bin")!)).toBe(
      sha256(inDir),
    );
    expect(
      sha256(files.get("Autotest Download Mixed Dir/nested/in-nested.bin")!),
    ).toBe(sha256(inNested));
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Two folders with same-named files keep them apart, each under its folder", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dirA = await createFolder(
      owner,
      myDocs,
      "Autotest Download FoldersA",
    );
    const dirB = await createFolder(
      owner,
      myDocs,
      "Autotest Download FoldersB",
    );
    const fromA = makeBytes(10, 41);
    const fromB = makeBytes(20, 42);
    await putFile(owner, dirA, "same.bin", fromA);
    await putFile(owner, dirB, "same.bin", fromB);

    const archive = await downloadArchive(apiSdk, owner, "owner", {
      folderIds: [dirA, dirB],
    });

    const { files } = readZip(archive);
    expect(sha256(files.get("Autotest Download FoldersA/same.bin")!)).toBe(
      sha256(fromA),
    );
    expect(sha256(files.get("Autotest Download FoldersB/same.bin")!)).toBe(
      sha256(fromB),
    );
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - An empty folder gives a valid archive without any file", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const empty = await createFolder(owner, myDocs, "Autotest Download Empty");

    const archive = await downloadArchive(apiSdk, owner, "owner", {
      folderIds: [empty],
    });

    expect(readZip(archive).files.size).toBe(0);
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - A reader of a room downloads its files byte-for-byte", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Download Reader Room");
    const first = makeBytes(210, 51);
    const second = makeBytes(220, 52);
    const a = await putFile(owner, roomId, "first.bin", first);
    const b = await putFile(owner, roomId, "second.bin", second);
    const { api: reader, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.Read);

    const archive = await downloadArchive(apiSdk, reader, "user", {
      fileIds: [a.id, b.id],
    });

    const { files } = readZip(archive);
    expect(sha256(files.get("first.bin")!)).toBe(sha256(first));
    expect(sha256(files.get("second.bin")!)).toBe(sha256(second));
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - A private file never reaches a reader: alone it is refused with 403 and queues nothing, in a mixed set it is not in the archive", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const roomId = await createRoom(owner, "Autotest Download Private Room");
    const readable = makeBytes(150, 61);
    const secret = makeBytes(160, 62);
    const roomFile = await putFile(owner, roomId, "readable.bin", readable);
    const privateFile = await putFile(
      owner,
      myDocs,
      "Autotest Download Secret.bin",
      secret,
    );
    const { api: reader, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.Read);
    // Premise: the reader really cannot read the private file.
    expect(
      (await reader.files.getFileInfo({ fileId: privateFile.id })).status,
    ).toBe(403);

    const alone = await reader.operations.bulkDownload({
      downloadRequestDto: { fileIds: [privateFile.id] } as never,
    });
    expect(alone.status).toBe(403);
    await expectNoOperationQueued(reader);

    const mixed = await reader.operations.bulkDownload({
      downloadRequestDto: { fileIds: [roomFile.id, privateFile.id] } as never,
    });
    if (mixed.status === 200) {
      const op = await waitForOperation(reader.operations);
      const { bytes } = await downloadAs(apiSdk, "user", op.url!);
      const delivered =
        bytes[0] === 0x50 && bytes[1] === 0x4b
          ? [...readZip(bytes).files.values()]
          : [bytes];
      // Positive control: the readable file is there, the secret is not.
      expect(delivered.map(sha256)).toContain(sha256(readable));
      expect(delivered.map(sha256)).not.toContain(sha256(secret));
    } else {
      expect(mixed.status).toBe(403);
    }
    await expectContent(apiSdk, "owner", privateFile.id, secret);
  });

  test("BUG-PENDING: PUT /api/2.0/files/fileops/bulkdownload - A set holding a file the caller may not read is refused with 403 as a whole", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const roomId = await createRoom(owner, "Autotest Download Refuse Room");
    const roomFile = await putFile(
      owner,
      roomId,
      "readable.bin",
      makeBytes(150, 71),
    );
    const privateFile = await putFile(
      owner,
      myDocs,
      "Autotest Download Refuse Secret.bin",
      makeBytes(160, 72),
    );
    const { api: reader, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.Read);
    // Premises: the readable file alone works, the private one alone is refused.
    await downloadArchive(apiSdk, reader, "user", { fileIds: [roomFile.id] });
    expect(
      (
        await reader.operations.bulkDownload({
          downloadRequestDto: { fileIds: [privateFile.id] } as never,
        })
      ).status,
    ).toBe(403);

    const mixed = await reader.operations.bulkDownload({
      downloadRequestDto: { fileIds: [roomFile.id, privateFile.id] } as never,
    });

    knownDefect(
      "JSDoc: an item the caller may not read fails the whole call with 403; the portal answers 200 and silently leaves it out of the archive",
    );
    expect(mixed.status).toBe(403);
  });

  test("BUG-PENDING: PUT /api/2.0/files/fileops/bulkdownload - An id that resolves to nothing is answered as missing even next to real files", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const real = await putFile(
      owner,
      myDocs,
      "Autotest Download Missing Real.bin",
      makeBytes(50, 81),
    );
    // Premise: an unknown id alone is answered as missing.
    const alone = await owner.operations.bulkDownload({
      downloadRequestDto: { fileIds: [99999999] } as never,
    });
    expect(alone.status).toBe(404);

    const mixed = await owner.operations.bulkDownload({
      downloadRequestDto: { fileIds: [real.id, 99999999] } as never,
    });

    knownDefect(
      "JSDoc: an id that resolves to nothing is answered as missing; next to a real file it is silently skipped (200)",
    );
    expect(mixed.status).toBe(404);
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - A second download while the first runs is refused with 403, the first still completes in full, and a later one works", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const big = await createFolder(owner, myDocs, "Autotest Download Busy");
    for (let i = 0; i < 60; i += 10) {
      await Promise.all(
        Array.from({ length: 10 }, (_, k) =>
          owner.files.createFile({
            folderId: big,
            createFileRequest: { title: `file ${i + k}.docx` },
          }),
        ),
      );
    }
    const small = await putFile(
      owner,
      myDocs,
      "Autotest Download Busy Small.bin",
      makeBytes(40, 91),
    );

    const first = await owner.operations.bulkDownload({
      downloadRequestDto: { folderIds: [big] } as never,
    });
    expect(first.status).toBe(200);
    const second = await owner.operations.bulkDownload({
      downloadRequestDto: { fileIds: [small.id] } as never,
    });

    expect(second.status).toBe(403);
    const op = await waitForOperation(owner.operations);
    expect(op.error ?? "").toBe("");
    const { bytes } = await downloadAs(apiSdk, "owner", op.url!);
    expect(readZip(bytes).files.size).toBe(60);

    const later = await downloadArchive(apiSdk, owner, "owner", {
      fileIds: [small.id],
    });
    expect(later.length).toBeGreaterThan(0);
  });
});

test.describe("duplicateBatchItems", () => {
  test("PUT /api/2.0/files/fileops/duplicate - A file is copied next to itself under a numbered name with the same bytes, again and again, and the original is untouched", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Duplicate One");
    const content = makeBytes(200, 101);
    const original = await putFile(owner, dir, "dup.bin", content);

    const created: Entry[] = [];
    for (let round = 0; round < 2; round++) {
      const res = await owner.operations.duplicateBatchItems({
        duplicateRequestDto: { fileIds: [original.id as never] },
      });
      expect(res.status).toBe(200);
      const op = await waitForOperation(owner.operations);
      expect(op.Operation).toBe(FileOperationType.Duplicate);
      expect(op.finished).toBe(true);
      expect(op.error ?? "").toBe("");
      expect(op.files).toHaveLength(1);
      created.push(op.files![0] as Entry);
    }

    expect(created[0].id).not.toBe(created[1].id);
    expect(created[0].title).not.toBe(created[1].title);
    for (const copy of created) {
      expect(copy.title!.startsWith("dup")).toBe(true);
      expect(copy.title).not.toBe("dup.bin");
      await expectContent(apiSdk, "owner", copy.id!, content);
    }
    expect(await listing(owner, dir)).toHaveLength(3);
    await expectContent(apiSdk, "owner", original.id, content);
    expect(await versionNumbers(owner, original.id)).toEqual([1]);
  });

  test("PUT /api/2.0/files/fileops/duplicate - A copy is independent: a new version of the original and then its deletion leave the copy as it was", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Duplicate Independent",
    );
    const content = makeBytes(300, 111);
    const original = await putFile(owner, dir, "indep.bin", content);
    await owner.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [original.id as never] },
    });
    const copyId = firstFile(await waitForOperation(owner.operations)).id!;

    await putFile(owner, dir, "indep.bin", makeBytes(310, 112), false);
    await expectContent(apiSdk, "owner", original.id, makeBytes(310, 112));
    await expectContent(apiSdk, "owner", copyId, content);

    await owner.operations.deleteBatchItems({
      deleteBatchRequestDto: {
        fileIds: [original.id],
        immediately: true,
        deleteAfter: false,
      },
    });
    await waitForOperation(owner.operations);
    await expectContent(apiSdk, "owner", copyId, content);
  });

  test("PUT /api/2.0/files/fileops/duplicate - A file with two versions is copied with its latest content and the original keeps both versions", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Duplicate Versions",
    );
    const v1 = makeBytes(50, 121);
    const v2 = makeBytes(60, 122);
    const id = await putVersions(owner, dir, "versioned.bin", [v1, v2]);

    await owner.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [id as never] },
    });
    const copy = firstFile(await waitForOperation(owner.operations));

    await expectContent(apiSdk, "owner", copy.id!, v2);
    expect(await versionNumbers(owner, id)).toEqual([1, 2]);
    expect(sha256(await versionBytes(apiSdk, "owner", owner, id, 1))).toBe(
      sha256(v1),
    );
    expect(sha256(await versionBytes(apiSdk, "owner", owner, id, 2))).toBe(
      sha256(v2),
    );
  });

  test("PUT /api/2.0/files/fileops/duplicate - Several files in one call each get a copy with the right bytes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Duplicate Several");
    const contents = [
      makeBytes(30, 131),
      makeBytes(40, 132),
      makeBytes(50, 133),
    ];
    const ids: number[] = [];
    for (const [i, bytes] of contents.entries()) {
      ids.push((await putFile(owner, dir, `item${i}.bin`, bytes)).id);
    }

    await owner.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: ids as never[] },
    });
    const op = await waitForOperation(owner.operations);

    expect(op.files).toHaveLength(3);
    const copies = await Promise.all(
      (op.files as Entry[]).map(async (f) => {
        const { bytes } = await downloadFile(apiSdk, "owner", f.id!);
        return sha256(bytes);
      }),
    );
    expect(copies.sort()).toEqual(contents.map(sha256).sort());
    expect(await listing(owner, dir)).toHaveLength(6);
  });

  test("PUT /api/2.0/files/fileops/duplicate - A folder tree is copied with every file byte-for-byte, and the copy survives the deletion of the original", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const root = await createFolder(owner, myDocs, "Autotest Duplicate Tree");
    const level = await createFolder(owner, root, "Level");
    await putFile(owner, root, "root.bin", makeBytes(10, 141));
    await putFile(owner, level, "level.bin", makeBytes(20, 142));
    const original = await readTree(apiSdk, "owner", owner, root);
    const before = await listing(owner, myDocs);

    await owner.operations.duplicateBatchItems({
      duplicateRequestDto: { folderIds: [root as never] },
    });
    const op = await waitForOperation(owner.operations);
    expect(op.error ?? "").toBe("");

    const after = await listing(owner, myDocs);
    const added = after.filter((e) => !before.includes(e));
    expect(added).toHaveLength(1);
    const copyRoot = Number(added[0].split(":")[0]);
    expect(copyRoot).not.toBe(root);
    expect(added[0].includes("Autotest Duplicate Tree")).toBe(true);
    expect(await readTree(apiSdk, "owner", owner, copyRoot)).toEqual(original);

    await owner.operations.deleteBatchItems({
      deleteBatchRequestDto: {
        folderIds: [root],
        immediately: true,
        deleteAfter: false,
      },
    });
    await waitForOperation(owner.operations);
    expect(await readTree(apiSdk, "owner", owner, copyRoot)).toEqual(original);
  });

  test("PUT /api/2.0/files/fileops/duplicate - A repeated id adds one more copy per occurrence, each with the original's bytes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Duplicate Repeat");
    const content = makeBytes(64, 151);
    const original = await putFile(owner, dir, "rep.bin", content);

    await owner.operations.duplicateBatchItems({
      duplicateRequestDto: {
        fileIds: [original.id as never, original.id as never],
      },
    });
    const op = await waitForOperation(owner.operations);

    expect(op.files).toHaveLength(2);
    const titles = (op.files as Entry[]).map((f) => f.title);
    expect(new Set(titles).size).toBe(2);
    for (const copy of op.files as Entry[]) {
      await expectContent(apiSdk, "owner", copy.id!, content);
    }
    expect(await listing(owner, dir)).toHaveLength(3);
  });

  test("PUT /api/2.0/files/fileops/duplicate - A numbered name that is already taken is skipped: nothing is overwritten", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Duplicate Taken");
    const content = makeBytes(80, 161);
    const taken = makeBytes(90, 162);
    const original = await putFile(owner, dir, "taken.bin", content);
    const squatter = await putFile(owner, dir, "taken (1).bin", taken);

    await owner.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [original.id as never] },
    });
    const copy = firstFile(await waitForOperation(owner.operations));

    expect(copy.id).not.toBe(squatter.id);
    expect(copy.title).not.toBe("taken (1).bin");
    await expectContent(apiSdk, "owner", copy.id!, content);
    await expectContent(apiSdk, "owner", squatter.id, taken);
    expect(await listing(owner, dir)).toHaveLength(3);
  });

  test("PUT /api/2.0/files/fileops/duplicate - A set mixing a file the caller may duplicate and one they may not is refused with 403 as a whole and nothing is copied", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const roomId = await createRoom(owner, "Autotest Duplicate Mixed Room");
    const { api: creator, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.ContentCreator);
    const own = await putFile(owner, roomId, "own.bin", makeBytes(30, 171));
    const privateFile = await putFile(
      owner,
      myDocs,
      "Autotest Duplicate Private.bin",
      makeBytes(30, 172),
    );

    // Positive control: the same user may duplicate the room file alone.
    const alone = await creator.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [own.id as never] },
    });
    expect(alone.status).toBe(200);
    await waitForOperation(creator.operations);
    const afterControl = await listing(owner, roomId);
    expect(afterControl).toHaveLength(2);

    const res = await creator.operations.duplicateBatchItems({
      duplicateRequestDto: {
        fileIds: [own.id as never, privateFile.id as never],
      },
    });

    expect(res.status).toBe(403);
    await expectNoOperationQueued(creator);
    expect(await listing(owner, roomId)).toEqual(afterControl);
    expect(
      (await listing(owner, myDocs)).filter((e) =>
        e.includes("Autotest Duplicate Private"),
      ),
    ).toHaveLength(1);
  });

  test("PUT /api/2.0/files/fileops/duplicate - Users are isolated: a user's copy lands in their own documents, and they cannot copy the owner's private file", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const ownerFile = await putFile(
      owner,
      myDocs,
      "Autotest Duplicate Isolation Owner.bin",
      makeBytes(30, 181),
    );
    const { api: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    const userDocs = await getMyDocsId(user);
    const content = makeBytes(40, 182);
    const userFile = await putFile(
      user,
      userDocs,
      "Autotest Duplicate Isolation User.bin",
      content,
    );
    const ownerBefore = await listing(owner, myDocs);

    const stolen = await user.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [ownerFile.id as never] },
    });
    expect(stolen.status).toBe(403);
    expect(await listing(owner, myDocs)).toEqual(ownerBefore);

    const own = await user.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [userFile.id as never] },
    });
    expect(own.status).toBe(200);
    const copy = firstFile(await waitForOperation(user.operations));
    await expectContent(apiSdk, "user", copy.id!, content);
    expect(
      (await listing(user, userDocs)).some((e) => e.startsWith(`${copy.id}:`)),
    ).toBe(true);
    expect(await listing(owner, myDocs)).toEqual(ownerBefore);
  });
});

test.describe("deleteFileVersions", () => {
  test("PUT /api/2.0/files/fileops/deleteversion - Deleting one old version leaves the others with their own content and the file in place", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Versions One");
    const contents = [
      makeBytes(101, 201),
      makeBytes(102, 202),
      makeBytes(103, 203),
      makeBytes(104, 204),
    ];
    const id = await putVersions(owner, dir, "history.bin", contents);
    expect(await versionNumbers(owner, id)).toEqual([1, 2, 3, 4]);

    const res = await owner.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: id, versions: [2] },
    });
    expect(res.status).toBe(200);
    const op = await waitForOperation(owner.operations);
    expect(op.Operation).toBe(FileOperationType.Delete);
    expect(op.finished).toBe(true);
    expect(op.error ?? "").toBe("");

    expect(await versionNumbers(owner, id)).toEqual([1, 3, 4]);
    for (const version of [1, 3, 4]) {
      expect(
        sha256(await versionBytes(apiSdk, "owner", owner, id, version)),
      ).toBe(sha256(contents[version - 1]));
    }
    await expectContent(apiSdk, "owner", id, contents[3]);
    expect(
      (await listing(owner, dir)).some((e) => e.startsWith(`${id}:`)),
    ).toBe(true);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Several versions at once: the rest keep their numbers and content, the current content is unchanged", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Versions Several");
    const contents = [
      makeBytes(111, 211),
      makeBytes(112, 212),
      makeBytes(113, 213),
      makeBytes(114, 214),
    ];
    const id = await putVersions(owner, dir, "several.bin", contents);

    await owner.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: id, versions: [1, 3] },
    });
    const op = await waitForOperation(owner.operations);
    expect(op.error ?? "").toBe("");

    expect(await versionNumbers(owner, id)).toEqual([2, 4]);
    expect(sha256(await versionBytes(apiSdk, "owner", owner, id, 2))).toBe(
      sha256(contents[1]),
    );
    expect(sha256(await versionBytes(apiSdk, "owner", owner, id, 4))).toBe(
      sha256(contents[3]),
    );
    await expectContent(apiSdk, "owner", id, contents[3]);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - The current version is refused before anything is queued, alone or among older ones, and the history is untouched", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Versions Current");
    const contents = [
      makeBytes(21, 221),
      makeBytes(22, 222),
      makeBytes(23, 223),
    ];
    const id = await putVersions(owner, dir, "current.bin", contents);

    const alone = await owner.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: id, versions: [3] },
    });
    const among = await owner.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: id, versions: [1, 3] },
    });

    expectClientError(alone.status);
    expectClientError(among.status);
    await expectNoOperationQueued(owner);
    expect(await versionNumbers(owner, id)).toEqual([1, 2, 3]);
    for (const version of [1, 2, 3]) {
      expect(
        sha256(await versionBytes(apiSdk, "owner", owner, id, version)),
      ).toBe(sha256(contents[version - 1]));
    }
  });

  test("PUT /api/2.0/files/fileops/deleteversion - The only version is the current one and cannot be deleted", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const content = makeBytes(33, 231);
    const file = await putFile(
      owner,
      myDocs,
      "Autotest Versions Only.bin",
      content,
    );

    const res = await owner.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: file.id, versions: [1] },
    });

    expectClientError(res.status);
    expect(await versionNumbers(owner, file.id)).toEqual([1]);
    await expectContent(apiSdk, "owner", file.id, content);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Versions that do not exist, and a version that was already deleted, are passed over without a complaint", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Versions Twice");
    const contents = [
      makeBytes(41, 241),
      makeBytes(42, 242),
      makeBytes(43, 243),
    ];
    const id = await putVersions(owner, dir, "twice.bin", contents);
    await owner.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: id, versions: [1] },
    });
    await waitForOperation(owner.operations);
    expect(await versionNumbers(owner, id)).toEqual([2, 3]);

    for (const versions of [[1], [99], [1, 99]]) {
      const res = await owner.operations.deleteFileVersions({
        deleteVersionBatchRequestDto: { fileId: id, versions },
      });
      expect(res.status, JSON.stringify(versions)).toBe(200);
      const op = await waitForOperation(owner.operations);
      expect(op.error ?? "", JSON.stringify(versions)).toBe("");
      expect(await versionNumbers(owner, id)).toEqual([2, 3]);
    }
    expect(sha256(await versionBytes(apiSdk, "owner", owner, id, 2))).toBe(
      sha256(contents[1]),
    );
    await expectContent(apiSdk, "owner", id, contents[2]);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - An empty or null version list is not an empty request: it deletes the whole file (documented), and only that file", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Versions Trap");
    const bystander = makeBytes(55, 251);
    const bystanderFile = await putFile(owner, dir, "bystander.bin", bystander);
    const victims: number[] = [];
    for (const label of ["empty", "null"]) {
      victims.push(
        await putVersions(owner, dir, `victim-${label}.bin`, [
          makeBytes(31, 252),
          makeBytes(32, 253),
        ]),
      );
    }

    for (const [i, versions] of [[] as number[], null].entries()) {
      const res = await owner.operations.deleteFileVersions({
        deleteVersionBatchRequestDto: { fileId: victims[i], versions },
      });
      expect(res.status).toBe(200);
      await waitForOperation(owner.operations);
    }

    for (const victim of victims) {
      expect((await owner.files.getFileInfo({ fileId: victim })).status).toBe(
        404,
      );
      expect(
        (await listing(owner, dir)).some((e) => e.startsWith(`${victim}:`)),
      ).toBe(false);
    }
    expect(
      (await listing(owner, dir)).some((e) =>
        e.startsWith(`${bystanderFile.id}:`),
      ),
    ).toBe(true);
    await expectContent(apiSdk, "owner", bystanderFile.id, bystander);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Deleting versions of one file does not touch the versions or content of another", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(
      owner,
      myDocs,
      "Autotest Versions Neighbour",
    );
    const targetContents = [makeBytes(61, 261), makeBytes(62, 262)];
    const neighbourContents = [makeBytes(71, 271), makeBytes(72, 272)];
    const target = await putVersions(owner, dir, "target.bin", targetContents);
    const neighbour = await putVersions(
      owner,
      dir,
      "neighbour.bin",
      neighbourContents,
    );

    await owner.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: target, versions: [1] },
    });
    await waitForOperation(owner.operations);

    expect(await versionNumbers(owner, target)).toEqual([2]);
    expect(await versionNumbers(owner, neighbour)).toEqual([1, 2]);
    expect(
      sha256(await versionBytes(apiSdk, "owner", owner, neighbour, 1)),
    ).toBe(sha256(neighbourContents[0]));
    expect(
      sha256(await versionBytes(apiSdk, "owner", owner, neighbour, 2)),
    ).toBe(sha256(neighbourContents[1]));
  });

  test("PUT /api/2.0/files/fileops/deleteversion - A reader of the room is refused with 403 and the history and content stay as they were", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Versions Reader Room");
    const contents = [
      makeBytes(81, 281),
      makeBytes(82, 282),
      makeBytes(83, 283),
    ];
    const id = await putVersions(owner, roomId, "guarded.bin", contents);
    const { api: reader, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.Read);

    const res = await reader.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: id, versions: [1] },
    });

    expect(res.status).toBe(403);
    await expectNoOperationQueued(reader);
    expect(await versionNumbers(owner, id)).toEqual([1, 2, 3]);
    expect(sha256(await versionBytes(apiSdk, "owner", owner, id, 1))).toBe(
      sha256(contents[0]),
    );
  });
});
