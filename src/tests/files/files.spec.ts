import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /files/@my/file", () => {
  // No extension → .docx added
  test("POST /files/@my/file - Title without extension gets .docx", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Document" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Document.docx");
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  test("POST /files/@my/file - Title with .docx extension stays .docx", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Document.docx" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Document.docx");
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  // Known text format → converted to .docx by default
  test("POST /files/@my/file - Title with .txt extension is converted to .docx", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Document.txt" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Document.docx");
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  // Bug 80324: enableExternalExt: true returns 403 with NullReferenceException
  test.fail(
    "BUG 80324: POST /files/@my/file - Title with .md extension and enableExternalExt keeps original extension",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data, status } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: {
          title: "Autotest Document.md",
          enableExternalExt: false,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.title).toBe("Autotest Document.md");
      expect(data.response!.id!).toBeGreaterThan(0);
    },
  );
});

test.describe("POST /files/:folderId/file", () => {
  test("POST /files/:folderId/file - Owner creates a file in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For File Creation",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Document" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Document.docx");
    expect(data.response!.folderId).toBe(folderId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });
});

test.describe("POST /files/:folderId/html - Create HTML file", () => {
  test("POST /files/:folderId/html - Creates an HTML file with title and content", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For HTML File",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.files.createHtmlFile({
      folderId,
      createTextOrHtmlFile: {
        title: "Autotest HTML File",
        content: "some text",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest HTML File.html");
    expect(data.response!.folderId).toBe(folderId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  // Note: createNewIfExist logic is inverted — true returns the existing file, false creates a new one with a suffix
  test("POST /files/:folderId/html - createNewIfExist: true returns existing file when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For HTML Dedup",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: firstData } = await ownerApi.files.createHtmlFile({
      folderId,
      createTextOrHtmlFile: {
        title: "Autotest HTML Dedup",
        content: "some text",
        createNewIfExist: false,
      },
    });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } = await ownerApi.files.createHtmlFile({
      folderId,
      createTextOrHtmlFile: {
        title: "Autotest HTML Dedup",
        content: "some text",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).toBe(firstId);
  });
});

test.describe("POST /files/:folderId/text - Create text file", () => {
  test("POST /files/:folderId/text - Creates a text file with title and content", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Text File",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.files.createTextFile({
      folderId,
      createTextOrHtmlFile: {
        title: "Autotest Text File",
        content: "some text",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Text File.txt");
    expect(data.response!.folderId).toBe(folderId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  // Note: createNewIfExist logic is inverted — true returns the existing file, false creates a new one with a suffix
  test("POST /files/:folderId/text - createNewIfExist: true returns existing file when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Text Dedup",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: firstData } = await ownerApi.files.createTextFile({
      folderId,
      createTextOrHtmlFile: {
        title: "Autotest Text Dedup",
        content: "some text",
        createNewIfExist: false,
      },
    });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } = await ownerApi.files.createTextFile({
      folderId,
      createTextOrHtmlFile: {
        title: "Autotest Text Dedup",
        content: "some text",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).toBe(firstId);
  });
});

test.describe("POST /files/file/:fileId/copyas - Copy file", () => {
  test("POST /files/file/:fileId/copyas - Copies file to a room with specified title and correct destination", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Source File" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Copy",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data } = await ownerApi.files.copyFileAs({
      fileId,
      copyAsJsonElement: {
        destTitle: "Autotest Copied File.docx",
        destFolderId,
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Copied File.docx");
    expect((data as any).response.folderId).toBe(destFolderId); // TODO(sdk): folderId missing from FileDto
  });

  test("POST /files/file/:fileId/copyas - Copies and converts file to form (toForm: true)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Source File For Form" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Form Copy",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data } = await ownerApi.files.copyFileAs({
      fileId,
      copyAsJsonElement: {
        destTitle: "Autotest Converted Form.docxf",
        destFolderId,
        toForm: true,
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Converted Form.docxf");
    expect((data as any).response.folderId).toBe(destFolderId); // TODO(sdk): folderId missing from FileDto
  });

  // TODO: requires a password-protected source file — no API method available to create one yet
  test.skip("POST /files/file/:fileId/copyas - Copies file with password", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Source File For Password" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Password Copy",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data } = await ownerApi.files.copyFileAs({
      fileId,
      copyAsJsonElement: {
        destTitle: "Autotest Password Copy.docx",
        destFolderId,
        password: "TestPassword123",
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Password Copy.docx");
    expect((data as any).response.folderId).toBe(destFolderId); // TODO(sdk): folderId missing from FileDto
  });

  // BUG 80745: copyFileAs with enableExternalExt: true returns 500 System.Exception — requires DS ↔ DocSpace connectivity
  test.fail(
    "BUG 80745: POST /files/file/:fileId/copyas - Copies file with non-standard extension (enableExternalExt: true)",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Source File For Ext" },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room For External Ext",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data } = await ownerApi.files.copyFileAs({
        fileId,
        copyAsJsonElement: {
          destTitle: "Autotest Copied File.md",
          destFolderId,
          enableExternalExt: true,
        },
      });

      expect(data.statusCode).toBe(200);
      expect(data.response!.title).toBe("Autotest Copied File.md");
      expect((data as any).response.folderId).toBe(destFolderId); // TODO(sdk): folderId missing from FileDto
    },
  );
});

test.describe("POST /files/file/:id/saveaspdf - Save file as PDF", () => {
  // BUG 80743: saveaspdf returns 403 System.InvalidOperationException — requires DS ↔ DocSpace connectivity
  test.fail(
    "BUG 80743: POST /files/file/:id/saveaspdf - Saves file as PDF in specified folder",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Source File For PDF" },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room For PDF",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { data, status } = await ownerApi.files.saveFileAsPdf({
        id: fileId,
        saveAsPdfInteger: { folderId, title: "Autotest Saved As PDF" },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.title).toBe("Autotest Saved As PDF.pdf");
      expect(data.response!.folderId).toBe(folderId);
    },
  );
});

test.describe("GET /files/favorites/:fileId - Change favorite status", () => {
  test("GET /files/favorites/:fileId - Sets file as favorite", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Favorite File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.toggleFileFavorite({
      fileId,
      favorite: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("GET /files/favorites/:fileId - Removes file from favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Unfavorite File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });
    const { data, status } = await ownerApi.files.toggleFileFavorite({
      fileId,
      favorite: false,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });
});

test.describe("GET /files/file/:fileId - Get file info", () => {
  test("GET /files/file/:fileId - Returns correct file metadata for a file in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Get File Info" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.getFileInfo({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Get File Info.docx");
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.version).toBe(1);
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  test("GET /files/file/:fileId - Returns correct folderId for a file in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Get File Info",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Room File Info" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.getFileInfo({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Room File Info.docx");
    expect(data.response!.folderId).toBe(folderId);
  });

  // Note: API returns 403 (not 404) for non-existent files — does not distinguish "not found" from "no access"
  test("GET /files/file/:fileId - Returns 403 for non-existent file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.getFileInfo({
      fileId: 999999999,
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("The required file was not found");
  });
});
