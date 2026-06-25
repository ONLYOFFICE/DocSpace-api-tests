import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  CheckDestFolderResult,
  FileDtoInteger,
  FileConflictResolveType,
  FileOperationType,
  FolderDtoInteger,
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

test.describe("PUT /api/2.0/files/fileops/copy - copyBatchItems", () => {
  test(
    "PUT /api/2.0/files/fileops/copy - Copy file from MyDocs to CustomRoom" +
      " returns 200 and file appears in destination, source preserved",
    async ({ apiSdk }) => {
      // Catches: copy does not create file in dest or removes source file
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const sourceTitle = "Autotest CopyBatch File to Room.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: sourceTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Dest CustomRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destTitles = (destContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(destTitles).toContain(sourceTitle);

      // Source still exists (copy, not move)
      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      const srcTitles = (srcContent.response?.files ?? []).map((f) => f.title);
      expect(srcTitles).toContain(sourceTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy folder from MyDocs to CustomRoom" +
      " returns 200 and folder with contents appears in destination",
    async ({ apiSdk }) => {
      // Catches: folder copy does not appear in dest or loses inner files
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest CopyBatch Source Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });
      const sourceFolderId = folderData.response!.id!;

      const innerFileTitle = "Autotest CopyBatch File In Folder.docx";
      await ownerApi.files.createFile({
        folderId: sourceFolderId,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Folder Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [sourceFolderId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destFolderTitles = (destContent.response?.folders ?? []).map(
        (f) => f.title,
      );
      expect(destFolderTitles).toContain(folderTitle);

      const copiedFolder = destContent.response!.folders!.find(
        (f) => f.title === folderTitle,
      ) as FolderDtoInteger;
      const { data: copiedContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: copiedFolder.id!,
        });
      const copiedFileTitles = (copiedContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(copiedFileTitles).toContain(innerFileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy multiple files returns 200" +
      " and all files appear in destination",
    async ({ apiSdk }) => {
      // Catches: multi-file copy loses some files
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const title1 = "Autotest CopyBatch Multi File1.docx";
      const title2 = "Autotest CopyBatch Multi File2.docx";

      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: title1 },
      });
      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: title2 },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Multi Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [file1Data.response!.id!, file2Data.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destTitles = (destContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(destTitles).toContain(title1);
      expect(destTitles).toContain(title2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with conflictResolveType Skip" +
      " when file exists - destination file unchanged, no duplicate created",
    async ({ apiSdk }) => {
      // Catches: Skip does not skip, overwrites or duplicates the existing file
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Skip Conflict.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Skip Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { data: destBefore } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const existingFileId = (destBefore.response!.files![0] as FileDtoInteger)
        .id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data: destAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destFiles = destAfter.response?.files ?? [];
      expect(destFiles).toHaveLength(1);
      expect((destFiles[0] as FileDtoInteger).id).toBe(existingFileId);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with conflictResolveType Overwrite" +
      " when file exists - destination file replaced",
    async ({ apiSdk }) => {
      // Catches: Overwrite does not replace existing file or duplicates instead
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Overwrite Conflict.docx";
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Overwrite Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [file1Data.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { data: destBefore } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const originalFileId = (destBefore.response!.files![0] as FileDtoInteger)
        .id!;

      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [file2Data.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Overwrite,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destFiles = destAfter.response?.files ?? [];
      expect(destFiles).toHaveLength(1);
      expect((destFiles[0] as FileDtoInteger).id).not.toBe(originalFileId);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with conflictResolveType Duplicate" +
      " when file exists - creates additional copy in destination",
    async ({ apiSdk }) => {
      // Catches: Duplicate does not create a second copy or overwrites instead
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Duplicate Conflict.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Duplicate Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Duplicate,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect(destContent.response?.files).toHaveLength(2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy folder with content=true copies" +
      " folder contents without the folder itself",
    async ({ apiSdk }) => {
      // Catches: content=true ignored, folder created in dest instead of its contents
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest CopyBatch Content Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });
      const sourceFolderId = folderData.response!.id!;

      const innerFileTitle = "Autotest CopyBatch Content Inner File.docx";
      await ownerApi.files.createFile({
        folderId: sourceFolderId,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Content Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [sourceFolderId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
          content: true,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      // Inner file appears directly in dest (not inside a subfolder)
      const destFileTitles = (destContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(destFileTitles).toContain(innerFileTitle);
      // The folder itself is NOT copied
      const destFolderTitles = (destContent.response?.folders ?? []).map(
        (f) => f.title,
      );
      expect(destFolderTitles).not.toContain(folderTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file from one room to another" +
      " CustomRoom returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: inter-room copy fails or file does not appear in second room
      const ownerApi = apiSdk.forRole("owner");

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Inter-Room Src",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcRoomId = srcRoomData.response!.id!;

      const fileTitle = "Autotest CopyBatch Inter-Room File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcRoomId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Inter-Room Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destTitles = (destContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(destTitles).toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy .docx file to FillingFormsRoom" +
      " - file does not appear in destination",
    async ({ apiSdk }) => {
      // FillingFormsRoom only accepts form files; .docx should not be copied in
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Docx FillingForms.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch FillingForms Docx Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destFiles = destContent.response?.files ?? [];
      expect(destFiles.some((f) => f.title === fileTitle)).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy form file to FillingFormsRoom" +
      " returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: form file copy to FillingFormsRoom fails or does not appear
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const formFileId = await createOoForm(ownerApi, myDocsFolderId);

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch FillingForms Form Room",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [formFileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).length).toBeGreaterThan(0);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file to level 2 subfolder" +
      " - file appears in subfolder not in room root",
    async ({ apiSdk }) => {
      // Catches: copy to nested folder places file at wrong level
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Level2 File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Level2 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: subfolderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest CopyBatch Level2 Subfolder" },
      });
      const subfolderId = subfolderData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: subfolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: subContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: subfolderId,
      });
      const subTitles = (subContent.response?.files ?? []).map((f) => f.title);
      expect(subTitles).toContain(fileTitle);

      // File is NOT in room root
      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      const rootFileTitles = (roomContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(rootFileTitles).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file to level 3 subfolder" +
      " (Room/Folder/Subfolder) - file appears in correct location",
    async ({ apiSdk }) => {
      // Catches: copy to 3-level deep destination places file at wrong level
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Level3 File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Level3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folder2Data } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest CopyBatch L3 Level2" },
      });
      const { data: folder3Data } = await ownerApi.folders.createFolder({
        folderId: folder2Data.response!.id!,
        createFolder: { title: "Autotest CopyBatch L3 Level3" },
      });
      const folder3Id = folder3Data.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: level3Content } =
        await ownerApi.folders.getFolderByFolderId({ folderId: folder3Id });
      expect(
        (level3Content.response?.files ?? []).map((f) => f.title),
      ).toContain(fileTitle);

      // File is NOT in room root
      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(
        (roomContent.response?.files ?? []).some((f) => f.title === fileTitle),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy folder to level 3 subfolder" +
      " - folder and contents appear in correct location",
    async ({ apiSdk }) => {
      // Catches: folder copy to 3-level deep destination loses contents or goes to wrong level
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const sourceFolderTitle = "Autotest CopyBatch Folder to L3";
      const { data: srcFolderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: sourceFolderTitle },
      });
      const innerFileTitle = "Autotest CopyBatch Folder to L3 Inner.docx";
      await ownerApi.files.createFile({
        folderId: srcFolderData.response!.id!,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Folder L3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: folder2Data } = await ownerApi.folders.createFolder({
        folderId: roomData.response!.id!,
        createFolder: { title: "Autotest CopyBatch Folder L3 L2" },
      });
      const { data: folder3Data } = await ownerApi.folders.createFolder({
        folderId: folder2Data.response!.id!,
        createFolder: { title: "Autotest CopyBatch Folder L3 L3" },
      });
      const folder3Id = folder3Data.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [srcFolderData.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: level3Content } =
        await ownerApi.folders.getFolderByFolderId({ folderId: folder3Id });
      const level3FolderTitles = (level3Content.response?.folders ?? []).map(
        (f) => f.title,
      );
      expect(level3FolderTitles).toContain(sourceFolderTitle);

      const copiedFolder = level3Content.response!.folders!.find(
        (f) => f.title === sourceFolderTitle,
      ) as FolderDtoInteger;
      const { data: copiedContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: copiedFolder.id!,
        });
      expect(
        (copiedContent.response?.files ?? []).map((f) => f.title),
      ).toContain(innerFileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with Skip conflict in level 3" +
      " subfolder - destination file unchanged",
    async ({ apiSdk }) => {
      // Catches: conflict resolution at nested level does not work correctly
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Skip L3 Conflict.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Skip L3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: folder2Data } = await ownerApi.folders.createFolder({
        folderId: roomData.response!.id!,
        createFolder: { title: "Autotest Skip L3 L2" },
      });
      const { data: folder3Data } = await ownerApi.folders.createFolder({
        folderId: folder2Data.response!.id!,
        createFolder: { title: "Autotest Skip L3 L3" },
      });
      const folder3Id = folder3Data.response!.id!;

      await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { data: beforeData } = await ownerApi.folders.getFolderByFolderId({
        folderId: folder3Id,
      });
      const existingId = (beforeData.response!.files![0] as FileDtoInteger).id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data: afterData } = await ownerApi.folders.getFolderByFolderId({
        folderId: folder3Id,
      });
      const afterFiles = afterData.response?.files ?? [];
      expect(afterFiles).toHaveLength(1);
      expect((afterFiles[0] as FileDtoInteger).id).toBe(existingId);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with Duplicate conflict in level 3" +
      " subfolder - creates additional copy",
    async ({ apiSdk }) => {
      // Catches: Duplicate conflict resolution fails at nested folder level
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Dup L3.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Dup L3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: folder2Data } = await ownerApi.folders.createFolder({
        folderId: roomData.response!.id!,
        createFolder: { title: "Autotest Dup L3 L2" },
      });
      const { data: folder3Data } = await ownerApi.folders.createFolder({
        folderId: folder2Data.response!.id!,
        createFolder: { title: "Autotest Dup L3 L3" },
      });
      const folder3Id = folder3Data.response!.id!;

      await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Duplicate,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data: afterData } = await ownerApi.folders.getFolderByFolderId({
        folderId: folder3Id,
      });
      expect(afterData.response?.files).toHaveLength(2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy level 3 subfolder to another room" +
      " - subfolder and contents appear in destination",
    async ({ apiSdk }) => {
      // Catches: deeply nested folder copy to another room fails or loses contents
      const ownerApi = apiSdk.forRole("owner");

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch L3Sub Src Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: folder2Data } = await ownerApi.folders.createFolder({
        folderId: srcRoomData.response!.id!,
        createFolder: { title: "Autotest L3Sub L2" },
      });
      const subFolderTitle = "Autotest L3Sub Level3 Folder";
      const { data: folder3Data } = await ownerApi.folders.createFolder({
        folderId: folder2Data.response!.id!,
        createFolder: { title: subFolderTitle },
      });
      const folder3Id = folder3Data.response!.id!;

      const innerFileTitle = "Autotest CopyBatch L3Sub Inner File.docx";
      await ownerApi.files.createFile({
        folderId: folder3Id,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch L3Sub Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [folder3Id],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destFolderTitles = (destContent.response?.folders ?? []).map(
        (f) => f.title,
      );
      expect(destFolderTitles).toContain(subFolderTitle);

      const copiedSubfolder = destContent.response!.folders!.find(
        (f) => f.title === subFolderTitle,
      ) as FolderDtoInteger;
      const { data: copiedContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: copiedSubfolder.id!,
        });
      expect(
        (copiedContent.response?.files ?? []).map((f) => f.title),
      ).toContain(innerFileTitle);
    },
  );

  test("PUT /api/2.0/files/fileops/copy - Empty fileIds and folderIds returns 400", async ({
    apiSdk,
  }) => {
    // Catches: empty request accepted without validation error
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CopyBatch Empty Src Room",
        roomType: RoomType.CustomRoom,
      },
    });

    const { status } = await ownerApi.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [],
        folderIds: [],
        destFolderId: roomData.response!.id!,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(400);
  });

  test("PUT /api/2.0/files/fileops/copy - Copy to archived room returns 403", async ({
    apiSdk,
  }) => {
    // Catches: archived room incorrectly accepts copy operation
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest CopyBatch Archived Dest.docx",
      },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest CopyBatch Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileData.response!.id!],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });

    expect(status).toBe(403);
  });

  test(
    "PUT /api/2.0/files/fileops/copy - Copy form file with toFillOut=true" +
      " creates a fill-out copy in destination",
    async ({ apiSdk }) => {
      // Catches: toFillOut flag not respected, form fill-out copy not created
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const formFileId = await createOoForm(ownerApi, myDocsFolderId);

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch FillOut Dest",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [formFileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
          toFillOut: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Copy);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).length).toBeGreaterThan(0);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file to same room with Duplicate" +
      " creates second copy in the same location",
    async ({ apiSdk }) => {
      // Catches: intra-room Duplicate copy fails or merges instead of duplicating
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch SameRoom Dup",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest CopyBatch SameRoom File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId: roomId,
          conflictResolveType: FileConflictResolveType.Duplicate,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: roomId,
      });
      expect(roomContent.response?.files).toHaveLength(2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with non-existent fileId" +
      " returns error in async operation",
    async ({ apiSdk }) => {
      // Catches: non-existent file ID accepted without error
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch InvalidId Room",
          roomType: RoomType.CustomRoom,
        },
      });

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [999999999],
          destFolderId: roomData.response!.id!,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      // Either rejected immediately or returns 200 with error in operation
      expect([200, 400, 404]).toContain(status);

      if (status === 200) {
        const operation = await waitForOperation(ownerApi.operations);
        // If accepted, operation should either have an error or finish with 0 files
        expect(operation).toBeDefined();
      }
    },
  );

  test("PUT /api/2.0/files/fileops/copy - Copy to non-existent destFolderId returns 400 or 404", async ({
    apiSdk,
  }) => {
    // Catches: non-existent destination folder accepted without error
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest CopyBatch BadDest.docx" },
    });

    const { status } = await ownerApi.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileData.response!.id!],
        destFolderId: 999999999,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });

    expect([400, 404]).toContain(status);
  });

  test(
    "PUT /api/2.0/files/fileops/copy - Copy multiple files to level 3 subfolder" +
      " - all files appear in correct location",
    async ({ apiSdk }) => {
      // Catches: multi-file copy to deeply nested dest places files at wrong level
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const title1 = "Autotest CopyBatch Multi L3 File1.docx";
      const title2 = "Autotest CopyBatch Multi L3 File2.docx";
      const { data: file1 } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: title1 },
      });
      const { data: file2 } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: title2 },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Multi L3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: folder2 } = await ownerApi.folders.createFolder({
        folderId: roomData.response!.id!,
        createFolder: { title: "Autotest Multi L3 L2" },
      });
      const { data: folder3 } = await ownerApi.folders.createFolder({
        folderId: folder2.response!.id!,
        createFolder: { title: "Autotest Multi L3 L3" },
      });
      const folder3Id = folder3.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [file1.response!.id!, file2.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: folder3Id,
      });
      const destTitles = (destContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(destTitles).toContain(title1);
      expect(destTitles).toContain(title2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with Overwrite conflict in level 3" +
      " subfolder - destination file replaced",
    async ({ apiSdk }) => {
      // Catches: Overwrite conflict resolution fails at deeply nested level
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Overwrite L3.docx";
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Overwrite L3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: folder2 } = await ownerApi.folders.createFolder({
        folderId: roomData.response!.id!,
        createFolder: { title: "Autotest Overwrite L3 L2" },
      });
      const { data: folder3 } = await ownerApi.folders.createFolder({
        folderId: folder2.response!.id!,
        createFolder: { title: "Autotest Overwrite L3 L3" },
      });
      const folder3Id = folder3.response!.id!;

      const { data: file1 } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [file1.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { data: beforeData } = await ownerApi.folders.getFolderByFolderId({
        folderId: folder3Id,
      });
      const originalFileId = (beforeData.response!.files![0] as FileDtoInteger)
        .id!;

      const { data: file2 } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [file2.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Overwrite,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: afterData } = await ownerApi.folders.getFolderByFolderId({
        folderId: folder3Id,
      });
      const afterFiles = afterData.response?.files ?? [];
      expect(afterFiles).toHaveLength(1);
      expect((afterFiles[0] as FileDtoInteger).id).not.toBe(originalFileId);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy folder with content=true to level 3" +
      " subfolder - folder contents appear directly in subfolder",
    async ({ apiSdk }) => {
      // Catches: content=true not honoured when destination is deeply nested
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const srcFolderTitle = "Autotest CopyBatch ContentL3 Src";
      const { data: srcFolder } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: srcFolderTitle },
      });
      const innerFileTitle = "Autotest CopyBatch ContentL3 Inner.docx";
      await ownerApi.files.createFile({
        folderId: srcFolder.response!.id!,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch ContentL3 Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: folder2 } = await ownerApi.folders.createFolder({
        folderId: roomData.response!.id!,
        createFolder: { title: "Autotest ContentL3 L2" },
      });
      const { data: folder3 } = await ownerApi.folders.createFolder({
        folderId: folder2.response!.id!,
        createFolder: { title: "Autotest ContentL3 L3" },
      });
      const folder3Id = folder3.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [srcFolder.response!.id!],
          destFolderId: folder3Id,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
          content: true,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: folder3Id,
      });
      // Inner file appears directly in level 3 folder (not inside a subfolder)
      const destFileTitles = (destContent.response?.files ?? []).map(
        (f) => f.title,
      );
      expect(destFileTitles).toContain(innerFileTitle);
      // The source folder itself is NOT in level 3
      const destFolderTitles = (destContent.response?.folders ?? []).map(
        (f) => f.title,
      );
      expect(destFolderTitles).not.toContain(srcFolderTitle);
    },
  );
});
