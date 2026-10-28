import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { downloadFile } from "@/src/helpers/download";
import { getMyDocsFolderId } from "@/src/helpers/files";
import { archiveRoomAndWait } from "@/src/helpers/archive-room";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

// copyFileAs and saveFileAsPdf are typed as a bare entry; the file fields are there at runtime.
const asFile = (response: unknown) =>
  response as { id: number; title: string; folderId: number; fileExst: string };

const PDF_MAGIC = "%PDF";
const ZIP_MAGIC = "PK"; // docx, xlsx and pptx are zip containers

const roomTypes = [
  { label: "Custom", roomType: RoomType.CustomRoom },
  { label: "Collaboration", roomType: RoomType.EditingRoom },
  { label: "Public", roomType: RoomType.PublicRoom },
  { label: "VDR", roomType: RoomType.VirtualDataRoom },
] as const;

const HTML_MARKUP = "<h1>Autotest conversion</h1>";

async function createRoom(apiSdk: ApiSDK, roomType: RoomType, title: string) {
  const { data } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  return asFile(data.response).id!;
}

// One source of every format the matrix needs, all in the owner's My Documents.
async function createSources(apiSdk: ApiSDK) {
  const api = apiSdk.forRole("owner");
  const id = async (p: Promise<{ data: { response?: { id?: number } } }>) =>
    (await p).data.response!.id!;
  return {
    html: await id(
      api.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFileRequest: {
          title: "Autotest Source",
          content: HTML_MARKUP,
        },
      }),
    ),
    txt: await id(
      api.files.createTextFileInMyDocuments({
        createTextOrHtmlFileRequest: {
          title: "Autotest Source",
          content: "plain text",
        },
      }),
    ),
    docx: await id(
      api.files.createFileInMyDocuments({
        createFileRequest: { title: "Autotest Source.docx" },
      }),
    ),
    xlsx: await id(
      api.files.createFileInMyDocuments({
        createFileRequest: { title: "Autotest Source.xlsx" },
      }),
    ),
    pptx: await id(
      api.files.createFileInMyDocuments({
        createFileRequest: { title: "Autotest Source.pptx" },
      }),
    ),
  };
}

async function filesCount(apiSdk: ApiSDK, folderId: number) {
  const { data } = await apiSdk
    .forRole("owner")
    .folders.getFolderByFolderId({ folderId });
  return data.response?.current?.filesCount ?? 0;
}

test.describe("POST /files/file/:fileId/copyas - copy and convert", () => {
  for (const { label, roomType } of roomTypes) {
    test(`POST /files/file/:fileId/copyas - ${label} room: same extension copies the bytes unchanged`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const sources = await createSources(apiSdk);
      const roomId = await createRoom(
        apiSdk,
        roomType,
        `Autotest Copy ${label}`,
      );

      const { data, status } = await ownerApi.files.copyFileAs({
        fileId: sources.html,
        copyAsRequest: { destTitle: "Copy.html", destFolderId: roomId },
      });

      expect(status).toBe(200);
      expect(asFile(data.response).id).not.toBe(sources.html);
      expect(asFile(data.response).title).toBe("Copy.html");
      expect(asFile(data.response).folderId).toBe(roomId);
      const copy = await downloadFile(
        apiSdk,
        "owner",
        asFile(data.response).id!,
      );
      expect(copy.bytes.toString("utf8")).toBe(HTML_MARKUP);
    });
  }

  const validConversions = [
    { from: "html", to: "pdf", magic: PDF_MAGIC },
    { from: "txt", to: "docx", magic: ZIP_MAGIC },
    { from: "docx", to: "pdf", magic: PDF_MAGIC },
    { from: "xlsx", to: "pdf", magic: PDF_MAGIC },
    { from: "pptx", to: "pdf", magic: PDF_MAGIC },
  ] as const;
  for (const { from, to, magic } of validConversions) {
    test(`POST /files/file/:fileId/copyas - ${from} to ${to} converts the content`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const sources = await createSources(apiSdk);
      const roomId = await createRoom(
        apiSdk,
        RoomType.CustomRoom,
        "Autotest Convert",
      );

      const { data, status } = await ownerApi.files.copyFileAs({
        fileId: sources[from],
        copyAsRequest: {
          destTitle: `Converted.${to}`,
          destFolderId: roomId,
        },
      });

      expect(status).toBe(200);
      expect(asFile(data.response).fileExst).toBe(`.${to}`);
      const copy = await downloadFile(
        apiSdk,
        "owner",
        asFile(data.response).id!,
      );
      expect(copy.bytes.subarray(0, magic.length).toString("latin1")).toBe(
        magic,
      );
      expect(copy.bytes.length).toBeGreaterThan(100);
    });
  }

  test("POST /files/file/:fileId/copyas - File in a room can be copied to My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Copy Out",
    );
    const { data: created } = await ownerApi.files.createHtmlFile({
      folderId: roomId,
      createTextOrHtmlFileRequest: {
        title: "Autotest Room File",
        content: HTML_MARKUP,
      },
    });
    const myDocs = await getMyDocsFolderId(ownerApi);

    const { data, status } = await ownerApi.files.copyFileAs({
      fileId: created.response!.id!,
      copyAsRequest: { destTitle: "Copy.html", destFolderId: myDocs },
    });

    expect(status).toBe(200);
    expect(asFile(data.response).folderId).toBe(myDocs);
  });

  test("POST /files/file/:fileId/copyas - Copy and source are independent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Copy Independence",
    );
    const { data: copied } = await ownerApi.files.copyFileAs({
      fileId: sources.html,
      copyAsRequest: { destTitle: "Copy.html", destFolderId: roomId },
    });
    const copyId = asFile(copied.response).id;

    await test.step("Editing the source leaves the copy unchanged", async () => {
      const { data: updated } =
        await ownerApi.files.createHtmlFileInMyDocuments({
          createTextOrHtmlFileRequest: {
            title: "Autotest Source",
            content: "<p>changed</p>",
            createNewIfExist: true,
          },
        });
      expect(updated.response!.id).toBe(sources.html);
      expect(
        (await downloadFile(apiSdk, "owner", copyId)).bytes.toString("utf8"),
      ).toBe(HTML_MARKUP);
      const { data: copyInfo } = await ownerApi.files.getFileInfo({
        fileId: copyId,
      });
      expect(copyInfo.response!.version).toBe(1);
    });

    await test.step("Deleting the source leaves the copy readable", async () => {
      await ownerApi.files.deleteFile({
        fileId: sources.html,
        deleteFileRequest: { immediately: true },
      });
      await waitForOperation(ownerApi.operations);
      const { status } = await ownerApi.files.getFileInfo({
        fileId: sources.html,
      });
      expect(status).toBe(404);
      const copy = await downloadFile(apiSdk, "owner", copyId);
      expect(copy.status).toBe(200);
      expect(copy.bytes.toString("utf8")).toBe(HTML_MARKUP);
    });
  });

  test("POST /files/file/:fileId/copyas - Copying does not change the source", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Copy Source",
    );
    const { data: before } = await ownerApi.files.getFileInfo({
      fileId: sources.docx,
    });

    await ownerApi.files.copyFileAs({
      fileId: sources.docx,
      copyAsRequest: { destTitle: "Converted.pdf", destFolderId: roomId },
    });

    const { data: after } = await ownerApi.files.getFileInfo({
      fileId: sources.docx,
    });
    expect(after.response!.version).toBe(before.response!.version);
    expect(after.response!.title).toBe(before.response!.title);
    expect(after.response!.contentLength).toBe(before.response!.contentLength);
  });

  // Documented: "The call is mutating and not idempotent - each call adds another copy."
  test("POST /files/file/:fileId/copyas - Every call adds another copy", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Copy Repeat",
    );
    const copy = () =>
      ownerApi.files.copyFileAs({
        fileId: sources.html,
        copyAsRequest: { destTitle: "Copy.html", destFolderId: roomId },
      });

    const first = await copy();
    const second = await copy();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(asFile(second.data.response).id).not.toBe(
      asFile(first.data.response).id,
    );
    expect(await filesCount(apiSdk, roomId)).toBe(2);
  });

  test("POST /files/file/:fileId/copyas - Non-existent source returns 404", async ({
    apiSdk,
  }) => {
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Copy 404",
    );

    const { status } = await apiSdk.forRole("owner").files.copyFileAs({
      fileId: 999999999,
      copyAsRequest: { destTitle: "Copy.docx", destFolderId: roomId },
    });

    expect(status).toBe(404);
    expect(await filesCount(apiSdk, roomId)).toBe(0);
  });

  // Documented: "a missing file or folder is answered with 404".
  test.fail(
    "BUG XXXXX: POST /files/file/:fileId/copyas - Non-existent destination folder returns 404",
    async ({ apiSdk }) => {
      const sources = await createSources(apiSdk);

      const { status } = await apiSdk.forRole("owner").files.copyFileAs({
        fileId: sources.docx,
        copyAsRequest: { destTitle: "Copy.docx", destFolderId: 999999999 },
      });

      expect(status).toBe(404);
    },
  );

  // Documented: "a format that cannot be converted with 400". The document
  // service rejects these pairs and the portal surfaces it as a 500.
  const impossibleConversions = [
    { from: "docx", to: "xlsx" },
    { from: "xlsx", to: "docx" },
    { from: "pptx", to: "docx" },
    { from: "docx", to: "pptx" },
  ] as const;
  for (const { from, to } of impossibleConversions) {
    test.fail(
      `BUG XXXXX: POST /files/file/:fileId/copyas - ${from} to ${to} returns 400 and creates nothing`,
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");
        const sources = await createSources(apiSdk);
        const roomId = await createRoom(
          apiSdk,
          RoomType.CustomRoom,
          "Autotest Copy Impossible",
        );

        const { status } = await ownerApi.files.copyFileAs({
          fileId: sources[from],
          copyAsRequest: {
            destTitle: `Converted.${to}`,
            destFolderId: roomId,
          },
        });

        expect(await filesCount(apiSdk, roomId)).toBe(0);
        expect(status).toBe(400);
      },
    );
  }

  test("POST /files/file/:fileId/copyas - Copy into an archived room is refused", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Copy Archived",
    );
    await archiveRoomAndWait(apiSdk, roomId);

    const { status } = await ownerApi.files.copyFileAs({
      fileId: sources.docx,
      copyAsRequest: { destTitle: "Copy.docx", destFolderId: roomId },
    });

    expect(status).toBe(403);
    expect(await filesCount(apiSdk, roomId)).toBe(0);
  });

  test("POST /files/file/:fileId/copyas - File from an archived room can still be copied out", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const archivedRoom = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Copy From Archived",
    );
    const { data: created } = await ownerApi.files.createHtmlFile({
      folderId: archivedRoom,
      createTextOrHtmlFileRequest: {
        title: "Archived File",
        content: HTML_MARKUP,
      },
    });
    await archiveRoomAndWait(apiSdk, archivedRoom);
    const myDocs = await getMyDocsFolderId(ownerApi);

    const { status } = await ownerApi.files.copyFileAs({
      fileId: created.response!.id!,
      copyAsRequest: { destTitle: "Out.html", destFolderId: myDocs },
    });

    expect(status).toBe(200);
  });
});

test.describe("POST /files/file/:id/saveaspdf - save a file as PDF", () => {
  for (const { label, roomType } of roomTypes) {
    test(`POST /files/file/:id/saveaspdf - ${label} room receives a real PDF`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const sources = await createSources(apiSdk);
      const roomId = await createRoom(
        apiSdk,
        roomType,
        `Autotest Save PDF ${label}`,
      );

      const { data, status } = await ownerApi.files.saveFileAsPdf({
        id: sources.docx,
        saveAsPdfRequest: { folderId: roomId, title: "Result" },
      });

      expect(status).toBe(200);
      expect(asFile(data.response).title).toBe("Result.pdf");
      expect(asFile(data.response).fileExst).toBe(".pdf");
      expect(asFile(data.response).folderId).toBe(roomId);
      const pdf = await downloadFile(
        apiSdk,
        "owner",
        asFile(data.response).id!,
      );
      expect(pdf.bytes.subarray(0, 4).toString("latin1")).toBe(PDF_MAGIC);
    });
  }

  for (const source of ["html", "txt", "docx", "xlsx", "pptx"] as const) {
    test(`POST /files/file/:id/saveaspdf - ${source} source converts to PDF in My Documents`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const sources = await createSources(apiSdk);
      const myDocs = await getMyDocsFolderId(ownerApi);

      const { data, status } = await ownerApi.files.saveFileAsPdf({
        id: sources[source],
        saveAsPdfRequest: { folderId: myDocs, title: `From ${source}` },
      });

      expect(status).toBe(200);
      expect(asFile(data.response).folderId).toBe(myDocs);
      const pdf = await downloadFile(
        apiSdk,
        "owner",
        asFile(data.response).id!,
      );
      expect(pdf.bytes.subarray(0, 4).toString("latin1")).toBe(PDF_MAGIC);
    });
  }

  test("POST /files/file/:id/saveaspdf - Form-filling room accepts the PDF", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const roomId = await createRoom(
      apiSdk,
      RoomType.FillingFormsRoom,
      "Autotest Save PDF Forms",
    );

    const { data, status } = await ownerApi.files.saveFileAsPdf({
      id: sources.docx,
      saveAsPdfRequest: { folderId: roomId, title: "Result" },
    });

    expect(status).toBe(200);
    expect(asFile(data.response).fileExst).toBe(".pdf");
  });

  // Documented: "the .pdf extension is added to it".
  test("POST /files/file/:id/saveaspdf - Extension is always appended to the title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const myDocs = await getMyDocsFolderId(ownerApi);

    const { data } = await ownerApi.files.saveFileAsPdf({
      id: sources.docx,
      saveAsPdfRequest: { folderId: myDocs, title: "Named.pdf" },
    });

    expect(asFile(data.response).title).toBe("Named.pdf.pdf");
  });

  // Documented: "an empty title reuses the name of the source with its extension replaced".
  for (const title of ["", null]) {
    test(`POST /files/file/:id/saveaspdf - ${title === null ? "Null" : "Empty"} title reuses the source name`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const sources = await createSources(apiSdk);
      const roomId = await createRoom(
        apiSdk,
        RoomType.CustomRoom,
        "Autotest Save PDF Title",
      );

      const { data, status } = await ownerApi.files.saveFileAsPdf({
        id: sources.docx,
        saveAsPdfRequest: { folderId: roomId, title },
      });

      expect(status).toBe(200);
      expect(asFile(data.response).title).toBe("Autotest Source.pdf");
    });
  }

  // Documented: "The source is left untouched, so the two files then live side by side."
  test("POST /files/file/:id/saveaspdf - Source stays untouched next to the PDF", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const myDocs = await getMyDocsFolderId(ownerApi);
    const { data: before } = await ownerApi.files.getFileInfo({
      fileId: sources.docx,
    });

    const { data } = await ownerApi.files.saveFileAsPdf({
      id: sources.docx,
      saveAsPdfRequest: { folderId: myDocs, title: "Side by side" },
    });

    const { data: after } = await ownerApi.files.getFileInfo({
      fileId: sources.docx,
    });
    expect(asFile(data.response).id).not.toBe(sources.docx);
    expect(after.response!.version).toBe(before.response!.version);
    expect(after.response!.title).toBe(before.response!.title);
    expect(after.response!.fileExst).toBe(".docx");
  });

  test("POST /files/file/:id/saveaspdf - Every call adds another PDF", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const sources = await createSources(apiSdk);
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Save PDF Repeat",
    );
    const save = () =>
      ownerApi.files.saveFileAsPdf({
        id: sources.docx,
        saveAsPdfRequest: { folderId: roomId, title: "Again" },
      });

    const first = await save();
    const second = await save();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(asFile(second.data.response).id).not.toBe(
      asFile(first.data.response).id,
    );
    expect(await filesCount(apiSdk, roomId)).toBe(2);
  });

  // Documented: "its title made unique when one of that name is already there".
  test.fail(
    "BUG XXXXX: POST /files/file/:id/saveaspdf - Second PDF with the same title gets a unique title",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const sources = await createSources(apiSdk);
      const roomId = await createRoom(
        apiSdk,
        RoomType.CustomRoom,
        "Autotest Save PDF Unique",
      );
      const save = () =>
        ownerApi.files.saveFileAsPdf({
          id: sources.docx,
          saveAsPdfRequest: { folderId: roomId, title: "Same" },
        });

      const first = await save();
      const second = await save();

      expect(asFile(second.data.response).title).not.toBe(
        asFile(first.data.response).title,
      );
    },
  );

  test("POST /files/file/:id/saveaspdf - Non-existent source returns 404 and creates nothing", async ({
    apiSdk,
  }) => {
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Save PDF 404",
    );

    const { status } = await apiSdk.forRole("owner").files.saveFileAsPdf({
      id: 999999999,
      saveAsPdfRequest: { folderId: roomId, title: "X" },
    });

    expect(status).toBe(404);
    expect(await filesCount(apiSdk, roomId)).toBe(0);
  });

  test("POST /files/file/:id/saveaspdf - Non-existent destination folder returns 404", async ({
    apiSdk,
  }) => {
    const sources = await createSources(apiSdk);

    const { status } = await apiSdk.forRole("owner").files.saveFileAsPdf({
      id: sources.docx,
      saveAsPdfRequest: { folderId: 999999999, title: "X" },
    });

    expect(status).toBe(404);
  });

  test("POST /files/file/:id/saveaspdf - Archived destination room is refused", async ({
    apiSdk,
  }) => {
    const sources = await createSources(apiSdk);
    const roomId = await createRoom(
      apiSdk,
      RoomType.CustomRoom,
      "Autotest Save PDF Archived",
    );
    await archiveRoomAndWait(apiSdk, roomId);

    const { status } = await apiSdk.forRole("owner").files.saveFileAsPdf({
      id: sources.docx,
      saveAsPdfRequest: { folderId: roomId, title: "X" },
    });

    expect(status).toBe(403);
    expect(await filesCount(apiSdk, roomId)).toBe(0);
  });
});
