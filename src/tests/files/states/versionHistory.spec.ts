import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { downloadFile } from "@/src/helpers/download";
import { readFileSync } from "fs";
import path from "path";

type Api = ReturnType<ApiSDK["forRole"]>;
type MemberType = "RoomAdmin" | "User";

// Documented (SDK):
// - getFileVersionInfo: "in a room only its managers and content creators may read
//   the history", plain editing/read access is refused;
// - getFileHistory: any member of the room sees the log, a non-member gets 403;
// - restoreFileVersion / changeVersionHistory need the right to edit the history
//   (room admin, content creator); both refuse a locked file and one being edited;
// - restoreFileVersion: `version` missing or already the current one is 400, and the
//   restore adds a new version on top, nothing is overwritten.

const levelsByRoom: Array<{
  roomLabel: string;
  roomType: RoomType;
  levels: Array<{ label: string; type: MemberType; access: FileShare }>;
}> = [
  {
    roomLabel: "Custom",
    roomType: RoomType.CustomRoom,
    levels: [
      {
        label: "RoomManager",
        type: "RoomAdmin",
        access: FileShare.RoomManager,
      },
      {
        label: "ContentCreator",
        type: "User",
        access: FileShare.ContentCreator,
      },
      { label: "Editing", type: "User", access: FileShare.Editing },
      { label: "Read", type: "User", access: FileShare.Read },
    ],
  },
  {
    roomLabel: "Collaboration",
    roomType: RoomType.EditingRoom,
    levels: [
      {
        label: "ContentCreator",
        type: "User",
        access: FileShare.ContentCreator,
      },
      { label: "Editing", type: "User", access: FileShare.Editing },
      { label: "Read", type: "User", access: FileShare.Read },
    ],
  },
  {
    roomLabel: "Public",
    roomType: RoomType.PublicRoom,
    levels: [
      {
        label: "RoomManager",
        type: "RoomAdmin",
        access: FileShare.RoomManager,
      },
      {
        label: "ContentCreator",
        type: "User",
        access: FileShare.ContentCreator,
      },
    ],
  },
  {
    roomLabel: "VDR",
    roomType: RoomType.VirtualDataRoom,
    levels: [
      {
        label: "ContentCreator",
        type: "User",
        access: FileShare.ContentCreator,
      },
      { label: "Editing", type: "User", access: FileShare.Editing },
      { label: "Read", type: "User", access: FileShare.Read },
    ],
  },
];

// A file with three versions whose content is "v1", "v2", "v3".
async function threeVersions(
  ownerApi: Api,
  folderId: number,
  title = "Autotest Versions",
) {
  let fileId = 0;
  for (const n of [1, 2, 3]) {
    const { data } = await ownerApi.files.createHtmlFile({
      folderId,
      createTextOrHtmlFileRequest: {
        title,
        content: `v${n}`,
        createNewIfExist: true,
      },
    });
    fileId = (data.response as { id: number }).id;
  }
  return fileId;
}

async function versionCount(ownerApi: Api, fileId: number) {
  const { data } = await ownerApi.files.getFileVersionInfo({ fileId });
  return data.response?.length ?? 0;
}

async function room(apiSdk: ApiSDK, roomType: RoomType, title: string) {
  const { data } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  return data.response!.id!;
}

async function invite(
  apiSdk: ApiSDK,
  roomId: number,
  type: MemberType,
  access: FileShare,
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

test.describe("Version history - room type and access level matrix", () => {
  for (const { roomLabel, roomType, levels } of levelsByRoom) {
    for (const level of levels) {
      const canEditHistory =
        level.access === FileShare.RoomManager ||
        level.access === FileShare.ContentCreator;
      // The SDK lists only managers and content creators for the version list,
      // yet an Editing member reads it too (200): not asserted here, see the BUG
      // test below.
      const versionListAsserted = level.access !== FileShare.Editing;

      test(`${roomLabel} room - ${level.label}: version list ${!versionListAsserted ? "not asserted" : canEditHistory ? "readable" : "refused"}, log readable, restore and change ${canEditHistory ? "allowed" : "refused"}`, async ({
        apiSdk,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        const roomId = await room(
          apiSdk,
          roomType,
          `Autotest Versions ${roomLabel}`,
        );
        const restoreId = await threeVersions(ownerApi, roomId, "Restore me");
        const changeId = await threeVersions(ownerApi, roomId, "Change me");
        const { data: logFile } = await ownerApi.files.createFile({
          folderId: roomId,
          createFileRequest: { title: "Autotest Log.docx" },
        });
        const logId = logFile.response!.id!;
        const api = await invite(apiSdk, roomId, level.type, level.access);
        expect(await versionCount(ownerApi, restoreId)).toBe(3);

        await test.step("getFileVersionInfo", async () => {
          const { data, status } = await api.files.getFileVersionInfo({
            fileId: restoreId,
          });
          if (!versionListAsserted) {
            return;
          }
          expect(status).toBe(canEditHistory ? 200 : 403);
          if (canEditHistory) {
            expect(data.response).toHaveLength(3);
            // Newest first.
            expect(
              data.response!.map((v) =>
                Number((v as { version?: number }).version),
              ),
            ).toEqual([3, 2, 1]);
          }
        });

        await test.step("getFileHistory: every member reads the log", async () => {
          const { data, status } = await api.files.getFileHistory({
            fileId: logId,
          });
          expect(status).toBe(200);
          expect((data.response ?? []).length).toBeGreaterThan(0);
        });

        await test.step("restoreFileVersion", async () => {
          const { status } = await api.files.restoreFileVersion({
            fileId: restoreId,
            version: 1,
          });
          expect(status).toBe(canEditHistory ? 200 : 403);
          const content = (
            await downloadFile(apiSdk, "owner", restoreId)
          ).bytes.toString();
          if (canEditHistory) {
            // Nothing is overwritten: the old content comes back as a new version.
            expect(await versionCount(ownerApi, restoreId)).toBe(4);
            expect(content).toBe("v1");
          } else {
            expect(await versionCount(ownerApi, restoreId)).toBe(3);
            expect(content).toBe("v3");
          }
        });

        await test.step("changeVersionHistory", async () => {
          const before = await versionCount(ownerApi, changeId);
          const { status } = await api.files.changeVersionHistory({
            fileId: changeId,
            changeHistoryRequest: { version: 2, continueVersion: true },
          });
          expect(status).toBe(canEditHistory ? 200 : 403);
          if (!canEditHistory) {
            expect(await versionCount(ownerApi, changeId)).toBe(before);
          }
        });
      });
    }
  }
});

test.describe("restoreFileVersion and changeVersionHistory - file states", () => {
  // Documented: "`version` ... is refused with 400 when it is missing or already
  // the current one."
  test("restoreFileVersion - Missing version and the current version return 400 and add nothing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await room(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Restore 400",
    );
    const fileId = await threeVersions(ownerApi, roomId);

    const missing = await ownerApi.files.restoreFileVersion({ fileId });
    const current = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 3,
    });

    expect(missing.status).toBe(400);
    expect(current.status).toBe(400);
    expect(await versionCount(ownerApi, fileId)).toBe(3);
  });

  // Documented: a restore "carries a comment that says which version it was
  // reverted to", and the file stays the same file.
  test("restoreFileVersion - The restored content is a new version with a comment, in the same file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await room(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Restore Comment",
    );
    const fileId = await threeVersions(ownerApi, roomId);

    const { status } = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 2,
    });

    expect(status).toBe(200);
    const { data } = await ownerApi.files.getFileVersionInfo({ fileId });
    expect(data.response).toHaveLength(4);
    expect((data.response![0] as { comment?: string }).comment).toBeTruthy();
    expect((await downloadFile(apiSdk, "owner", fileId)).bytes.toString()).toBe(
      "v2",
    );
  });

  // Documented: changeVersionHistory refuses "a locked file" and one "open in an
  // editing session". The lock only binds others (lockFile: not "the account that
  // set it"), so the caller is a content creator and the owner holds the lock or
  // the session. A docx is used because the editing flag is only reliable on it.
  async function heldByOwner(apiSdk: ApiSDK, state: "locked" | "being edited") {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await room(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest History State",
    );
    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Autotest History State.docx" },
    });
    const fileId = created.response!.id!;
    const api = await invite(apiSdk, roomId, "User", FileShare.ContentCreator);
    if (state === "locked") {
      const { status } = await ownerApi.files.lockFile({
        fileId,
        lockFileRequest: { lockFile: true },
      });
      expect(status).toBe(200);
    } else {
      const { status } = await ownerApi.files.startEditFile({
        fileId,
        startEditRequest: { editingAlone: true },
      });
      expect(status).toBe(200);
    }
    return {
      ownerApi,
      api,
      fileId,
      before: await versionCount(ownerApi, fileId),
    };
  }

  for (const state of ["locked", "being edited"] as const) {
    test(`changeVersionHistory - A file ${state} by someone else is left unchanged`, async ({
      apiSdk,
    }) => {
      const { ownerApi, api, fileId, before } = await heldByOwner(
        apiSdk,
        state,
      );

      await api.files.changeVersionHistory({
        fileId,
        changeHistoryRequest: { version: 0, continueVersion: false },
      });

      expect(await versionCount(ownerApi, fileId)).toBe(before);
    });
  }

  // The refusal of a locked file is a 500 ("The file is currently locked by another
  // user" raised as a plain System.Exception), not a client error.
  test.fail(
    "BUG 84771: changeVersionHistory - A file locked by someone else is refused with a client error, not 500",
    async ({ apiSdk }) => {
      const { api, fileId } = await heldByOwner(apiSdk, "locked");

      const { status } = await api.files.changeVersionHistory({
        fileId,
        changeHistoryRequest: { version: 0, continueVersion: false },
      });

      expect(status).not.toBe(500);
    },
  );

  // A file open in someone else's editing session is "refused" by the SDK; the call
  // answers 200 although nothing changes.
  test.fail(
    "BUG 84772: changeVersionHistory - A file being edited by someone else is refused, not reported as success",
    async ({ apiSdk }) => {
      const { ownerApi, api, fileId, before } = await heldByOwner(
        apiSdk,
        "being edited",
      );

      const { status } = await api.files.changeVersionHistory({
        fileId,
        changeHistoryRequest: { version: 0, continueVersion: false },
      });

      expect(await versionCount(ownerApi, fileId)).toBe(before);
      expect(status).not.toBe(200);
    },
  );

  // Documented: "With continueVersion=false the named version is completed: its
  // content is stored again as a fresh version that opens a new revision group".
  test("changeVersionHistory - continueVersion=false stores the current content again as a new version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await room(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Change Group",
    );
    const fileId = await threeVersions(ownerApi, roomId);

    const { data, status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistoryRequest: { version: 0, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(4);
    expect(await versionCount(ownerApi, fileId)).toBe(4);
    expect((await downloadFile(apiSdk, "owner", fileId)).bytes.toString()).toBe(
      "v3",
    );
  });

  // Documented (getFileHistory): "a caller without access to the room is refused
  // with 403 and an unknown id is answered with 404".
  test("getFileHistory - A caller without room access gets 403 and an unknown id 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await room(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Log Access",
    );
    const fileId = await threeVersions(ownerApi, roomId);
    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");

    const denied = await api.files.getFileHistory({ fileId });
    const unknown = await ownerApi.files.getFileHistory({ fileId: 999999999 });

    expect(denied.status).toBe(403);
    expect(unknown.status).toBe(404);
  });

  // Documented (getFileHistory): newest first, "fromDate"/"toDate" narrow the range.
  test("getFileHistory - Entries arrive newest first and a future fromDate leaves none", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await room(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Log Order",
    );
    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Autotest Log Order.docx" },
    });
    const fileId = created.response!.id!;
    await ownerApi.files.updateFile({
      fileId,
      updateFileRequest: { title: "Renamed once" },
    });
    await ownerApi.files.updateFile({
      fileId,
      updateFileRequest: { title: "Renamed twice" },
    });

    const { data } = await ownerApi.files.getFileHistory({ fileId });
    const dates = (data.response ?? []).map((e) =>
      Date.parse(String((e as unknown as { date?: string }).date)),
    );
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const { data: none, status } = await ownerApi.files.getFileHistory({
      fileId,
      fromDate: future,
    });

    expect(dates.length).toBeGreaterThanOrEqual(3);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(status).toBe(200);
    expect(none.response ?? []).toEqual([]);
  });

  // Documented (getFileHistory): the log records who "renamed ... converted, locked
  // or edited" a file. A docx created through createFile has its FileCreated entry at
  // once, but an HTML file created or updated through createHtmlFile has an empty
  // log (still empty 26 s later).
  test.fail(
    "BUG 84773: getFileHistory - A file created through createHtmlFile has a creation entry",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await room(
        apiSdk,
        RoomType.CustomRoom,
        "Autotest Log Html",
      );
      const { data } = await ownerApi.files.createHtmlFile({
        folderId: roomId,
        createTextOrHtmlFileRequest: {
          title: "Autotest Log Html",
          content: "<p/>",
        },
      });
      const fileId = (data.response as { id: number }).id;

      await expect
        .poll(
          async () =>
            (
              (await ownerApi.files.getFileHistory({ fileId })).data.response ??
              []
            ).length,
          { timeout: 20_000, intervals: [1000, 2000, 5000] },
        )
        .toBeGreaterThan(0);
    },
  );

  // Documented (getFileVersionInfo): "in a room only its managers and content
  // creators may read the history". An Editing member gets the list.
  test.fail(
    "BUG 84774: getFileVersionInfo - An Editing member of a room cannot read the version list",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const roomId = await room(
        apiSdk,
        RoomType.CustomRoom,
        "Autotest Versions Editing",
      );
      const fileId = await threeVersions(ownerApi, roomId);
      const api = await invite(apiSdk, roomId, "User", FileShare.Editing);

      const { status } = await api.files.getFileVersionInfo({ fileId });

      expect(status).toBe(403);
    },
  );

  // A PDF form in a form-filling room: versions come from saveediting, and the
  // same documented rules apply (restore adds a version on top, nothing is lost).
  test("FormFilling room - a form keeps its versions, log and can be restored by the owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await room(
      apiSdk,
      RoomType.FillingFormsRoom,
      "Autotest Versions Forms",
    );
    const original = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-empty.pdf"),
    );
    const submitted = readFileSync(
      path.join(__dirname, "../../../assets/oo-form-submitted.pdf"),
    );
    const { data: inserted } = await apiSdk.insertBinaryFile(
      "owner",
      roomId,
      original,
      "autotest-versions-form.pdf",
    );
    const formId = inserted.response.id as number;
    for (let i = 0; i < 2; i++) {
      const { status } = await ownerApi.files.saveEditingFileFromForm({
        fileId: formId,
        file: new File([new Uint8Array(submitted)], "submitted.pdf", {
          type: "application/pdf",
        }),
        forcesave: false,
      });
      expect(status).toBe(200);
    }
    expect(await versionCount(ownerApi, formId)).toBe(3);

    const log = await ownerApi.files.getFileHistory({ fileId: formId });
    const restore = await ownerApi.files.restoreFileVersion({
      fileId: formId,
      version: 1,
    });

    expect(log.status).toBe(200);
    expect(restore.status).toBe(200);
    expect(await versionCount(ownerApi, formId)).toBe(4);
    const current = (await downloadFile(apiSdk, "owner", formId)).bytes;
    expect(current.equals(original)).toBe(true);
  });
});
