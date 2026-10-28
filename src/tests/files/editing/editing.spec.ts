import { expect } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { test } from "@/src/fixtures/index";
import { FileShare, FileStatus, RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";

// Everything here stays at API level. A real editing session (co-editing, the
// document service saving through the callback, conflicting edits) needs a
// Document Server and is not simulated.

const roomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
] as const;

async function roomWithFile(
  apiSdk: ApiSDK,
  roomType: RoomType,
  fileTitle = "Autotest Editing File.docx",
) {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: { title: "Autotest Editing Room", roomType },
  });
  const roomId = roomData.response!.id!;
  const { data: fileData } = await ownerApi.files.createFile({
    folderId: roomId,
    createFileRequest: { title: fileTitle },
  });
  return { ownerApi, roomId, fileId: fileData.response!.id! };
}

async function isEditing(apiSdk: ApiSDK, fileId: number) {
  const { data } = await apiSdk.forRole("owner").files.getFileInfo({ fileId });
  const status = Number(
    (data.response as { fileStatus?: number }).fileStatus ?? 0,
  );
  return (status & FileStatus.IsEditing) === FileStatus.IsEditing;
}

test.describe("GET /files/file/:fileId/openedit - editor configuration", () => {
  for (const { label, roomType } of roomTypes) {
    test(`GET /files/file/:fileId/openedit - ${label} room: owner gets a complete editor configuration`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId } = await roomWithFile(apiSdk, roomType);

      const { data, status } = await ownerApi.files.openEditFile({ fileId });

      expect(status).toBe(200);
      const config = data.response as {
        document: {
          key?: string;
          title?: string;
          fileType?: string;
          url?: string;
          permissions?: { edit?: boolean };
        };
        documentType: string;
        editorConfig: {
          mode: string;
          callbackUrl?: string;
          modeWrite?: boolean;
        };
        token?: string;
        file: { id: number };
      };
      expect(config.file.id).toBe(fileId);
      expect(config.document.key).toBeTruthy();
      expect(config.document.title).toContain("Autotest Editing File");
      expect(config.document.fileType).toBe("docx");
      expect(config.document.url).toBeTruthy();
      expect(config.documentType).toBe("word");
      expect(config.editorConfig.mode).toBe("edit");
      expect(config.editorConfig.callbackUrl).toBeTruthy();
      expect(config.document.permissions?.edit).toBe(true);
      expect(config.token).toBeTruthy();
    });
  }

  // `view` says the client only wants to read.
  test("GET /files/file/:fileId/openedit - view=true opens in view mode", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
    );

    const { data, status } = await ownerApi.files.openEditFile({
      fileId,
      view: true,
    });

    expect(status).toBe(200);
    expect(data.response?.editorConfig?.mode).toBe("view");
  });

  test("GET /files/file/:fileId/openedit - Spreadsheet and presentation get their own document type", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
    );
    const create = async (title: string) =>
      (
        await ownerApi.files.createFile({
          folderId: roomId,
          createFileRequest: { title },
        })
      ).data.response!.id!;

    const sheet = await ownerApi.files.openEditFile({
      fileId: await create("Autotest Sheet.xlsx"),
    });
    const deck = await ownerApi.files.openEditFile({
      fileId: await create("Autotest Deck.pptx"),
    });

    expect(sheet.data.response?.documentType).toBe("cell");
    expect(sheet.data.response?.document?.fileType).toBe("xlsx");
    expect(deck.data.response?.documentType).toBe("slide");
    expect(deck.data.response?.document?.fileType).toBe("pptx");
  });

  test("GET /files/file/:fileId/openedit - File in My Documents opens for its owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest My Docs Edit.docx" },
    });

    const { data, status } = await ownerApi.files.openEditFile({
      fileId: created.response!.id!,
    });

    expect(status).toBe(200);
    expect(data.response?.editorConfig?.mode).toBe("edit");
  });

  test("GET /files/file/:fileId/openedit - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .files.openEditFile({ fileId: 999999999 });

    expect(status).toBe(404);
  });
});

test.describe("POST /files/file/:fileId/startedit and GET /files/file/:fileId/trackeditfile - session lifecycle", () => {
  // Documented: the file "is marked as being edited for as long as the session lasts".
  test("startedit - editingAlone=true marks the file as being edited and returns the document key", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
    );
    expect(await isEditing(apiSdk, fileId)).toBe(false);

    const { data, status } = await ownerApi.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });

    expect(status).toBe(200);
    expect(typeof data.response).toBe("string");
    expect((data.response as unknown as string).length).toBeGreaterThan(0);
    expect(await isEditing(apiSdk, fileId)).toBe(true);
  });

  // Documented: "end it by calling [trackeditfile] with isFinish=true".
  test("trackeditfile - isFinish=true releases the file so another user can start editing", async ({
    apiSdk,
  }) => {
    const { ownerApi, roomId, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
    );
    const { api: editorApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.Editing },
        ],
        notify: false,
      },
    });
    expect(inviteStatus).toBe(200);
    const { data: started } = await ownerApi.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });
    const docKey = started.response as unknown as string;

    const blocked = await editorApi.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });
    expect(blocked.status).toBe(403);

    const { status: finishStatus } = await ownerApi.files.trackEditFile({
      fileId,
      tabId: faker.string.uuid(),
      docKeyForTrack: docKey,
      isFinish: true,
    });
    expect(finishStatus).toBe(200);

    const { data: next, status: nextStatus } =
      await editorApi.files.startEditFile({
        fileId,
        startEditRequest: { editingAlone: true },
      });
    expect(nextStatus).toBe(200);
    expect(typeof next.response).toBe("string");
  });

  // Documented: "It answers key true with an empty value whenever it succeeds"
  // and "repeating it is safe".
  test("trackeditfile - Refreshing the entry answers key true with an empty value, repeatedly", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
    );
    const { data: started } = await ownerApi.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });
    const docKey = started.response as unknown as string;

    for (let i = 0; i < 2; i++) {
      const { data, status } = await ownerApi.files.trackEditFile({
        fileId,
        tabId: faker.string.uuid(),
        docKeyForTrack: docKey,
        isFinish: false,
      });
      expect(status).toBe(200);
      expect(data.response?.key).toBe(true);
      expect(data.response?.value).toBeFalsy();
    }
    expect(await isEditing(apiSdk, fileId)).toBe(true);
  });

  // Documented: a key matching neither the current revision nor the one being
  // edited "is refused with 403".
  test("trackeditfile - Wrong docKeyForTrack returns 403 and the session stays", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
    );
    await ownerApi.files.startEditFile({
      fileId,
      startEditRequest: { editingAlone: true },
    });

    const { status } = await ownerApi.files.trackEditFile({
      fileId,
      tabId: faker.string.uuid(),
      docKeyForTrack: "not-the-document-key",
      isFinish: true,
    });

    expect(status).toBe(403);
    expect(await isEditing(apiSdk, fileId)).toBe(true);
  });
});

test.describe("PUT /files/file/:fileId/customfilter - Custom Filter mode", () => {
  for (const { label, roomType } of roomTypes) {
    test(`PUT /files/file/:fileId/customfilter - ${label} room: spreadsheet mode is switched on and off and persists`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId } = await roomWithFile(
        apiSdk,
        roomType,
        "Autotest Custom Filter.xlsx",
      );

      const { data: on, status: onStatus } =
        await ownerApi.files.setCustomFilterTag({
          fileId,
          customFilterRequest: { enabled: true },
        });
      expect(onStatus).toBe(200);
      expect(on.response?.customFilterEnabled).toBe(true);
      const { data: infoOn } = await ownerApi.files.getFileInfo({ fileId });
      expect(infoOn.response?.customFilterEnabled).toBe(true);

      const { status: offStatus } = await ownerApi.files.setCustomFilterTag({
        fileId,
        customFilterRequest: { enabled: false },
      });
      expect(offStatus).toBe(200);
      const { data: infoOff } = await ownerApi.files.getFileInfo({ fileId });
      expect(infoOff.response?.customFilterEnabled).toBeFalsy();
    });
  }

  // Documented: "called twice with the same value, changes nothing the second time".
  test("PUT /files/file/:fileId/customfilter - Repeating the same value changes nothing", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Custom Filter Twice.xlsx",
    );
    const enable = () =>
      ownerApi.files.setCustomFilterTag({
        fileId,
        customFilterRequest: { enabled: true },
      });

    const first = await enable();
    const second = await enable();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data.response?.customFilterEnabledBy).toBe(
      first.data.response?.customFilterEnabledBy,
    );
    expect(second.data.response?.customFilterEnabled).toBe(true);
  });

  // Documented: "Only formats that support the mode are accepted; anything else
  // is rejected as an invalid request."
  for (const title of [
    "Autotest Not A Sheet.docx",
    "Autotest Not A Deck.pptx",
  ]) {
    test(`PUT /files/file/:fileId/customfilter - ${title.split(".").pop()} file returns 400 and stays unchanged`, async ({
      apiSdk,
    }) => {
      const { ownerApi, fileId } = await roomWithFile(
        apiSdk,
        RoomType.CustomRoom,
        title,
      );

      const { status } = await ownerApi.files.setCustomFilterTag({
        fileId,
        customFilterRequest: { enabled: true },
      });

      const { data: info } = await ownerApi.files.getFileInfo({ fileId });
      expect(info.response?.customFilterEnabled).toBeFalsy();
      expect(status).toBe(400);
    });
  }
});

test.describe("POST /files/file/referencedata - references between documents", () => {
  async function referenceOf(
    ownerApi: ReturnType<ApiSDK["forRole"]>,
    fileId: number,
  ) {
    const { data } = await ownerApi.files.openEditFile({ fileId });
    const reference = data.response!.document!.referenceData!;
    return { fileKey: reference.fileKey!, instanceId: reference.instanceId! };
  }

  // Documented: "A link that points outside this portal is not resolved at all and
  // comes back unchanged as the address to follow."
  test("POST /files/file/referencedata - A link outside the portal comes back unchanged", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Reference Source.xlsx",
    );
    const external = "https://example.com/some/other/sheet.xlsx";

    const { data, status } = await ownerApi.files.getReferenceData({
      getReferenceDataDto: {
        fileKey: "",
        instanceId: "",
        sourceFileId: fileId,
        link: external,
      },
    });

    expect(status).toBe(200);
    expect(JSON.stringify(data.response)).toContain(external);
  });

  // Documented: a reference that resolves to nothing "is still answered with 200,
  // with the error text filled in and the rest of the descriptor empty".
  test("POST /files/file/referencedata - Unknown reference answers 200 with an error and no descriptor", async ({
    apiSdk,
  }) => {
    const { ownerApi, fileId } = await roomWithFile(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Reference Unknown.xlsx",
    );
    const { instanceId } = await referenceOf(ownerApi, fileId);

    const { data, status } = await ownerApi.files.getReferenceData({
      getReferenceDataDto: { fileKey: "999999999", instanceId },
    });

    expect(status).toBe(200);
    expect((data.response as { error?: string }).error).toBeTruthy();
    expect(data.response?.url).toBeFalsy();
    expect(data.response?.key).toBeFalsy();
  });
});
