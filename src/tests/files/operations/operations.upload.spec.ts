import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { test } from "@/src/fixtures";
import {
  Configuration,
  FileDto,
  FileShare,
  OperationsApi,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { downloadFile } from "@/src/helpers/download";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

// Chunked-upload coverage for createUploadSession (legacy),
// createUploadSessionInFolder, uploadSession, uploadAsyncSession,
// finalizeSession and abortUploadSession.
//
// Contract notes, taken from the SDK 4.0.0 JSDoc and from probing the portal:
//   * `chunkUploadSize` (GET /files/settings, 10 MiB on the test portals) splits
//     two upload shapes. A payload BELOW it is a "small" session: one part, and
//     uploadSession finishes it by itself. A payload ABOVE it is a "large"
//     session: the parts go through uploadAsyncSession (numbered from 1) or
//     uploadSession (in order) and the file exists only after the last part or
//     after finalize. Large-session tests here really send more than one chunk.
//   * The session id is the only thing the server checks for chunk calls and for
//     finalize: the folder segment of the path is ignored (documented).
//   * Declared divergence: JSDoc says finalize on a session that is short of
//     bytes "assembles whatever is there"; the portal answers 400 and stores
//     nothing. That is the safer behaviour and is what the test below pins.
//   * Defects found while probing are in the "Upload defects" group. Each one is
//     marked with `test.fail()` AFTER its setup assertions, so a broken setup
//     fails loudly instead of being swallowed as "expected failure", and only
//     the violated condition can flip the test.

type Api = ReturnType<ApiSDK["forRole"]>;

type SessionBody = { id?: string; bytes_total?: number; location?: string };
type UploadResult = {
  id?: number;
  folderId?: number;
  version?: number;
  title?: string;
  uploaded?: boolean;
  file?: {
    id?: number;
    title?: string;
    version?: number;
    pureContentLength?: number;
  };
};

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** Deterministic pseudo-random bytes (xorshift32) so a swapped chunk is caught. */
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

const asFile = (bytes: Buffer, name = "part.bin") =>
  new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });

const sessionOf = (res: { data: unknown }): SessionBody =>
  (res.data as { response?: SessionBody }).response ?? {};

const resultOf = (res: { data: unknown }): UploadResult =>
  (res.data as { response?: UploadResult }).response ?? {};

function anonymousOperations(apiSdk: ApiSDK) {
  return new OperationsApi(
    new Configuration({
      basePath: `${apiSdk.tokenStore.portalBaseUrl}`,
      baseOptions: {
        headers: { Origin: `http://${apiSdk.tokenStore.newTenantDomain}` },
      },
    }),
    undefined,
    apiSdk.createAxiosInstance() as any,
  );
}

async function getChunkSize(api: Api): Promise<number> {
  const { data, status } = await api.filesSettings.getFilesSettings();
  expect(status).toBe(200);
  const size = data.response?.chunkUploadSize;
  expect(size).toBeGreaterThan(0);
  return size!;
}

async function getMyDocsId(api: Api): Promise<number> {
  const { data, status } = await api.folders.getMyFolder();
  expect(status).toBe(200);
  return data.response!.current!.id!;
}

async function createCustomRoom(api: Api, title: string): Promise<number> {
  const { data, status } = await api.rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  expect(status).toBe(200);
  return data.response!.id!;
}

async function filesIn(
  api: Api,
  folderId: number,
  titlePrefix = "",
): Promise<FileDto[]> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  expect(status).toBe(200);
  return ((data.response?.files ?? []) as FileDto[]).filter((f) =>
    (f.title ?? "").startsWith(titlePrefix),
  );
}

// Sessions opened through `openSession` are aborted after the test. A session
// that is already finished answers 404 (large) or 200 (small, see the defects
// group); anything else is recorded as a cleanup problem next to the result.
type OpenSession = { api: Api; folderId: number; sessionId: string };
const openSessions: OpenSession[] = [];

test.afterEach(async () => {
  for (const s of openSessions.splice(0)) {
    try {
      const { status } = await s.api.operations.abortUploadSession({
        folderId: s.folderId,
        sessionId: s.sessionId,
      });
      if (status !== 200 && status !== 404) {
        test.info().annotations.push({
          type: "cleanup-error",
          description: `abort of session ${s.sessionId} answered ${status}`,
        });
      }
    } catch (error) {
      test.info().annotations.push({
        type: "cleanup-error",
        description: `abort of session ${s.sessionId} threw: ${String(error)}`,
      });
    }
  }
});

async function openSession(
  api: Api,
  folderId: number,
  fileName: string,
  fileSize: number,
  createNewIfExist = true,
): Promise<string> {
  const res = await api.operations.createUploadSessionInFolder({
    folderId,
    sessionRequest: { fileName, fileSize, createNewIfExist },
  });
  expect(res.status).toBe(200);
  const body = sessionOf(res);
  expect(body.id).toMatch(/^[0-9a-f]{32}$/);
  expect(body.bytes_total).toBe(fileSize);
  openSessions.push({ api, folderId, sessionId: body.id! });
  return body.id!;
}

async function sendChunk(
  api: Api,
  folderId: number,
  sessionId: string,
  chunkNumber: number,
  bytes: Buffer,
) {
  return api.operations.uploadAsyncSession({
    folderId,
    sessionId,
    chunkNumber,
    file: asFile(bytes),
  });
}

async function expectChunkAccepted(
  api: Api,
  folderId: number,
  sessionId: string,
  chunkNumber: number,
  bytes: Buffer,
) {
  const res = await sendChunk(api, folderId, sessionId, chunkNumber, bytes);
  expect(res.status).toBe(200);
  expect(sessionOf(res).id).toBe(sessionId);
  return res;
}

async function expectDownloadMatches(
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

function expectClientError(status: number) {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

/** Called after the setup assertions: from here only the violated condition may fail. */
function knownDefect(label: string) {
  test.fail(true, label);
}

test.describe("Upload session lifecycle", () => {
  test("POST /api/2.0/files/{folderId}/upload/create_session - Legacy session in the success envelope uploads and finalizes to a byte-identical file", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(2048, 1);
    const fileName = "Autotest Upload Legacy.bin";

    const created = await owner.operations.createUploadSession({
      folderId,
      sessionRequest: {
        fileName,
        fileSize: payload.length,
        createNewIfExist: true,
      },
    });
    expect(created.status).toBe(200);
    const envelope = (
      created.data as unknown as {
        response?: { success?: boolean; data?: SessionBody };
      }
    ).response;
    expect(envelope?.success).toBe(true);
    const sessionId = envelope!.data!.id!;
    expect(sessionId).toMatch(/^[0-9a-f]{32}$/);
    expect(envelope!.data!.bytes_total).toBe(payload.length);
    openSessions.push({ api: owner, folderId, sessionId });

    await test.step("Nothing is stored before any part arrives", async () => {
      expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);
    });

    await expectChunkAccepted(owner, folderId, sessionId, 1, payload);

    const finalized = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(finalized.status).toBe(201);
    const result = resultOf(finalized);
    expect(result.uploaded).toBe(true);
    expect(result.title).toBe(fileName);
    expect(result.file?.pureContentLength).toBe(payload.length);

    await expectDownloadMatches(apiSdk, "owner", result.file!.id!, payload);
  });

  test("POST /api/2.0/files/{folderId}/upload/create_session - Legacy session in a non-existent folder returns 404 and creates nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { status } = await owner.operations.createUploadSession({
      folderId: 99999999,
      sessionRequest: {
        fileName: "Autotest Upload Legacy Missing.bin",
        fileSize: 10,
      },
    });
    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/{folderId}/session - Opening a session stores no file and two sessions for one name stay independent", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const fileName = "Autotest Upload Two Sessions.bin";

    const first = await openSession(owner, folderId, fileName, 100);
    const second = await openSession(owner, folderId, fileName, 100);
    expect(second).not.toBe(first);

    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);

    const bytesA = makeBytes(100, 11);
    const bytesB = makeBytes(100, 12);
    await expectChunkAccepted(owner, folderId, first, 1, bytesA);
    await expectChunkAccepted(owner, folderId, second, 1, bytesB);

    const a = await owner.operations.finalizeSession({
      folderId,
      sessionId: first,
    });
    expect(a.status).toBe(201);
    const b = await owner.operations.finalizeSession({
      folderId,
      sessionId: second,
    });
    expect(b.status).toBe(201);

    // createNewIfExist=true: the second upload lands beside the first one.
    const idA = resultOf(a).file!.id!;
    const idB = resultOf(b).file!.id!;
    expect(idA).not.toBe(idB);
    await expectDownloadMatches(apiSdk, "owner", idA, bytesA);
    await expectDownloadMatches(apiSdk, "owner", idB, bytesB);
  });

  test("POST /api/2.0/files/{folderId}/session - Non-existent folder returns 404 and no session is usable", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const { data, status } = await owner.operations.createUploadSessionInFolder(
      {
        folderId: 99999999,
        sessionRequest: {
          fileName: "Autotest Upload Missing Folder.bin",
          fileSize: 10,
        },
      },
    );
    expect(status).toBe(404);
    expect(sessionOf({ data }).id).toBeUndefined();
  });

  test("DELETE /api/2.0/files/{folderId}/session/{sessionId} - Aborting a large session after one chunk leaves no file, closes the session and spares a neighbour", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const total = chunkSize + 100;
    const doomed = makeBytes(total, 21);
    const survivor = makeBytes(total, 22);

    const doomedId = await openSession(
      owner,
      folderId,
      "Autotest Upload Doomed.bin",
      total,
    );
    const survivorId = await openSession(
      owner,
      folderId,
      "Autotest Upload Survivor.bin",
      total,
    );

    await expectChunkAccepted(
      owner,
      folderId,
      doomedId,
      1,
      doomed.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      survivorId,
      1,
      survivor.subarray(0, chunkSize),
    );

    const aborted = await owner.operations.abortUploadSession({
      folderId,
      sessionId: doomedId,
    });
    expect(aborted.status).toBe(200);

    await test.step("The aborted session is gone for every method", async () => {
      expect(
        (
          await sendChunk(
            owner,
            folderId,
            doomedId,
            2,
            doomed.subarray(chunkSize),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await owner.operations.finalizeSession({
            folderId,
            sessionId: doomedId,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await owner.operations.abortUploadSession({
            folderId,
            sessionId: doomedId,
          })
        ).status,
      ).toBe(404);
    });

    expect(
      await filesIn(owner, folderId, "Autotest Upload Doomed"),
    ).toHaveLength(0);

    await test.step("The neighbouring session still completes byte-for-byte", async () => {
      await expectChunkAccepted(
        owner,
        folderId,
        survivorId,
        2,
        survivor.subarray(chunkSize),
      );
      const done = await owner.operations.finalizeSession({
        folderId,
        sessionId: survivorId,
      });
      expect(done.status).toBe(201);
      await expectDownloadMatches(
        apiSdk,
        "owner",
        resultOf(done).file!.id!,
        survivor,
      );
    });
  });

  test("DELETE /api/2.0/files/{folderId}/session/{sessionId} - Aborting a session before any chunk leaves no file", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Abort Fresh.bin",
      64,
    );

    const { status } = await owner.operations.abortUploadSession({
      folderId,
      sessionId,
    });
    expect(status).toBe(200);

    expect(
      await filesIn(owner, folderId, "Autotest Upload Abort Fresh"),
    ).toHaveLength(0);
    expect(
      (await sendChunk(owner, folderId, sessionId, 1, makeBytes(64, 1))).status,
    ).toBe(404);
  });

  test("PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - Non-existent session id returns 404 on every session method", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const missing = "0".repeat(32);
    const part = makeBytes(32, 1);

    expect(
      (await owner.operations.finalizeSession({ folderId, sessionId: missing }))
        .status,
    ).toBe(404);
    expect((await sendChunk(owner, folderId, missing, 1, part)).status).toBe(
      404,
    );
    expect(
      (
        await owner.operations.uploadSession({
          folderId,
          sessionId: missing,
          file: asFile(part),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await owner.operations.abortUploadSession({
          folderId,
          sessionId: missing,
        })
      ).status,
    ).toBe(404);

    // A value that is not even shaped like an id is answered the same way.
    expect(
      (
        await owner.operations.finalizeSession({
          folderId,
          sessionId: "not-a-session",
        })
      ).status,
    ).toBe(404);
  });
});

test.describe("Chunk upload and finalization", () => {
  test("POST /api/2.0/files/{folderId}/session/{sessionId} - Small payload through uploadSession answers 201 and stores the file without finalize", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(1000, 31);
    const fileName = "Autotest Upload Sequential Small.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );

    const res = await owner.operations.uploadSession({
      folderId,
      sessionId,
      file: asFile(payload),
    });

    expect(res.status).toBe(201);
    const result = resultOf(res);
    expect(result.uploaded).toBe(true);
    expect(result.version).toBe(1);
    expect(result.title).toBe(fileName);
    expect(result.file?.pureContentLength).toBe(payload.length);
    await expectDownloadMatches(apiSdk, "owner", result.file!.id!, payload);
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(1);
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId} - Large payload through uploadSession answers 200 for the first chunk and 201 for the last, with no finalize", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 32);
    const fileName = "Autotest Upload Sequential Large.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );

    const first = await owner.operations.uploadSession({
      folderId,
      sessionId,
      file: asFile(payload.subarray(0, chunkSize)),
    });
    expect(first.status).toBe(200);
    expect(resultOf(first).uploaded).toBe(false);
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);

    const last = await owner.operations.uploadSession({
      folderId,
      sessionId,
      file: asFile(payload.subarray(chunkSize)),
    });
    expect(last.status).toBe(201);
    const result = resultOf(last);
    expect(result.uploaded).toBe(true);
    expect(result.version).toBe(1);
    expect(result.file?.pureContentLength).toBe(payload.length);
    await expectDownloadMatches(apiSdk, "owner", result.file!.id!, payload);

    await test.step("The completed session is closed", async () => {
      expect(
        (await owner.operations.finalizeSession({ folderId, sessionId }))
          .status,
      ).toBe(404);
      expect(
        (
          await owner.operations.uploadSession({
            folderId,
            sessionId,
            file: asFile(payload.subarray(chunkSize)),
          })
        ).status,
      ).toBe(404);
      expect(await filesIn(owner, folderId, fileName)).toHaveLength(1);
    });
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Two chunks in order answer 200, store nothing until finalize, then finalize answers 201 with the exact bytes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 33);
    const fileName = "Autotest Upload Async In Order.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );

    const one = await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    expect(sessionOf(one).bytes_total).toBe(payload.length);
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize),
    );
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);

    const finalized = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(finalized.status).toBe(201);
    const result = resultOf(finalized);
    expect(result.uploaded).toBe(true);
    expect(result.version).toBe(1);
    expect(result.folderId).toBe(folderId);
    expect(result.title).toBe(fileName);
    expect(result.file?.pureContentLength).toBe(payload.length);
    await expectDownloadMatches(apiSdk, "owner", result.file!.id!, payload);
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Three chunks in order 1, 2, 3 assemble to the original SHA-256", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize * 2 + 777, 34);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Order 123.bin",
      payload.length,
    );

    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize, chunkSize * 2),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      3,
      payload.subarray(chunkSize * 2),
    );

    const finalized = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(finalized.status).toBe(201);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(finalized).file!.id!,
      payload,
    );
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Chunks sent in order 3, 1, 2 assemble to the original SHA-256", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize * 2 + 777, 35);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Order 312.bin",
      payload.length,
    );

    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      3,
      payload.subarray(chunkSize * 2),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize, chunkSize * 2),
    );

    const finalized = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(finalized.status).toBe(201);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(finalized).file!.id!,
      payload,
    );
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Chunks sent in parallel assemble to the original SHA-256", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize * 2 + 777, 36);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Parallel Chunks.bin",
      payload.length,
    );

    const answers = await Promise.all([
      sendChunk(owner, folderId, sessionId, 3, payload.subarray(chunkSize * 2)),
      sendChunk(owner, folderId, sessionId, 1, payload.subarray(0, chunkSize)),
      sendChunk(
        owner,
        folderId,
        sessionId,
        2,
        payload.subarray(chunkSize, chunkSize * 2),
      ),
    ]);
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200]);

    const finalized = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(finalized.status).toBe(201);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(finalized).file!.id!,
      payload,
    );
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Resending a chunk number replaces its bytes and the last copy wins", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 37);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Resend.bin",
      payload.length,
    );

    // Same length, different bytes: if the first copy survived, the SHA differs.
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      makeBytes(chunkSize, 99),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize),
    );

    const finalized = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(finalized.status).toBe(201);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(finalized).file!.id!,
      payload,
    );
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Two large sessions uploaded in parallel never mix their bytes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const total = chunkSize + 100;
    const payloadA = makeBytes(total, 41);
    const payloadB = makeBytes(total, 42);
    const idA = await openSession(
      owner,
      folderId,
      "Autotest Upload Parallel A.bin",
      total,
    );
    const idB = await openSession(
      owner,
      folderId,
      "Autotest Upload Parallel B.bin",
      total,
    );

    const answers = await Promise.all([
      sendChunk(owner, folderId, idA, 2, payloadA.subarray(chunkSize)),
      sendChunk(owner, folderId, idB, 1, payloadB.subarray(0, chunkSize)),
      sendChunk(owner, folderId, idA, 1, payloadA.subarray(0, chunkSize)),
      sendChunk(owner, folderId, idB, 2, payloadB.subarray(chunkSize)),
    ]);
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200]);
    expect(answers.map((a) => sessionOf(a).id)).toEqual([idA, idB, idA, idB]);

    const doneA = await owner.operations.finalizeSession({
      folderId,
      sessionId: idA,
    });
    const doneB = await owner.operations.finalizeSession({
      folderId,
      sessionId: idB,
    });
    expect(doneA.status).toBe(201);
    expect(doneB.status).toBe(201);
    expect(resultOf(doneA).file!.id).not.toBe(resultOf(doneB).file!.id);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(doneA).file!.id!,
      payloadA,
    );
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(doneB).file!.id!,
      payloadB,
    );
  });

  test("PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - A finished large session is closed: finalize, chunk and abort answer 404 and the file stays at version 1", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 43);
    const fileName = "Autotest Upload Closed Session.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize),
    );
    const finalized = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(finalized.status).toBe(201);
    const fileId = resultOf(finalized).file!.id!;

    expect(
      (await owner.operations.finalizeSession({ folderId, sessionId })).status,
    ).toBe(404);
    expect(
      (
        await sendChunk(
          owner,
          folderId,
          sessionId,
          1,
          payload.subarray(0, chunkSize),
        )
      ).status,
    ).toBe(404);
    expect(
      (await owner.operations.abortUploadSession({ folderId, sessionId }))
        .status,
    ).toBe(404);

    const stored = await filesIn(owner, folderId, fileName);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(fileId);
    const { data: versions } = await owner.files.getFileVersionInfo({ fileId });
    expect(versions.response).toHaveLength(1);
    await expectDownloadMatches(apiSdk, "owner", fileId, payload);
  });

  // JSDoc says finalize on a short session "assembles whatever is there". The
  // portal refuses instead and stores nothing, which is the safer behaviour;
  // this pins what actually happens so a switch to partial assembly is noticed.
  test("PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - Incomplete large session answers 400 and stores no file (JSDoc says it assembles the partial content)", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize * 2 + 777, 44);
    const fileName = "Autotest Upload Incomplete Large.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );

    // Chunk 2 is skipped on purpose.
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      3,
      payload.subarray(chunkSize * 2),
    );

    const { status } = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });

    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);
    expect(status).toBe(400);

    await test.step("The missing chunk can still be sent and the session completes", async () => {
      // Not guaranteed by the contract, so only the stored result is checked if it does.
      const retry = await sendChunk(
        owner,
        folderId,
        sessionId,
        2,
        payload.subarray(chunkSize, chunkSize * 2),
      );
      if (retry.status === 200) {
        const done = await owner.operations.finalizeSession({
          folderId,
          sessionId,
        });
        expect(done.status).toBe(201);
        await expectDownloadMatches(
          apiSdk,
          "owner",
          resultOf(done).file!.id!,
          payload,
        );
      }
    });
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - A part above chunkUploadSize is refused and does not poison the session", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 45);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Oversize.bin",
      payload.length,
    );

    // JSDoc: "A part bigger than chunkUploadSize ... is refused". The exact status
    // is not part of the contract (the portal answers 402), only that it is not a success.
    const oversize = await sendChunk(
      owner,
      folderId,
      sessionId,
      1,
      makeBytes(chunkSize + 1, 5),
    );
    expect(oversize.status).toBeGreaterThanOrEqual(400);

    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize),
    );
    const done = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(done.status).toBe(201);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(done).file!.id!,
      payload,
    );
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - An empty part does not corrupt the session: the real chunks still assemble to the original SHA-256", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 46);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Empty Part.bin",
      payload.length,
    );

    // The portal answers 200 to an empty part; the contract does not say, so
    // the answer is not asserted, only what the session turns into.
    await sendChunk(owner, folderId, sessionId, 1, Buffer.alloc(0));

    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize),
    );
    const done = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(done.status).toBe(201);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(done).file!.id!,
      payload,
    );
  });
});

test.describe("Upload defects", () => {
  // Every test: setup and precondition assertions first, then knownDefect(),
  // then the single condition the portal violates.

  test("BUG-PENDING: POST /api/2.0/files/{folderId}/session/{sessionId}/upload - A request without the multipart file part is a client error, not a 500", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(500, 51);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload No File Part.bin",
      payload.length,
    );

    const res = await owner.operations.uploadAsyncSession({
      folderId,
      sessionId,
      chunkNumber: 1,
    });

    knownDefect("NullReferenceException: missing multipart file answers 500");
    expectClientError(res.status);
  });

  test("BUG-PENDING: PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - Finalize without any chunk must not report a stored file that does not exist", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const fileName = "Autotest Upload Finalize Empty.bin";
    const sessionId = await openSession(owner, folderId, fileName, 500);
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);

    const res = await owner.operations.finalizeSession({ folderId, sessionId });
    const stored = await filesIn(owner, folderId, fileName);

    knownDefect(
      "finalize answers 201 uploaded=true with file id 0 and stores nothing",
    );
    if (res.status < 300) {
      // A success answer is only honest if the file is really there.
      expect(stored).toHaveLength(1);
      expect(resultOf(res).file?.id).toBeGreaterThan(0);
    } else {
      expectClientError(res.status);
      expect(stored).toHaveLength(0);
    }
  });

  // Root cause behind several defects below: a small session (payload under
  // chunkUploadSize) STORES the file on the first uploadAsyncSession call, before
  // finalize, although the JSDoc says that call "never completes the upload".
  // The two tests that follow show it as a truncated or early file in the folder.
  test("BUG-PENDING: POST /api/2.0/files/{folderId}/session/{sessionId}/upload - A small session must not expose a truncated file before finalize", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const fileName = "Autotest Upload Truncated Visible.bin";
    const sessionId = await openSession(owner, folderId, fileName, 1000);
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);

    // 400 of the declared 1000 bytes.
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      makeBytes(400, 52),
    );
    const visible = await filesIn(owner, folderId, fileName);

    knownDefect(
      "the file is listed in the folder after the first chunk, before finalize, short of its declared size",
    );
    expect(visible).toHaveLength(0);
  });

  test("BUG-PENDING: POST /api/2.0/files/{folderId}/session/{sessionId}/upload - A small session stores no file until finalize", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(1000, 52);
    const fileName = "Autotest Upload Small Early Store.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);

    await expectChunkAccepted(owner, folderId, sessionId, 1, payload);
    const beforeFinalize = await filesIn(owner, folderId, fileName);

    knownDefect(
      "JSDoc: uploadAsyncSession never completes the upload; small sessions store the file at once",
    );
    expect(beforeFinalize).toHaveLength(0);
  });

  test("BUG-PENDING: PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - Finalize of a small session that received more bytes than declared must not report a stored file that does not exist", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const fileName = "Autotest Upload Finalize Over Declared.bin";
    const sessionId = await openSession(owner, folderId, fileName, 100);
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      makeBytes(300, 53),
    );
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(0);

    const res = await owner.operations.finalizeSession({ folderId, sessionId });
    const stored = await filesIn(owner, folderId, fileName);

    knownDefect(
      "300 bytes into a 100-byte session: finalize answers 201 with file id 0",
    );
    if (res.status < 300) {
      expect(stored).toHaveLength(1);
      expect(resultOf(res).file?.id).toBeGreaterThan(0);
    } else {
      expectClientError(res.status);
      expect(stored).toHaveLength(0);
    }
  });

  for (const chunkNumber of [0, -1]) {
    test(`BUG-PENDING: POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Chunk number ${chunkNumber} on a large session is a client error, not a 500`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const chunkSize = await getChunkSize(owner);
      const folderId = await getMyDocsId(owner);
      const payload = makeBytes(chunkSize + 100, 54);
      const sessionId = await openSession(
        owner,
        folderId,
        "Autotest Upload Bad Chunk Number.bin",
        payload.length,
      );

      const res = await sendChunk(
        owner,
        folderId,
        sessionId,
        chunkNumber,
        payload.subarray(0, chunkSize),
      );

      knownDefect(
        "numbering starts at 1, but 0/-1 answer 500 (small sessions accept them)",
      );
      expectClientError(res.status);
    });
  }

  test("BUG-PENDING: PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - A small session finalized once cannot be finalized again", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(1000, 55);
    const fileName = "Autotest Upload Small Refinalize.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );
    await expectChunkAccepted(owner, folderId, sessionId, 1, payload);
    const first = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(first.status).toBe(201);
    expect(resultOf(first).file!.id).toBeGreaterThan(0);

    const second = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });

    knownDefect(
      "JSDoc: finalize ends the session and cannot be repeated; small sessions answer 201 again",
    );
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await filesIn(owner, folderId, fileName)).toHaveLength(1);
  });

  test("BUG-PENDING: POST /api/2.0/files/{folderId}/session/{sessionId}/upload - A small session accepts no chunk after finalize", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(1000, 56);
    const fileName = "Autotest Upload Small Late Chunk.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );
    await expectChunkAccepted(owner, folderId, sessionId, 1, payload);
    const done = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(done.status).toBe(201);
    const fileId = resultOf(done).file!.id!;

    const late = await sendChunk(
      owner,
      folderId,
      sessionId,
      1,
      makeBytes(1000, 57),
    );

    knownDefect("a chunk sent after finalize is accepted by a small session");
    expect(late.status).toBeGreaterThanOrEqual(400);
    // Whatever the answer, the stored file must not have been rewritten.
    await expectDownloadMatches(apiSdk, "owner", fileId, payload);
  });

  test("BUG-PENDING: DELETE /api/2.0/files/{folderId}/session/{sessionId} - A small session cannot be aborted after finalize", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(1000, 58);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Small Late Abort.bin",
      payload.length,
    );
    await expectChunkAccepted(owner, folderId, sessionId, 1, payload);
    const done = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(done.status).toBe(201);

    const abort = await owner.operations.abortUploadSession({
      folderId,
      sessionId,
    });

    knownDefect(
      "JSDoc: there is nothing left to abort once the file exists; small sessions answer 200",
    );
    expect(abort.status).toBeGreaterThanOrEqual(400);
  });

  test("BUG-PENDING: PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - Repeated chunks into one small session produce a new file at version 1, not extra versions", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(1000, 59);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Extra Versions.bin",
      payload.length,
    );
    for (let i = 0; i < 3; i++) {
      await expectChunkAccepted(owner, folderId, sessionId, 1, payload);
    }
    const done = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(done.status).toBe(201);
    const fileId = resultOf(done).file!.id!;
    const { data: versions } = await owner.files.getFileVersionInfo({ fileId });

    knownDefect(
      "JSDoc: a brand-new file is version 1; probing showed one version per extra chunk call",
    );
    expect(resultOf(done).version).toBe(1);
    expect(versions.response).toHaveLength(1);
  });

  test("BUG-PENDING: POST /api/2.0/files/{folderId}/session - A negative fileSize is rejected when the session opens", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);

    const res = await owner.operations.createUploadSessionInFolder({
      folderId,
      sessionRequest: {
        fileName: "Autotest Upload Negative Size.bin",
        fileSize: -1,
        createNewIfExist: true,
      },
    });
    const leaked = sessionOf(res).id;
    if (leaked) openSessions.push({ api: owner, folderId, sessionId: leaked });

    knownDefect(
      "fileSize -1 opens a session with bytes_total -1 (finalize fails later with 400)",
    );
    expectClientError(res.status);
    expect(leaked).toBeUndefined();
  });

  test("BUG-PENDING: PUT /api/2.0/files/{folderId}/session/{sessionId}/finalize - A short intermediate chunk fails as a client error at the latest on finalize, never a 500", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 60);
    const fileName = "Autotest Upload Short Middle Chunk.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );

    // Chunk 1 is 100 bytes instead of chunkUploadSize; chunk 2 carries the rest.
    // The upload answers are left unasserted: refusing here would be fine too.
    await sendChunk(owner, folderId, sessionId, 1, payload.subarray(0, 100));
    await sendChunk(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(100, 100 + chunkSize),
    );
    const res = await owner.operations.finalizeSession({ folderId, sessionId });
    const stored = await filesIn(owner, folderId, fileName);
    expect(stored).toHaveLength(0);

    knownDefect("finalize answers 500 'smaller than the minimum allowed size'");
    expectClientError(res.status);
  });
});

test.describe("Upload permissions and isolation", () => {
  test("POST /api/2.0/files/{folderId}/session - Unauthenticated chunk, finalize and abort answer 401 and leave the owner's session intact", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 61);
    const fileName = "Autotest Upload Anon.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );

    const anon = anonymousOperations(apiSdk);
    const part = payload.subarray(chunkSize);

    expect(
      (
        await anon.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest Upload Anon New.bin",
            fileSize: 10,
          },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await anon.uploadAsyncSession({
          folderId,
          sessionId,
          chunkNumber: 2,
          file: asFile(part),
        })
      ).status,
    ).toBe(401);
    expect(
      (await anon.uploadSession({ folderId, sessionId, file: asFile(part) }))
        .status,
    ).toBe(401);
    expect((await anon.finalizeSession({ folderId, sessionId })).status).toBe(
      401,
    );
    expect(
      (await anon.abortUploadSession({ folderId, sessionId })).status,
    ).toBe(401);

    expect(await filesIn(owner, folderId, "Autotest Upload Anon")).toHaveLength(
      0,
    );

    await test.step("The owner's session is untouched and completes byte-for-byte", async () => {
      await expectChunkAccepted(owner, folderId, sessionId, 2, part);
      const done = await owner.operations.finalizeSession({
        folderId,
        sessionId,
      });
      expect(done.status).toBe(201);
      await expectDownloadMatches(
        apiSdk,
        "owner",
        resultOf(done).file!.id!,
        payload,
      );
    });
  });

  test("POST /api/2.0/files/{folderId}/session - User with Read access cannot open a session in the room, with the current or the legacy method, and nothing is created", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createCustomRoom(
      owner,
      "Autotest Upload Read Only Room",
    );
    const { api: reader, data: userData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const share = await owner.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });
    expect(share.status).toBe(200);
    // Premise: the user really is a member and can read the room.
    expect(
      (await reader.folders.getFolderByFolderId({ folderId: roomId })).status,
    ).toBe(200);

    const current = await reader.operations.createUploadSessionInFolder({
      folderId: roomId,
      sessionRequest: { fileName: "Autotest Upload Reader.bin", fileSize: 64 },
    });
    expect(current.status).toBe(403);
    expect(sessionOf(current).id).toBeUndefined();

    const legacy = await reader.operations.createUploadSession({
      folderId: roomId,
      sessionRequest: {
        fileName: "Autotest Upload Reader Legacy.bin",
        fileSize: 64,
      },
    });
    expect(legacy.status).toBe(403);

    expect(await filesIn(owner, roomId, "Autotest Upload Reader")).toHaveLength(
      0,
    );
  });

  test("DELETE /api/2.0/files/{folderId}/session/{sessionId} - A user without access to the folder cannot abort the owner's session and the upload still completes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const folderId = await getMyDocsId(owner);
    const payload = makeBytes(chunkSize + 100, 62);
    const fileName = "Autotest Upload Foreign Abort.bin";
    const sessionId = await openSession(
      owner,
      folderId,
      fileName,
      payload.length,
    );
    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      1,
      payload.subarray(0, chunkSize),
    );

    const { api: intruder } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    // Premise: the intruder has no access to the owner's My Documents.
    expect(
      (await intruder.folders.getFolderByFolderId({ folderId })).status,
    ).toBe(403);

    const abort = await intruder.operations.abortUploadSession({
      folderId,
      sessionId,
    });
    expect(abort.status).toBe(403);

    await expectChunkAccepted(
      owner,
      folderId,
      sessionId,
      2,
      payload.subarray(chunkSize),
    );
    const done = await owner.operations.finalizeSession({
      folderId,
      sessionId,
    });
    expect(done.status).toBe(201);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(done).file!.id!,
      payload,
    );
  });

  test("POST /api/2.0/files/{folderId}/session - A user without access cannot open a session in the owner's folder", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const folderId = await getMyDocsId(owner);
    const { api: intruder } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const res = await intruder.operations.createUploadSessionInFolder({
      folderId,
      sessionRequest: {
        fileName: "Autotest Upload Intruder Create.bin",
        fileSize: 64,
      },
    });

    expect(res.status).toBe(403);
    expect(sessionOf(res).id).toBeUndefined();
    expect(
      await filesIn(owner, folderId, "Autotest Upload Intruder"),
    ).toHaveLength(0);
  });

  test("POST /api/2.0/files/{folderId}/session/{sessionId}/upload - Two users upload in their own sessions at the same time and each file lands in its own folder byte-for-byte", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const chunkSize = await getChunkSize(owner);
    const ownerFolder = await getMyDocsId(owner);
    const { api: member } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const memberFolder = await getMyDocsId(member);
    expect(memberFolder).not.toBe(ownerFolder);

    const total = chunkSize + 100;
    const ownerPayload = makeBytes(total, 71);
    const memberPayload = makeBytes(total, 72);
    const ownerSession = await openSession(
      owner,
      ownerFolder,
      "Autotest Upload Isolation Owner.bin",
      total,
    );
    const memberSession = await openSession(
      member,
      memberFolder,
      "Autotest Upload Isolation Member.bin",
      total,
    );

    const answers = await Promise.all([
      sendChunk(
        owner,
        ownerFolder,
        ownerSession,
        1,
        ownerPayload.subarray(0, chunkSize),
      ),
      sendChunk(
        member,
        memberFolder,
        memberSession,
        1,
        memberPayload.subarray(0, chunkSize),
      ),
      sendChunk(
        owner,
        ownerFolder,
        ownerSession,
        2,
        ownerPayload.subarray(chunkSize),
      ),
      sendChunk(
        member,
        memberFolder,
        memberSession,
        2,
        memberPayload.subarray(chunkSize),
      ),
    ]);
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200]);

    // The member's attempt on the owner's session changes nothing for the owner.
    expect(
      (
        await member.operations.abortUploadSession({
          folderId: ownerFolder,
          sessionId: ownerSession,
        })
      ).status,
    ).toBe(403);

    const ownerDone = await owner.operations.finalizeSession({
      folderId: ownerFolder,
      sessionId: ownerSession,
    });
    const memberDone = await member.operations.finalizeSession({
      folderId: memberFolder,
      sessionId: memberSession,
    });
    expect(ownerDone.status).toBe(201);
    expect(memberDone.status).toBe(201);

    expect(
      await filesIn(owner, ownerFolder, "Autotest Upload Isolation"),
    ).toHaveLength(1);
    expect(
      await filesIn(member, memberFolder, "Autotest Upload Isolation"),
    ).toHaveLength(1);
    await expectDownloadMatches(
      apiSdk,
      "owner",
      resultOf(ownerDone).file!.id!,
      ownerPayload,
    );
    await expectDownloadMatches(
      apiSdk,
      "roomAdmin",
      resultOf(memberDone).file!.id!,
      memberPayload,
    );
  });

  // SECURITY DIAGNOSTIC, not a regression test. JSDoc documents that chunk calls
  // and finalize find the session "by the id alone", so whoever holds the id can
  // write into the owner's folder, while abort does check access (403 above).
  // The test does not pin that as wanted behaviour: it records what happens and
  // attaches the observation to the result for the security report. It only
  // fails if its own premises break (the intruder must really lack access).
  test("SECURITY-DIAG: POST /api/2.0/files/{folderId}/session/{sessionId}/upload - A user without folder access presents the owner's session id (observation only)", async ({
    apiSdk,
  }, testInfo) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { data: folderData, status: folderStatus } =
      await owner.folders.createFolder({
        folderId: myDocs,
        createFolderRequest: { title: "Autotest Upload Security Diag Folder" },
      });
    expect(folderStatus).toBe(200);
    const folderId = folderData.response!.id!;

    const ownerBytes = makeBytes(300, 81);
    const foreignBytes = makeBytes(300, 82);
    const sessionId = await openSession(
      owner,
      folderId,
      "Autotest Upload Diag Owner.bin",
      ownerBytes.length,
    );

    const { api: intruder } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    expect(
      (await intruder.folders.getFolderByFolderId({ folderId })).status,
    ).toBe(403);

    const chunk = await sendChunk(
      intruder,
      folderId,
      sessionId,
      1,
      foreignBytes,
    );
    const finalize = await intruder.operations.finalizeSession({
      folderId,
      sessionId,
    });
    const landed = await filesIn(owner, folderId, "Autotest Upload Diag");
    const landedFile = landed[0];

    let landedMatchesForeignBytes: boolean | null = null;
    if (landedFile?.id) {
      const { bytes } = await downloadFile(apiSdk, "owner", landedFile.id);
      landedMatchesForeignBytes = sha256(bytes) === sha256(foreignBytes);
    }

    const observation = {
      intruderChunkStatus: chunk.status,
      intruderFinalizeStatus: finalize.status,
      fileLandedInOwnersFolder: landed.length > 0,
      landedFileTitle: landedFile?.title ?? null,
      landedFileCreatedById: landedFile?.createdBy?.id ?? null,
      landedContentIsIntruderBytes: landedMatchesForeignBytes,
    };
    testInfo.annotations.push({
      type: "security-diagnostic",
      description: JSON.stringify(observation),
    });
    await testInfo.attach("foreign-session-observation", {
      body: JSON.stringify(observation, null, 2),
      contentType: "application/json",
    });
  });
});
