import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { test } from "@/src/fixtures";
import {
  ConversationResultDto,
  Configuration,
  FileOperationType,
  FileShare,
  OperationsApi,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { downloadFile } from "@/src/helpers/download";
import { extractDocxText } from "@/src/helpers/docx";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

// startFileConversion (PUT /files/file/{id}/checkconversion) and
// checkConversionStatus (GET, same address).
//
// What the portal really does, found by probing and used as the contract here:
//   * only formats that must be converted are queued (RTF and HTML become .docx);
//     anything already editable (docx, xlsx, pptx) and plain text, CSV and
//     Markdown are answered 200 with an empty list and no work;
//   * the result is a NEW file with the source's base name and the .docx
//     extension in the source's folder; the source is never touched; the entry
//     carries it in `result` (the method JSDoc says `file`, the DTO says
//     `result`);
//   * `progress` is 0 until the job is over and then 100, whether it ended with
//     a file or with an `error`; a finished entry is handed out once;
//   * with the default createNewIfExist=false a repeated conversion replaces the
//     earlier result (same id, next version);
//   * the caller needs permission to view the file, otherwise 403.
//
// Observed and deliberately not pinned (the JSDoc is silent or differs):
//   * damaged and empty RTF/HTML files convert without an error;
//   * a user with Read access to a room is refused (403) although the JSDoc
//     says read access is enough;
//   * the in-flight entry belongs to the file, not to the caller: another user
//     with read access sees it and can take the finished entry before the
//     starter does (recorded as a security diagnostic below);
//   * `outputType` is ignored and unknown values are accepted (BUG-PENDING).

type Api = ReturnType<ApiSDK["forRole"]>;
type Entry = ConversationResultDto;
type FileRef = { id?: number; title?: string; version?: number };

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

const rtf = (text: string) =>
  Buffer.from(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}${text}\\par}`);

const html = (paragraphs: string[]) =>
  Buffer.from(
    `<html><head><meta charset="utf-8"></head><body>${paragraphs
      .map((p) => `<p>${p}</p>`)
      .join("")}</body></html>`,
  );

async function getMyDocsId(api: Api): Promise<number> {
  const { data, status } = await api.folders.getMyFolder();
  expect(status).toBe(200);
  const folderId = data.response!.current!.id!;
  // The four sample documents are added to a new portal asynchronously; waiting
  // for them keeps "the folder did not change" comparisons honest.
  await expect
    .poll(async () => (await titlesIn(api, folderId, "ONLYOFFICE")).length, {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(4);
  return folderId;
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

/** Stores a file with exact bytes through a one-shot upload session (201). */
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

/** Every file in a folder as "id:title:vN", for exact before/after comparisons. */
async function listing(api: Api, folderId: number): Promise<string[]> {
  const { data, status } = await api.folders.getFolderByFolderId({ folderId });
  expect(status).toBe(200);
  return ((data.response?.files ?? []) as FileRef[])
    .map((f) => `${f.id}:${f.title}:v${f.version}`)
    .sort();
}

async function titlesIn(api: Api, folderId: number, prefix: string) {
  const { data } = await api.folders.getFolderByFolderId({ folderId });
  return ((data.response?.files ?? []) as FileRef[])
    .filter((f) => (f.title ?? "").startsWith(prefix))
    .map((f) => ({ id: f.id!, title: f.title!, version: f.version! }));
}

type StartBody = {
  sync?: boolean;
  startConvert?: boolean;
  version?: number;
  password?: string;
  outputType?: string;
  createNewIfExist?: boolean;
};

async function startConversion(api: Api, fileId: number, body?: StartBody) {
  const res = await api.operations.startFileConversion({
    fileId,
    checkConversionRequestDto: body,
  });
  return { status: res.status, entries: (res.data.response ?? []) as Entry[] };
}

async function readEntries(api: Api, fileId: number, start?: boolean) {
  const res = await api.operations.checkConversionStatus({ fileId, start });
  return { status: res.status, entries: (res.data.response ?? []) as Entry[] };
}

/** Polls until the entry reaches 100 (this read hands it out) and returns it. */
async function waitConversion(api: Api, fileId: number): Promise<Entry> {
  let found: Entry | undefined;
  await expect(async () => {
    const { entries } = await readEntries(api, fileId);
    expect(entries, "the entry is still known").toHaveLength(1);
    expect(entries[0].progress).toBe(100);
    found = entries[0];
  }).toPass({ intervals: [100, 200, 500], timeout: 45_000 });
  return found!;
}

async function textOf(apiSdk: ApiSDK, role: Role, fileId: number) {
  const { status, bytes } = await downloadFile(apiSdk, role, fileId);
  expect(status).toBe(200);
  return extractDocxText(bytes).trim();
}

async function expectSourceIntact(
  apiSdk: ApiSDK,
  api: Api,
  fileId: number,
  original: Buffer,
) {
  const { status, bytes } = await downloadFile(apiSdk, "owner", fileId);
  expect(status).toBe(200);
  expect(sha256(bytes)).toBe(sha256(original));
  const versions = await api.files.getFileVersionInfo({ fileId });
  expect(versions.status).toBe(200);
  expect(versions.data.response).toHaveLength(1);
}

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

/** Called after the setup assertions: from here only the violated condition may fail. */
function knownDefect(label: string) {
  test.fail(true, label);
}

test.describe("startFileConversion and checkConversionStatus: converting", () => {
  test("PUT /api/2.0/files/file/{fileId}/checkconversion - An RTF file is converted into a new .docx beside it, with its text, and the source stays byte-for-byte", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = rtf("Hello Conversion Probe");
    const { id: sourceId } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Basic.rtf",
      source,
    );
    const before = await listing(owner, myDocs);

    // Nothing is known before the start, and asking changes nothing.
    const idle = await readEntries(owner, sourceId);
    expect(idle.status).toBe(200);
    expect(idle.entries).toEqual([]);
    expect(await listing(owner, myDocs)).toEqual(before);

    const started = await startConversion(owner, sourceId, {
      startConvert: true,
    });
    expect(started.status).toBe(200);
    expect(started.entries).toHaveLength(1);
    const first = started.entries[0];
    expect(first.Operation).toBe(FileOperationType.Convert);
    expect(first.progress).toBe(0);
    expect(first.error ?? "").toBe("");
    expect(JSON.parse(first.source!)).toMatchObject({
      id: sourceId,
      version: 1,
    });

    const done = await waitConversion(owner, sourceId);

    expect(done.progress).toBe(100);
    expect(done.error ?? "").toBe("");
    expect(done.processed).toBe("1");
    const result = done.result as FileRef & {
      fileExst?: string;
      folderId?: number;
    };
    expect(result.id).toBeGreaterThan(0);
    expect(result.id).not.toBe(sourceId);
    expect(result.title).toBe("Autotest Convert Basic.docx");
    expect(result.fileExst).toBe(".docx");
    expect(result.folderId).toBe(myDocs);
    expect(result.version).toBe(1);

    expect(await textOf(apiSdk, "owner", result.id!)).toBe(
      "Hello Conversion Probe",
    );
    const info = await owner.files.getFileInfo({ fileId: result.id! });
    expect(info.status).toBe(200);
    expect(info.data.response?.title).toBe("Autotest Convert Basic.docx");
    // The only change in the folder is the result; the source is untouched.
    expect(await listing(owner, myDocs)).toEqual(
      [...before, `${result.id}:Autotest Convert Basic.docx:v1`].sort(),
    );
    await expectSourceIntact(apiSdk, owner, sourceId, source);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - An HTML file with Cyrillic text keeps every paragraph", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = html(["Привет, мир", "Второй абзац", "Third paragraph"]);
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Cyrillic.html",
      source,
    );

    const started = await startConversion(owner, id);
    expect(started.status).toBe(200);
    expect(started.entries).toHaveLength(1);
    const done = await waitConversion(owner, id);

    expect(done.error ?? "").toBe("");
    const text = await textOf(apiSdk, "owner", (done.result as FileRef).id!);
    expect(text.split("\n").map((l) => l.trim())).toEqual([
      "Привет, мир",
      "Второй абзац",
      "Third paragraph",
    ]);
    await expectSourceIntact(apiSdk, owner, id, source);
  });

  test("GET /api/2.0/files/file/{fileId}/checkconversion - The entry holds 0 and then 100 with the same source, running entries are empty, and the finished entry is handed out once", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const paragraphs = Array.from(
      { length: 3000 },
      (_, i) => `Paragraph ${i} lorem ipsum dolor sit amet`,
    );
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Timeline.html",
      html(paragraphs),
    );
    const started = await startConversion(owner, id);
    expect(started.entries).toHaveLength(1);

    const samples: Entry[] = [];
    await expect(async () => {
      const { entries } = await readEntries(owner, id);
      expect(entries).toHaveLength(1);
      samples.push(entries[0]);
      expect(entries[0].progress).toBe(100);
    }).toPass({ intervals: [50, 100, 200], timeout: 45_000 });

    const running = samples.filter((s) => s.progress !== 100);
    expect(
      running.length,
      "at least one read while it was running",
    ).toBeGreaterThan(0);
    for (const sample of running) {
      expect(sample.result ?? null).toBeNull();
      expect(sample.error ?? "").toBe("");
      expect(sample.processed ?? "").toBe("");
      expect(sample.source).toBe(started.entries[0].source);
    }
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].progress!).toBeGreaterThanOrEqual(
        samples[i - 1].progress!,
      );
    }
    const last = samples[samples.length - 1];
    expect(last.processed).toBe("1");
    expect((last.result as FileRef).id).toBeGreaterThan(0);

    // Handed out once: the next read is empty, the converted file stays.
    expect((await readEntries(owner, id)).entries).toEqual([]);
    expect(
      (await owner.files.getFileInfo({ fileId: (last.result as FileRef).id! }))
        .status,
    ).toBe(200);
  });

  test("GET /api/2.0/files/file/{fileId}/checkconversion - start=true starts the conversion as well", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert StartFlag.rtf",
      rtf("Flag start"),
    );

    const first = await readEntries(owner, id, true);

    expect(first.status).toBe(200);
    expect(first.entries).toHaveLength(1);
    const done = await waitConversion(owner, id);
    expect(done.error ?? "").toBe("");
    expect(await textOf(apiSdk, "owner", (done.result as FileRef).id!)).toBe(
      "Flag start",
    );
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - sync=true answers with the finished result and leaves nothing to poll", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Sync.rtf",
      rtf("Sync result"),
    );

    const res = await startConversion(owner, id, {
      startConvert: true,
      sync: true,
    });

    expect(res.status).toBe(200);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].progress).toBe(100);
    expect(res.entries[0].error ?? "").toBe("");
    const result = res.entries[0].result as FileRef;
    expect(result.title).toBe("Autotest Convert Sync.docx");
    expect(await textOf(apiSdk, "owner", result.id!)).toBe("Sync result");
    expect((await readEntries(owner, id)).entries).toEqual([]);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - A body without startConvert, with startConvert false, or no body at all still starts the conversion (the flag is set by the operation)", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    for (const [name, body] of [
      ["NoBody", undefined],
      ["FlagFalse", { startConvert: false }],
      ["EmptyBody", {}],
    ] as const) {
      const { id } = await putFile(
        owner,
        myDocs,
        `Autotest Convert ${name}.rtf`,
        rtf(`Body ${name}`),
      );

      const started = await startConversion(owner, id, body);

      expect(started.status, name).toBe(200);
      expect(started.entries, name).toHaveLength(1);
      const done = await waitConversion(owner, id);
      expect(
        await textOf(apiSdk, "owner", (done.result as FileRef).id!),
        name,
      ).toBe(`Body ${name}`);
    }
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - Two different files convert in parallel, each to its own result with its own text", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const a = await putFile(
      owner,
      myDocs,
      "Autotest Convert ParallelA.rtf",
      rtf("Parallel Alpha"),
    );
    const b = await putFile(
      owner,
      myDocs,
      "Autotest Convert ParallelB.html",
      html(["Parallel Beta"]),
    );

    const [startA, startB] = await Promise.all([
      startConversion(owner, a.id),
      startConversion(owner, b.id),
    ]);
    expect(startA.entries).toHaveLength(1);
    expect(startB.entries).toHaveLength(1);
    const [doneA, doneB] = await Promise.all([
      waitConversion(owner, a.id),
      waitConversion(owner, b.id),
    ]);

    const resultA = doneA.result as FileRef;
    const resultB = doneB.result as FileRef;
    expect(resultA.id).not.toBe(resultB.id);
    expect(resultA.title).toBe("Autotest Convert ParallelA.docx");
    expect(resultB.title).toBe("Autotest Convert ParallelB.docx");
    expect(await textOf(apiSdk, "owner", resultA.id!)).toBe("Parallel Alpha");
    expect(await textOf(apiSdk, "owner", resultB.id!)).toBe("Parallel Beta");
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - Starting again while it runs adds no second conversion: one entry and one result file", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const paragraphs = Array.from(
      { length: 3000 },
      (_, i) => `Repeat ${i} lorem ipsum dolor sit amet`,
    );
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Twice.html",
      html(paragraphs),
    );

    const first = await startConversion(owner, id);
    const second = await startConversion(owner, id);

    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0].source).toBe(first.entries[0].source);
    const done = await waitConversion(owner, id);
    expect(done.error ?? "").toBe("");
    const results = await titlesIn(
      owner,
      myDocs,
      "Autotest Convert Twice.docx",
    );
    expect(results).toHaveLength(1);
    expect(results[0].version).toBe(1);
  });
});

test.describe("startFileConversion: converting again and the result's place", () => {
  test("PUT /api/2.0/files/file/{fileId}/checkconversion - Converting again by default replaces the earlier result: same file, next version, the new content of the source", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Again.rtf",
      rtf("First text"),
    );
    await startConversion(owner, id);
    const first = (await waitConversion(owner, id)).result as FileRef;
    expect(await textOf(apiSdk, "owner", first.id!)).toBe("First text");

    await putFile(
      owner,
      myDocs,
      "Autotest Convert Again.rtf",
      rtf("Second text"),
      false,
    );
    await startConversion(owner, id);
    const second = (await waitConversion(owner, id)).result as FileRef;

    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(await textOf(apiSdk, "owner", first.id!)).toBe("Second text");
    expect(
      await titlesIn(owner, myDocs, "Autotest Convert Again.docx"),
    ).toHaveLength(1);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - createNewIfExist=true makes another file and leaves the earlier result as it was", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert NewCopy.rtf",
      rtf("Copy text"),
    );
    await startConversion(owner, id);
    const first = (await waitConversion(owner, id)).result as FileRef;

    await startConversion(owner, id, {
      startConvert: true,
      createNewIfExist: true,
    });
    const second = (await waitConversion(owner, id)).result as FileRef;

    expect(second.id).not.toBe(first.id);
    expect(second.version).toBe(1);
    expect(await textOf(apiSdk, "owner", first.id!)).toBe("Copy text");
    expect(await textOf(apiSdk, "owner", second.id!)).toBe("Copy text");
    const results = await titlesIn(
      owner,
      myDocs,
      "Autotest Convert NewCopy.docx",
    );
    expect(results.map((r) => r.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });

  test("BUG-PENDING: PUT /api/2.0/files/file/{fileId}/checkconversion - A second file made with createNewIfExist=true gets its own title, not the title of the file beside it", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Unique.rtf",
      rtf("Unique"),
    );
    await startConversion(owner, id);
    const first = (await waitConversion(owner, id)).result as FileRef;
    await startConversion(owner, id, {
      startConvert: true,
      createNewIfExist: true,
    });
    const second = (await waitConversion(owner, id)).result as FileRef;
    // Premise: it really is a second file.
    expect(second.id).not.toBe(first.id);

    knownDefect(
      "the new file takes the same title, so one folder holds two files with one name (elsewhere a numbered name is used)",
    );
    expect(second.title).not.toBe(first.title);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - version converts that version of the source; 0 and below mean the current one; a version that does not exist queues nothing", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Version.rtf",
      rtf("Version One"),
    );
    await putFile(
      owner,
      myDocs,
      "Autotest Convert Version.rtf",
      rtf("Version Two"),
      false,
    );

    for (const [version, expected] of [
      [1, "Version One"],
      [2, "Version Two"],
      [0, "Version Two"],
      [-1, "Version Two"],
    ] as const) {
      const started = await startConversion(owner, id, {
        startConvert: true,
        version,
        createNewIfExist: true,
      });
      expect(started.entries, `version ${version}`).toHaveLength(1);
      const done = await waitConversion(owner, id);
      expect(
        await textOf(apiSdk, "owner", (done.result as FileRef).id!),
        `version ${version}`,
      ).toBe(expected);
    }

    const before = await listing(owner, myDocs);
    const missing = await startConversion(owner, id, {
      startConvert: true,
      version: 99,
      createNewIfExist: true,
    });
    expect(missing.status).toBe(200);
    expect(missing.entries).toEqual([]);
    expect((await readEntries(owner, id)).entries).toEqual([]);
    expect(await listing(owner, myDocs)).toEqual(before);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - outputType docx, DOCX and none give a .docx result", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    for (const [name, outputType] of [
      ["Lower", "docx"],
      ["Upper", "DOCX"],
      ["None", undefined],
    ] as const) {
      const { id } = await putFile(
        owner,
        myDocs,
        `Autotest Convert Output ${name}.rtf`,
        rtf(`Output ${name}`),
      );
      await startConversion(owner, id, { startConvert: true, outputType });
      const done = await waitConversion(owner, id);
      expect((done.result as { fileExst?: string }).fileExst, name).toBe(
        ".docx",
      );
      expect(
        await textOf(apiSdk, "owner", (done.result as FileRef).id!),
        name,
      ).toBe(`Output ${name}`);
    }
  });

  test("BUG-PENDING: PUT /api/2.0/files/file/{fileId}/checkconversion - A format the portal cannot produce is not silently turned into a .docx", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const control = await putFile(
      owner,
      myDocs,
      "Autotest Convert OutputControl.rtf",
      rtf("Control"),
    );
    await startConversion(owner, control.id);
    expect((await waitConversion(owner, control.id)).error ?? "").toBe("");
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert OutputJunk.rtf",
      rtf("Junk format"),
    );
    const before = await listing(owner, myDocs);

    const res = await apiSdk.forRole("owner").operations.startFileConversion({
      fileId: id,
      checkConversionRequestDto: { startConvert: true, outputType: "zzz" },
    });
    const queued = (res.data.response ?? []) as Entry[];
    if (queued.length) await waitConversion(owner, id);
    const after = await listing(owner, myDocs);

    knownDefect(
      "JSDoc: what the portal cannot produce is answered without work or rejected; outputType zzz is accepted and a .docx is made",
    );
    expect(res.status === 200 ? queued : []).toEqual([]);
    expect(after).toEqual(before);
  });

  test("BUG-PENDING: PUT /api/2.0/files/file/{fileId}/checkconversion - outputType pdf yields a .pdf result, as the DTO describes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const control = await putFile(
      owner,
      myDocs,
      "Autotest Convert PdfControl.rtf",
      rtf("Control"),
    );
    await startConversion(owner, control.id, {
      startConvert: true,
      outputType: "docx",
    });
    expect((await waitConversion(owner, control.id)).error ?? "").toBe("");
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Pdf.rtf",
      rtf("To pdf"),
    );

    await startConversion(owner, id, { startConvert: true, outputType: "pdf" });
    const done = await waitConversion(owner, id);
    expect(done.progress).toBe(100);

    knownDefect(
      "outputType is ignored: the result of a pdf request is a .docx",
    );
    expect((done.result as { fileExst?: string } | null)?.fileExst).toBe(
      ".pdf",
    );
  });
});

test.describe("startFileConversion: what is not converted, and failures", () => {
  for (const [name, bytes] of [
    ["text.txt", Buffer.from("plain text\nsecond line\n")],
    ["table.csv", Buffer.from("name,value\nalpha,1\nbeta,2\n")],
    ["notes.md", Buffer.from("# Heading\n\ntext\n")],
  ] as const) {
    test(`PUT /api/2.0/files/file/{fileId}/checkconversion - ${name.split(".")[1].toUpperCase()} needs no conversion: 200, an empty answer, no job, no new file and no new version`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const { id } = await putFile(
        owner,
        myDocs,
        `Autotest Convert None ${name}`,
        bytes,
      );
      const before = await listing(owner, myDocs);

      const res = await startConversion(owner, id, { startConvert: true });

      expect(res.status).toBe(200);
      expect(res.entries).toEqual([]);
      expect((await readEntries(owner, id)).entries).toEqual([]);
      expect(await listing(owner, myDocs)).toEqual(before);
      await expectSourceIntact(apiSdk, owner, id, bytes);
    });
  }

  for (const title of [
    "Autotest Convert Editable.docx",
    "Autotest Convert Editable.xlsx",
    "Autotest Convert Editable.pptx",
  ]) {
    test(`PUT /api/2.0/files/file/{fileId}/checkconversion - ${title.split(".")[1]} is already editable: nothing is queued, no new file, no new version`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const { data } = await owner.files.createFile({
        folderId: myDocs,
        createFileRequest: { title },
      });
      const id = data.response!.id!;
      const before = await listing(owner, myDocs);

      const res = await startConversion(owner, id, { startConvert: true });

      expect(res.status).toBe(200);
      expect(res.entries).toEqual([]);
      expect(await listing(owner, myDocs)).toEqual(before);
      const versions = await owner.files.getFileVersionInfo({ fileId: id });
      expect(versions.data.response).toHaveLength(1);
    });
  }

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - An XML file is queued and ends with an error, no result, and a source that is unchanged; the entry is handed out once and a new attempt is possible", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const bytes = Buffer.from("<a>x</a>");
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Unsupported.xml",
      bytes,
    );
    const before = await listing(owner, myDocs);

    const started = await startConversion(owner, id);
    expect(started.status).toBe(200);
    expect(started.entries).toHaveLength(1);
    const done = await waitConversion(owner, id);

    expect(done.progress, "progress reaches 100 for a failure as well").toBe(
      100,
    );
    expect(done.error, "the failure is reported in error").toBeTruthy();
    expect(done.result ?? null).toBeNull();
    expect(await listing(owner, myDocs)).toEqual(before);
    await expectSourceIntact(apiSdk, owner, id, bytes);
    expect((await readEntries(owner, id)).entries).toEqual([]);

    const again = await startConversion(owner, id);
    expect(again.entries).toHaveLength(1);
    const second = await waitConversion(owner, id);
    expect(second.error).toBeTruthy();
    expect(await listing(owner, myDocs)).toEqual(before);
  });

  for (const [name, bytes] of [
    ["garbage.rtf", Buffer.from("this is not rtf at all")],
    ["empty.rtf", Buffer.alloc(0)],
    ["binary.html", Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02])],
  ] as const) {
    test(`PUT /api/2.0/files/file/{fileId}/checkconversion - A damaged file (${name}) ends cleanly: either an error with no new file, or a real result; the source never changes`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const { id } = await putFile(
        owner,
        myDocs,
        `Autotest Convert Damaged ${name}`,
        bytes,
      );
      const before = await listing(owner, myDocs);

      const started = await startConversion(owner, id);

      expect(started.status).toBe(200);
      if (started.entries.length === 0) {
        expect(await listing(owner, myDocs)).toEqual(before);
      } else {
        const done = await waitConversion(owner, id);
        expect(done.progress).toBe(100);
        const after = await listing(owner, myDocs);
        if (done.error) {
          expect(done.result ?? null).toBeNull();
          expect(after).toEqual(before);
        } else {
          const result = done.result as FileRef;
          expect(after).toEqual(
            [...before, `${result.id}:${result.title}:v1`].sort(),
          );
          const { status, bytes: docx } = await downloadFile(
            apiSdk,
            "owner",
            result.id!,
          );
          expect(status).toBe(200);
          expect(() => extractDocxText(docx)).not.toThrow();
        }
      }
      await expectSourceIntact(apiSdk, owner, id, bytes);
    });
  }

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - A file that does not exist answers 200 with an empty list for both methods and nothing is created; an id that is not a number is a client error", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const before = await listing(owner, myDocs);

    for (const fileId of [99999999, 0, -1]) {
      const started = await startConversion(owner, fileId);
      expect(started.status, `start ${fileId}`).toBe(200);
      expect(started.entries, `start ${fileId}`).toEqual([]);
      const read = await readEntries(owner, fileId);
      expect(read.status, `read ${fileId}`).toBe(200);
      expect(read.entries, `read ${fileId}`).toEqual([]);
    }
    const startJunk = await owner.operations.startFileConversion({
      fileId: "abc",
    });
    const readJunk = await owner.operations.checkConversionStatus({
      fileId: "abc",
    });
    for (const status of [startJunk.status, readJunk.status]) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
    expect(await listing(owner, myDocs)).toEqual(before);
  });
});

test.describe("startFileConversion and checkConversionStatus: permissions", () => {
  test("PUT /api/2.0/files/file/{fileId}/checkconversion - A user with no access to the file is refused with 403 by both methods and nothing is made", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const bytes = rtf("Private text");
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Private.rtf",
      bytes,
    );
    const before = await listing(owner, myDocs);
    const { api: outsider } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const start = await outsider.operations.startFileConversion({ fileId: id });
    const read = await outsider.operations.checkConversionStatus({
      fileId: id,
      start: true,
    });

    expect(start.status).toBe(403);
    expect(read.status).toBe(403);
    expect((await readEntries(owner, id)).entries).toEqual([]);
    expect(await listing(owner, myDocs)).toEqual(before);
    await expectSourceIntact(apiSdk, owner, id, bytes);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - An unauthenticated caller gets 401 from both methods and nothing is made", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const bytes = rtf("Anonymous text");
    const { id } = await putFile(
      owner,
      myDocs,
      "Autotest Convert Anonymous.rtf",
      bytes,
    );
    const before = await listing(owner, myDocs);
    const anon = anonymousOperations(apiSdk);

    const start = await anon.startFileConversion({ fileId: id });
    const read = await anon.checkConversionStatus({ fileId: id, start: true });

    expect(start.status).toBe(401);
    expect(read.status).toBe(401);
    expect((await readEntries(owner, id)).entries).toEqual([]);
    expect(await listing(owner, myDocs)).toEqual(before);
    await expectSourceIntact(apiSdk, owner, id, bytes);
  });

  test("GET /api/2.0/files/file/{fileId}/checkconversion - A user with Read access may ask about a file's conversion and gets an empty list while none is known", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Convert Read Status Room");
    const { id } = await putFile(
      owner,
      roomId,
      "Autotest Convert ReadStatus.rtf",
      rtf("Read status"),
    );
    const { api: reader, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.Read);

    const res = await readEntries(reader, id);

    expect(res.status).toBe(200);
    expect(res.entries).toEqual([]);
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - A user with Content creator access converts an own file in the room: the result lands there and the user can read it", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Convert Creator Room");
    const { api: creator, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.ContentCreator);
    const { id } = await putFile(
      creator,
      roomId,
      "Autotest Convert Creator.rtf",
      rtf("Creator text"),
    );

    const started = await startConversion(creator, id);

    expect(started.status).toBe(200);
    expect(started.entries).toHaveLength(1);
    const done = await waitConversion(creator, id);
    expect(done.error ?? "").toBe("");
    const result = done.result as FileRef & { folderId?: number };
    expect(result.folderId).toBe(roomId);
    expect(await textOf(apiSdk, "user", result.id!)).toBe("Creator text");
    expect(
      (await titlesIn(owner, roomId, "Autotest Convert Creator.docx")).map(
        (f) => f.id,
      ),
    ).toEqual([result.id]);
  });

  test("SECURITY-DIAG: GET /api/2.0/files/file/{fileId}/checkconversion - Another user with Read access polls the owner's conversion (observation only)", async ({
    apiSdk,
  }, testInfo) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(owner, "Autotest Convert Diag Room");
    const paragraphs = Array.from(
      { length: 3000 },
      (_, i) => `Diag ${i} lorem ipsum dolor sit amet`,
    );
    const { id } = await putFile(
      owner,
      roomId,
      "Autotest Convert Diag.html",
      html(paragraphs),
    );
    const { api: reader, data: user } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await invite(owner, roomId, user.response!.id!, FileShare.Read);
    // Premise: the reader really can read the room.
    expect(
      (await reader.folders.getFolderByFolderId({ folderId: roomId })).status,
    ).toBe(200);

    const started = await startConversion(owner, id);
    expect(started.entries).toHaveLength(1);
    let readerSawRunning = false;
    let readerSawFinished = false;
    let ownerSawFinished = false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 45_000) {
      const theirs = await readEntries(reader, id);
      if (theirs.entries.length && theirs.entries[0].progress !== 100)
        readerSawRunning = true;
      if (theirs.entries.length && theirs.entries[0].progress === 100)
        readerSawFinished = true;
      const mine = await readEntries(owner, id);
      if (mine.entries.length && mine.entries[0].progress === 100)
        ownerSawFinished = true;
      if (
        readerSawFinished ||
        ownerSawFinished ||
        (!theirs.entries.length && !mine.entries.length)
      )
        break;
    }

    const results = await titlesIn(owner, roomId, "Autotest Convert Diag.docx");
    const observation = {
      readerSawRunning,
      readerSawFinished,
      ownerSawFinished,
      resultFiles: results.length,
    };
    testInfo.annotations.push({
      type: "security-diagnostic",
      description: JSON.stringify(observation),
    });
    await testInfo.attach("conversion-entry-visibility", {
      body: JSON.stringify(observation, null, 2),
      contentType: "application/json",
    });
    // Whatever the visibility, the conversion itself must have produced exactly one result.
    await expect
      .poll(
        async () =>
          (await titlesIn(owner, roomId, "Autotest Convert Diag.docx")).length,
        { timeout: 30_000 },
      )
      .toBe(1);
  });
});
