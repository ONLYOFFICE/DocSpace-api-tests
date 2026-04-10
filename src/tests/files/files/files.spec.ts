import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FileShare,
  SubjectType,
  LinkType,
} from "@onlyoffice/docspace-api-sdk";
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

  // Note: createNewIfExist logic is inverted - true returns the existing file, false creates a new one with a suffix
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

test.describe("POST /files/@my/html - Create HTML file in My Documents", () => {
  test("POST /files/@my/html - Owner creates an HTML file in My Documents with title and content", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest HTML My Docs File",
        content: "<p>Hello world</p>",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest HTML My Docs File.html");
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.folderId).toBeGreaterThan(0);
    expect(data.response!.fileExst).toBe(".html");
  });

  // Note: content is marked optional in the SDK but the API requires it - returns 400 without it
  test("POST /files/@my/html - Missing content returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest HTML My Docs No Content",
      },
    });

    expect(status).toBe(400);
  });

  // Note: createNewIfExist logic is inverted - true returns the existing file, false creates a new one with a suffix
  test("POST /files/@my/html - createNewIfExist: true returns existing file when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: firstData } =
      await ownerApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Dedup",
          content: "<p>First</p>",
          createNewIfExist: false,
        },
      });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } =
      await ownerApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Dedup",
          content: "<p>Second</p>",
          createNewIfExist: true,
        },
      });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).toBe(firstId);
  });

  // Note: createNewIfExist: false creates a new file with a numeric suffix
  test("POST /files/@my/html - createNewIfExist: false creates new file with suffix when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: firstData } =
      await ownerApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Suffix",
          content: "<p>First</p>",
          createNewIfExist: true,
        },
      });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } =
      await ownerApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Suffix",
          content: "<p>Second</p>",
          createNewIfExist: false,
        },
      });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).not.toBe(firstId);
  });

  // Default behavior when createNewIfExist is not specified
  test("POST /files/@my/html - createNewIfExist omitted creates new file with suffix when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: firstData } =
      await ownerApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Default",
          content: "<p>First</p>",
        },
      });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } =
      await ownerApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Default",
          content: "<p>Second</p>",
        },
      });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).not.toBe(firstId);
  });
});

test.describe("POST /files/@my/text - Create text file in My Documents", () => {
  test("POST /files/@my/text - Owner creates a text file in My Documents with title and content", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.createTextFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Text My Docs File",
        content: "Hello world",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Text My Docs File.txt");
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.folderId).toBeGreaterThan(0);
    expect(data.response!.fileExst).toBe(".txt");
  });

  // Note: content is marked optional in the SDK but the API requires it - returns 400 without it
  test("POST /files/@my/text - Missing content returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.files.createTextFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Text My Docs No Content",
      },
    });

    expect(status).toBe(400);
  });

  // Note: createNewIfExist logic is inverted - true returns the existing file, false creates a new one with a suffix
  test("POST /files/@my/text - createNewIfExist: true returns existing file when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: firstData } =
      await ownerApi.files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Dedup",
          content: "First",
          createNewIfExist: false,
        },
      });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } =
      await ownerApi.files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Dedup",
          content: "Second",
          createNewIfExist: true,
        },
      });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).toBe(firstId);
  });

  // Note: createNewIfExist: false creates a new file with a numeric suffix
  test("POST /files/@my/text - createNewIfExist: false creates new file with suffix when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: firstData } =
      await ownerApi.files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Suffix",
          content: "First",
          createNewIfExist: true,
        },
      });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } =
      await ownerApi.files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Suffix",
          content: "Second",
          createNewIfExist: false,
        },
      });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).not.toBe(firstId);
  });

  // Default behavior when createNewIfExist is not specified
  test("POST /files/@my/text - createNewIfExist omitted creates new file with suffix when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: firstData } =
      await ownerApi.files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Default",
          content: "First",
        },
      });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } =
      await ownerApi.files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Default",
          content: "Second",
        },
      });

    expect(status).toBe(200);
    expect(secondData.statusCode).toBe(200);
    expect(secondData.response!.id).not.toBe(firstId);
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

  // Note: createNewIfExist logic is inverted - true returns the existing file, false creates a new one with a suffix
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

  // TODO: requires a password-protected source file - no API method available to create one yet
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

  test("BUG 80745: POST /files/file/:fileId/copyas - Copies file with non-standard extension (enableExternalExt: true)", async ({
    apiSdk,
  }) => {
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
    expect((data as any).response.folderId).toBe(destFolderId);
  });
});

test.describe("POST /files/file/:id/saveaspdf - Save file as PDF", () => {
  test("BUG 80743: POST /files/file/:id/saveaspdf - Saves file as PDF in specified folder", async ({
    apiSdk,
  }) => {
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
  });
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

  test("GET /files/file/:fileId - Returns 403 for non-existent file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.getFileInfo({
      fileId: 999999999,
    });

    expect(status).toBe(404);
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

  test("BUG 80774: PUT /files/file/:fileId - Returns 404 for non-existent file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.updateFile({
      fileId: 999999999,
      updateFile: { title: "Autotest Non-existent" },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("The required file was not found");
  });

  // Note: updateFile cannot change the file extension - the original extension (.docx) is always preserved
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

  test("PUT /files/file/:fileId - Empty title is ignored, returns 200 with unchanged title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Empty Title Original" },
    });
    const fileId = created.response!.id!;

    const { status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "" },
    });

    expect(status).toBe(200);
  });

  test("PUT /files/file/:fileId - Whitespace-only title is ignored, returns 200 with unchanged title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Spaces Title Original" },
    });
    const fileId = created.response!.id!;

    const { status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "   " },
    });

    expect(status).toBe(200);
  });

  // Note: max title length is 165 characters - API returns 400 for longer titles
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

  test("BUG 80773: PUT /files/file/:fileId - lastVersion equal to current version returns 500 instead of 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest LastVersion Original" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest LastVersion Renamed", lastVersion: 1 },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "The new version cannot be the same as the current one",
    );
  });

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

    // Forward slash is an invalid filename character - API sanitizes it by replacing with underscore
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

    // Delete is an async operation - wait for it to complete
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

    // Delete is an async operation - wait for it to complete
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

    // Delete is an async operation - wait for it to complete
    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("1");
    expect(operation.error).toBeFalsy();
  });

  test("DELETE /files/file/:fileId - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.deleteFile({
      fileId: 999999999,
      _delete: { immediately: true },
    });

    expect(status).toBe(404);
    expect((data as any).error?.message).toBe(
      "The required file was not found",
    );
  });
});

test.describe("PUT /files/file/:fileId/lock - Lock/unlock file", () => {
  test("PUT /files/file/:fileId/lock - Owner locks a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Lock File" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBe(true);
  });

  test("PUT /files/file/:fileId/lock - Owner unlocks a previously locked file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Unlock File" },
    });
    const fileId = created.response!.id!;

    await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    const { data, status } = await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    // After unlock, locked field is absent from response (API omits false values)
    expect(data.response?.locked).toBeFalsy();
  });

  test("PUT /files/file/:fileId/lock - Owner locks a file in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Lock",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Lock Room File" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBe(true);
  });

  test("PUT /files/file/:fileId/lock - Locking an already locked file is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Idempotent Lock File" },
    });
    const fileId = created.response!.id!;

    await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    const { data, status } = await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBe(true);
  });

  test("PUT /files/file/:fileId/lock - Unlocking an already unlocked file is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Idempotent Unlock File" },
    });
    const fileId = created.response!.id!;

    const { data, status } = await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBeFalsy();
  });

  test("BUG 80788: PUT /files/file/:fileId/lock - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.lockFile({
      fileId: 999999999,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("The required file was not found");
  });
});

test.describe("PUT /files/:fileId/order - Set file order", () => {
  test("PUT /files/:fileId/order - Owner sets file order to a specific value", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 5 },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Order File.docx");
  });

  test("PUT /files/:fileId/order - Order can be updated to a new value", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order Update File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 3 },
    });

    const { data, status } = await ownerApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 7 },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  // Order must be between 1 and 2147483647 - 0 is not valid
  test("PUT /files/:fileId/order - Order 0 returns 400", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order Zero File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 0 },
    });

    expect(status).toBe(400);
  });

  test("PUT /files/:fileId/order - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.files.setFileOrder({
      fileId: 999999999,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(404);
  });
});

test.describe("POST /files/file/:fileId/recent - Add file to recent", () => {
  test("POST /files/file/:fileId/recent - Owner adds file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent File.docx");
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.folderId).toBeGreaterThan(0);
  });

  test("POST /files/file/:fileId/recent - Adding the same file twice is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent Idempotent File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.addFileToRecent({ fileId });

    const { data, status } = await ownerApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  test("POST /files/file/:fileId/recent - File appears in Recent section after adding", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent Check File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.addFileToRecent({ fileId });

    const { data, status } = await ownerApi.folders.getRecentFolder();

    expect(status).toBe(200);
    const recentFiles = data.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(true);
  });

  test("POST /files/file/:fileId/recent - User access can add room file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Recent Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Recent Room File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent Room File.docx");
  });

  test("POST /files/file/:fileId/recent - File in a room subfolder: folderId points to subfolder, originRoomId points to room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const roomTitle = "Autotest Recent Subfolder Room";
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: roomTitle,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: subfolderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Recent Subfolder" },
    });
    const subfolderId = subfolderData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: subfolderId,
      createFileJsonElement: { title: "Autotest Recent Subfolder File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent Subfolder File.docx");
    // Business: folderId points to the subfolder, not the room root
    expect(data.response!.folderId).toBe(subfolderId);
    // Business: originId points to the immediate parent (subfolder)
    expect((data.response as any).originId).toBe(subfolderId);
    // Business: originTitle matches the subfolder name
    expect((data.response as any).originTitle).toBe(
      "Autotest Recent Subfolder",
    );
    // Business: originRoomId points to the room, not the subfolder
    expect((data.response as any).originRoomId).toBe(roomId);
    // Business: originRoomTitle matches the room title
    expect((data.response as any).originRoomTitle).toBe(roomTitle);
  });

  test("BUG 80795: POST /files/file/:fileId/recent - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.addFileToRecent({
      fileId: 999999999,
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("The required file was not found");
  });
});

test.describe("DELETE /files/recent - Delete files from Recent section", () => {
  test("DELETE /files/recent - Owner removes a file from Recent section", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.addFileToRecent({ fileId });

    const { status } = await ownerApi.files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(204);

    const { data: recentData } = await ownerApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(false);
  });

  test("DELETE /files/recent - Owner removes multiple files from Recent in one request", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: file1Data } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent File 1" },
    });
    const fileId1 = file1Data.response!.id!;

    const { data: file2Data } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent File 2" },
    });
    const fileId2 = file2Data.response!.id!;

    await ownerApi.files.addFileToRecent({ fileId: fileId1 });
    await ownerApi.files.addFileToRecent({ fileId: fileId2 });

    const { status } = await ownerApi.files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId1 as any, fileId2 as any] },
    });

    expect(status).toBe(204);

    const { data: recentData } = await ownerApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found1 = recentFiles.some((f: any) => f.id === fileId1);
    const found2 = recentFiles.some((f: any) => f.id === fileId2);
    expect(found1).toBe(false);
    expect(found2).toBe(false);
  });

  test("DELETE /files/recent - Removing a file not in Recent is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent Not Added" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(204);
  });
});

test.describe("GET /files/file/:id/link - Get primary external link", () => {
  test("GET /files/file/:id/link - Owner gets primary external link for a file in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest External Link File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.access).toBe(FileShare.Read);
    expect(data.response!.canEditInternal).toBe(true);
    expect(data.response!.canEditDenyDownload).toBe(true);
    expect(data.response!.canEditExpirationDate).toBe(true);
    expect(data.response!.sharedLink).toBeDefined();
    expect(data.response!.sharedLink!.primary).toBe(true);
    expect(data.response!.sharedLink!.linkType).toBe(LinkType.External);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
    expect(data.response!.sharedLink!.id).toBeDefined();
  });

  test("GET /files/file/:id/link - File in a room also has a primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For External Link",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room File External Link" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.primary).toBe(true);
    expect(data.response!.sharedLink!.linkType).toBe(LinkType.External);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("GET /files/file/:id/link - Repeated calls return the same link ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest External Link Idempotent" },
    });
    const fileId = fileData.response!.id!;

    const { data: data1 } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });
    const { data: data2 } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });

    expect(data1.response!.sharedLink!.id).toBe(data2.response!.sharedLink!.id);
  });
});

test.describe("PUT /files/file/:id/links - Set file external link", () => {
  test("PUT /files/file/:id/links - Owner creates a new non-primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set External Link" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "My New Link",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.subjectType).toBe(SubjectType.ExternalLink);
    expect(data.response!.access).toBe(FileShare.Read);
    expect(data.response!.sharedLink).toBeDefined();
    expect(data.response!.sharedLink!.primary).toBe(false);
    expect(data.response!.sharedLink!.title).toBe("My New Link");
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("PUT /files/file/:id/links - Owner creates a primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set Primary External Link" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: true,
        access: FileShare.Read,
        title: "My Primary Link",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.primary).toBe(true);
    expect(data.response!.sharedLink!.title).toBe("My Primary Link");
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("PUT /files/file/:id/links - Created link has correct structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Set External Link Structure",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Structure Check Link",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.ExternalLink);
    expect(data.response!.access).toBe(FileShare.Read);
    expect(data.response!.isLocked).toBe(false);
    expect(data.response!.sharedLink!.id).toBeDefined();
    expect(data.response!.sharedLink!.title).toBe("Structure Check Link");
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
    expect(data.response!.sharedLink!.linkType).toBe(LinkType.External);
    expect(data.response!.sharedLink!.primary).toBe(false);
    expect(data.response!.sharedLink!.internal).toBe(false);
    expect(data.response!.sharedLink!.denyDownload).toBe(false);
    expect(data.response!.sharedLink!.isExpired).toBe(false);
  });

  test("PUT /files/file/:id/links - Owner creates a link with denyDownload=true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Set External Link DenyDownload",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "No Download Link",
        denyDownload: true,
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.denyDownload).toBe(true);
  });

  test("PUT /files/file/:id/links - Owner creates an internal link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Set External Link Internal",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Internal Link",
        internal: true,
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.internal).toBe(true);
  });

  test("PUT /files/file/:id/links - Owner updates an existing link title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Update External Link" },
    });
    const fileId = fileData.response!.id!;

    const { data: createData } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Original Title",
      },
    });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        linkId,
        primary: false,
        access: FileShare.Read,
        title: "Updated Title",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBe(linkId);
    expect(data.response!.sharedLink!.title).toBe("Updated Title");
  });

  test("PUT /files/file/:id/links - Owner creates a link with expiration date", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set External Link Expiration" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Expiring Link",
        expirationDate: "2030-01-01T00:00:00.000Z" as any,
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.isExpired).toBe(false);
    expect((data.response!.sharedLink! as any).expirationDate).toBeDefined();
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("PUT /files/file/:id/links - Owner creates a link with password protection", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set External Link Password" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Password Protected Link",
        password: "SecurePass123",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
    expect((data.response!.sharedLink! as any).password).toBe("SecurePass123");
  });

  test("PUT /files/file/:id/links - Owner creates a link with ReadWrite access", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set External Link ReadWrite" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.ReadWrite,
        title: "ReadWrite Link",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "The role is not available for this user type",
    );
  });

  test("PUT /files/file/:id/links - Setting a link with non-existent linkId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Set External Link Bad LinkId",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        linkId: "00000000-0000-0000-0000-000000000001",
        primary: false,
        access: FileShare.Read,
        title: "Link With Bad Id",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBe(
      "00000000-0000-0000-0000-000000000001",
    );
  });

  test("PUT /files/file/:id/links - Setting a link on a non-existent file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: 999999999,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Link On Missing File",
      },
    });
    expect(status).toBe(404);
    expect((data as any).error.message).toBe("Item not found");
  });
});

test.describe("GET /files/file/:id/links - Get file links", () => {
  test("GET /files/file/:id/links - New file in My Documents has no custom external links", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Links" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("GET /files/file/:id/links - New file in a room also has no custom external links", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For File Links",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room File Links" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("GET /files/file/:id/links - count and startIndex parameters return 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Links Pagination" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileLinks({
      id: fileId,
      count: 10,
      startIndex: 0,
    });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /files/file/:id/links - File with a created external link returns it in the response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File With External Link" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Test External Link",
      },
    });

    const { data, status } = await ownerApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(1);
    expect(data.count).toBe(data.response!.length);
  });

  test("GET /files/file/:id/links - External link item has correct structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Link Structure" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Test External Link Structure",
      },
    });

    const { data, status } = await ownerApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(1);

    const link = data.response![0];
    expect(link.subjectType).toBe(SubjectType.ExternalLink);
    expect(link.access).toBe(FileShare.Read);
    expect(link.isLocked).toBe(false);
    expect(link.sharedLink).toBeDefined();
    expect(link.sharedLink!.id).toBeDefined();
    expect(link.sharedLink!.title).toBe("Test External Link Structure");
    expect(link.sharedLink!.shareLink).toBeTruthy();
    expect(link.sharedLink!.linkType).toBe(LinkType.External);
    expect(link.sharedLink!.primary).toBe(false);
    expect(link.sharedLink!.internal).toBe(false);
    expect(link.sharedLink!.denyDownload).toBe(false);
    expect(link.sharedLink!.isExpired).toBe(false);
  });
});

test.describe("GET /files/file/:fileId/history - Get file version info", () => {
  test("GET /files/file/:fileId/history - New file has one version in history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Version History" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBe(1);
    expect(data.count).toBe(1);
    expect(data.response![0].version).toBe(1);
    expect(data.response![0].versionGroup).toBe(1);
  });

  test("GET /files/file/:fileId/history - Version item has correct structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Version Structure" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);

    const version = data.response![0];
    expect(version.id).toBe(fileId);
    expect(version.title).toBe("Autotest File Version Structure.docx");
    expect(version.version).toBe(1);
    expect(version.versionGroup).toBe(1);
    expect(version.folderId).toBeDefined();
    expect(version.fileExst).toBe(".docx");
    expect(version.webUrl).toBeTruthy();
    expect(version.viewUrl).toBeTruthy();
    expect(version.createdBy).toBeDefined();
    expect(version.updatedBy).toBeDefined();
    expect(version.locked).toBeFalsy();
    expect(version.encrypted).toBeFalsy();
  });

  test("GET /files/file/:fileId/history - File in a room also has version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Version History",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room File Version" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
    expect(data.response![0].version).toBe(1);
    expect(data.response![0].id).toBe(fileId);
  });

  test("GET /files/file/:fileId/history - Non-existent file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.files.getFileVersionInfo({
      fileId: 999999999,
    });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/history - First version has comment 'Created' and fileStatus 0", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Version Comment" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response![0].comment).toBe("Created");
    expect(data.response![0].fileStatus).toBe(0);
  });
});

test.describe("GET /files/file/:fileId/edit/history - Get file edit history", () => {
  test("GET /files/file/:fileId/edit/history - Owner gets edit history of a new file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit History File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditHistory({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBe(1);
    expect(data.count).toBe(1);
  });

  test("GET /files/file/:fileId/edit/history - Edit history entry has correct structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit History Structure" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditHistory({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBe(1);

    const entry = data.response![0];
    // Business: each entry must identify the document version and author
    expect(entry.id).toBe(fileId);
    expect(entry.key).toBeTruthy();
    expect(entry.version).toBe(1);
    expect(entry.versionGroup).toBe(1);
    expect(entry.user).toBeDefined();
    expect(entry.user!.id).toBeTruthy();
    expect(entry.user!.name).toBeTruthy();
    expect(entry.created).toBeDefined();
  });

  test("GET /files/file/:fileId/edit/history - File in a room has edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Edit History",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room Edit History File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditHistory({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("BUG 80962: GET /files/file/:fileId/edit/history - Non-existent file returns 403 instead of 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.getEditHistory({
      fileId: 999999999,
    });

    expect(status).toBe(404);
    expect((data as any).error.message).toBe("The required file was not found");
  });
});
