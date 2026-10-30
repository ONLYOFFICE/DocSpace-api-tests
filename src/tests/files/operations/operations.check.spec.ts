import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  CheckDestFolderResult,
  FileConflictResolveType,
  FileShare,
  FolderType,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import { createOoForm } from "@/src/helpers/files";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import type { ApiSDK } from "@/src/services/api-sdk";
import type { Role } from "@/src/services/token-store";

// checkMoveOrCopyBatchItems (GET /files/fileops/move) and
// checkMoveOrCopyDestFolder (GET /files/fileops/checkdestfolder).
//
// BUG 84727: the SDK 4.0.0 request builder spreads `destFolderId` with
// Object.entries(), so a number is dropped from the query and a string is split
// into `0=1&1=2...`. The server then rejects the call as "no destination", which
// is why every functional test below sends the request itself (`checkRequest`)
// with a correct query. The SDK path is covered by the "destFolderId
// serialization" group, marked `BUG 84727`, which flips to "unexpected pass" as
// soon as the SDK is fixed.
//
// Contract used (SDK JSDoc, confirmed on the portal):
//   * move: answers the part of the request that clashes by name with an entry
//     in the destination; `[]` means no clash. `conflictResolveType` is ignored,
//     unknown source ids are passed over, nothing is changed.
//   * checkdestfolder: `result` AllAllowed/PartAllowed/NoneAllowed and `files`
//     naming the accepted ones; only fileIds and destFolderId are read; a
//     form-filling room accepts PDF forms only.
//   * both: create access to the destination is needed (archived room and a
//     room the caller cannot write to answer 403), a missing destination is 404
//     and a request without destFolderId is rejected as invalid (400).

type Api = ReturnType<ApiSDK["forRole"]>;
type Kind = "move" | "checkdestfolder";
type Query = {
  fileIds?: number[];
  folderIds?: number[];
  destFolderId?: number | string;
  conflictResolveType?: string;
};
type Entry = { id?: number; title?: string; folderId?: number };
type DestCheck = { result?: number; files?: Entry[] };

async function checkRequest(
  apiSdk: ApiSDK,
  role: Role,
  kind: Kind,
  query: Query,
) {
  const params = new URLSearchParams();
  for (const id of query.fileIds ?? []) params.append("fileIds", String(id));
  for (const id of query.folderIds ?? [])
    params.append("folderIds", String(id));
  if (query.destFolderId !== undefined) {
    params.set("destFolderId", String(query.destFolderId));
  }
  if (query.conflictResolveType !== undefined) {
    params.set("conflictResolveType", query.conflictResolveType);
  }
  const response = await apiSdk
    .createAxiosInstance()
    .get(
      `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/fileops/${kind}?${params}`,
      {
        headers: {
          Authorization: `Bearer ${apiSdk.tokenStore.getToken(role)}`,
          Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
        },
        validateStatus: () => true,
      },
    );
  return { status: response.status, body: response.data };
}

const clashes = (res: { body: unknown }): Entry[] =>
  ((res.body as { response?: Entry[] }).response ?? []) as Entry[];

const destCheck = (res: { body: unknown }): DestCheck =>
  ((res.body as { response?: DestCheck }).response ?? {}) as DestCheck;

const titles = (entries: Entry[] | undefined) =>
  (entries ?? []).map((e) => e.title).sort();

async function getMyDocsId(api: Api): Promise<number> {
  const { data, status } = await api.folders.getMyFolder();
  expect(status).toBe(200);
  return data.response!.current!.id!;
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

async function createRoom(api: Api, title: string, roomType: RoomType) {
  const { data, status } = await api.rooms.createRoom({
    createRoomRequestDto: { title, roomType },
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

/** Files and folders of every listed folder, for "nothing was changed" checks. */
async function snapshot(api: Api, folderIds: number[]) {
  const out: Record<number, string[]> = {};
  for (const folderId of folderIds) {
    const { data, status } = await api.folders.getFolderByFolderId({
      folderId,
    });
    expect(status).toBe(200);
    const entries = [
      ...(data.response?.files ?? []),
      ...(data.response?.folders ?? []),
    ] as Entry[];
    out[folderId] = entries.map((e) => `${e.id}:${e.title}`).sort();
  }
  return out;
}

async function expectNoOperationQueued(api: Api) {
  const { data, status } = await api.operations.getOperationStatuses();
  expect(status).toBe(200);
  expect(data.response ?? []).toEqual([]);
}

/** Called after the setup assertions: from here only the violated condition may fail. */
function knownDefect(label: string) {
  test.fail(true, label);
}

test.describe("destFolderId serialization (SDK regression)", () => {
  for (const kind of ["move", "checkdestfolder"] as const) {
    const call = (api: Api, fileId: number, destFolderId: number | string) =>
      kind === "move"
        ? api.operations.checkMoveOrCopyBatchItems({
            fileIds: [fileId],
            destFolderId,
          })
        : api.operations.checkMoveOrCopyDestFolder({
            fileIds: [fileId],
            destFolderId,
          });
    const method =
      kind === "move"
        ? "checkMoveOrCopyBatchItems"
        : "checkMoveOrCopyDestFolder";

    test(`BUG 84727: GET /api/2.0/files/fileops/${kind} - ${method} sends a numeric destFolderId in the query`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const fileId = await createFile(
        owner,
        myDocs,
        "Autotest Check Sdk Number.docx",
      );
      const roomId = await createRoom(
        owner,
        "Autotest Check Sdk Number Room",
        RoomType.CustomRoom,
      );

      // Premise: the server accepts exactly this request when it is built correctly.
      const control = await checkRequest(apiSdk, "owner", kind, {
        fileIds: [fileId],
        destFolderId: roomId,
      });
      expect(control.status).toBe(200);

      const res = await call(owner, fileId, roomId);
      const sent = new URL(
        (res as unknown as { config: { url: string } }).config.url,
      ).searchParams;

      knownDefect(
        "SDK drops a numeric destFolderId from the query; the server answers 400",
      );
      expect(sent.get("destFolderId")).toBe(String(roomId));
      expect(res.status).toBe(200);
    });

    test(`BUG 84727: GET /api/2.0/files/fileops/${kind} - ${method} sends a string destFolderId as one parameter, not as indexed characters`, async ({
      apiSdk,
    }) => {
      const owner = apiSdk.forRole("owner");
      const myDocs = await getMyDocsId(owner);
      const fileId = await createFile(
        owner,
        myDocs,
        "Autotest Check Sdk String.docx",
      );
      const roomId = await createRoom(
        owner,
        "Autotest Check Sdk String Room",
        RoomType.CustomRoom,
      );

      const control = await checkRequest(apiSdk, "owner", kind, {
        fileIds: [fileId],
        destFolderId: String(roomId),
      });
      expect(control.status).toBe(200);

      const res = await call(owner, fileId, String(roomId));
      const sent = new URL(
        (res as unknown as { config: { url: string } }).config.url,
      ).searchParams;
      const indexedKeys = [...sent.keys()].filter((k) => /^\d+$/.test(k));

      knownDefect(
        "SDK spreads the string with Object.entries(): ?0=1&1=2&... instead of destFolderId=12",
      );
      expect(sent.get("destFolderId")).toBe(String(roomId));
      expect(indexedKeys).toEqual([]);
      expect(res.status).toBe(200);
    });
  }
});

test.describe("checkMoveOrCopyBatchItems", () => {
  test("GET /api/2.0/files/fileops/move - A clashing file is reported with its source id, title and folder, and nothing changes", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(owner, myDocs, "Autotest Check Source");
    const dest = await createFolder(owner, myDocs, "Autotest Check Dest");
    const clashing = await createFile(owner, source, "Report.docx");
    await createFile(owner, dest, "Report.docx");
    const before = await snapshot(owner, [source, dest]);

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [clashing],
      destFolderId: dest,
    });

    expect(res.status).toBe(200);
    const found = clashes(res);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(clashing);
    expect(found[0].title).toBe("Report.docx");
    expect(found[0].folderId).toBe(source);
    expect(await snapshot(owner, [source, dest])).toEqual(before);
    await expectNoOperationQueued(owner);
  });

  test("GET /api/2.0/files/fileops/move - Without a same-named entry the answer is an empty array", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Check No Clash.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Check No Clash Room",
      RoomType.CustomRoom,
    );
    await createFile(owner, roomId, "Something Else.docx");

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(200);
    expect(clashes(res)).toEqual([]);
  });

  test("GET /api/2.0/files/fileops/move - A clashing folder is reported by its id and title", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(
      owner,
      myDocs,
      "Autotest Check Folder Source",
    );
    const dest = await createFolder(
      owner,
      myDocs,
      "Autotest Check Folder Dest",
    );
    const clashing = await createFolder(owner, source, "Archive 2026");
    await createFolder(owner, dest, "Archive 2026");

    const res = await checkRequest(apiSdk, "owner", "move", {
      folderIds: [clashing],
      destFolderId: dest,
    });

    expect(res.status).toBe(200);
    expect(clashes(res).map((e) => e.id)).toEqual([clashing]);
    expect(titles(clashes(res))).toEqual(["Archive 2026"]);
  });

  test("GET /api/2.0/files/fileops/move - Only the clashing items of a mixed selection are reported, each once", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(
      owner,
      myDocs,
      "Autotest Check Mixed Source",
    );
    const dest = await createFolder(owner, myDocs, "Autotest Check Mixed Dest");
    const clashFile = await createFile(owner, source, "Clash.docx");
    const cleanFile = await createFile(owner, source, "Clean.docx");
    const clashFolder = await createFolder(owner, source, "ClashFolder");
    const cleanFolder = await createFolder(owner, source, "CleanFolder");
    await createFile(owner, dest, "Clash.docx");
    await createFolder(owner, dest, "ClashFolder");

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [clashFile, cleanFile],
      folderIds: [clashFolder, cleanFolder],
      destFolderId: dest,
    });

    expect(res.status).toBe(200);
    expect(
      clashes(res)
        .map((e) => e.id)
        .sort(),
    ).toEqual([clashFile, clashFolder].sort());
    expect(titles(clashes(res))).toEqual(["Clash.docx", "ClashFolder"]);
  });

  test("GET /api/2.0/files/fileops/move - Names that differ only by letter case or use non-Latin letters still clash", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(
      owner,
      myDocs,
      "Autotest Check Case Source",
    );
    const dest = await createFolder(owner, myDocs, "Autotest Check Case Dest");
    const lower = await createFile(owner, source, "budget.docx");
    const unicode = await createFile(owner, source, "Отчёт Ünï.docx");
    await createFile(owner, dest, "BUDGET.DOCX");
    await createFile(owner, dest, "Отчёт Ünï.docx");

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [lower, unicode],
      destFolderId: dest,
    });

    expect(res.status).toBe(200);
    expect(
      clashes(res)
        .map((e) => e.id)
        .sort(),
    ).toEqual([lower, unicode].sort());
  });

  test("GET /api/2.0/files/fileops/move - A clash inside a room subfolder is reported for the subfolder only, not for the room root", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Check Nested.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Check Nested Room",
      RoomType.CustomRoom,
    );
    const sub = await createFolder(owner, roomId, "Inner");
    await createFile(owner, sub, "Autotest Check Nested.docx");

    const inSub = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId],
      destFolderId: sub,
    });
    const inRoot = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(inSub.status).toBe(200);
    expect(clashes(inSub).map((e) => e.id)).toEqual([fileId]);
    expect(inRoot.status).toBe(200);
    expect(clashes(inRoot)).toEqual([]);
  });

  test("GET /api/2.0/files/fileops/move - Repeating an id reports the item once", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(
      owner,
      myDocs,
      "Autotest Check Dup Source",
    );
    const dest = await createFolder(owner, myDocs, "Autotest Check Dup Dest");
    const fileId = await createFile(owner, source, "Twice.docx");
    await createFile(owner, dest, "Twice.docx");

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId, fileId],
      destFolderId: dest,
    });

    expect(res.status).toBe(200);
    expect(clashes(res).map((e) => e.id)).toEqual([fileId]);
  });

  test("GET /api/2.0/files/fileops/move - A source id that resolves to nothing is passed over and the real clash is still reported", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(
      owner,
      myDocs,
      "Autotest Check Unknown Source",
    );
    const dest = await createFolder(
      owner,
      myDocs,
      "Autotest Check Unknown Dest",
    );
    const fileId = await createFile(owner, source, "Real.docx");
    await createFile(owner, dest, "Real.docx");

    const onlyUnknown = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [99999999],
      destFolderId: dest,
    });
    const withReal = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [99999999, fileId],
      destFolderId: dest,
    });

    expect(onlyUnknown.status).toBe(200);
    expect(clashes(onlyUnknown)).toEqual([]);
    expect(withReal.status).toBe(200);
    expect(clashes(withReal).map((e) => e.id)).toEqual([fileId]);
  });

  test("GET /api/2.0/files/fileops/move - conflictResolveType does not change what is reported", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(
      owner,
      myDocs,
      "Autotest Check Resolve Source",
    );
    const dest = await createFolder(
      owner,
      myDocs,
      "Autotest Check Resolve Dest",
    );
    const fileId = await createFile(owner, source, "Resolve.docx");
    await createFile(owner, dest, "Resolve.docx");

    const reported: number[][] = [];
    for (const conflictResolveType of [
      FileConflictResolveType.Skip,
      FileConflictResolveType.Overwrite,
      FileConflictResolveType.Duplicate,
    ]) {
      const res = await checkRequest(apiSdk, "owner", "move", {
        fileIds: [fileId],
        destFolderId: dest,
        conflictResolveType: String(conflictResolveType),
      });
      expect(res.status).toBe(200);
      reported.push(clashes(res).map((e) => e.id!));
    }

    expect(reported).toEqual([[fileId], [fileId], [fileId]]);
  });

  test("GET /api/2.0/files/fileops/move - An empty selection answers 200 with an empty array", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const dest = await createFolder(owner, myDocs, "Autotest Check Empty Dest");

    const res = await checkRequest(apiSdk, "owner", "move", {
      destFolderId: dest,
    });

    expect(res.status).toBe(200);
    expect(clashes(res)).toEqual([]);
  });

  test("GET /api/2.0/files/fileops/move - A request without destFolderId is rejected with 400", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Check No Dest.docx",
    );

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId],
    });

    expect(res.status).toBe(400);
  });

  test("GET /api/2.0/files/fileops/move - A destination that does not exist answers 404", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Check Missing Dest.docx",
    );

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId],
      destFolderId: 99999999,
    });

    expect(res.status).toBe(404);
  });

  test("GET /api/2.0/files/fileops/move - An archived room destination answers 403", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Check Archived.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Check Archived Room",
      RoomType.CustomRoom,
    );
    await archiveRoomAndWait(apiSdk, roomId);

    const res = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(403);
  });

  test("GET /api/2.0/files/fileops/move - A user with Read access to the room gets 403 for it as a destination", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Check Reader.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Check Reader Room",
      RoomType.CustomRoom,
    );
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await invite(owner, roomId, user.response!.id!, FileShare.Read);

    const res = await checkRequest(apiSdk, "user", "move", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(403);
  });

  test("GET /api/2.0/files/fileops/move - A file the caller cannot read is passed over and its name clash is not revealed", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const privateFile = await createFile(owner, myDocs, "Private Plan.docx");
    const roomId = await createRoom(
      owner,
      "Autotest Check Private Room",
      RoomType.CustomRoom,
    );
    await createFile(owner, roomId, "Private Plan.docx");
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await invite(owner, roomId, user.response!.id!, FileShare.ContentCreator);

    // Positive control: the owner, who can read the file, does see the clash.
    const control = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [privateFile],
      destFolderId: roomId,
    });
    expect(control.status).toBe(200);
    expect(clashes(control).map((e) => e.id)).toEqual([privateFile]);

    const res = await checkRequest(apiSdk, "user", "move", {
      fileIds: [privateFile],
      destFolderId: roomId,
    });

    expect(res.status).toBeLessThan(500);
    expect(clashes(res)).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("Private Plan");
  });
});

test.describe("checkMoveOrCopyDestFolder", () => {
  test("GET /api/2.0/files/fileops/checkdestfolder - A Custom room accepts every file: AllAllowed and the accepted files are named", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const a = await createFile(owner, myDocs, "Autotest Dest A.docx");
    const b = await createFile(owner, myDocs, "Autotest Dest B.docx");
    const roomId = await createRoom(
      owner,
      "Autotest Dest Custom Room",
      RoomType.CustomRoom,
    );
    const before = await snapshot(owner, [myDocs, roomId]);

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [a, b],
      destFolderId: roomId,
    });

    expect(res.status).toBe(200);
    expect(destCheck(res).result).toBe(CheckDestFolderResult.AllAllowed);
    expect(titles(destCheck(res).files)).toEqual([
      "Autotest Dest A.docx",
      "Autotest Dest B.docx",
    ]);
    expect(await snapshot(owner, [myDocs, roomId])).toEqual(before);
    await expectNoOperationQueued(owner);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A form-filling room refuses a text document: NoneAllowed and no files", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(owner, myDocs, "Autotest Dest Plain.docx");
    const roomId = await createRoom(
      owner,
      "Autotest Dest Forms Room",
      RoomType.FillingFormsRoom,
    );

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(200);
    expect(destCheck(res).result).toBe(CheckDestFolderResult.NoneAllowed);
    expect(destCheck(res).files ?? []).toEqual([]);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A form-filling room accepts a PDF form: AllAllowed and the form is named", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const formId = await createOoForm(owner, myDocs);
    const roomId = await createRoom(
      owner,
      "Autotest Dest Forms Accept Room",
      RoomType.FillingFormsRoom,
    );

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [formId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(200);
    expect(destCheck(res).result).toBe(CheckDestFolderResult.AllAllowed);
    expect(destCheck(res).files!.map((f) => f.id)).toEqual([formId]);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A form and a text document together give PartAllowed naming only the form", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const formId = await createOoForm(owner, myDocs);
    const plainId = await createFile(
      owner,
      myDocs,
      "Autotest Dest Part Plain.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Dest Part Room",
      RoomType.FillingFormsRoom,
    );

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [plainId, formId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(200);
    expect(destCheck(res).result).toBe(CheckDestFolderResult.PartAllowed);
    expect(destCheck(res).files!.map((f) => f.id)).toEqual([formId]);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - Folder ids and copy options play no part in the answer", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const plainId = await createFile(
      owner,
      myDocs,
      "Autotest Dest Ignored Plain.docx",
    );
    const folderId = await createFolder(
      owner,
      myDocs,
      "Autotest Dest Ignored Folder",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Dest Ignored Room",
      RoomType.FillingFormsRoom,
    );

    const plain = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [plainId],
      destFolderId: roomId,
    });
    const withExtras = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [plainId],
      folderIds: [folderId],
      destFolderId: roomId,
      conflictResolveType: String(FileConflictResolveType.Overwrite),
    });

    expect(plain.status).toBe(200);
    expect(withExtras.status).toBe(200);
    expect(destCheck(withExtras)).toEqual(destCheck(plain));
    expect(destCheck(withExtras).result).toBe(
      CheckDestFolderResult.NoneAllowed,
    );
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A same-named file at the destination is not a reason to refuse", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Dest Same Name.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Dest Same Name Room",
      RoomType.CustomRoom,
    );
    await createFile(owner, roomId, "Autotest Dest Same Name.docx");

    // Positive control: the other method does see the clash.
    const clash = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [fileId],
      destFolderId: roomId,
    });
    expect(clashes(clash).map((e) => e.id)).toEqual([fileId]);

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(200);
    expect(destCheck(res).result).toBe(CheckDestFolderResult.AllAllowed);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - An empty selection answers 200 and names no files", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const roomId = await createRoom(
      owner,
      "Autotest Dest Empty Room",
      RoomType.CustomRoom,
    );

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      destFolderId: roomId,
    });

    expect(res.status).toBe(200);
    expect(destCheck(res).files ?? []).toEqual([]);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A request without destFolderId is rejected with 400", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Dest No Dest.docx",
    );

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
    });

    expect(res.status).toBe(400);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A destination that does not exist answers 404", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Dest Missing.docx",
    );

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: 99999999,
    });

    expect(res.status).toBe(404);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - An archived room destination answers 403", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Dest Archived.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Dest Archived Room",
      RoomType.CustomRoom,
    );
    await archiveRoomAndWait(apiSdk, roomId);

    const res = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(403);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A user with Read access to the room gets 403 for it as a destination", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(owner, myDocs, "Autotest Dest Reader.docx");
    const roomId = await createRoom(
      owner,
      "Autotest Dest Reader Room",
      RoomType.CustomRoom,
    );
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await invite(owner, roomId, user.response!.id!, FileShare.Read);

    const res = await checkRequest(apiSdk, "user", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(res.status).toBe(403);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A file the caller cannot read is not named as accepted", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const privateFile = await createFile(owner, myDocs, "Private Budget.docx");
    const roomId = await createRoom(
      owner,
      "Autotest Dest Private Room",
      RoomType.CustomRoom,
    );
    const { data: user } = await apiSdk.addAuthenticatedMember("owner", "User");
    await invite(owner, roomId, user.response!.id!, FileShare.ContentCreator);

    // Positive control: the owner gets the file named back.
    const control = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [privateFile],
      destFolderId: roomId,
    });
    expect(destCheck(control).files!.map((f) => f.id)).toEqual([privateFile]);

    const res = await checkRequest(apiSdk, "user", "checkdestfolder", {
      fileIds: [privateFile],
      destFolderId: roomId,
    });

    expect(res.status).toBeLessThan(500);
    expect(destCheck(res).files ?? []).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("Private Budget");
  });

  test("BUG-PENDING: GET /api/2.0/files/fileops/checkdestfolder - A repeated file id does not turn AllAllowed into PartAllowed", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Dest Repeated.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Dest Repeated Room",
      RoomType.CustomRoom,
    );

    // Premise: the same file listed once is fully accepted.
    const once = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: roomId,
    });
    expect(once.status).toBe(200);
    expect(destCheck(once).result).toBe(CheckDestFolderResult.AllAllowed);

    const twice = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId, fileId],
      destFolderId: roomId,
    });
    expect(twice.status).toBe(200);

    knownDefect(
      "the repeated id is counted as a refused file: result is PartAllowed (1) though the one real file is accepted",
    );
    expect(destCheck(twice).result).toBe(CheckDestFolderResult.AllAllowed);
    expect(destCheck(twice).files!.map((f) => f.id)).toEqual([fileId]);
  });
});

test.describe("Check, then act (end to end)", () => {
  test("GET /api/2.0/files/fileops/move + PUT /api/2.0/files/fileops/copy - The reported clash decides the outcome: Duplicate keeps the existing file and adds a copy", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const sourceId = await createFile(
      owner,
      myDocs,
      "Autotest Flow Clash.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Flow Clash Room",
      RoomType.CustomRoom,
    );
    const existingId = await createFile(
      owner,
      roomId,
      "Autotest Flow Clash.docx",
    );

    const check = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [sourceId],
      destFolderId: roomId,
    });
    expect(clashes(check).map((e) => e.id)).toEqual([sourceId]);

    const copied = await owner.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [sourceId],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Duplicate,
        deleteAfter: false,
      },
    });
    expect(copied.status).toBe(200);
    expect((await waitForOperation(owner.operations)).finished).toBe(true);

    const after = await snapshot(owner, [roomId, myDocs]);
    expect(after[roomId]).toHaveLength(2);
    expect(after[roomId].some((e) => e.startsWith(`${existingId}:`))).toBe(
      true,
    );
    expect(after[myDocs].some((e) => e.startsWith(`${sourceId}:`))).toBe(true);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder + PUT /api/2.0/files/fileops/move - An accepted destination takes the file, and the original folder then reports no clash for it", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const sourceFolder = await createFolder(
      owner,
      myDocs,
      "Autotest Flow Move Source",
    );
    const fileId = await createFile(
      owner,
      sourceFolder,
      "Autotest Flow Move.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Flow Move Room",
      RoomType.CustomRoom,
    );

    const verdict = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: roomId,
    });
    expect(destCheck(verdict).result).toBe(CheckDestFolderResult.AllAllowed);

    const moved = await owner.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });
    expect(moved.status).toBe(200);
    expect((await waitForOperation(owner.operations)).finished).toBe(true);

    const state = await snapshot(owner, [sourceFolder, roomId]);
    expect(state[sourceFolder]).toEqual([]);
    expect(state[roomId]).toHaveLength(1);
    expect(state[roomId][0].endsWith("Autotest Flow Move.docx")).toBe(true);

    // The file now lives in the room; a clash check against the old folder is empty.
    const movedId = Number(state[roomId][0].split(":")[0]);
    const back = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [movedId],
      destFolderId: sourceFolder,
    });
    expect(back.status).toBe(200);
    expect(clashes(back)).toEqual([]);
  });

  test("GET /api/2.0/files/fileops/checkdestfolder - A form-filling room that refuses a document says so before any copy is started", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const fileId = await createFile(
      owner,
      myDocs,
      "Autotest Flow Refused.docx",
    );
    const roomId = await createRoom(
      owner,
      "Autotest Flow Refused Room",
      RoomType.FillingFormsRoom,
    );

    const verdict = await checkRequest(apiSdk, "owner", "checkdestfolder", {
      fileIds: [fileId],
      destFolderId: roomId,
    });

    expect(destCheck(verdict).result).toBe(CheckDestFolderResult.NoneAllowed);
    // Checking is not acting: the room is still empty and no operation exists.
    expect((await snapshot(owner, [roomId]))[roomId]).toEqual([]);
    await expectNoOperationQueued(owner);
  });
});

test.describe("Preflight vs the real operation", () => {
  // The expected behaviour is that a preflight agrees with the operation it
  // announces. Both defects were reproduced with the real PUT /fileops/copy on
  // the same inputs (copy only: nothing is removed), so the contract used here
  // is the operation's own answer, not a guess.

  test("BUG-PENDING: GET /api/2.0/files/fileops/move - content=true reports the clashes that the real copy resolves", async ({
    apiSdk,
  }) => {
    const owner = apiSdk.forRole("owner");
    const myDocs = await getMyDocsId(owner);
    const source = await createFolder(owner, myDocs, "Autotest Content Source");
    const dest = await createFolder(owner, myDocs, "Autotest Content Dest");
    const sourceA = await createFile(owner, source, "a.docx");
    const sourceB = await createFile(owner, source, "b.docx");
    const destA = await createFile(owner, dest, "a.docx");
    const destB = await createFile(owner, dest, "b.docx");
    const untouched = await snapshot(owner, [dest]);

    // Premise 1: addressing the same files by id, the preflight does see both clashes.
    const byId = await checkRequest(apiSdk, "owner", "move", {
      fileIds: [sourceA, sourceB],
      destFolderId: dest,
    });
    expect(
      clashes(byId)
        .map((e) => e.id)
        .sort(),
    ).toEqual([sourceA, sourceB].sort());

    // Premise 2: the real copy of the folder content treats them as clashes too:
    // with Skip it leaves the destination exactly as it was.
    const copy = await owner.operations.copyBatchItems({
      batchRequestDto: {
        folderIds: [source],
        content: true,
        destFolderId: dest,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });
    expect(copy.status).toBe(200);
    expect((await waitForOperation(owner.operations)).finished).toBe(true);
    expect(await snapshot(owner, [dest])).toEqual(untouched);
    expect(untouched[dest]).toHaveLength(2);
    expect(untouched[dest].some((e) => e.startsWith(`${destA}:`))).toBe(true);
    expect(untouched[dest].some((e) => e.startsWith(`${destB}:`))).toBe(true);

    // The call with content=true needs the raw request: the SDK would not send destFolderId.
    const res = await apiSdk
      .createAxiosInstance()
      .get(
        `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/fileops/move?folderIds=${source}&content=true&destFolderId=${dest}`,
        {
          headers: {
            Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
            Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
          },
          validateStatus: () => true,
        },
      );
    expect(res.status).toBe(200);

    knownDefect(
      "content=true is not taken into account: the preflight answers [] although both files clash",
    );
    expect(titles(clashes({ body: res.data }))).toEqual(["a.docx", "b.docx"]);
  });

  for (const [rootName, rootType] of [
    ["Rooms", FolderType.VirtualRooms],
    ["Forms", FolderType.Forms],
    ["AI agents", FolderType.AiAgents],
  ] as const) {
    for (const kind of ["move", "checkdestfolder"] as const) {
      test(`BUG-PENDING: GET /api/2.0/files/fileops/${kind} - The ${rootName} section root is refused with 403, as the real copy refuses it`, async ({
        apiSdk,
      }) => {
        const owner = apiSdk.forRole("owner");
        const myDocs = await getMyDocsId(owner);
        const fileId = await createFile(
          owner,
          myDocs,
          "Autotest Root Probe.docx",
        );
        const { data: rootsData, status } = await owner.folders.getRootFolders(
          {},
        );
        expect(status).toBe(200);
        const rootId = (rootsData.response ?? []).find(
          (r) => r.current?.rootFolderType === rootType,
        )?.current?.id;
        expect(rootId).toBeGreaterThan(0);
        const rootBefore = await snapshot(owner, [rootId!]);

        // Premise: the real operation refuses this destination and creates nothing.
        const copy = await owner.operations.copyBatchItems({
          batchRequestDto: {
            fileIds: [fileId],
            destFolderId: rootId!,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: false,
          },
        });
        expect(copy.status).toBe(403);
        expect(await snapshot(owner, [rootId!])).toEqual(rootBefore);

        const res = await checkRequest(apiSdk, "owner", kind, {
          fileIds: [fileId],
          destFolderId: rootId,
        });

        knownDefect(
          `the preflight answers ${res.status} for the ${rootName} root, the copy answers 403`,
        );
        expect(res.status).toBe(403);
      });
    }
  }
});
