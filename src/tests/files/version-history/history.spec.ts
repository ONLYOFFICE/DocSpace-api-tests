import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

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

    const { data, status } = await ownerApi.files.getEditHistory({ fileId });

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
      createFileJsonElement: { title: "Autotest Edit History Archived File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.files.getEditHistory({ fileId });

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
      createFileJsonElement: { title: "Autotest Version History Structure" },
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

    const { data: before } = await ownerApi.files.getEditHistory({ fileId });
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
      createFileJsonElement: { title: "Autotest Version History Merge Groups" },
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

    const { data: before } = await ownerApi.files.getEditHistory({ fileId });
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
      createFileJsonElement: { title: "Autotest Version History Room File" },
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
