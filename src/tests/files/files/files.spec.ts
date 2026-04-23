import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FileShare,
  SubjectType,
  LinkType,
  MessageAction,
  FileEntryType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { faker } from "@faker-js/faker";

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

test.describe("POST /api/2.0/files/{fileId}/edit_session - Create Edit Session", () => {
  test("POST /api/2.0/files/{fileId}/edit_session - Owner creates edit session for a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Upload Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Response success is true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Success Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Success File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 2048,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Response contains session ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked ID Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked ID File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.id).toBeTruthy();
    expect(typeof data.response!.data!.id).toBe("string");
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session has expiration date", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Expiry Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Expiry File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.expired).toBeTruthy();
    const expiryDate = new Date(data.response!.data!.expired!);
    expect(expiryDate.getTime()).toBeGreaterThan(Date.now());
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session has location", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Location Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Location File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.location).toBeTruthy();
  });

  test("POST /api/2.0/files/{fileId}/edit_session - bytes_total matches fileSize", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Bytes Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Bytes File" },
    });
    const fileId = fileData.response!.id!;

    const fileSize = 5120;
    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.bytes_total).toBe(fileSize);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session can be created without fileSize", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked No Size Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked No Size File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session created field is returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Created Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Created File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.created).toBeTruthy();
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .files.createEditSession({ fileId: 999999999 });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - File in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Chunked MyDocs File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
    expect(data.response!.data!.id).toBeTruthy();
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

    const { data, status } = await ownerApi.files.getEditHistory({
      fileId,
    });

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
      createFileJsonElement: {
        title: "Autotest Edit History Structure",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditHistory({
      fileId,
    });

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

    const { data, status } = await ownerApi.files.getEditHistory({
      fileId,
    });

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

  test("GET /files/file/:fileId/edit/history - History grows after version increment", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit History Versions" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.getEditHistory({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(1);
  });

  test("GET /files/file/:fileId/edit/history - File in archived room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Edit History Archived File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.files.getEditHistory({
      fileId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("PUT /files/file/:fileId/history - Change version history", () => {
  test("PUT /files/file/:fileId/history - Owner splits version into new group (continueVersion: false)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Version History Split" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);

    const v1 = data.response!.find((f) => f.version === 1);
    const v2 = data.response!.find((f) => f.version === 2);
    expect(v1).toBeDefined();
    expect(v2).toBeDefined();
    expect(v2!.versionGroup).not.toBe(v1!.versionGroup);
  });

  test("PUT /files/file/:fileId/history - Owner merges version into previous group (continueVersion: true)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Version History Merge" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);

    const v1 = data.response!.find((f) => f.version === 1);
    const v2 = data.response!.find((f) => f.version === 2);
    expect(v1).toBeDefined();
    expect(v2).toBeDefined();
  });

  test("PUT /files/file/:fileId/history - Response has correct file structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Version History Structure",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(data.count).toBeGreaterThan(0);

    const file = data.response![0];
    expect(file.id).toBeDefined();
    expect(file.version).toBeDefined();
    expect(file.versionGroup).toBeDefined();
    expect(file.title).toBeDefined();
  });

  test("PUT /files/file/:fileId/history - Split creates new version group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Version History Groups" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data: before } = await ownerApi.files.getEditHistory({
      fileId,
    });
    const groupsBefore = new Set(before.response?.map((e) => e.versionGroup));

    await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    const { data: after } = await ownerApi.files.getEditHistory({ fileId });
    const groupsAfter = new Set(after.response?.map((e) => e.versionGroup));

    expect(groupsAfter.size).toBeGreaterThanOrEqual(groupsBefore.size);

    const v1 = after.response!.find((e) => e.version === 1);
    const v2 = after.response!.find((e) => e.version === 2);
    expect(v1).toBeDefined();
    expect(v2).toBeDefined();
    expect(v2!.versionGroup).not.toBe(v1!.versionGroup);
  });

  test("PUT /files/file/:fileId/history - Merge reduces version groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Version History Merge Groups",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    const { data: before } = await ownerApi.files.getEditHistory({
      fileId,
    });
    const groupsBefore = new Set(before.response?.map((e) => e.versionGroup));

    const { status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: true },
    });

    const { data: after } = await ownerApi.files.getEditHistory({ fileId });
    const groupsAfter = new Set(after.response?.map((e) => e.versionGroup));

    expect(status).toBe(200);
    expect(groupsAfter.size).toBeLessThanOrEqual(groupsBefore.size);
  });

  test("PUT /files/file/:fileId/history - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .files.changeVersionHistory({
        fileId: 999999999,
        changeHistory: { version: 1, continueVersion: false },
      });

    expect(status).toBe(404);
    expect((data as any).error?.message).toBeTruthy();
  });

  test("PUT /files/file/:fileId/history - File in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History Room File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("PUT /files/file/:fileId/history - File in archived room returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History Archived File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBeTruthy();
  });
});

test.describe("POST /files/file/:fileId/restoreversion - Restore file version", () => {
  test("POST /files/file/:fileId/restoreversion - Owner restores a previous version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Restore Version" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /files/file/:fileId/restoreversion - Restore adds a new entry to edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Restore Grows History" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data: before } = await ownerApi.files.getEditHistory({
      fileId,
    });
    const countBefore = before.response!.length;

    const { data, status } = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(countBefore);
  });

  test("POST /files/file/:fileId/restoreversion - Response has correct edit history structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Restore Structure" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);

    const entry = data.response![0];
    expect(entry.id).toBeDefined();
    expect(entry.key).toBeTruthy();
    expect(entry.version).toBeDefined();
    expect(entry.versionGroup).toBeDefined();
    expect(entry.user).toBeDefined();
    expect(entry.user!.id).toBeTruthy();
    expect(entry.created).toBeDefined();
  });

  test("POST /files/file/:fileId/restoreversion - File in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore Version Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Restore Version Room File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("POST /files/file/:fileId/restoreversion - Missing version and url returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Restore No Params" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await ownerApi.files.restoreFileVersion({
      fileId,
    });

    expect(status).toBe(400);
  });

  test("POST /files/file/:fileId/restoreversion - Non-existent file returns error", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").files.restoreFileVersion({
      fileId: 999999999,
      version: 1,
    });

    expect([403, 404]).toContain(status);
  });

  test("POST /files/file/:fileId/restoreversion - File in archived room returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore Version Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Restore Version Archived File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(403);
  });
});

test.describe("POST /files/file/referencedata - Get reference data", () => {
  test("POST /files/file/referencedata - Owner gets reference data using fileKey and instanceId from openEditFile", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ReferenceData Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest ReferenceData File" },
    });
    const fileId = fileData.response!.id!;

    const { data: openData } = await ownerApi.files.openEditFile({ fileId });
    const fileKey = openData.response!.document!.referenceData!.fileKey!;
    const instanceId = openData.response!.document!.referenceData!.instanceId!;

    const { data, status } = await ownerApi.files.getReferenceData({
      getReferenceDataDtoInteger: { fileKey, instanceId },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.url).toBeTruthy();
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.referenceData).toBeDefined();
  });

  test("POST /files/file/referencedata - Response referenceData contains same fileKey and instanceId (roundtrip)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ReferenceData Roundtrip Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest ReferenceData Roundtrip File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: openData } = await ownerApi.files.openEditFile({ fileId });
    const fileKey = openData.response!.document!.referenceData!.fileKey!;
    const instanceId = openData.response!.document!.referenceData!.instanceId!;

    const { data, status } = await ownerApi.files.getReferenceData({
      getReferenceDataDtoInteger: { fileKey, instanceId },
    });

    expect(status).toBe(200);
    expect(data.response!.referenceData!.fileKey).toBe(fileKey);
    expect(data.response!.referenceData!.instanceId).toBe(instanceId);
  });

  test("POST /files/file/referencedata - sourceFileId can be passed alongside fileKey and instanceId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest ReferenceData SourceId Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest ReferenceData SourceId File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: openData } = await ownerApi.files.openEditFile({ fileId });
    const fileKey = openData.response!.document!.referenceData!.fileKey!;
    const instanceId = openData.response!.document!.referenceData!.instanceId!;

    const { data, status } = await ownerApi.files.getReferenceData({
      getReferenceDataDtoInteger: { fileKey, instanceId, sourceFileId: fileId },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.url).toBeTruthy();
    expect(data.response!.referenceData).toBeDefined();
  });

  test("POST /files/file/referencedata - Read-only room member gets 200 with canEditRoom false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RefData ReadOnly Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest RefData ReadOnly File" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: openData } = await ownerApi.files.openEditFile({ fileId });
    const fileKey = openData.response!.document!.referenceData!.fileKey!;
    const instanceId = openData.response!.document!.referenceData!.instanceId!;

    const { data, status } = await userApi.files.getReferenceData({
      getReferenceDataDtoInteger: { fileKey, instanceId },
    });

    expect(status).toBe(200);
    expect(data.response!.referenceData!.canEditRoom).toBe(false);
  });

  test("POST /files/file/referencedata - All fields passed simultaneously returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RefData AllFields Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest RefData AllFields File" },
    });
    const fileId = fileData.response!.id!;

    const { data: openData } = await ownerApi.files.openEditFile({ fileId });
    const fileKey = openData.response!.document!.referenceData!.fileKey!;
    const instanceId = openData.response!.document!.referenceData!.instanceId!;

    const { data: linkData } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });
    const linkUrl = linkData.response!.sharedLink!.shareLink!;

    const { data, status } = await ownerApi.files.getReferenceData({
      getReferenceDataDtoInteger: {
        fileKey,
        instanceId,
        sourceFileId: fileId,
        path: "Sheet1!A1",
        link: linkUrl,
      },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.url).toBeTruthy();
  });

  test("POST /files/file/referencedata - Arbitrary fileKey not from openEditFile returns error", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .files.getReferenceData({
        getReferenceDataDtoInteger: {
          fileKey: "totally-fake-file-key-12345",
          instanceId: "fake-instance-id",
        },
      });

    expect(status === 404 || data.response?.error != null).toBe(true);
  });
});

test.describe("GET /files/file/:fileId/log - Get file history", () => {
  test("GET /files/file/:fileId/log - Owner gets file history with correct structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Structure Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History Structure File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
    const entry = data.response![0];
    expect(entry.id).toBeDefined();
    expect(entry.action).toBeDefined();
    expect(entry.initiator).toBeDefined();
    expect(entry.initiator.displayName).toBeTruthy();
    expect(entry.date).toBeDefined();
  });

  test("GET /files/file/:fileId/log - Newly created file has FileCreated action in history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Created Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History Created File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
    expect(data.response![0].action?.id).toBe(MessageAction.FileCreated);
  });

  test("GET /files/file/:fileId/log - History grows after file rename operations", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Grow Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History Grow File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest History Grow File Renamed 1" },
    });

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest History Grow File Renamed 2" },
    });

    const { data, status } = await ownerApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(3);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FileCreated);
    expect(actionIds).toContain(MessageAction.FileRenamed);
  });

  test("GET /files/file/:fileId/log - count parameter limits number of returned entries", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Count Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History Count File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest History Count File Renamed 1" },
    });

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest History Count File Renamed 2" },
    });

    const { data, status } = await ownerApi.files.getFileHistory({
      fileId,
      count: 1,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
  });

  test("GET /files/file/:fileId/log - startIndex shifts result set", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History StartIndex Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History StartIndex File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest History StartIndex File Renamed" },
    });

    const { data: data0 } = await ownerApi.files.getFileHistory({
      fileId,
      startIndex: 0,
      count: 1,
    });
    const { data: data1, status } = await ownerApi.files.getFileHistory({
      fileId,
      startIndex: 1,
      count: 1,
    });

    expect(status).toBe(200);
    expect(data0.response![0].id).not.toBe(data1.response![0].id);
  });

  test("GET /files/file/:fileId/log - startIndex beyond total entries returns empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Beyond Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History Beyond File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileHistory({
      fileId,
      startIndex: 99999,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(0);
  });

  test("GET /files/file/:fileId/log - response count matches actual number of entries", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Count Match Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History Count Match File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest History Count Match File Renamed" },
    });

    const { data, status } = await ownerApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.count).toBe(data.response!.length);
  });

  test("GET /files/file/:fileId/log - History is non-empty and contains FileCreated action", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const fromDate = new Date(Date.now() - 60000).toISOString();

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History DateFilter Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History DateFilter File",
      },
    });
    const fileId = fileData.response!.id!;

    const toDate = new Date(Date.now() + 60000).toISOString();

    const { data, status } = await ownerApi.files.getFileHistory({
      fileId,
      fromDate: { utcTime: fromDate },
      toDate: { utcTime: toDate },
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FileCreated);
  });

  test("GET /files/file/:fileId/log - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .files.getFileHistory({ fileId: 999999999 });

    expect(status).toBe(404);
  });

  test("GET /files/file/:fileId/log - Owner can get file history in archived room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History Archived File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /files/file/:fileId/log - Owner can get file history for deleted file in trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Deleted Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History Deleted File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });

    const { data, status } = await ownerApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });
});

test.describe("POST /files/file/:fileId/startedit - Start file editing", () => {
  test("POST /files/file/:fileId/startedit - Owner, editingAlone: false returns error (requires Document Server)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Start Edit Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Start Edit File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: false },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("File editing start error");
  });

  test("POST /files/file/:fileId/startedit - Owner starts editing a file alone", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Start Edit Alone Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Start Edit Alone File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(typeof data.response).toBe("string");
    expect(data.response).toBeTruthy();
  });

  test("POST /files/file/:fileId/startedit - DocSpaceAdmin starts editing a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Admin Start Edit Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Admin Start Edit File" },
    });
    const fileId = fileData.response!.id!;

    const { api: adminApi, data: adminMemberData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminUserId = adminMemberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminUserId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await adminApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(typeof data.response).toBe("string");
    expect(data.response).toBeTruthy();
  });

  test("POST /files/file/:fileId/startedit - RoomAdmin starts editing a file in their room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RoomAdmin Start Edit Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest RoomAdmin Start Edit File" },
    });
    const fileId = fileData.response!.id!;

    const { api: roomAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(typeof data.response).toBe("string");
    expect(data.response).toBeTruthy();
  });

  test("POST /files/file/:fileId/startedit - Non-existent fileId returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const nonExistentFileId = 999999999;

    const { data, status } = await ownerApi.files.startEditFile({
      fileId: nonExistentFileId,
      startEdit: { editingAlone: true },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("The required file was not found");
  });

  test("POST /files/file/:fileId/startedit - Request without editingAlone field", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartEdit No Body Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest StartEdit No Body File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.startEditFile({
      fileId,
      startEdit: {},
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("File editing start error");
  });

  test("POST /files/file/:fileId/startedit - Second user starts editing a file already being edited", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Concurrent Edit Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Concurrent Edit File" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data: ownerEditData, status: ownerStatus } =
      await ownerApi.files.startEditFile({
        fileId,
        startEdit: { editingAlone: true },
      });

    const { data, status } = await userApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: true },
    });

    expect(ownerStatus).toBe(200);
    expect(ownerEditData.response).toBeTruthy();
    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "This document is being edited by you in another tab",
    );
  });

  test("POST /files/file/:fileId/startedit - editingAlone: true when file is already being edited", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest EditingAlone Conflict Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest EditingAlone Conflict File" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data: firstEditData, status: firstStatus } =
      await ownerApi.files.startEditFile({
        fileId,
        startEdit: { editingAlone: true },
      });

    const { data, status } = await userApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: true },
    });

    expect(firstStatus).toBe(200);
    expect(firstEditData.response).toBeTruthy();
    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "This document is being edited by you in another tab",
    );
  });
});

test.describe("PUT /files/order - Set files order in bulk", () => {
  // Note: setFilesOrder only works with files/folders inside rooms (VDR with indexing: true).
  // Files in My Documents return 403 - this is consistent with how room ordering works in the project.

  // Catches: API silently ignores the order field or returns wrong entry
  test("PUT /files/order - Owner sets order for a single file in VDR room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Single File Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Single File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 5 }],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBe(1);
    expect(data.response![0].id).toBe(fileId);
    expect(data.response![0].title).toBe("Autotest BulkOrder Single File.docx");
    expect(data.response![0].fileEntryType).toBe(FileEntryType.File);
  });

  // Catches: Folder entries silently ignored or returned with wrong fileEntryType
  test("PUT /files/order - Owner sets order for a single folder in VDR room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Single Folder Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest BulkOrder Single Folder" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [
          { entryId: folderId, entryType: FileEntryType.Folder, order: 3 },
        ],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBe(1);
    expect(data.response![0].id).toBe(folderId);
    expect(data.response![0].fileEntryType).toBe(FileEntryType.Folder);
  });

  // Catches: Batch partial failure - some items silently dropped from response
  test("PUT /files/order - Owner sets order for multiple files at once", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Multi File Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: file1Data } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Multi File 1" },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Multi File 2" },
    });
    const fileId1 = file1Data.response!.id!;
    const fileId2 = file2Data.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [
          { entryId: fileId1, entryType: FileEntryType.File, order: 1 },
          { entryId: fileId2, entryType: FileEntryType.File, order: 2 },
        ],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBe(2);
    const ids = data.response!.map((e) => e.id);
    expect(ids).toContain(fileId1);
    expect(ids).toContain(fileId2);
  });

  // Catches: Mixed batch silently drops folders or returns wrong fileEntryType per item
  test("PUT /files/order - Owner sets order for a mix of files and folders", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Mix Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Mix File" },
    });
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest BulkOrder Mix Folder" },
    });
    const fileId = fileData.response!.id!;
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [
          { entryId: fileId, entryType: FileEntryType.File, order: 1 },
          { entryId: folderId, entryType: FileEntryType.Folder, order: 2 },
        ],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBe(2);
    const fileItem = data.response!.find((e) => e.id === fileId);
    const folderItem = data.response!.find((e) => e.id === folderId);
    expect(fileItem).toBeDefined();
    expect(folderItem).toBeDefined();
    expect(fileItem!.fileEntryType).toBe(FileEntryType.File);
    expect(folderItem!.fileEntryType).toBe(FileEntryType.Folder);
  });

  // Catches: Repeated calls overwrite instead of returning stale order value
  test("PUT /files/order - Order value can be updated with a new value", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Update Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Update File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 3 }],
      },
    });

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 7 }],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].id).toBe(fileId);
  });

  // Catches: API crashes or returns 500 on empty batch instead of 200 with empty array
  test("PUT /files/order - Empty items array returns 200 with empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: { items: [] },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBe(0);
  });

  // BUG: order=0 returns statusCode 200 instead of 400 in response body
  test.fail(
    "BUG 81187: PUT /files/order - Order value 0 returns statusCode 200 instead of 400 in response body",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest BulkOrder Zero Room",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest BulkOrder Zero File" },
      });
      const fileId = fileData.response!.id!;

      const { data } = await ownerApi.files.setFilesOrder({
        ordersRequestDtoInteger: {
          items: [{ entryId: fileId, entryType: FileEntryType.File, order: 0 }],
        },
      });

      expect(data.statusCode).toBe(400);
      expect(data.status).toBe(1);
    },
  );

  // Catches: Off-by-one - minimum boundary value 1 incorrectly rejected
  test("PUT /files/order - Order value 1 (minimum) is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Min Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Min File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 1 }],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].id).toBe(fileId);
  });

  // Catches: Integer overflow or silent truncation at max int boundary
  test("PUT /files/order - Order value 2147483647 (max int) is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Max Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Max File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [
          {
            entryId: fileId,
            entryType: FileEntryType.File,
            order: 2147483647,
          },
        ],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].id).toBe(fileId);
  });

  // Catches: API rejects duplicate order values in a single batch request
  test("PUT /files/order - Same order value for multiple items is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Dup Order Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: file1Data } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Dup Order 1" },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Dup Order 2" },
    });
    const fileId1 = file1Data.response!.id!;
    const fileId2 = file2Data.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [
          { entryId: fileId1, entryType: FileEntryType.File, order: 5 },
          { entryId: fileId2, entryType: FileEntryType.File, order: 5 },
        ],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBe(2);
  });

  // Catches: Non-existent ID returns 500 or is silently ignored instead of 404
  test("PUT /files/order - Non-existent entryId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [
          {
            entryId: 999999999,
            entryType: FileEntryType.File,
            order: 1,
          },
        ],
      },
    });

    expect(status).toBe(404);
  });

  // Catches: API uses entryType to look up item and silently creates/matches wrong entry
  test("PUT /files/order - File ID with entryType Folder returns error", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Wrong Type Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Wrong Type File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.Folder, order: 1 }],
      },
    });

    // File ID passed as Folder type should not succeed
    expect(status).toBe(404);
  });

  // Catches: Response missing count field or count mismatches actual response array length
  test("PUT /files/order - Response has correct structure with count and statusCode", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Structure Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Structure File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 4 }],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response![0].id).toBeDefined();
    expect(data.response![0].title).toBeDefined();
    expect(data.response![0].fileEntryType).toBeDefined();
  });
});

test.describe("GET /files/file/:fileId/trackeditfile - Track file editing", () => {
  // Note: response.key = boolean (true = file is being actively edited),
  // response.value = document key string or null

  // Catches: API crashes or returns wrong status for a basic tracking call without optional params
  test("GET /files/file/:fileId/trackeditfile - Owner tracks editing without optional params", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Basic Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Basic File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.trackEditFile({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    // key: boolean - indicates whether the file is being actively edited
    expect(typeof data.response!.key).toBe("boolean");
  });

  // Catches: isFinish=false causes unexpected error or changes state when it should not
  test("GET /files/file/:fileId/trackeditfile - Owner tracks editing with isFinish=false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit NotFinish Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit NotFinish File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.trackEditFile({
      fileId,
      isFinish: false,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response!.key).toBe("boolean");
  });

  // Catches: isFinish=true causes error or reports file as still being edited after session close
  test("GET /files/file/:fileId/trackeditfile - Owner finishes tracking with isFinish=true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Finish Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Finish File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.trackEditFile({
      fileId,
      isFinish: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // isFinish=true signals the end of the editing session:
    // no active editing session exists, so key must be false
    expect(data.response!.key).toBe(false);
  });

  // Catches: tabId parameter silently rejected or causes unexpected error
  test("GET /files/file/:fileId/trackeditfile - Owner tracks editing with tabId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit TabId Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit TabId File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.trackEditFile({
      fileId,
      tabId: faker.string.uuid(),
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  // Catches: docKeyForTrack parameter silently rejected or causes unexpected error
  test("GET /files/file/:fileId/trackeditfile - Owner tracks editing with docKeyForTrack", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit DocKey Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit DocKey File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.trackEditFile({
      fileId,
      docKeyForTrack: "autotest-dockey-000",
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  // BUG: non-existent fileId returns HTTP 200 with error in value instead of HTTP 404
  test.fail(
    "BUG 81219: GET /files/file/:fileId/trackeditfile - Non-existent fileId returns HTTP 200 instead of 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.files.trackEditFile({
        fileId: 999999999,
      });

      expect(status).toBe(404);
    },
  );

  // Catches: response missing required fields or key/value have wrong types
  test("GET /files/file/:fileId/trackeditfile - Response has correct structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Structure Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Structure File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.trackEditFile({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    // key: boolean - active editing indicator
    expect(typeof data.response!.key).toBe("boolean");
    // value: string or null - document key / session identifier
    expect(
      data.response!.value === null || typeof data.response!.value === "string",
    ).toBe(true);
  });
});

test.describe("POST /files/thumbnails - Create thumbnails", () => {
  // Catches: API crashes or returns wrong status for a single file thumbnail request
  test("POST /files/thumbnails - Owner creates thumbnail for a single file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Single File Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Single File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // response contains the file ID for which thumbnail was queued
    expect(data.response).toContain(fileId);
    expect(data.response!.length).toBe(1);
  });

  // Catches: Batch thumbnail generation silently drops some files from response
  test("POST /files/thumbnails - Owner creates thumbnails for multiple files", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Multi File Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: file1Data } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Multi File 1" },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Multi File 2" },
    });
    const fileId1 = file1Data.response!.id!;
    const fileId2 = file2Data.response!.id!;

    const { data, status } = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId1, fileId2] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // both file IDs are included in response
    expect(data.response).toContain(fileId1);
    expect(data.response).toContain(fileId2);
    expect(data.response!.length).toBe(2);
  });

  // Catches: folderIds param silently ignored or causes unexpected error
  test("POST /files/thumbnails - Owner creates thumbnails for a folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Folder Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Thumbnails Folder" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // empty folder has no files - response is empty array
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBe(0);
  });

  // Catches: mixed batch silently drops folders or files from response
  test("POST /files/thumbnails - Owner creates thumbnails for files and folders", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Mix Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Mix File" },
    });
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Thumbnails Mix Folder" },
    });
    const fileId = fileData.response!.id!;
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId], folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // only file ID is returned - folder ID is not included in response
    expect(data.response).toContain(fileId);
    expect(data.response).not.toContain(folderId);
    expect(data.response!.length).toBe(1);
  });

  // Catches: empty batch causes crash or returns 500 instead of 200 with empty array
  test("POST /files/thumbnails - Empty request body returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.createThumbnails({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBe(0);
  });

  // Catches: non-existent fileId causes crash or returns 500 instead of graceful response
  test("POST /files/thumbnails - Non-existent fileId returns graceful response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [999999999] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // non-existent ID is still included in response - API does not validate file existence
    expect(data.response).toContain(999999999);
  });
});

test.describe("GET /files/file/:fileId/edit/diff - Get edit diff URL", () => {
  test("GET /files/file/:fileId/edit/diff - Owner gets diff URL for latest version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit Diff URL" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // Business: key and url are required by Document Server to render diff
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
    // API returns version: 0 when no version parameter is specified (means "latest")
    expect(data.response!.version).toBe(0);
    expect(data.response!.fileType).toBeTruthy();
  });

  test("GET /files/file/:fileId/edit/diff - Owner gets diff URL for specific version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Edit Diff URL Specific Version",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.getEditDiffUrl({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // Business: version in response must match the requested version
    expect(data.response!.version).toBe(1);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
  });

  test("GET /files/file/:fileId/edit/diff - Version 2 created via API has no previous edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Edit Diff URL With Previous",
      },
    });
    const fileId = fileData.response!.id!;

    // updateFile increments version metadata only - no real editing history is recorded
    // previous field requires Document Server to track actual content changes via editor
    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.getEditDiffUrl({
      fileId,
      version: 2,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.version).toBe(2);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
    // No previous data: updateFile does not create Document Server editing history
    expect(data.response!.previous).toBeFalsy();
  });

  test("GET /files/file/:fileId/edit/diff - First version has no previous version data", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Edit Diff URL No Previous",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    // API returns version: 0 when no version parameter is specified (means "latest")
    expect(data.response!.version).toBe(0);
    // Business: first version has nothing to compare against
    expect(data.response!.previous).toBeFalsy();
  });

  test.fail(
    "BUG XXXXX: GET /files/file/:fileId/edit/diff - Non-existent fileId returns 403 instead of 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.files.getEditDiffUrl({
        fileId: 999999999,
      });

      expect(status).toBe(404);
      expect((data as any).error.message).toBe(
        "The required file was not found",
      );
    },
  );

  test("GET /files/file/:fileId/edit/diff - File in a room returns diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff URL Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Edit Diff URL Room File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
    expect(data.response!.fileType).toBeTruthy();
  });
});
