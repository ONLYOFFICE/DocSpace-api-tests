import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  CheckDestFolderResult,
  FileConflictResolveType,
  FileOperationType,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { createOoForm } from "@/src/helpers/files";
import config from "@/config";

test.describe("POST /api/2.0/files/favorites - Add favorite files and folders", () => {
  test("POST /api/2.0/files/favorites - Add file returns 200 response true and file appears in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav File.docx");
  });

  test("POST /api/2.0/files/favorites - Add folder returns 200 response true and folder appears in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest AddFav Folder" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const folderTitles = (favData.response!.folders ?? []).map((f) => f.title);
    expect(folderTitles).toContain("Autotest AddFav Folder");
  });

  test("POST /api/2.0/files/favorites - Adding multiple files at once all appear in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: file1Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav Multi1.docx" },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav Multi2.docx" },
    });
    const fileId1 = file1Data.response!.id!;
    const fileId2 = file2Data.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId1, fileId2] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav Multi1.docx");
    expect(titles).toContain("Autotest AddFav Multi2.docx");
  });

  test("POST /api/2.0/files/favorites - Adding multiple folders at once all appear in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folder1Data } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest AddFav MultiFolderA" },
    });
    const { data: folder2Data } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest AddFav MultiFolderB" },
    });
    const folderId1 = folder1Data.response!.id!;
    const folderId2 = folder2Data.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderId1, folderId2] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const folderTitles = (favData.response!.folders ?? []).map((f) => f.title);
    expect(folderTitles).toContain("Autotest AddFav MultiFolderA");
    expect(folderTitles).toContain("Autotest AddFav MultiFolderB");
  });

  test("POST /api/2.0/files/favorites - Adding file and folder simultaneously both appear in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav Mixed File.docx" },
    });
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest AddFav Mixed Folder" },
    });
    const fileId = fileData.response!.id!;
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId], folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const fileTitles = (favData.response!.files ?? []).map((f) => f.title);
    const folderTitles = (favData.response!.folders ?? []).map((f) => f.title);
    expect(fileTitles).toContain("Autotest AddFav Mixed File.docx");
    expect(folderTitles).toContain("Autotest AddFav Mixed Folder");
  });

  test("POST /api/2.0/files/favorites - Adding already-favorited file is idempotent - no duplicates in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav Idempotent.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });
    const { status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    const count = titles.filter(
      (t) => t === "Autotest AddFav Idempotent.docx",
    ).length;
    expect(count).toBe(1);
  });

  test("POST /api/2.0/files/favorites - Empty body returns 200 response true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.addFavorites({});

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("POST /api/2.0/files/favorites - Empty fileIds and folderIds arrays returns 200 response true and nothing added", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [], folderIds: [] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    expect(favData.response!.total).toBe(0);
  });

  test("POST /api/2.0/files/favorites - fileId 0 returns 200 response true and nothing added to getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [0] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    expect(favData.response!.total).toBe(0);
  });

  test("POST /api/2.0/files/favorites - Non-existent fileId returns 200 response true and nothing added to getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [999999999] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    expect(favData.response!.total).toBe(0);
  });

  test("POST /api/2.0/files/favorites - folderId 0 returns 200 response true and nothing added to getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [0] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    expect(favData.response!.total).toBe(0);
  });

  test("POST /api/2.0/files/favorites - Non-existent folderId returns 200 response true and nothing added to getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [999999999] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    expect(favData.response!.total).toBe(0);
  });

  test("POST /api/2.0/files/favorites - File moved to trash returns 200 response true but does not appear in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav Trash File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest AddFav Trash File.docx");
  });

  test("POST /api/2.0/files/favorites - File from Recent section can be added to favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest AddFav Recent File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.addFileToRecent({ fileId });

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav Recent File.docx");
  });

  test("POST /api/2.0/files/favorites - File from Custom Room can be added to favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav CustomRoom",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest AddFav Custom Room File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav Custom Room File.docx");
  });

  test("POST /api/2.0/files/favorites - File from Collaboration Room (EditingRoom) can be added to favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav EditingRoom",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest AddFav Editing Room File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav Editing Room File.docx");
  });

  test("POST /api/2.0/files/favorites - File from Form Filling Room can be added to favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav FillingFormsRoom",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileId = await createOoForm(ownerApi, roomId);

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest OO Form.pdf");
  });

  test("POST /api/2.0/files/favorites - File from Public Room can be added to favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav PublicRoom",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest AddFav Public Room File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav Public Room File.docx");
  });

  test("POST /api/2.0/files/favorites - File from Virtual Data Room can be added to favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav VirtualDataRoom",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest AddFav VDR File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav VDR File.docx");
  });

  test("POST /api/2.0/files/favorites - File from archived room can be added to favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AddFav Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest AddFav Archived File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest AddFav Archived File.docx");
  });
});

test.describe("PUT /api/2.0/files/fileops/bulkdownload - Bulk download", () => {
  test("PUT /api/2.0/files/fileops/bulkdownload - Owner downloads a single file returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest BulkDownload Single.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Owner downloads multiple files returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: file1Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest BulkDownload Multi1.docx" },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest BulkDownload Multi2.docx" },
    });
    const fileId1 = file1Data.response!.id!;
    const fileId2 = file2Data.response!.id!;

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId1, fileId2] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("2");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Owner downloads a single folder returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest BulkDownload Folder" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: {
        title: "Autotest BulkDownload In Folder.docx",
      },
    });

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Owner downloads multiple folders returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folder1Data } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest BulkDownload MultiFolder1" },
    });
    const { data: folder2Data } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest BulkDownload MultiFolder2" },
    });
    const folderId1 = folder1Data.response!.id!;
    const folderId2 = folder2Data.response!.id!;

    await ownerApi.files.createFile({
      folderId: folderId1,
      createFileJsonElement: {
        title: "Autotest BulkDownload Folder1 File.docx",
      },
    });
    await ownerApi.files.createFile({
      folderId: folderId2,
      createFileJsonElement: {
        title: "Autotest BulkDownload Folder2 File.docx",
      },
    });

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { folderIds: [folderId1, folderId2] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Owner downloads files and folders simultaneously returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest BulkDownload Mixed File.docx",
      },
    });
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest BulkDownload Mixed Folder" },
    });
    const fileId = fileData.response!.id!;
    const folderId = folderData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: {
        title: "Autotest BulkDownload In Mixed Folder.docx",
      },
    });

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId], folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Owner downloads file from Custom Room returns 200 and operation finishes with url", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkDownload Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest BulkDownload Room File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - returnSingleOperation true returns single entry with Operation type Download", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest BulkDownload ReturnSingle.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: {
        fileIds: [fileId],
        returnSingleOperation: true,
      },
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
    expect(data.response![0].Operation).toBe(FileOperationType.Download);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Empty body returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: {},
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - Non-existent fileId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: { fileIds: [999999999] },
    });

    expect(status).toBe(404);
  });

  test("PUT /api/2.0/files/fileops/bulkdownload - fileConvertIds downloads file with conversion to pdf", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest BulkDownload Convert.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.bulkDownload({
      downloadRequestDto: {
        fileConvertIds: [{ key: fileId, value: "pdf" }],
      },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const operation = await waitForOperation(ownerApi.operations);

    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
    expect(operation.Operation).toBe(FileOperationType.Download);
    expect(operation.processed).toBe("1");
    expect(operation.url).toContain("filehandler.ashx?action=bulk");
  });
});

test.describe("GET /api/2.0/files/file/{fileId}/checkconversion - Check conversion status", () => {
  test("PUT /api/2.0/files/file/{fileId}/checkconversion - Owner starts file conversion returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest StartConversion docx.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
    expect(data.links).toHaveLength(1);
    expect((data.links as any)[0].href).toContain("checkconversion");
    expect((data.links as any)[0].action).toBe("PUT");
  });

  test("GET /api/2.0/files/file/{fileId}/checkconversion - No active conversion returns 200 with empty response array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckConversion No Active.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.checkConversionStatus({
      fileId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
    expect(data.links).toHaveLength(1);
    expect((data.links as any)[0].href).toContain("checkconversion");
    expect((data.links as any)[0].action).toBe("GET");
  });
});

test.describe("GET /api/2.0/files/fileops/move - checkMoveOrCopyBatchItems", () => {
  test("GET /api/2.0/files/fileops/move - Owner checks move of file from MyDocs to CustomRoom returns 200 with array response", async ({
    apiSdk,
  }) => {
    // Catches: method returns non-200 or fails to respond when owner checks move of own file to a room
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileTitle = "Autotest CheckMove File To CustomRoom.docx";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: fileTitle },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Dest CustomRoom",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Owner checks move of folder from MyDocs to CustomRoom returns 200", async ({
    apiSdk,
  }) => {
    // Catches: folder move check returns unexpected status when source is a folder instead of a file
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest CheckMove Source Folder" },
    });
    const folderId = folderData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Folder Dest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          folderIds: [folderId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Owner checks move of file from MyDocs to EditingRoom returns 200", async ({
    apiSdk,
  }) => {
    // Catches: move check incorrectly fails for EditingRoom (Collaboration) destination
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckMove To EditingRoom.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Dest EditingRoom",
        roomType: RoomType.EditingRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Owner checks move of file from MyDocs to FillingFormsRoom returns 200", async ({
    apiSdk,
  }) => {
    // Catches: move check returns 403 or 400 for FillingFormsRoom destination, blocking form-room workflows
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CheckMove To FillingForms.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Dest FillingForms",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Owner checks move of file from MyDocs to PublicRoom returns 200", async ({
    apiSdk,
  }) => {
    // Catches: move check incorrectly rejects files destined for PublicRoom
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove To PublicRoom.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Dest PublicRoom",
        roomType: RoomType.PublicRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Owner checks move of file from MyDocs to VirtualDataRoom returns 200", async ({
    apiSdk,
  }) => {
    // Catches: move check returns error for VirtualDataRoom despite owner having full access
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove To VDR.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Dest VDR",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Conflict detected: same-named file in destination appears in response", async ({
    apiSdk,
  }) => {
    // Catches: conflicting file missing from response when same-named file exists in destination,
    // causing the UI to skip the conflict dialog and silently overwrite or lose data
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const conflictTitle = "Autotest CheckMove ConflictFile.docx";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: conflictTitle },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Conflict Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    await ownerApi.files.createFile({
      folderId: destFolderId,
      createFileJsonElement: { title: conflictTitle },
    });

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0].title).toBe(conflictTitle);
  });

  test("GET /api/2.0/files/fileops/move - No conflict: response is empty when destination has no same-named file", async ({
    apiSdk,
  }) => {
    // Catches: response incorrectly contains items when no conflict exists,
    // causing false-positive conflict dialogs in the UI
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove NoConflict.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove NoConflict Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - conflictResolveType Overwrite returns 200 with conflict item", async ({
    apiSdk,
  }) => {
    // Catches: Overwrite conflict mode rejected or fails to identify the conflicting item
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const conflictTitle = "Autotest CheckMove Overwrite.docx";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: conflictTitle },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Overwrite Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    await ownerApi.files.createFile({
      folderId: destFolderId,
      createFileJsonElement: { title: conflictTitle },
    });

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Overwrite,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0].title).toBe(conflictTitle);
  });

  test("GET /api/2.0/files/fileops/move - conflictResolveType Duplicate returns 200 with empty response when no conflict", async ({
    apiSdk,
  }) => {
    // Catches: Duplicate mode returns unexpected status or incorrectly reports conflicts when none exist
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Duplicate.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Duplicate Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Duplicate,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Multiple files checked at once returns 200", async ({
    apiSdk,
  }) => {
    // Catches: batch check fails or drops items when multiple fileIds are passed simultaneously
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: file1 } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Multi1.docx" },
    });
    const { data: file2 } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Multi2.docx" },
    });
    const fileIds = [file1.response!.id!, file2.response!.id!];

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Multi Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds,
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Owner checks copy (deleteAfter false) of file to CustomRoom returns 200", async ({
    apiSdk,
  }) => {
    // Catches: copy check (deleteAfter: false) returns unexpected status or is treated same as move,
    // breaking UI distinction between copy and move conflict resolution flows
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckCopy File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckCopy Dest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Owner checks move of files and folders together returns 200", async ({
    apiSdk,
  }) => {
    // Catches: mixed batch (files + folders) causes error or drops items from conflict check
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Mixed File.docx" },
    });
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest CheckMove Mixed Folder" },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Mixed Dest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileData.response!.id!],
          folderIds: [folderData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - content true: check move of folder content only returns 200", async ({
    apiSdk,
  }) => {
    // Catches: content:true flag ignored or causes 400/500, breaking "move folder contents" workflow
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest CheckMove Content True Folder" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: {
        title: "Autotest CheckMove Content True File.docx",
      },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Content True Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          folderIds: [folderId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          content: true,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Empty request (no fileIds, no folderIds) returns 200 with empty response", async ({
    apiSdk,
  }) => {
    // Catches: empty batch request causes 400/500 instead of graceful empty response,
    // breaking UI when user initiates move with no selection
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Empty Dest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/fileops/move - Move to same folder (source equals destination) returns 200", async ({
    apiSdk,
  }) => {
    // Catches: moving file to its own parent folder causes 500 or returns unexpected error.
    // The file already exists in the destination with the same name, so API reports it as a conflict.
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileTitle = "Autotest CheckMove SameFolder.docx";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: fileTitle },
    });
    const fileId = fileData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId: myDocsFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(1);
    expect(data.response![0].title).toBe(fileTitle);
  });

  test("GET /api/2.0/files/fileops/move - Move to archived room returns 403", async ({
    apiSdk,
  }) => {
    // Catches: archived rooms incorrectly accept move-check requests, allowing writes to read-only archived content
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CheckMove Archived.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.operations.checkMoveOrCopyBatchItems({
      inDto: {
        fileIds: [fileId],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/fileops/move - Non-existent fileId returns 200 with empty response", async ({
    apiSdk,
  }) => {
    // Non-existent fileId is silently skipped: no file to check, no conflicts - returns empty array.
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CheckMove NonExist File Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [999999999],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  // BUG 81881: GET /api/2.0/files/fileops/move - non-existent destFolderId returns 403 instead of 404
  test.fail(
    "BUG 81881: GET /api/2.0/files/fileops/move - Non-existent destFolderId returns 404",
    async ({ apiSdk }) => {
      // Catches: non-existent destFolderId returns 403 (Access denied) instead of 404 (Not found);
      // misleads callers into thinking it is a permissions issue rather than a missing resource
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckMove NonExist Dest.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          destFolderId: 999999999,
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

      expect(status).toBe(404);
    },
  );

  // BUG 81882: GET /api/2.0/files/fileops/move - missing destFolderId returns 403 instead of 400
  test.fail(
    "BUG 81882: GET /api/2.0/files/fileops/move - No destFolderId specified returns 400",
    async ({ apiSdk }) => {
      // Catches: omitting required destFolderId field returns 403 instead of 400,
      // hiding a client-side input error behind an access-denied response
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckMove NoDestFolder.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.checkMoveOrCopyBatchItems({
        inDto: {
          fileIds: [fileId],
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

      expect(status).toBe(400);
    },
  );
});

test.describe("GET /api/2.0/files/fileops/checkdestfolder - checkMoveOrCopyDestFolder", () => {
  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of file" +
      " to CustomRoom returns AllAllowed and files contains source file",
    async ({ apiSdk }) => {
      // Catches: method returns wrong result or fails when checking move to an empty destination room;
      // files field contains the source files being moved, not the destination contents
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const sourceFileTitle = "Autotest CheckDestFolder File CustomRoom.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: sourceFileTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder CustomRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
      expect(data.response!.files).toHaveLength(1);
      expect(data.response!.files![0].title).toBe(sourceFileTitle);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - files field contains all" +
      " source files when multiple files are checked",
    async ({ apiSdk }) => {
      // Catches: files field should list all source files passed in the request
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const file1Title = "Autotest CheckDestFolder Multi Source1.docx";
      const file2Title = "Autotest CheckDestFolder Multi Source2.docx";

      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: file1Title },
      });
      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: file2Title },
      });
      const fileIds = [file1Data.response!.id!, file2Data.response!.id!];

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Multi Files Field Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds,
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
      expect(data.response!.files).toHaveLength(2);
      const titles = data.response!.files!.map((f) => f.title);
      expect(titles).toContain(file1Title);
      expect(titles).toContain(file2Title);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of file" +
      " to EditingRoom returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: method returns wrong result for EditingRoom destination
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder File EditingRoom.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder EditingRoom",
          roomType: RoomType.EditingRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of" +
      " .docx file to FillingFormsRoom returns NoneAllowed",
    async ({ apiSdk }) => {
      // FillingFormsRoom only accepts form files (.oform/.pdf form);
      // moving a regular .docx returns NoneAllowed
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Docx FillingForms.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder FillingFormsRoom Docx",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.NoneAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of" +
      " form file to FillingFormsRoom returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: form file (.pdf form) should be allowed in FillingFormsRoom
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      // createOoForm creates the form file in myDocsFolderId
      const formFileId = await createOoForm(ownerApi, myDocsFolderId);

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder FillingFormsRoom Form",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [formFileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of file" +
      " to PublicRoom returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: method returns wrong result for PublicRoom destination
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder File PublicRoom.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder PublicRoom",
          roomType: RoomType.PublicRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of file" +
      " to VirtualDataRoom returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: method returns wrong result for VirtualDataRoom destination
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder File VDR.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder VirtualDataRoom",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks copy" +
      " (deleteAfter: false) of file returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: copy operation (deleteAfter false) returns wrong result
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Copy File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Copy Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: false,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of folder" +
      " returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: folder move check returns wrong result when folderIds used instead of fileIds
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest CheckDestFolder Source Folder" },
      });
      const sourceFolderId = folderData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Folder Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            folderIds: [sourceFolderId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of" +
      " multiple files returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: multi-file check returns wrong result or partial AllAllowed
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Multi File1.docx",
        },
      });
      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Multi File2.docx",
        },
      });
      const fileIds = [file1Data.response!.id!, file2Data.response!.id!];

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Multi Files Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds,
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );

  // BUG 82103: checkMoveOrCopyDestFolder returns 200 AllAllowed for archived room instead of 403
  test.fail(
    "BUG 82103: GET /api/2.0/files/fileops/checkdestfolder - Move to" +
      " archived room returns 403",
    async ({ apiSdk }) => {
      // Catches: archived room returns 200 AllAllowed instead of 403;
      // checkMoveOrCopyBatchItems correctly returns 403 for archived room,
      // but checkMoveOrCopyDestFolder ignores room archive status
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder Archived Dest.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CheckDestFolder Archived Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: roomId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.operations.checkMoveOrCopyDestFolder({
        inDto: {
          fileIds: [fileId],
          destFolderId: roomId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: true,
        },
      });

      expect(status).toBe(403);
    },
  );

  // BUG XXXXX: non-existent destFolderId returns 403 instead of 404
  test.fail(
    "BUG XXXXX: GET /api/2.0/files/fileops/checkdestfolder - Non-existent" +
      " destFolderId returns 404",
    async ({ apiSdk }) => {
      // Catches: non-existent destFolderId returns 403 (Access denied) instead of 404 (Not found);
      // misleads callers into thinking it is a permissions issue rather than a missing resource
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder NonExistent Dest.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.checkMoveOrCopyDestFolder({
        inDto: {
          fileIds: [fileId],
          destFolderId: 999999999,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: true,
        },
      });

      expect(status).toBe(404);
    },
  );

  // BUG XXXXX: missing destFolderId returns 403 instead of 400
  test.fail(
    "BUG XXXXX: GET /api/2.0/files/fileops/checkdestfolder - No destFolderId" +
      " specified returns 400",
    async ({ apiSdk }) => {
      // Catches: omitting required destFolderId field returns 403 instead of 400,
      // hiding a client-side input error behind an access-denied response
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder No Dest.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.checkMoveOrCopyDestFolder({
        inDto: {
          fileIds: [fileId],
          conflictResolveType: FileConflictResolveType.Skip,
        },
      });

      expect(status).toBe(400);
    },
  );

  test(
    "GET /api/2.0/files/fileops/checkdestfolder - Owner checks move of file" +
      " to room with connected Third-party storage returns AllAllowed",
    async ({ apiSdk }) => {
      // Catches: checkMoveOrCopyDestFolder returns wrong result when destination
      // room is backed by third-party storage (Nextcloud)
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CheckDestFolder ThirdParty File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: thirdPartyData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest CheckDestFolder Nextcloud",
            providerKey: "Nextcloud",
          },
        });
      const thirdPartyFolderId = thirdPartyData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: thirdPartyFolderId,
        createThirdPartyRoom: {
          title: "Autotest CheckDestFolder ThirdParty Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.checkMoveOrCopyDestFolder({
          inDto: {
            fileIds: [fileId],
            destFolderId,
            conflictResolveType: FileConflictResolveType.Skip,
            deleteAfter: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response?.result).toBe(CheckDestFolderResult.AllAllowed);
    },
  );
});
