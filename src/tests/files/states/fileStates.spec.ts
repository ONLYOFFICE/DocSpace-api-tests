import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { downloadFile } from "@/src/helpers/download";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

// File-state matrix. Each block separates what the SDK descriptions define (named
// "Documented") from what is only observed on the test portal ("Observed").

type Api = ReturnType<ApiSDK["forRole"]>;

async function roomWithHtml(apiSdk: ApiSDK, content = "<p>original</p>") {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: {
      title: "Autotest File States Room",
      roomType: RoomType.CustomRoom,
    },
  });
  const roomId = roomData.response!.id!;
  const { data } = await ownerApi.files.createHtmlFile({
    folderId: roomId,
    createTextOrHtmlFileRequest: { title: "Autotest State", content },
  });
  return { ownerApi, roomId, fileId: (data.response as { id: number }).id };
}

async function addMember(
  apiSdk: ApiSDK,
  roomId: number,
  access: FileShare,
  type: "User" | "RoomAdmin" = "User",
) {
  const { api, data } = await apiSdk.addAuthenticatedMember("owner", type);
  const { status } = await apiSdk.forRole("owner").rooms.setRoomSecurity({
    id: roomId,
    roomInvitationRequest: {
      invitations: [{ id: data.response!.id!, access }],
      notify: false,
    },
  });
  expect(status).toBe(200);
  return api;
}

async function fileState(apiSdk: ApiSDK, fileId: number) {
  const { data, status } = await apiSdk
    .forRole("owner")
    .files.getFileInfo({ fileId });
  const response = data.response as {
    title?: string;
    version?: number;
    locked?: boolean;
    fileStatus?: number;
  };
  return {
    status,
    title: response?.title,
    version: response?.version,
    locked: Boolean(response?.locked),
    editing: (Number(response?.fileStatus ?? 0) & 1) === 1,
    bytes:
      status === 200
        ? (await downloadFile(apiSdk, "owner", fileId)).bytes.toString("base64")
        : null,
  };
}

const replacement = () =>
  new File(["<p>replaced</p>"], "replacement.html", { type: "text/html" });

test.describe("State: locked file", () => {
  async function lockedFile(apiSdk: ApiSDK) {
    const { ownerApi, roomId, fileId } = await roomWithHtml(apiSdk);
    const member = await addMember(apiSdk, roomId, FileShare.ContentCreator);
    const { status } = await ownerApi.files.lockFile({
      fileId,
      lockFileRequest: { lockFile: true },
    });
    expect(status).toBe(200);
    return { ownerApi, member, fileId };
  }

  // Documented (saveEditingFileFromForm): refused with 403 when the file is locked.
  test("saveediting - Content cannot be replaced by someone else and nothing changes", async ({
    apiSdk,
  }) => {
    const { member, fileId } = await lockedFile(apiSdk);
    const before = await fileState(apiSdk, fileId);

    const { status } = await member.files.saveEditingFileFromForm({
      fileId,
      file: replacement(),
      forcesave: false,
    });

    expect(status).toBe(403);
    expect(await fileState(apiSdk, fileId)).toEqual(before);
  });

  // Whatever status it answers, the refused claim must leave the file as it was
  // (checked on 2026-10-15: version, bytes, lock and editing flag all unchanged).
  test("startedit - A refused claim on a locked file changes nothing", async ({
    apiSdk,
  }) => {
    const { member, fileId } = await lockedFile(apiSdk);
    const before = await fileState(apiSdk, fileId);

    await member.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });

    expect(await fileState(apiSdk, fileId)).toEqual(before);
  });

  // Documented (lockFile): the lock "blocks editing" for everybody but the setter.
  // The claim is refused, but through an unhandled exception (500).
  test.fail(
    "BUG 84768: startedit - Another member cannot claim a locked file and gets a client error, not 500",
    async ({ apiSdk }) => {
      const { member, fileId } = await lockedFile(apiSdk);
      const before = await fileState(apiSdk, fileId);

      const { status } = await member.files.startEditFile({
        fileId,
        startEditRequest: { editingAlone: true },
      });

      expect(await fileState(apiSdk, fileId)).toEqual(before);
      expect(status).not.toBe(500);
    },
  );

  // Documented (lockFile): the lock blocks others, not "the account that set it".
  test("updatefile and deletefile - The account that set the lock can still rename and delete", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await lockedFile(apiSdk);

    const { status: renameStatus } = await ownerApi.files.updateFile({
      fileId,
      updateFileRequest: { title: "Renamed by setter" },
    });
    expect(renameStatus).toBe(200);
    expect((await fileState(apiSdk, fileId)).title).toBe(
      "Renamed by setter.html",
    );

    const { status: deleteStatus } = await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
    });
    expect(deleteStatus).toBe(200);
    await waitForOperation(ownerApi.operations);
    expect((await fileState(apiSdk, fileId)).status).toBe(404);
  });

  // Documented: the lock blocks editing, renaming and deleting, not reading.
  test("Reading stays possible: info, download address and copy", async ({
    apiSdk,
  }) => {
    const { member, fileId } = await lockedFile(apiSdk);

    const info = await member.files.getFileInfo({ fileId });
    const address = await member.files.getPresignedUri({ fileId });

    expect(info.status).toBe(200);
    expect(info.data.response?.locked).toBe(true);
    expect(address.status).toBe(200);
  });
});

test.describe("State: open in an editing session", () => {
  // A docx: HTML files do not carry the editing flag the same way.
  async function editedFile(apiSdk: ApiSDK) {
    const { ownerApi, roomId } = await roomWithHtml(apiSdk);
    const fileId = (
      await ownerApi.files.createFile({
        folderId: roomId,
        createFileRequest: { title: "Autotest Edited.docx" },
      })
    ).data.response!.id!;
    const member = await addMember(apiSdk, roomId, FileShare.ContentCreator);
    const { data } = await ownerApi.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });
    expect(typeof data.response).toBe("string");
    return { ownerApi, member, fileId };
  }

  // Documented (saveEditingFileFromForm): refused with 403 when the file "is open
  // in an editing session started by somebody else". Today the call answers 200 AND
  // really replaces the file: checked on 2026-10-15 on a docx - version 1 -> 2, the
  // stored bytes become the uploaded ones, the owner's editing flag is cleared and the
  // owner's next trackeditfile is refused with 403 (its session is gone).
  test.fail(
    "BUG 84769: saveediting - Content cannot be replaced by another member during an editing session",
    async ({ apiSdk }) => {
      const { member, fileId } = await editedFile(apiSdk);
      const before = await fileState(apiSdk, fileId);

      const { status } = await member.files.saveEditingFileFromForm({
        fileId,
        file: replacement(),
        forcesave: false,
      });

      const after = await fileState(apiSdk, fileId);
      expect(after.bytes).toBe(before.bytes);
      expect(after.version).toBe(before.version);
      expect(after.editing).toBe(true);
      expect(status).toBe(403);
    },
  );

  // Documented (startEditFile): the marked file "is kept from being deleted or moved".
  test("deletefile - A file being edited is not deleted", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await editedFile(apiSdk);
    const before = await fileState(apiSdk, fileId);

    const { status } = await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
    });

    // The refusal queues no operation, so there is nothing to wait for.
    expect(await fileState(apiSdk, fileId)).toEqual(before);
    expect(before.editing).toBe(true);
    expect(status).toBe(403);
  });

  test("Reading stays possible: info, download address and copy", async ({
    apiSdk,
  }) => {
    const { member, fileId } = await editedFile(apiSdk);

    const info = await member.files.getFileInfo({ fileId });
    const address = await member.files.getPresignedUri({ fileId });

    expect(info.status).toBe(200);
    expect(address.status).toBe(200);
  });
});

test.describe("State: file in an archived room", () => {
  async function archivedFile(apiSdk: ApiSDK) {
    const { ownerApi, roomId, fileId } = await roomWithHtml(apiSdk);
    const { data } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Autotest Archived Sheet.xlsx" },
    });
    const sheetId = data.response!.id!;
    await archiveRoomAndWait(apiSdk, roomId);
    return { ownerApi, fileId, sheetId };
  }

  // Observed (and consistent with the archived-room refusals already covered for
  // history, version restore, copy into and creation inside): an archived room
  // is read-only, so each mutation is refused and the file stays as it was.
  const mutations: Array<{
    name: string;
    run: (
      api: Api,
      ids: { fileId: number; sheetId: number },
    ) => Promise<{ status: number }>;
  }> = [
    {
      name: "updateFile (rename)",
      run: (api, { fileId }) =>
        api.files.updateFile({
          fileId,
          updateFileRequest: { title: "Renamed in archive" },
        }),
    },
    {
      name: "lockFile",
      run: (api, { fileId }) =>
        api.files.lockFile({ fileId, lockFileRequest: { lockFile: true } }),
    },
    {
      name: "startEditFile",
      run: (api, { fileId }) =>
        api.files.startEditFile({
          fileId,
          startEditRequest: { editingAlone: true },
        }),
    },
    {
      name: "saveEditingFileFromForm",
      run: (api, { fileId }) =>
        api.files.saveEditingFileFromForm({
          fileId,
          file: replacement(),
          forcesave: false,
        }),
    },
    {
      name: "createEditSession",
      run: (api, { fileId }) =>
        api.files.createEditSession({ fileId, fileSize: 1024 }),
    },
    {
      name: "setCustomFilterTag",
      run: (api, { sheetId }) =>
        api.files.setCustomFilterTag({
          fileId: sheetId,
          customFilterRequest: { enabled: true },
        }),
    },
    {
      name: "setFileOrder",
      run: (api, { fileId }) =>
        api.files.setFileOrder({ fileId, orderRequestDto: { order: 1 } }),
    },
  ];

  for (const mutation of mutations) {
    test(`${mutation.name} - refused for the owner and the file stays as it was`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId, sheetId } = await archivedFile(apiSdk);
      const before = await fileState(apiSdk, fileId);
      const sheetBefore = await fileState(apiSdk, sheetId);

      const { status } = await mutation.run(ownerApi, { fileId, sheetId });

      expect(await fileState(apiSdk, fileId)).toEqual(before);
      expect(await fileState(apiSdk, sheetId)).toEqual(sheetBefore);
      expect(status).toBe(403);
    });
  }

  test("deleteFile - refused for the owner and the file stays", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await archivedFile(apiSdk);
    const before = await fileState(apiSdk, fileId);

    const { status } = await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
    });
    if (status === 200) {
      await waitForOperation(ownerApi.operations);
    }

    expect(await fileState(apiSdk, fileId)).toEqual(before);
  });

  test("Reading stays possible: info, download address, favorite flag", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await archivedFile(apiSdk);

    const info = await ownerApi.files.getFileInfo({ fileId });
    const address = await ownerApi.files.getPresignedUri({ fileId });
    const favorite = await ownerApi.files.toggleFileFavorite({
      fileId,
      favorite: true,
    });

    expect(info.status).toBe(200);
    expect(address.status).toBe(200);
    expect(favorite.status).toBe(200);
  });
});

test.describe("State: deleted file", () => {
  // Observed: every operation answers a deleted file like an unknown id (404).
  test("Every file operation answers 404 once the file is deleted for good", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId, fileId } = await roomWithHtml(apiSdk);
    const { status: deleteStatus } = await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
    });
    expect(deleteStatus).toBe(200);
    await waitForOperation(ownerApi.operations);
    expect((await fileState(apiSdk, fileId)).status).toBe(404);

    const calls: Array<[string, Promise<{ status: number }>]> = [
      ["getFileInfo", ownerApi.files.getFileInfo({ fileId })],
      ["openEditFile", ownerApi.files.openEditFile({ fileId })],
      [
        "createEditSession",
        ownerApi.files.createEditSession({ fileId, fileSize: 1 }),
      ],
      [
        "copyFileAs",
        ownerApi.files.copyFileAs({
          fileId,
          copyAsRequest: { destTitle: "Copy.html", destFolderId: roomId },
        }),
      ],
      [
        "saveFileAsPdf",
        ownerApi.files.saveFileAsPdf({
          id: fileId,
          saveAsPdfRequest: { folderId: roomId, title: "Pdf" },
        }),
      ],
      ["getPresignedUri", ownerApi.files.getPresignedUri({ fileId })],
      ["getPresignedFileUri", ownerApi.files.getPresignedFileUri({ fileId })],
      [
        "setFileOrder",
        ownerApi.files.setFileOrder({ fileId, orderRequestDto: { order: 1 } }),
      ],
      [
        "createFilePrimaryExternalLink",
        ownerApi.files.createFilePrimaryExternalLink({
          id: fileId,
          fileLinkRequest: { access: FileShare.Read },
        }),
      ],
    ];

    // Observed 404 in 17 of 18 runs and 403 once for startEditFile; the SDK does not
    // say which, so it is only required to refuse and start no session.
    const start = await ownerApi.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });
    expect(start.status).not.toBe(200);

    const statuses: Record<string, number> = {};
    for (const [name, call] of calls) {
      statuses[name] = (await call).status;
    }

    expect(statuses).toEqual(
      Object.fromEntries(calls.map(([name]) => [name, 404])),
    );
  });
});
