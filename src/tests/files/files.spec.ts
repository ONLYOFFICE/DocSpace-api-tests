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
      title: "Autotest Document",
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
      title: "Autotest Document.docx",
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
      title: "Autotest Document.txt",
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Document.docx");
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  // Bug 80324: enableExternalExt: true returns 403 with NullReferenceException
  test.fail("POST /files/@my/file - Title with .md extension and enableExternalExt keeps original extension", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.files.createFileInMyDocuments({
      title: "Autotest Document.md",
      enableExternalExt: false,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Document.md");
    expect(data.response!.id!).toBeGreaterThan(0);
  });
});

test.describe("POST /files/:folderId/file", () => {
  test("POST /files/:folderId/file - Owner creates a file in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For File Creation",
      roomType: RoomType.CustomRoom,
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.files.createFile(folderId, {
      title: "Autotest Document",
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
      title: "Autotest Room For HTML File",
      roomType: RoomType.CustomRoom,
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.files.createHtmlFile(folderId, {
      title: "Autotest HTML File",
      content: "some text",
      createNewIfExist: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest HTML File.html");
    expect(data.response!.folderId).toBe(folderId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  // Bug: createNewIfExist logic is inverted
  test.fail("POST /files/:folderId/html - createNewIfExist: false returns existing file when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For HTML Dedup",
      roomType: RoomType.CustomRoom,
    });
    const folderId = roomData.response!.id!;

    const { data: firstData } = await ownerApi.files.createHtmlFile(folderId, {
      title: "Autotest HTML Dedup",
      content: "some text",
      createNewIfExist: false,
    });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } = await ownerApi.files.createHtmlFile(
      folderId,
      {
        title: "Autotest HTML Dedup",
        content: "some text",
        createNewIfExist: false,
      },
    );

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
      title: "Autotest Room For Text File",
      roomType: RoomType.CustomRoom,
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.files.createTextFile(folderId, {
      title: "Autotest Text File",
      content: "some text",
      createNewIfExist: true,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Text File.txt");
    expect(data.response!.folderId).toBe(folderId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  // Bug: createNewIfExist logic is inverted
  test.fail("POST /files/:folderId/text - createNewIfExist: false returns existing file when title already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For Text Dedup",
      roomType: RoomType.CustomRoom,
    });
    const folderId = roomData.response!.id!;

    const { data: firstData } = await ownerApi.files.createTextFile(folderId, {
      title: "Autotest Text Dedup",
      content: "some text",
      createNewIfExist: false,
    });
    const firstId = firstData.response!.id!;

    const { data: secondData, status } = await ownerApi.files.createTextFile(
      folderId,
      {
        title: "Autotest Text Dedup",
        content: "some text",
        createNewIfExist: false,
      },
    );

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
      title: "Autotest Source File",
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For Copy",
      roomType: RoomType.CustomRoom,
    });
    const destFolderId = roomData.response!.id!;

    const { data } = await ownerApi.files.copyFileAs(fileId, {
      destTitle: "Autotest Copied File.docx",
      destFolderId,
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
      title: "Autotest Source File For Form",
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For Form Copy",
      roomType: RoomType.CustomRoom,
    });
    const destFolderId = roomData.response!.id!;

    const { data } = await ownerApi.files.copyFileAs(fileId, {
      destTitle: "Autotest Converted Form.docxf",
      destFolderId,
      toForm: true,
    });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Converted Form.docxf");
    expect((data as any).response.folderId).toBe(destFolderId); // TODO(sdk): folderId missing from FileDto
  });

  // TODO: requires a password-protected source file — no API method available to create one yet
  test.fail("POST /files/file/:fileId/copyas - Copies file with password", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      title: "Autotest Source File For Password",
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For Password Copy",
      roomType: RoomType.CustomRoom,
    });
    const destFolderId = roomData.response!.id!;

    const { data } = await ownerApi.files.copyFileAs(fileId, {
      destTitle: "Autotest Password Copy.docx",
      destFolderId,
      password: "TestPassword123",
    });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Password Copy.docx");
    expect((data as any).response.folderId).toBe(destFolderId); // TODO(sdk): folderId missing from FileDto
  });

  // Requires Document Server able to download files from DocSpace (DS ↔ DocSpace connectivity)
  test.fail("POST /files/file/:fileId/copyas - Copies file with non-standard extension (enableExternalExt: true)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      title: "Autotest Source File For Ext",
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For External Ext",
      roomType: RoomType.CustomRoom,
    });
    const destFolderId = roomData.response!.id!;

    const { data } = await ownerApi.files.copyFileAs(fileId, {
      destTitle: "Autotest Copied File.md",
      destFolderId,
      enableExternalExt: true,
    });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Copied File.md");
    expect((data as any).response.folderId).toBe(destFolderId); // TODO(sdk): folderId missing from FileDto
  });
});

test.describe("POST /files/file/:id/saveaspdf - Save file as PDF", () => {
  test.fail("POST /files/file/:id/saveaspdf - Saves file as PDF in specified folder", async ({
    apiSdk,
  }) => {
    test.skip(
      true,
      "Requires Document Server able to download files from DocSpace (DS ↔ DocSpace connectivity)",
    );

    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      title: "Autotest Source File For PDF",
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room For PDF",
      roomType: RoomType.CustomRoom,
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.files.saveFileAsPdf(fileId, {
      folderId,
      title: "Autotest Saved As PDF",
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
      title: "Autotest Favorite File",
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.toggleFileFavorite(
      fileId,
      true,
    );

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("GET /files/favorites/:fileId - Removes file from favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      title: "Autotest Unfavorite File",
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite(fileId, true);
    const { data, status } = await ownerApi.files.toggleFileFavorite(
      fileId,
      false,
    );

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });
});
