import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { test } from "@/src/fixtures";
import {
  FileOperationType,
  FileShare,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { downloadFile } from "@/src/helpers/download";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

// markAsRead, updateFileComment, addFavorites, deleteFavoritesFromBody.
//
// Contract used (SDK 4.0.0 JSDoc, confirmed on the portal):
//   * markAsRead clears only the caller's new-item badges; items the caller
//     cannot read are passed over in silence, nothing is modified, other members
//     keep their badges;
//   * updateFileComment replaces the comment of ONE existing version, an empty
//     comment clears it, the caller needs the right to edit the file's history
//     (read-only access and a file in Trash are refused), a version that does
//     not exist is a 400 and a file that does not exist a 404;
//   * favorites are personal: another member is unaffected, items the caller
//     cannot read or that do not exist are skipped with `true` as the answer,
//     repeating is safe, an item in Trash keeps its mark and is hidden until
//     it is restored, and removing a mark deletes nothing.
//
// Observed and deliberately not pinned (the JSDoc differs):
//   * the comment limit is 255 characters and a longer text is rejected with a
//     400, while the JSDoc says the text is "cut to the length the portal
//     keeps" (BUG 82266 in the existing suite expects the 400).

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

async function createFolder(api: Api, folderId: number, title: string) {
  const { data, status } = await api.folders.createFolder({
    folderId,
    createFolderRequest: { title },
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

/**
 * Several signed-in members in one test: all are created first and then signed
 * in one after another, because every sign-in puts that member's session on the
 * shared request context.
 */
async function members<T extends ("User" | "RoomAdmin")[]>(
  apiSdk: ApiSDK,
  types: T,
) {
  const created = [];
  for (const type of types) created.push(await apiSdk.addMember("owner", type));
  const apis: Api[] = [];
  for (const [i, type] of types.entries()) {
    apis.push(await apiSdk.authenticateMember(created[i].userData, type));
  }
  return created.map((m, i) => ({ api: apis[i], id: m.data.response!.id! }));
}

async function newTitles(api: Api, roomId: number): Promise<string[]> {
  const { data, status } = await api.rooms.getNewRoomItems({ id: roomId });
  expect(status).toBe(200);
  return (data.response ?? [])
    .flatMap((group) => group.items ?? [])
    .map((item) => item.title!)
    .sort();
}

async function waitForNew(api: Api, roomId: number, titles: string[]) {
  await expect
    .poll(
      async () => {
        const current = await newTitles(api, roomId);
        return titles.every((t) => current.includes(t));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

async function commentsOf(api: Api, fileId: number) {
  const { data, status } = await api.files.getFileVersionInfo({ fileId });
  expect(status).toBe(200);
  return Object.fromEntries(
    (data.response ?? []).map((v) => [v.version!, v.comment ?? ""]),
  ) as Record<number, string>;
}

const setComment = (
  api: Api,
  fileId: number,
  version: number,
  comment: string | null,
) =>
  api.operations.updateFileComment({
    fileId,
    updateCommentRequest: { version, comment },
  });

async function favorites(api: Api): Promise<string[]> {
  const { data, status } = await api.folders.getFavoritesFolder();
  expect(status).toBe(200);
  return [
    ...((data.response?.files ?? []) as Entry[]),
    ...((data.response?.folders ?? []) as Entry[]),
  ]
    .map((e) => e.title!)
    .sort();
}

const addFavorites = (api: Api, fileIds: number[], folderIds: number[] = []) =>
  api.operations.addFavorites({
    baseBatchRequestDto: {
      fileIds: fileIds as never[],
      folderIds: folderIds as never[],
    },
  });

const removeFavorites = (
  api: Api,
  fileIds: number[],
  folderIds: number[] = [],
) =>
  api.operations.deleteFavoritesFromBody({
    baseBatchRequestDto: {
      fileIds: fileIds as never[],
      folderIds: folderIds as never[],
    },
  });

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

/** Called after the setup assertions: from here only the violated condition may fail. */
function knownDefect(label: string) {
  test.fail(true, label);
}

function expectClientError(status: number) {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

test.describe("markAsRead", () => {
  test("PUT /api/2.0/files/fileops/markasread - Marking a file clears only the caller's badge for it, another member keeps theirs, and repeating changes nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest MarkRead Isolation Room");
    const [reader, other] = await members(apiSdk, ["User", "RoomAdmin"]);
    await invite(owner, roomId, reader.id, FileShare.Read);
    await invite(owner, roomId, other.id, FileShare.Read);
    const first = await createFile(owner, roomId, "Autotest MarkRead One.docx");
    await createFile(owner, roomId, "Autotest MarkRead Two.docx");
    const both = ["Autotest MarkRead One.docx", "Autotest MarkRead Two.docx"];
    await waitForNew(reader.api, roomId, both);
    await waitForNew(other.api, roomId, both);
    const { bytes: before } = await downloadFile(apiSdk, "owner", first);

    const res = await reader.api.operations.markAsRead({
      baseBatchRequestDto: { fileIds: [first as never] },
    });
    expect(res.status).toBe(200);
    const op = await waitForOperation(reader.api.operations);
    expect(op.Operation).toBe(FileOperationType.MarkAsRead);
    expect(op.finished).toBe(true);
    expect(op.error ?? "").toBe("");

    await expect
      .poll(() => newTitles(reader.api, roomId), { timeout: 30_000 })
      .toEqual(["Autotest MarkRead Two.docx"]);
    expect(await newTitles(other.api, roomId)).toEqual(both);

    // Repeating on an item that is already read changes nothing.
    const again = await reader.api.operations.markAsRead({
      baseBatchRequestDto: { fileIds: [first as never] },
    });
    expect(again.status).toBe(200);
    expect((await waitForOperation(reader.api.operations)).error ?? "").toBe(
      "",
    );
    expect(await newTitles(reader.api, roomId)).toEqual([
      "Autotest MarkRead Two.docx",
    ]);
    expect(await newTitles(other.api, roomId)).toEqual(both);

    // Nothing was opened, moved or modified.
    const { bytes: after } = await downloadFile(apiSdk, "owner", first);
    expect(sha256(after)).toBe(sha256(before));
    const info = await owner.files.getFileInfo({ fileId: first });
    expect(info.data.response?.version).toBe(1);
    expect(info.data.response?.folderId).toBe(roomId);
  });

  test("PUT /api/2.0/files/fileops/markasread - Several files, with a repeated id, are all cleared for the caller", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest MarkRead Several Room");
    const [reader] = await members(apiSdk, ["User"]);
    await invite(owner, roomId, reader.id, FileShare.Read);
    const a = await createFile(owner, roomId, "Autotest MarkRead SevA.docx");
    const b = await createFile(owner, roomId, "Autotest MarkRead SevB.docx");
    await createFile(owner, roomId, "Autotest MarkRead SevC.docx");
    await waitForNew(reader.api, roomId, [
      "Autotest MarkRead SevA.docx",
      "Autotest MarkRead SevB.docx",
      "Autotest MarkRead SevC.docx",
    ]);

    const res = await reader.api.operations.markAsRead({
      baseBatchRequestDto: { fileIds: [a as never, b as never, a as never] },
    });
    expect(res.status).toBe(200);
    expect((await waitForOperation(reader.api.operations)).error ?? "").toBe(
      "",
    );

    await expect
      .poll(() => newTitles(reader.api, roomId), { timeout: 30_000 })
      .toEqual(["Autotest MarkRead SevC.docx"]);
  });

  test("PUT /api/2.0/files/fileops/markasread - A file the caller cannot read is passed over in silence, the readable one is still cleared", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const roomId = await createRoom(owner, "Autotest MarkRead Private Room");
    const [reader] = await members(apiSdk, ["User"]);
    await invite(owner, roomId, reader.id, FileShare.Read);
    const readable = await createFile(
      owner,
      roomId,
      "Autotest MarkRead Readable.docx",
    );
    const secret = makeBytes(40, 31);
    const privateFile = await putFile(
      owner,
      myDocs,
      "Autotest MarkRead Secret.bin",
      secret,
    );
    await waitForNew(reader.api, roomId, ["Autotest MarkRead Readable.docx"]);
    // Premise: the reader cannot read the private file.
    expect(
      (await reader.api.files.getFileInfo({ fileId: privateFile.id })).status,
    ).toBe(403);

    const mixed = await reader.api.operations.markAsRead({
      baseBatchRequestDto: {
        fileIds: [readable as never, privateFile.id as never],
      },
    });
    expect(mixed.status).toBe(200);
    const op = await waitForOperation(reader.api.operations);
    expect(op.finished).toBe(true);
    expect(op.error ?? "").toBe("");
    await expect
      .poll(() => newTitles(reader.api, roomId), { timeout: 30_000 })
      .toEqual([]);

    // Even a selection that is entirely inaccessible succeeds and changes nothing.
    const onlyPrivate = await reader.api.operations.markAsRead({
      baseBatchRequestDto: { fileIds: [privateFile.id as never] },
    });
    expect(onlyPrivate.status).toBe(200);
    expect((await waitForOperation(reader.api.operations)).error ?? "").toBe(
      "",
    );
    await expectContent(apiSdk, "owner", privateFile.id, secret);
  });

  test("PUT /api/2.0/files/fileops/markasread - An id that does not exist is passed over and a real file next to it is cleared", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest MarkRead Missing Room");
    const [reader] = await members(apiSdk, ["User"]);
    await invite(owner, roomId, reader.id, FileShare.Read);
    const real = await createFile(owner, roomId, "Autotest MarkRead Real.docx");
    await waitForNew(reader.api, roomId, ["Autotest MarkRead Real.docx"]);

    const res = await reader.api.operations.markAsRead({
      baseBatchRequestDto: { fileIds: [real as never, 99999999 as never] },
    });

    expect(res.status).toBe(200);
    expect((await waitForOperation(reader.api.operations)).error ?? "").toBe(
      "",
    );
    await expect
      .poll(() => newTitles(reader.api, roomId), { timeout: 30_000 })
      .toEqual([]);
  });
});

test.describe("updateFileComment", () => {
  test("PUT /api/2.0/files/file/{fileId}/comment - A comment is set on one version only, read back from the history, and repeating the same text leaves it as it is", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Version Room");
    const id = await putVersions(owner, roomId, "versions.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
      makeBytes(12, 3),
    ]);
    const initial = await commentsOf(owner, id);
    expect(Object.keys(initial)).toEqual(["1", "2", "3"]);

    const set = await setComment(owner, id, 2, "second version note");
    expect(set.status).toBe(200);
    expect(set.data.response).toBe("second version note");

    expect(await commentsOf(owner, id)).toEqual({
      ...initial,
      2: "second version note",
    });

    const replaced = await setComment(owner, id, 2, "replaced note");
    expect(replaced.data.response).toBe("replaced note");
    const repeated = await setComment(owner, id, 2, "replaced note");
    expect(repeated.status).toBe(200);
    expect(repeated.data.response).toBe("replaced note");
    expect(await commentsOf(owner, id)).toEqual({
      ...initial,
      2: "replaced note",
    });
    // The file itself is not touched by a comment.
    await expectContent(apiSdk, "owner", id, makeBytes(12, 3));
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - An empty or null comment clears the note and only that note", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Clear Room");
    const id = await putVersions(owner, roomId, "clear.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
      makeBytes(12, 3),
    ]);
    await setComment(owner, id, 1, "note one");
    await setComment(owner, id, 2, "note two");
    const before = await commentsOf(owner, id);

    expect((await setComment(owner, id, 1, "")).data.response).toBe("");
    expect(await commentsOf(owner, id)).toEqual({ ...before, 1: "" });
    expect((await setComment(owner, id, 2, null)).data.response).toBe("");
    expect(await commentsOf(owner, id)).toEqual({ ...before, 1: "", 2: "" });
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Cyrillic and other Unicode letters, markup, quotes and line breaks are stored exactly as sent", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Text Room");
    const id = await putVersions(owner, roomId, "text.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
    ]);

    for (const text of [
      "Привет, мир — «тест» ñ ü 日本語",
      "<b>bold</b> & <script>alert(1)</script>",
      "quotes \" ' backslash \\ percent %",
      "first line\nsecond line\ttab",
      "  padded  ",
    ]) {
      const res = await setComment(owner, id, 2, text);
      expect(res.status, text).toBe(200);
      expect(res.data.response, text).toBe(text);
      expect((await commentsOf(owner, id))[2], text).toBe(text);
    }
  });

  test("BUG-PENDING: PUT /api/2.0/files/file/{fileId}/comment - A character outside the Basic Multilingual Plane, such as an emoji, is stored as sent", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Emoji Room");
    const id = await putVersions(owner, roomId, "emoji.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
    ]);
    // Premise: ordinary non-Latin text round-trips.
    const plain = await setComment(owner, id, 2, "Привет");
    expect(plain.data.response).toBe("Привет");
    expect((await commentsOf(owner, id))[2]).toBe("Привет");

    const text = "note 😀 done";
    const res = await setComment(owner, id, 2, text);
    expect(res.status).toBe(200);
    // The answer claims the text "as it was stored".
    expect(res.data.response).toBe(text);

    knownDefect(
      "the answer echoes the emoji but the history stores a question mark in its place",
    );
    expect((await commentsOf(owner, id))[2]).toBe(text);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - A comment of 255 characters is stored in full; a longer one is rejected and the stored text stays", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Limit Room");
    const id = await putVersions(owner, roomId, "limit.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
    ]);
    const full = "a".repeat(255);

    const ok = await setComment(owner, id, 2, full);
    expect(ok.status).toBe(200);
    expect(ok.data.response).toBe(full);
    expect((await commentsOf(owner, id))[2]).toBe(full);

    for (const length of [256, 1000]) {
      const tooLong = await setComment(owner, id, 2, "b".repeat(length));
      expectClientError(tooLong.status);
      expect((await commentsOf(owner, id))[2], `after ${length}`).toBe(full);
    }
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - A reader is refused with 403 and the comment stays", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Reader Room");
    const id = await putVersions(owner, roomId, "guarded.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
    ]);
    await setComment(owner, id, 1, "original note");
    const { api: reader, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.Read);

    const res = await setComment(reader, id, 1, "reader was here");

    expect(res.status).toBe(403);
    expect((await commentsOf(owner, id))[1]).toBe("original note");
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - A content creator and a room manager may comment, on their own and on somebody else's files, and every comment reads back", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Rights Room");
    const [creator, manager] = await members(apiSdk, ["User", "RoomAdmin"]);
    await invite(owner, roomId, creator.id, FileShare.ContentCreator);
    await invite(owner, roomId, manager.id, FileShare.RoomManager);
    const own = await putVersions(creator.api, roomId, "creator.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
    ]);
    const foreign = await putVersions(owner, roomId, "foreign.bin", [
      makeBytes(12, 3),
      makeBytes(13, 4),
    ]);

    const byCreator = await setComment(creator.api, own, 2, "creator note");
    expect(byCreator.status).toBe(200);
    expect((await commentsOf(owner, own))[2]).toBe("creator note");

    const byManager = await setComment(manager.api, foreign, 1, "manager note");
    expect(byManager.status).toBe(200);
    expect((await commentsOf(owner, foreign))[1]).toBe("manager note");

    // The JSDoc names content creators among those who may edit the history, so the
    // same user may also comment on a file somebody else uploaded.
    const onForeign = await setComment(
      creator.api,
      foreign,
      2,
      "creator on foreign",
    );
    expect(onForeign.status).toBe(200);
    expect((await commentsOf(owner, foreign))[2]).toBe("creator on foreign");
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - A file in the Trash is refused and its comment is the same after restoring it", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const id = await putVersions(owner, myDocs, "Autotest Comment Trash.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
    ]);
    await setComment(owner, id, 1, "before trash");
    await owner.operations.deleteBatchItems({
      deleteBatchRequestDto: {
        fileIds: [id],
        immediately: false,
        deleteAfter: false,
      },
    });
    await waitForOperation(owner.operations);

    const res = await setComment(owner, id, 1, "while in trash");

    expectClientError(res.status);
    await owner.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [id],
        destFolderId: myDocs,
        deleteAfter: false,
      },
    });
    await waitForOperation(owner.operations);
    expect((await commentsOf(owner, id))[1]).toBe("before trash");
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Concurrent updates never fail or corrupt: the last of several writes to one version wins whole, different versions keep their own", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Comment Concurrent Room");
    const id = await putVersions(owner, roomId, "concurrent.bin", [
      makeBytes(10, 1),
      makeBytes(11, 2),
      makeBytes(12, 3),
    ]);
    const texts = ["alpha", "bravo", "charlie", "delta", "echo"].map(
      (w) => `concurrent ${w}`,
    );

    const results = await Promise.all(
      texts.map((t) => setComment(owner, id, 1, t)),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(texts).toContain((await commentsOf(owner, id))[1]);

    await Promise.all([
      setComment(owner, id, 1, "parallel one"),
      setComment(owner, id, 2, "parallel two"),
      setComment(owner, id, 3, "parallel three"),
    ]);
    expect(await commentsOf(owner, id)).toEqual({
      1: "parallel one",
      2: "parallel two",
      3: "parallel three",
    });
  });
});

test.describe("addFavorites and deleteFavoritesFromBody", () => {
  test("POST /api/2.0/files/favorites - Favorites are personal: each member has their own list, removing a mark leaves the other member's, and the file itself stays", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Favorites Personal Room");
    const [first, second] = await members(apiSdk, ["User", "RoomAdmin"]);
    await invite(owner, roomId, first.id, FileShare.Read);
    await invite(owner, roomId, second.id, FileShare.Read);
    const content = makeBytes(90, 301);
    const file = await putFile(
      owner,
      roomId,
      "Autotest Favorites Shared.bin",
      content,
    );
    const title = "Autotest Favorites Shared.bin";

    expect((await addFavorites(first.api, [file.id])).data.response).toBe(true);
    expect(await favorites(first.api)).toContain(title);
    expect(await favorites(second.api)).not.toContain(title);
    expect(await favorites(owner)).not.toContain(title);

    await addFavorites(second.api, [file.id]);
    expect(await favorites(second.api)).toContain(title);

    expect((await removeFavorites(first.api, [file.id])).data.response).toBe(
      true,
    );
    expect(await favorites(first.api)).not.toContain(title);
    expect(await favorites(second.api)).toContain(title);
    // Removing again, by the member who no longer has it, takes nothing from the other.
    expect((await removeFavorites(first.api, [file.id])).data.response).toBe(
      true,
    );
    expect(await favorites(second.api)).toContain(title);

    // The mark was never the file: it is where it was, with its content, for everybody.
    expect((await owner.files.getFileInfo({ fileId: file.id })).status).toBe(
      200,
    );
    await expectContent(apiSdk, "owner", file.id, content);
    await expectContent(apiSdk, "roomAdmin", file.id, content);
  });

  test("POST /api/2.0/files/favorites - Several files and a folder are marked and unmarked together, and nothing is deleted", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dir = await createFolder(owner, myDocs, "Autotest Favorites Many");
    const inner = makeBytes(20, 311);
    const a = await putFile(
      owner,
      dir,
      "Autotest Favorites A.bin",
      makeBytes(10, 310),
    );
    const b = await putFile(
      owner,
      dir,
      "Autotest Favorites B.bin",
      makeBytes(11, 312),
    );
    const folder = await createFolder(owner, dir, "Autotest Favorites Folder");
    const nested = await putFile(owner, folder, "inner.bin", inner);

    await addFavorites(owner, [a.id, b.id], [folder]);
    const marked = await favorites(owner);
    for (const title of [
      "Autotest Favorites A.bin",
      "Autotest Favorites B.bin",
      "Autotest Favorites Folder",
    ]) {
      expect(marked).toContain(title);
    }

    await removeFavorites(owner, [a.id, b.id], [folder]);
    for (const title of [
      "Autotest Favorites A.bin",
      "Autotest Favorites B.bin",
      "Autotest Favorites Folder",
    ]) {
      expect(await favorites(owner)).not.toContain(title);
    }
    expect(
      (await owner.folders.getFolderInfo({ folderId: folder })).status,
    ).toBe(200);
    await expectContent(apiSdk, "owner", a.id, makeBytes(10, 310));
    await expectContent(apiSdk, "owner", nested.id, inner);
  });

  test("POST /api/2.0/files/favorites - A file the caller cannot read and an id that does not exist are skipped with a true answer; the readable file is marked", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const roomId = await createRoom(owner, "Autotest Favorites Mixed Room");
    const [reader] = await members(apiSdk, ["User"]);
    await invite(owner, roomId, reader.id, FileShare.Read);
    const readable = await putFile(
      owner,
      roomId,
      "Autotest Favorites Readable.bin",
      makeBytes(10, 321),
    );
    const secret = await putFile(
      owner,
      myDocs,
      "Autotest Favorites Secret.bin",
      makeBytes(11, 322),
    );
    // Premise: the reader really cannot read the private file.
    expect(
      (await reader.api.files.getFileInfo({ fileId: secret.id })).status,
    ).toBe(403);

    const res = await addFavorites(reader.api, [
      readable.id,
      secret.id,
      99999999,
    ]);

    expect(res.status).toBe(200);
    expect(res.data.response).toBe(true);
    expect(await favorites(reader.api)).toEqual([
      "Autotest Favorites Readable.bin",
    ]);
    // And the other way round: removing the same mixed set is just as harmless.
    const removed = await removeFavorites(reader.api, [
      readable.id,
      secret.id,
      99999999,
    ]);
    expect(removed.status).toBe(200);
    expect(removed.data.response).toBe(true);
    expect(await favorites(reader.api)).toEqual([]);
    expect(await favorites(owner)).not.toContain(
      "Autotest Favorites Secret.bin",
    );
  });

  test("POST /api/2.0/files/favorites - A marked file in the Trash is left out of the list and comes back when it is restored", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const content = makeBytes(50, 331);
    const file = await putFile(
      owner,
      myDocs,
      "Autotest Favorites Trash.bin",
      content,
    );
    await addFavorites(owner, [file.id]);
    expect(await favorites(owner)).toContain("Autotest Favorites Trash.bin");

    await owner.operations.deleteBatchItems({
      deleteBatchRequestDto: {
        fileIds: [file.id],
        immediately: false,
        deleteAfter: false,
      },
    });
    await waitForOperation(owner.operations);
    expect(await favorites(owner)).not.toContain(
      "Autotest Favorites Trash.bin",
    );

    await owner.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [file.id],
        destFolderId: myDocs,
        deleteAfter: false,
      },
    });
    await waitForOperation(owner.operations);

    expect(await favorites(owner)).toContain("Autotest Favorites Trash.bin");
    await expectContent(apiSdk, "owner", file.id, content);
  });
});
