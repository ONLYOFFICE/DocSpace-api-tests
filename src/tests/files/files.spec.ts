import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

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

    const { data, status } = await ownerApi.files.copyFileAs({
      fileId,
      copyAsJsonElement: {
        destTitle: "Autotest Copied File.docx",
        destFolderId,
      },
    });

    expect(status).toBe(200);
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

    const { data, status } = await ownerApi.files.copyFileAs({
      fileId,
      copyAsJsonElement: {
        destTitle: "Autotest Converted Form.docxf",
        destFolderId,
        toForm: true,
      },
    });

    expect(status).toBe(200);
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

test.describe("PUT /files/file/:fileId - Update file", () => {
  test("PUT /files/file/:fileId - Owner renames a file", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Update File Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest Update File Renamed" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Update File Renamed.docx");
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.version).toBe(1);
  });

  test("PUT /files/file/:fileId - Title without extension keeps .docx extension", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest No Ext Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest No Ext Renamed" },
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe("Autotest No Ext Renamed.docx");
    expect(data.response!.fileExst).toBe(".docx");
  });

  test("PUT /files/file/:fileId - Title with extension updates correctly", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest With Ext Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest With Ext Renamed.docx" },
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe("Autotest With Ext Renamed.docx");
    expect(data.response!.fileExst).toBe(".docx");
  });

  test.fail(
    "BUG XXXX: PUT /files/file/:fileId - Returns 403 instead of 404 for non-existent file",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.files.updateFile({
        fileId: 999999999,
        updateFile: { title: "Autotest Non-existent" },
      });

      // Bug: API crashes with NullReferenceException and returns 403 instead of 404
      expect(status).toBe(404);
    },
  );

  // Note: updateFile cannot change the file extension — the original extension (.docx) is always preserved
  // and appended after the new title, e.g. "Renamed.txt" becomes "Renamed.txt.docx"
  test("PUT /files/file/:fileId - Renaming with a different extension does not change fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Change Ext Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest Change Ext Renamed.txt" },
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe("Autotest Change Ext Renamed.txt.docx");
    expect(data.response!.fileExst).toBe(".docx");
  });

  test.fail(
    "BUG XXXX: PUT /files/file/:fileId - Empty title returns 200 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Empty Title Original" },
      });
      const fileId = created.response!.id!;

      const { status } = await ownerApi.files.updateFile({
        fileId,
        updateFile: { title: "" },
      });

      // Bug: API silently ignores empty title and returns 200 with unchanged filename
      // Expected: 400 with validation error "Title cannot be empty"
      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG XXXX: PUT /files/file/:fileId - Whitespace-only title returns 200 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Spaces Title Original" },
      });
      const fileId = created.response!.id!;

      const { status } = await ownerApi.files.updateFile({
        fileId,
        updateFile: { title: "   " },
      });

      // Bug: API silently ignores whitespace-only title and returns 200 with unchanged filename
      // Expected: 400 with validation error "Title cannot be empty"
      expect(status).toBe(400);
    },
  );

  // Note: max title length is 165 characters — API returns 400 for longer titles
  test("PUT /files/file/:fileId - Title longer than 165 characters returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Long Title Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "A".repeat(166) },
    });

    expect(status).toBe(400);
    expect((data as any).response.errors["File.Title"][0]).toBe(
      "The field Title must be a string with a maximum length of 165.",
    );
  });

  test.fail(
    "BUG XXXX: PUT /files/file/:fileId - lastVersion equal to current version returns 500 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: created } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest LastVersion Original" },
      });
      const fileId = created.response!.id!;

      const { status } = await ownerApi.files.updateFile({
        fileId,
        updateFile: { title: "Autotest LastVersion Renamed", lastVersion: 1 },
      });

      // Bug: API returns 500 with "The new version cannot be the same as the current one"
      // when lastVersion equals the current file version. Expected: 400 Bad Request.
      expect(status).toBe(400);
    },
  );

  test("PUT /files/file/:fileId - Title with ampersand is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Special Chars Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest A & B" },
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe("Autotest A & B.docx");
  });

  test("PUT /files/file/:fileId - Title with forward slash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Slash Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest A/B" },
    });

    // Forward slash is an invalid filename character — API sanitizes it by replacing with underscore
    expect(status).toBe(200);
    expect(data.response!.title).toBe("Autotest A_B.docx");
  });
});

test.describe("DELETE /files/file/:fileId - Delete file", () => {
  test("DELETE /files/file/:fileId - Owner moves a file to Trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Trash File" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0].Operation).toBe(2); // FileOperationType.Delete

    // Delete is an async operation — wait for it to complete
    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("1");
    expect(operation.error).toBeFalsy();
  });

  test("DELETE /files/file/:fileId - Owner deletes a file immediately", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Immediate File" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].Operation).toBe(2); // FileOperationType.Delete

    // Delete is an async operation — wait for it to complete
    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("1");
    expect(operation.error).toBeFalsy();
  });

  test("DELETE /files/file/:fileId - Owner deletes a file in a room immediately", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Delete Room File" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].Operation).toBe(2); // FileOperationType.Delete

    // Delete is an async operation — wait for it to complete
    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("1");
    expect(operation.error).toBeFalsy();
  });

  // Note: unlike GET and PUT, DELETE accepts non-existent fileId — operation is queued and fails asynchronously
  test("DELETE /files/file/:fileId - Non-existent file returns 200 and queues an operation", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.deleteFile({
      fileId: 999999999,
      _delete: { immediately: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].Operation).toBe(2); // FileOperationType.Delete

    const operation = await waitForOperation(ownerApi.operations);
    // Operation finishes but with an error — file was not found asynchronously
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("0");
    expect(operation.error).toBe("The required file was not found");
  });
});
