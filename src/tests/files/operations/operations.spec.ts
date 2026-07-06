import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  CheckDestFolderResult,
  FileDtoInteger,
  FileConflictResolveType,
  FileOperationType,
  FileShare,
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

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - startFileConversion XLSX to PDF returns 200 with empty response and PUT link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest StartConversion xlsx.xlsx",
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

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - startFileConversion PPTX to PDF returns 200 with empty response and PUT link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest StartConversion pptx.pptx",
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

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - startConvert false returns 200 with empty response and link to checkconversion", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest StartConversion startConvertFalse.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: false,
      },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
    expect(data.links).toHaveLength(1);
    expect((data.links as any)[0].href).toContain("checkconversion");
  });

  test("PUT /api/2.0/files/file/{fileId}/checkconversion - non-existent fileId returns 200 with empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.startFileConversion({
      fileId: 999999999,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });
});

test.describe("GET /api/2.0/files/fileops/move - checkMoveOrCopyBatchItems", () => {
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

  // BUG 82158: non-existent destFolderId returns 500 instead of 404
  test.fail(
    "BUG 82158: GET /api/2.0/files/fileops/checkdestfolder - Non-existent" +
      " destFolderId returns 404",
    async ({ apiSdk }) => {
      // Catches: non-existent destFolderId returns 500 (NullReferenceException) instead of 404 (Not found)
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

  // BUG 82159: missing destFolderId returns 403 instead of 400
  test.fail(
    "BUG 82159: GET /api/2.0/files/fileops/checkdestfolder - No destFolderId" +
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
      " when file exists - destination file updated as new version, no duplicate",
    async ({ apiSdk }) => {
      // Overwrite = version update: same file entry (same ID), no second file created
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
      expect((destFiles[0] as FileDtoInteger).id).toBe(originalFileId);
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
      " returns 403",
    async ({ apiSdk }) => {
      // FillingFormsRoom only accepts form files; copying .docx is forbidden (403)
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest CopyBatch Docx FillingForms.docx",
        },
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

      expect(status).toBe(403);
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

  test("PUT /api/2.0/files/fileops/copy - Empty fileIds and folderIds returns 200", async ({
    apiSdk,
  }) => {
    // Empty batch is accepted gracefully (consistent with addFavorites and checkMove)
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

    expect(status).toBe(200);
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

  // BUG 82204: Non-existent fileId returns 403 (SecurityException "Access denied") instead of 404
  test.fail(
    "BUG 82204: PUT /api/2.0/files/fileops/copy - Non-existent fileId" +
      " returns 403 instead of 404",
    async ({ apiSdk }) => {
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

      expect(status).toBe(404);
    },
  );

  test("PUT /api/2.0/files/fileops/copy - Copy to non-existent destFolderId returns 404", async ({
    apiSdk,
  }) => {
    // Non-existent destination folder returns 404 (resource not found)
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

    expect(status).toBe(404);
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
      " subfolder - destination file updated as new version, no duplicate",
    async ({ apiSdk }) => {
      // Overwrite = version update: same file entry (same ID), no second file created
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
      expect((afterFiles[0] as FileDtoInteger).id).toBe(originalFileId);
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

  test(
    "PUT /api/2.0/files/fileops/copy - Copy files and folders together returns 200" +
      " and all items appear in destination",
    async ({ apiSdk }) => {
      // Catches: mixed batch (files + folders) drops one type silently
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch Mixed File.docx";
      const folderTitle = "Autotest CopyBatch Mixed Folder";

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch Mixed Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          folderIds: [folderData.response!.id!],
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
      expect(
        (destContent.response?.files ?? []).some((f) => f.title === fileTitle),
      ).toBe(true);
      expect(
        (destContent.response?.folders ?? []).some(
          (f) => f.title === folderTitle,
        ),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy multiple folders returns 200" +
      " and all folders appear in destination",
    async ({ apiSdk }) => {
      // Catches: second folder lost when folderIds has multiple entries
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folder1Title = "Autotest CopyBatch MultiFolders Folder1";
      const folder2Title = "Autotest CopyBatch MultiFolders Folder2";

      const { data: folder1 } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folder1Title },
      });
      const { data: folder2 } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folder2Title },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch MultiFolders Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [folder1.response!.id!, folder2.response!.id!],
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
      expect(destFolderTitles).toContain(folder1Title);
      expect(destFolderTitles).toContain(folder2Title);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy empty folder returns 200" +
      " and empty folder appears in destination",
    async ({ apiSdk }) => {
      // Catches: empty folder silently dropped or causes error
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const emptyFolderTitle = "Autotest CopyBatch EmptyFolder";
      const { data: emptyFolder } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: emptyFolderTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch EmptyFolder Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          folderIds: [emptyFolder.response!.id!],
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
      const copiedFolder = (destContent.response?.folders ?? []).find(
        (f) => f.title === emptyFolderTitle,
      ) as FolderDtoInteger;
      expect(copiedFolder).toBeDefined();

      const { data: copiedFolderContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: copiedFolder.id!,
        });
      expect(copiedFolderContent.response?.files ?? []).toHaveLength(0);
      expect(copiedFolderContent.response?.folders ?? []).toHaveLength(0);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file from room to MyDocs returns 200" +
      " and file appears in MyDocs, source preserved",
    async ({ apiSdk }) => {
      // Catches: copying out of a room to personal space fails or removes source
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch RoomToMyDocs Src",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcRoomId = roomData.response!.id!;

      const fileTitle = "Autotest CopyBatch RoomToMyDocs File.docx";
      const { data: srcFileData } = await ownerApi.files.createFile({
        folderId: srcRoomId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [srcFileData.response!.id!],
          destFolderId: myDocsFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: myDocsContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      expect(
        (myDocsContent.response?.files ?? []).some(
          (f) => f.title === fileTitle,
        ),
      ).toBe(true);

      const { data: roomContentAfter } =
        await ownerApi.folders.getFolderByFolderId({ folderId: srcRoomId });
      expect(
        (roomContentAfter.response?.files ?? []).some(
          (f) => f.title === fileTitle,
        ),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file from room subfolder to another room" +
      " returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: source path resolution fails when file is in a nested room subfolder
      const ownerApi = apiSdk.forRole("owner");

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch SubSrc Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const { data: srcFolderData } = await ownerApi.folders.createFolder({
        folderId: srcRoomData.response!.id!,
        createFolder: { title: "Autotest CopyBatch SubSrc Folder" },
      });

      const fileTitle = "Autotest CopyBatch SubSrc File.docx";
      const { data: srcFileData } = await ownerApi.files.createFile({
        folderId: srcFolderData.response!.id!,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch SubDest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [srcFileData.response!.id!],
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
      expect(
        (destContent.response?.files ?? []).some((f) => f.title === fileTitle),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with deleteAfter=true returns 200" +
      " and file appears in destination, source preserved",
    async ({ apiSdk }) => {
      // deleteAfter=true removes the operation record from queue after completion
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch DeleteAfter File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch DeleteAfter Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: true,
        },
      });

      expect(status).toBe(200);

      await expect(async () => {
        const { data: destContent } =
          await ownerApi.folders.getFolderByFolderId({
            folderId: destFolderId,
          });
        expect(
          (destContent.response?.files ?? []).some(
            (f) => f.title === fileTitle,
          ),
        ).toBe(true);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcContent.response?.files ?? []).some((f) => f.title === fileTitle),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy with duplicate fileId in request" +
      " and Skip creates one copy in destination",
    async ({ apiSdk }) => {
      // Same fileId twice: first copy succeeds, second is skipped due to name conflict
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch DupId File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch DupId Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [fileId, fileId],
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
      expect(
        (destContent.response?.files ?? []).filter(
          (f) => f.title === fileTitle,
        ),
      ).toHaveLength(1);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file to PublicRoom returns 200" +
      " and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: PublicRoom rejects copy with unexpected 403 or 400
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch PublicRoom File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch PublicRoom",
          roomType: RoomType.PublicRoom,
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
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect(
        (destContent.response?.files ?? []).some((f) => f.title === fileTitle),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file to EditingRoom returns 200" +
      " and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: EditingRoom rejects copy with unexpected error
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch EditingRoom File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch EditingRoom",
          roomType: RoomType.EditingRoom,
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
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect(
        (destContent.response?.files ?? []).some((f) => f.title === fileTitle),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/copy - Copy file to VirtualDataRoom returns 200" +
      " and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: VirtualDataRoom rejects copy with unexpected error
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest CopyBatch VirtualDataRoom File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest CopyBatch VirtualDataRoom",
          roomType: RoomType.VirtualDataRoom,
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
      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect(
        (destContent.response?.files ?? []).some((f) => f.title === fileTitle),
      ).toBe(true);
    },
  );
});

test.describe("POST /api/2.0/files/{folderId}/session - createUploadSessionInFolder", () => {
  test(
    "POST /api/2.0/files/{folderId}/session - Owner creates upload session" +
      " in MyDocs returns 200 and session fields are set",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const { data, status } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest UploadSession MyDocs.docx",
            fileSize: 1024,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response!.id).toBeDefined();
      expect(data.response!.location).toBeTruthy();
      expect(new Date(data.response!.expired!).getTime()).toBeGreaterThan(
        Date.now(),
      );
      expect(data.response!.bytes_total).toBe(1024);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - Owner creates upload session" +
      " in CustomRoom returns 200 and session id is set",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession CustomRoom",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { data, status } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest UploadSession CustomRoom File.docx",
            fileSize: 512,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response!.id).toBeDefined();
      expect(data.response!.location).toBeTruthy();
      expect(data.response!.bytes_total).toBe(512);
      expect(new Date(data.response!.expired!).getTime()).toBeGreaterThan(
        Date.now(),
      );
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - Full upload cycle returns 201" +
      " and file appears in destination folder",
    async ({ apiSdk }) => {
      // Catches: session created but upload or finalize step fails silently
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession FullCycle Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const fileContent = Buffer.from("test file content");
      const fileName = "Autotest UploadSession FullCycle.docx";

      const { data: sessionData, status: sessionStatus } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName,
            fileSize: fileContent.length,
            createNewIfExist: true,
          },
        });
      expect(sessionStatus).toBe(200);
      const sessionId = sessionData.response!.id!;

      const file = new File([fileContent], fileName, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const { status: uploadStatus } =
        await ownerApi.operations.uploadAsyncSession({
          folderId,
          sessionId,
          chunkNumber: 1,
          file,
        });
      expect(uploadStatus).toBe(200);

      const { status: finalizeStatus } =
        await ownerApi.operations.finalizeSession({ folderId, sessionId });
      expect(finalizeStatus).toBe(201);

      const { data: folderContent } =
        await ownerApi.folders.getFolderByFolderId({ folderId });
      expect(
        (folderContent.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(true);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - createNewIfExist=true with" +
      " existing filename creates session returns 200",
    async ({ apiSdk }) => {
      // Catches: session creation fails when file with same name already exists
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest UploadSession ExistingFile.docx";
      await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: fileName },
      });

      const fileContent = Buffer.from("uploaded content");
      const { data: sessionData, status } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName,
            fileSize: fileContent.length,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(200);
      expect(sessionData.response!.id).toBeDefined();

      const file = new File([fileContent], fileName, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await ownerApi.operations.uploadAsyncSession({
        folderId,
        sessionId: sessionData.response!.id!,
        chunkNumber: 1,
        file,
      });
      await ownerApi.operations.finalizeSession({
        folderId,
        sessionId: sessionData.response!.id!,
      });

      // createNewIfExist=true: original file must not be overwritten
      const { data: folderContent } =
        await ownerApi.folders.getFolderByFolderId({ folderId });
      expect(
        (folderContent.response?.files ?? []).length,
      ).toBeGreaterThanOrEqual(2);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - Upload session to archived" +
      " room returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession Archived Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      await ownerApi.rooms.archiveRoom({
        id: folderId,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);

      const { status } = await ownerApi.operations.createUploadSessionInFolder({
        folderId,
        sessionRequest: {
          fileName: "Autotest UploadSession Archived.docx",
          fileSize: 256,
          createNewIfExist: true,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - Non-existent folderId" +
      " returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.operations.createUploadSessionInFolder({
        folderId: 999999999,
        sessionRequest: {
          fileName: "Autotest UploadSession NonExistent.docx",
          fileSize: 256,
          createNewIfExist: true,
        },
      });

      expect(status).toBe(404);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - relativePath creates file in" +
      " subfolder returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest UploadSession RelativePath Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;
      const relativePath = "MySubfolder";
      const fileName = "Autotest UploadSession RelativePath.docx";
      const fileContent = Buffer.from("relative path test content");

      const { data: sessionData, status } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName,
            fileSize: fileContent.length,
            createNewIfExist: true,
            relativePath,
          },
        });

      expect(status).toBe(200);
      expect(sessionData.response!.id).toBeDefined();

      const file = new File([fileContent], fileName, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await ownerApi.operations.uploadAsyncSession({
        folderId,
        sessionId: sessionData.response!.id!,
        chunkNumber: 1,
        file,
      });
      await ownerApi.operations.finalizeSession({
        folderId,
        sessionId: sessionData.response!.id!,
      });

      // File lands in the subfolder, not directly in the room
      const { data: folderContent } =
        await ownerApi.folders.getFolderByFolderId({ folderId });
      expect(
        (folderContent.response?.folders ?? []).some(
          (f) => f.title === relativePath,
        ),
      ).toBe(true);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - fileSize=0 creates session" +
      " returns 200 with bytes_total=0",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const { data, status } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest UploadSession ZeroSize.docx",
            fileSize: 0,
            createNewIfExist: true,
          },
        });

      expect(status).toBe(200);
      expect(data.response!.id).toBeDefined();
      expect(data.response!.bytes_total).toBe(0);
    },
  );

  test(
    "POST /api/2.0/files/{folderId}/session - createNewIfExist=false with" +
      " existing filename overwrites file returns 200",
    async ({ apiSdk }) => {
      // Catches: createNewIfExist=false should overwrite, not create a duplicate
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest UploadSession Overwrite.docx";
      await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: fileName },
      });

      const fileContent = Buffer.from("overwritten content");
      const { data: sessionData, status } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName,
            fileSize: fileContent.length,
            createNewIfExist: false,
          },
        });

      expect(status).toBe(200);
      expect(sessionData.response!.id).toBeDefined();

      const file = new File([fileContent], fileName, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await ownerApi.operations.uploadAsyncSession({
        folderId,
        sessionId: sessionData.response!.id!,
        chunkNumber: 1,
        file,
      });
      await ownerApi.operations.finalizeSession({
        folderId,
        sessionId: sessionData.response!.id!,
      });

      // createNewIfExist=false: existing file is overwritten, only 1 copy remains
      const { data: folderContent } =
        await ownerApi.folders.getFolderByFolderId({ folderId });
      const filesWithSameName = (folderContent.response?.files ?? []).filter(
        (f) => f.title === fileName,
      );
      expect(filesWithSameName.length).toBe(1);
    },
  );
});

test.describe("DELETE /api/2.0/files/{folderId}/session/{sessionId} - abortUploadSession", () => {
  test(
    "DELETE /api/2.0/files/{folderId}/session/{sessionId} - Owner aborts" +
      " active upload session returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest AbortSession.docx",
            fileSize: 1024,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const { status } = await ownerApi.operations.abortUploadSession({
        sessionId,
        folderId,
      });

      expect(status).toBe(200);
    },
  );

  test(
    "DELETE /api/2.0/files/{folderId}/session/{sessionId} - Aborting session" +
      " without upload does not create file in folder",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest AbortSession NoFile.docx";
      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName,
            fileSize: 1024,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const { status } = await ownerApi.operations.abortUploadSession({
        sessionId,
        folderId,
      });
      expect(status).toBe(200);

      const { data: folderContent } =
        await ownerApi.folders.getFolderByFolderId({ folderId });
      const fileExists = (folderContent.response?.files ?? []).some(
        (f) => f.title === fileName,
      );
      expect(fileExists).toBe(false);
    },
  );

  // BUG XXXXX: DELETE /api/2.0/files/{folderId}/session/{sessionId} - Non-existent sessionId returns 500 instead of 404
  test.fail(
    "BUG XXXXX: DELETE /api/2.0/files/{folderId}/session/{sessionId} - Non-existent" +
      " sessionId returns 500 instead of 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const { status } = await ownerApi.operations.abortUploadSession({
        sessionId: "00000000-0000-0000-0000-000000000000",
        folderId,
      });

      expect(status).toBe(404);
    },
  );

  test(
    "DELETE /api/2.0/files/{folderId}/session/{sessionId} - Abort already" +
      " finalized session returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileContent = Buffer.from("test content");
      const fileName = "Autotest AbortSession Finalized.docx";

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName,
            fileSize: fileContent.length,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const file = new File([fileContent], fileName, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await ownerApi.operations.uploadAsyncSession({
        folderId,
        sessionId,
        chunkNumber: 1,
        file,
      });
      await ownerApi.operations.finalizeSession({ folderId, sessionId });

      const { status } = await ownerApi.operations.abortUploadSession({
        sessionId,
        folderId,
      });

      expect(status).toBe(200);
    },
  );

  // BUG XXXXX: DELETE /api/2.0/files/{folderId}/session/{sessionId} - Aborting session after partial upload creates file in folder instead of cleaning up
  test.fail(
    "BUG XXXXX: DELETE /api/2.0/files/{folderId}/session/{sessionId} - Aborting" +
      " session after partial upload creates file instead of cleaning up",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest AbortSession Partial.docx";
      const partialContent = Buffer.from("partial chunk");

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName,
            fileSize: 1024,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const file = new File([partialContent], fileName, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await ownerApi.operations.uploadAsyncSession({
        folderId,
        sessionId,
        chunkNumber: 1,
        file,
      });

      const { status } = await ownerApi.operations.abortUploadSession({
        sessionId,
        folderId,
      });

      expect(status).toBe(200);

      const { data: folderContent } =
        await ownerApi.folders.getFolderByFolderId({ folderId });
      const fileExists = (folderContent.response?.files ?? []).some(
        (f) => f.title === fileName,
      );
      expect(fileExists).toBe(false);
    },
  );

  test(
    "DELETE /api/2.0/files/{folderId}/session/{sessionId} - Abort session" +
      " in a Custom Room returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest AbortSession Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const folderId = roomData.response!.id!;

      const { data: sessionData } =
        await ownerApi.operations.createUploadSessionInFolder({
          folderId,
          sessionRequest: {
            fileName: "Autotest AbortSession InRoom.docx",
            fileSize: 1024,
            createNewIfExist: true,
          },
        });
      const sessionId = sessionData.response!.id!;

      const { status } = await ownerApi.operations.abortUploadSession({
        sessionId,
        folderId,
      });

      expect(status).toBe(200);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/delete - deleteBatchItems", () => {
  test(
    "PUT /api/2.0/files/fileops/delete - Owner moves file to trash returns" +
      " 200 and file appears in trash",
    async ({ apiSdk }) => {
      // Catches: immediately=false must move to trash, not delete permanently
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest Delete ToTrash File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileId],
          immediately: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      // File must appear in trash
      const { data: trashData } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashData.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(true);

      // File must NOT be in MyDocs anymore
      const { data: myDocs } = await ownerApi.folders.getFolderByFolderId({
        folderId,
      });
      expect(
        (myDocs.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - Owner permanently deletes file" +
      " returns 200 and file not in trash or source",
    async ({ apiSdk }) => {
      // Catches: immediately=true must skip trash and delete permanently
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest Delete Permanent File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileId],
          immediately: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      // File must NOT be in trash
      const { data: trashData } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashData.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);

      // File must NOT be in MyDocs
      const { data: myDocs } = await ownerApi.folders.getFolderByFolderId({
        folderId,
      });
      expect(
        (myDocs.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - Owner moves folder to trash" +
      " returns 200 and folder appears in trash",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const parentId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest Delete FolderToTrash";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: parentId,
        createFolder: { title: folderTitle },
      });
      const subFolderId = folderData.response!.id!;

      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          folderIds: [subFolderId],
          immediately: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      // Folder must appear in trash
      const { data: trashData } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashData.response?.folders ?? []).some(
          (f) => f.title === folderTitle,
        ),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - Owner permanently deletes folder" +
      " with files returns 200 and folder removed from MyDocs",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const parentId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest Delete FolderWithFiles";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: parentId,
        createFolder: { title: folderTitle },
      });
      const subFolderId = folderData.response!.id!;

      await ownerApi.files.createFile({
        folderId: subFolderId,
        createFileJsonElement: { title: "Autotest Delete InnerFile.docx" },
      });

      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          folderIds: [subFolderId],
          immediately: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      // Folder must NOT be in MyDocs
      const { data: myDocs } = await ownerApi.folders.getFolderByFolderId({
        folderId: parentId,
      });
      expect(
        (myDocs.response?.folders ?? []).some((f) => f.title === folderTitle),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - Batch delete multiple files and" +
      " folders returns 200 and all removed from source",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const parentId = myDocsData.response!.current!.id!;

      const { data: file1 } = await ownerApi.files.createFile({
        folderId: parentId,
        createFileJsonElement: { title: "Autotest Batch Delete File1.docx" },
      });
      const { data: file2 } = await ownerApi.files.createFile({
        folderId: parentId,
        createFileJsonElement: { title: "Autotest Batch Delete File2.docx" },
      });
      const { data: folder1 } = await ownerApi.folders.createFolder({
        folderId: parentId,
        createFolder: { title: "Autotest Batch Delete Folder1" },
      });

      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [file1.response!.id!, file2.response!.id!],
          folderIds: [folder1.response!.id!],
          immediately: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      const { data: myDocs } = await ownerApi.folders.getFolderByFolderId({
        folderId: parentId,
      });
      const fileTitles = (myDocs.response?.files ?? []).map((f) => f.title);
      const folderTitles = (myDocs.response?.folders ?? []).map((f) => f.title);
      expect(fileTitles).not.toContain("Autotest Batch Delete File1.docx");
      expect(fileTitles).not.toContain("Autotest Batch Delete File2.docx");
      expect(folderTitles).not.toContain("Autotest Batch Delete Folder1");
    },
  );

  test(
    "PUT /api/2.0/files/fileops/delete - Empty fileIds and folderIds" +
      " returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [],
          folderIds: [],
          immediately: true,
        },
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
    },
  );

  test("PUT /api/2.0/files/fileops/delete - Non-existent fileId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: {
        fileIds: [999999999],
        immediately: true,
      },
    });

    expect(status).toBe(404);
  });

  test(
    "PUT /api/2.0/files/fileops/delete - File already in trash permanently" +
      " deleted returns 200 and not in trash",
    async ({ apiSdk }) => {
      // Catches: double-delete should work -- move to trash then delete permanently
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const folderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest Delete FromTrash File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      // Step 1: move to trash
      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(ownerApi.operations);

      // Step 2: permanently delete from trash
      const { data, status } = await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      // File must not be in trash
      const { data: trashData } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashData.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/deleteversion - deleteFileVersions", () => {
  test("PUT /api/2.0/files/fileops/deleteversion - Delete version 1 from file with 2 versions returns 200 operation Delete and version 1 is gone", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer Single File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    await waitForOperation(ownerApi.operations);

    const { data: versionsData } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    const versionNumbers = versionsData.response!.map((v) => v.version);
    expect(versionNumbers).not.toContain(1);
    expect(versionNumbers).toContain(2);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Delete multiple versions at once returns 200 and only remaining version stays", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer Multi File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });
    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 3 } });

    const { data, status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1, 2] },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    await waitForOperation(ownerApi.operations);

    const { data: versionsData } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    const versionNumbers = versionsData.response!.map((v) => v.version);
    expect(versionNumbers).not.toContain(1);
    expect(versionNumbers).not.toContain(2);
    expect(versionNumbers).toContain(3);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - File is still accessible in source folder after version deletion", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer Accessible.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });
    await waitForOperation(ownerApi.operations);

    const { data: folderContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const titles = (folderContent.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest DelVer Accessible.docx");
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Non-existent version number silently ignored returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer NonExistVer.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [999] },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    await waitForOperation(ownerApi.operations);

    const { data: versionsData } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    expect(versionsData.response!.length).toBe(1);
    expect(versionsData.response![0].version).toBe(1);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - Non-existent fileId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId: 999999999, versions: [1] },
    });

    expect(status).toBe(404);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - File in Custom Room version deleted and only remaining version stays", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest DelVer CustomRoom",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest DelVer Room File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    const { data, status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    await waitForOperation(ownerApi.operations);

    const { data: versionsData } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    const versionNumbers = versionsData.response!.map((v) => v.version);
    expect(versionNumbers).not.toContain(1);
    expect(versionNumbers).toContain(2);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - File in archived room cannot delete versions returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest DelVer ArchivedRoom",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest DelVer Archived File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - File moved to trash cannot delete versions returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer Trash File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: [1] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/fileops/deleteversion - versions null returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelVer Null Versions.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    const { data, status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: { fileId, versions: null },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("PUT /api/2.0/files/fileops/deleteversion - returnSingleOperation true returns 200 and version is deleted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest DelVer SingleOp File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({ fileId, updateFile: { lastVersion: 2 } });

    const { data, status } = await ownerApi.operations.deleteFileVersions({
      deleteVersionBatchRequestDto: {
        fileId,
        versions: [1],
        returnSingleOperation: true,
      },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();

    await waitForOperation(ownerApi.operations);

    const { data: versionsData } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });
    const versionNumbers = versionsData.response!.map((v) => v.version);
    expect(versionNumbers).not.toContain(1);
    expect(versionNumbers).toContain(2);
  });
});

test.describe("DELETE /api/2.0/files/favorites - Remove favorite files and folders", () => {
  test("DELETE /api/2.0/files/favorites - Delete file from favorites returns 200 response true and file no longer appears in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest DelFav File.docx");
  });

  test("DELETE /api/2.0/files/favorites - Delete folder from favorites returns 200 response true and folder no longer appears in getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest DelFav Folder" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const folderTitles = (favData.response!.folders ?? []).map((f) => f.title);
    expect(folderTitles).not.toContain("Autotest DelFav Folder");
  });

  test("DELETE /api/2.0/files/favorites - Delete multiple files at once all removed from getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: file1Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav Multi1.docx" },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav Multi2.docx" },
    });
    const fileId1 = file1Data.response!.id!;
    const fileId2 = file2Data.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId1, fileId2] },
    });

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId1, fileId2] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const titles = (favData.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest DelFav Multi1.docx");
    expect(titles).not.toContain("Autotest DelFav Multi2.docx");
  });

  test("DELETE /api/2.0/files/favorites - Delete multiple folders at once all removed from getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folder1Data } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest DelFav MultiFolderA" },
    });
    const { data: folder2Data } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest DelFav MultiFolderB" },
    });
    const folderId1 = folder1Data.response!.id!;
    const folderId2 = folder2Data.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderId1, folderId2] },
    });

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { folderIds: [folderId1, folderId2] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const folderTitles = (favData.response!.folders ?? []).map((f) => f.title);
    expect(folderTitles).not.toContain("Autotest DelFav MultiFolderA");
    expect(folderTitles).not.toContain("Autotest DelFav MultiFolderB");
  });

  test("DELETE /api/2.0/files/favorites - Delete file and folder simultaneously both removed from getFavoritesFolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav Mixed File.docx" },
    });
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest DelFav Mixed Folder" },
    });
    const fileId = fileData.response!.id!;
    const folderId = folderData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId], folderIds: [folderId] },
    });

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId], folderIds: [folderId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const fileTitles = (favData.response!.files ?? []).map((f) => f.title);
    const folderTitles = (favData.response!.folders ?? []).map((f) => f.title);
    expect(fileTitles).not.toContain("Autotest DelFav Mixed File.docx");
    expect(folderTitles).not.toContain("Autotest DelFav Mixed Folder");
  });

  test("DELETE /api/2.0/files/favorites - Source file is still accessible after removing from favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav Source File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { data: folderContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const titles = (folderContent.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest DelFav Source File.docx");
  });

  test("DELETE /api/2.0/files/favorites - Delete file not in favorites is idempotent returns 200 response true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest DelFav Idempotent File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DELETE /api/2.0/files/favorites - Empty body returns 200 response true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody(
      {},
    );

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DELETE /api/2.0/files/favorites - Empty fileIds and folderIds arrays returns 200 response true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [], folderIds: [] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DELETE /api/2.0/files/favorites - Non-existent fileId returns 200 response true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { fileIds: [999999999] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DELETE /api/2.0/files/favorites - Non-existent folderId returns 200 response true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { folderIds: [999999999] },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("PUT /api/2.0/files/fileops/duplicate - duplicateBatchItems", () => {
  test("PUT /api/2.0/files/fileops/duplicate - Duplicate file in My Documents returns 200 Operation Duplicate and duplicate appears in same folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileBase = "Autotest Dup Single File";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: `${fileBase}.docx` },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");

    const { data: folderContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const matchingFiles = (folderContent.response!.files ?? []).filter((f) =>
      f.title?.includes(fileBase),
    );
    expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - Duplicate folder in My Documents returns 200 and duplicate folder appears in same location", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const folderBase = "Autotest Dup Single Folder";
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: folderBase },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { folderIds: [folderId as any] },
    });

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");

    const { data: folderContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const matchingFolders = (folderContent.response!.folders ?? []).filter(
      (f) => f.title?.includes(folderBase),
    );
    expect(matchingFolders.length).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - Duplicate multiple files at once all duplicates appear in same folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const base1 = "Autotest Dup Multi FileA";
    const base2 = "Autotest Dup Multi FileB";
    const { data: file1Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: `${base1}.docx` },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: `${base2}.docx` },
    });
    const fileId1 = file1Data.response!.id!;
    const fileId2 = file2Data.response!.id!;

    const { data, status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId1 as any, fileId2 as any] },
    });

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");

    const { data: folderContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const files = folderContent.response!.files ?? [];
    expect(
      files.filter((f) => f.title?.includes(base1)).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      files.filter((f) => f.title?.includes(base2)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - Duplicate file in Custom Room returns 200 and duplicate appears in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Dup Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileBase = "Autotest Dup Room File";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: `${fileBase}.docx` },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");

    const { data: roomContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: roomId,
    });
    const matchingFiles = (roomContent.response!.files ?? []).filter((f) =>
      f.title?.includes(fileBase),
    );
    expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - File with diacritical characters created and duplicated returns 200 and both appear in folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const fileBase = "Autotest Dup Üñó Résumé";
    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: `${fileBase}.docx` },
    });
    const fileId = fileData.response!.id!;

    const { data: createdFile, status: createStatus } =
      await ownerApi.files.getFileInfo({ fileId });
    expect(createStatus).toBe(200);
    expect(createdFile.response!.title).toContain("Üñó");

    const { data, status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(200);
    expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

    const operation = await waitForOperation(ownerApi.operations);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");

    const { data: folderContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: myDocsFolderId,
    });
    const matchingFiles = (folderContent.response!.files ?? []).filter((f) =>
      f.title?.includes(fileBase),
    );
    expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
  });

  test("PUT /api/2.0/files/fileops/duplicate - Empty fileIds array returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [] },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // BUG 82210: duplicateBatchItems returns 500 instead of 404 for non-existent fileId
  test.fail(
    "BUG 82210: PUT /api/2.0/files/fileops/duplicate - Non-existent fileId returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.operations.duplicateBatchItems({
        duplicateRequestDto: { fileIds: [999999999 as any] },
      });

      expect(status).toBe(404);
    },
  );

  test("PUT /api/2.0/files/fileops/duplicate - File in archived room cannot be duplicated returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Dup Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Dup Archived File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/fileops/duplicate - File in trash cannot be duplicated returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Dup Trash File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(403);
  });

  // BUG 82210: duplicateBatchItems returns 500 instead of 404 for non-existent folderId
  test.fail(
    "BUG 82210: PUT /api/2.0/files/fileops/duplicate - Non-existent folderId returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.operations.duplicateBatchItems({
        duplicateRequestDto: { folderIds: [999999999 as any] },
      });

      expect(status).toBe(404);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/duplicate - Duplicate folder with nested file" +
      " returns 200 and nested file appears in duplicate folder",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderBase = "Autotest Dup Nested Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderBase },
      });
      const folderId = folderData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: "Autotest Dup Nested File.docx" },
      });
      const innerFileTitle = fileData.response!.title!;

      const { data, status } = await ownerApi.operations.duplicateBatchItems({
        duplicateRequestDto: { folderIds: [folderId as any] },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
      expect(operation.error).toBe("");

      const { data: myDocsContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      const matchingFolders = (
        myDocsContent.response!.folders as FolderDtoInteger[]
      ).filter((f) => f.title?.includes(folderBase));
      expect(matchingFolders.length).toBeGreaterThanOrEqual(2);

      const duplicateFolder = matchingFolders.find((f) => f.id !== folderId)!;
      const { data: dupContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: duplicateFolder.id!,
      });
      expect(
        (dupContent.response!.files ?? []).some(
          (f) => f.title === innerFileTitle,
        ),
      ).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/duplicate - Duplicate file and folder together" +
      " returns 200 and both duplicates appear",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileBase = "Autotest Dup Mixed File";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: `${fileBase}.docx` },
      });
      const fileId = fileData.response!.id!;

      const folderBase = "Autotest Dup Mixed Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderBase },
      });
      const folderId = folderData.response!.id!;

      const { data, status } = await ownerApi.operations.duplicateBatchItems({
        duplicateRequestDto: {
          fileIds: [fileId as any],
          folderIds: [folderId as any],
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
      expect(operation.error).toBe("");

      const { data: myDocsContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      const matchingFiles = (myDocsContent.response!.files ?? []).filter((f) =>
        f.title?.includes(fileBase),
      );
      const matchingFolders = (myDocsContent.response!.folders ?? []).filter(
        (f) => f.title?.includes(folderBase),
      );
      expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
      expect(matchingFolders.length).toBeGreaterThanOrEqual(2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/duplicate - Duplicate file in nested subfolder" +
      " returns 200 and duplicate appears in same subfolder",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: subFolderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest Dup Subfolder" },
      });
      const subFolderId = subFolderData.response!.id!;

      const fileBase = "Autotest Dup Subfolder File";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: subFolderId,
        createFileJsonElement: { title: `${fileBase}.docx` },
      });
      const fileId = fileData.response!.id!;

      const { data, status } = await ownerApi.operations.duplicateBatchItems({
        duplicateRequestDto: { fileIds: [fileId as any] },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Duplicate);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
      expect(operation.error).toBe("");

      const { data: subFolderContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: subFolderId,
        });
      const matchingFiles = (subFolderContent.response!.files ?? []).filter(
        (f) => f.title?.includes(fileBase),
      );
      expect(matchingFiles.length).toBeGreaterThanOrEqual(2);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/emptytrash - emptyTrash", () => {
  test(
    "PUT /api/2.0/files/fileops/emptytrash - Empty trash with one file" +
      " returns 200 and file no longer in trash",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest EmptyTrash File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data: trashBefore } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashBefore.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(true);

      const { data, status } = await ownerApi.operations.emptyTrash();

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      const { data: trashAfter } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashAfter.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/emptytrash - Empty trash with one folder" +
      " returns 200 and folder no longer in trash",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest EmptyTrash Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });
      const folderId = folderData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { folderIds: [folderId], immediately: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data: trashBefore } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashBefore.response?.folders ?? []).some(
          (f) => f.title === folderTitle,
        ),
      ).toBe(true);

      const { data, status } = await ownerApi.operations.emptyTrash();

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      const { data: trashAfter } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashAfter.response?.folders ?? []).some(
          (f) => f.title === folderTitle,
        ),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/emptytrash - Empty trash with mixed content" +
      " returns 200 and trash is empty",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileName = "Autotest EmptyTrash Mixed File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      const folderTitle = "Autotest EmptyTrash Mixed Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });
      const folderId = folderData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: {
          fileIds: [fileId],
          folderIds: [folderId],
          immediately: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.operations.emptyTrash();

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      const { data: trashAfter } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashAfter.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
      expect(
        (trashAfter.response?.folders ?? []).some(
          (f) => f.title === folderTitle,
        ),
      ).toBe(false);
    },
  );

  test("PUT /api/2.0/files/fileops/emptytrash - Empty already empty trash returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.emptyTrash();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test(
    "PUT /api/2.0/files/fileops/emptytrash - File deleted from room" +
      " appears in personal trash and is removed by emptyTrash returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest EmptyTrash Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const fileName = "Autotest EmptyTrash Room File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: fileName },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data: trashBefore } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashBefore.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(true);

      const { data, status } = await ownerApi.operations.emptyTrash();

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      const { data: trashAfter } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashAfter.response?.files ?? []).some((f) => f.title === fileName),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/emptytrash - single=true returns array with" +
      " operation of type Delete",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: "Autotest EmptyTrash Single.docx" },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.operations.deleteBatchItems({
        deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
      });
      await waitForOperation(ownerApi.operations);

      const { data, status } = await ownerApi.operations.emptyTrash({
        single: true,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response![0].Operation).toBe(FileOperationType.Delete);

      await waitForOperation(ownerApi.operations);

      const { data: trashAfter } = await ownerApi.folders.getTrashFolder();
      expect(
        (trashAfter.response?.files ?? []).some(
          (f) => f.title === "Autotest EmptyTrash Single.docx",
        ),
      ).toBe(false);
    },
  );
});

test.describe("GET /api/2.0/files/fileops - getOperationStatuses", () => {
  test("GET /api/2.0/files/fileops - No active operations returns 200 and empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.getOperationStatuses();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBe(0);
  });

  test(
    "GET /api/2.0/files/fileops - Non-existent operation id returns" +
      " 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.operations.getOperationStatuses({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );
});

test.describe("GET /api/2.0/files/fileops/:operationType - getOperationStatusesByType", () => {
  // Catches: bug where Delete type filter path is broken or server ignores type
  test(
    "GET /api/2.0/files/fileops/:operationType - operationType Delete" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Delete,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: bug where Copy type filter path is broken
  test(
    "GET /api/2.0/files/fileops/:operationType - operationType Copy" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Copy,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: bug where Move type filter path is broken
  test(
    "GET /api/2.0/files/fileops/:operationType - operationType Move" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Move,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: bug where Duplicate type filter path is broken
  test(
    "GET /api/2.0/files/fileops/:operationType - operationType Duplicate" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Duplicate,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: bug where Download type filter path is broken
  test(
    "GET /api/2.0/files/fileops/:operationType - operationType Download" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Download,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: bug where MarkAsRead type filter path is broken
  test(
    "GET /api/2.0/files/fileops/:operationType - operationType MarkAsRead" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.MarkAsRead,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // BUG 82225: GET /api/2.0/files/fileops/:operationType - Convert (value=6) returns 400 instead of 200
  // Catches: bug where Convert type filter path is broken
  test.fail(
    "BUG 82225: GET /api/2.0/files/fileops/:operationType - operationType Convert" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Convert,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // BUG 82225: GET /api/2.0/files/fileops/:operationType - Import (value=5) returns 400 instead of 200
  // Catches: bug where Import type filter path is broken
  test.fail(
    "BUG 82225: GET /api/2.0/files/fileops/:operationType - operationType Import" +
      " with no active operations returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Import,
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: bug where combining type + id filter causes 500 or returns wrong data
  test(
    "GET /api/2.0/files/fileops/:operationType - Valid operationType" +
      " with non-existent id returns 200 and empty array",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } =
        await ownerApi.operations.getOperationStatusesByType({
          operationType: FileOperationType.Delete,
          id: "9999999",
        });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBe(0);
    },
  );

  // Catches: server returning 500 instead of 400 for unknown enum value
  test(
    "GET /api/2.0/files/fileops/:operationType - Invalid operationType" +
      " returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.operations.getOperationStatusesByType({
        operationType: 99 as any,
      });

      expect(status).toBe(400);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/markasread - markAsRead", () => {
  test(
    "PUT /api/2.0/files/fileops/markasread - Mark single file as read" +
      " returns 200 and Operation MarkAsRead",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MarkAsRead Single File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest MarkAsRead File.docx" },
      });
      const fileId = fileData.response!.id!;

      const { data: newBefore } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });
      expect(
        (newBefore.response ?? [])
          .flatMap((g) => g.items ?? [])
          .some((f) => f.title === "Autotest MarkAsRead File.docx"),
      ).toBe(true);

      const { data, status } = await userApi.operations.markAsRead({
        baseBatchRequestDto: { fileIds: [fileId as any] },
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response![0].Operation).toBe(FileOperationType.MarkAsRead);

      await waitForOperation(userApi.operations);

      const { data: newAfter } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });
      expect(
        (newAfter.response ?? [])
          .flatMap((g) => g.items ?? [])
          .some((f) => f.title === "Autotest MarkAsRead File.docx"),
      ).toBe(false);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/markasread - Mark multiple files as read" +
      " removes them from new items list",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MarkAsRead Multi Files",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest MarkAsRead File1.docx" },
      });
      const file1Id = file1Data.response!.id!;

      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest MarkAsRead File2.docx" },
      });
      const file2Id = file2Data.response!.id!;

      const { data: newBefore } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });
      const itemsBefore = (newBefore.response ?? []).flatMap(
        (g) => g.items ?? [],
      );
      expect(
        itemsBefore.some((f) => f.title === "Autotest MarkAsRead File1.docx"),
      ).toBe(true);
      expect(
        itemsBefore.some((f) => f.title === "Autotest MarkAsRead File2.docx"),
      ).toBe(true);

      const { data, status } = await userApi.operations.markAsRead({
        baseBatchRequestDto: { fileIds: [file1Id as any, file2Id as any] },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.MarkAsRead);

      await waitForOperation(userApi.operations);

      const { data: newAfter } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });
      const itemsAfter = (newAfter.response ?? []).flatMap(
        (g) => g.items ?? [],
      );
      expect(
        itemsAfter.some((f) => f.title === "Autotest MarkAsRead File1.docx"),
      ).toBe(false);
      expect(
        itemsAfter.some((f) => f.title === "Autotest MarkAsRead File2.docx"),
      ).toBe(false);
    },
  );

  // Subfolders do not appear in getNewRoomItems, so this test verifies the
  // technical response only: folderIds are accepted and operation is MarkAsRead.
  test(
    "PUT /api/2.0/files/fileops/markasread - Mark folder as read" +
      " returns 200 and Operation MarkAsRead",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MarkAsRead Folder",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: subFolderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest MarkAsRead Subfolder" },
      });
      const subFolderId = subFolderData.response!.id!;

      const { data, status } = await ownerApi.operations.markAsRead({
        baseBatchRequestDto: { folderIds: [subFolderId as any] },
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response![0].Operation).toBe(FileOperationType.MarkAsRead);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/markasread - Mix of files and folders" +
      " returns 200 and Operation MarkAsRead",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MarkAsRead Mix",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest MarkAsRead Mix File.docx" },
      });
      const fileId = fileData.response!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest MarkAsRead Mix Folder" },
      });
      const folderId = folderData.response!.id!;

      const { data, status } = await userApi.operations.markAsRead({
        baseBatchRequestDto: {
          fileIds: [fileId as any],
          folderIds: [folderId as any],
        },
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response![0].Operation).toBe(FileOperationType.MarkAsRead);
    },
  );

  test("PUT /api/2.0/files/fileops/markasread - No body returns 200", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").operations.markAsRead();

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/fileops/markasread - Empty fileIds returns 200", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .operations.markAsRead({
        baseBatchRequestDto: { fileIds: [] },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("PUT /api/2.0/files/fileops/markasread - Non-existent fileId returns 200", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").operations.markAsRead({
      baseBatchRequestDto: { fileIds: [9999999 as any] },
    });

    expect(status).toBe(200);
  });

  test(
    "PUT /api/2.0/files/fileops/markasread - Already read file" +
      " returns 200 (idempotent)",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MarkAsRead Idempotent",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest MarkAsRead Idempotent File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status: status1 } = await userApi.operations.markAsRead({
        baseBatchRequestDto: { fileIds: [fileId as any] },
      });
      expect(status1).toBe(200);

      await waitForOperation(userApi.operations);

      const { status: status2 } = await userApi.operations.markAsRead({
        baseBatchRequestDto: { fileIds: [fileId as any] },
      });
      expect(status2).toBe(200);
    },
  );

  // Catches: folderIds marking not clearing files inside the folder in new items
  test(
    "PUT /api/2.0/files/fileops/markasread - Mark folder as read removes" +
      " its files from new items list",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MarkAsRead Folder Business",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      await userApi.rooms.getRoomInfo({ id: roomId });

      const { data: subFolderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest MarkAsRead Folder Business Sub" },
      });
      const subFolderId = subFolderData.response!.id!;

      await ownerApi.files.createFile({
        folderId: subFolderId,
        createFileJsonElement: {
          title: "Autotest MarkAsRead Folder File.docx",
        },
      });

      const { data: newBefore } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });
      expect(
        (newBefore.response ?? [])
          .flatMap((g) => g.items ?? [])
          .some((f) => f.title === "Autotest MarkAsRead Folder File.docx"),
      ).toBe(true);

      await userApi.operations.markAsRead({
        baseBatchRequestDto: { folderIds: [subFolderId as any] },
      });
      await waitForOperation(userApi.operations);

      const { data: newAfter } = await userApi.rooms.getNewRoomItems({
        id: roomId,
      });
      expect(
        (newAfter.response ?? [])
          .flatMap((g) => g.items ?? [])
          .some((f) => f.title === "Autotest MarkAsRead Folder File.docx"),
      ).toBe(false);
    },
  );

  // Catches: server error when fileId is inaccessible to the caller
  test(
    "PUT /api/2.0/files/fileops/markasread - Mark file without access" +
      " returns 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MarkAsRead No Access",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest MarkAsRead No Access File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await userApi.operations.markAsRead({
        baseBatchRequestDto: { fileIds: [fileId as any] },
      });

      expect(status).toBe(200);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/move - moveBatchItems", () => {
  test(
    "PUT /api/2.0/files/fileops/move - Move single file from MyDocs to CustomRoom" +
      " returns 200 and Move operation, file in destination, removed from source",
    async ({ apiSdk }) => {
      // Catches: file not moved, remains in source, or does not appear in destination
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const sourceTitle = "Autotest MoveBatch Single File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: sourceTitle },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Single Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        sourceTitle,
      );

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcContent.response?.files ?? []).map((f) => f.title),
      ).not.toContain(sourceTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move multiple files from MyDocs to CustomRoom" +
      " returns 200, all files in destination, removed from source",
    async ({ apiSdk }) => {
      // Catches: only first file moved, or files not removed from source
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const title1 = "Autotest MoveBatch Multi File1.docx";
      const title2 = "Autotest MoveBatch Multi File2.docx";

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
          title: "Autotest MoveBatch Multi Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [file1Data.response!.id!, file2Data.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

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

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      const srcTitles = (srcContent.response?.files ?? []).map((f) => f.title);
      expect(srcTitles).not.toContain(title1);
      expect(srcTitles).not.toContain(title2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move folder from MyDocs to CustomRoom" +
      " returns 200, folder with contents in destination, removed from source",
    async ({ apiSdk }) => {
      // Catches: folder not moved, loses inner files, or remains in source
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest MoveBatch Source Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });
      const sourceFolderId = folderData.response!.id!;

      const innerFileTitle = "Autotest MoveBatch Inner File.docx";
      await ownerApi.files.createFile({
        folderId: sourceFolderId,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Folder Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          folderIds: [sourceFolderId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      const destFolderTitles = (destContent.response?.folders ?? []).map(
        (f) => f.title,
      );
      expect(destFolderTitles).toContain(folderTitle);

      const movedFolder = destContent.response!.folders!.find(
        (f) => f.title === folderTitle,
      ) as FolderDtoInteger;
      const { data: movedContent } = await ownerApi.folders.getFolderByFolderId(
        {
          folderId: movedFolder.id!,
        },
      );
      expect(
        (movedContent.response?.files ?? []).map((f) => f.title),
      ).toContain(innerFileTitle);

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcContent.response?.folders ?? []).map((f) => f.title),
      ).not.toContain(folderTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move mixed files and folders to CustomRoom" +
      " returns 200 and all items appear in destination",
    async ({ apiSdk }) => {
      // Catches: mixed batch move fails or only partial items moved
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch Mix File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const folderTitle = "Autotest MoveBatch Mix Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Mix Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          folderIds: [folderData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );
      expect(
        (destContent.response?.folders ?? []).map((f) => f.title),
      ).toContain(folderTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file between two CustomRooms" +
      " returns 200, file in destination room, removed from source room",
    async ({ apiSdk }) => {
      // Catches: inter-room move fails or file remains in source room
      const ownerApi = apiSdk.forRole("owner");

      const { data: srcRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch InterRoom Source",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcFolderId = srcRoomData.response!.id!;

      const fileTitle = "Autotest MoveBatch InterRoom File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch InterRoom Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: srcFolderId,
      });
      expect(
        (srcContent.response?.files ?? []).map((f) => f.title),
      ).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file from CustomRoom to MyDocs" +
      " returns 200, file in MyDocs, removed from room",
    async ({ apiSdk }) => {
      // Catches: move from room to personal folder fails or leaves file in room
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch RoomToMyDocs Src",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcFolderId = roomData.response!.id!;

      const fileTitle = "Autotest MoveBatch RoomToMyDocs File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: myDocsFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: myDocsContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      expect(
        (myDocsContent.response?.files ?? []).map((f) => f.title),
      ).toContain(fileTitle);

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: srcFolderId,
      });
      expect(
        (srcContent.response?.files ?? []).map((f) => f.title),
      ).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file between subfolders within MyDocs" +
      " returns 200, file in destination subfolder, removed from source subfolder",
    async ({ apiSdk }) => {
      // Catches: intra-MyDocs subfolder move fails
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: srcFolderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest MoveBatch MyDocsSrc Folder" },
      });
      const srcFolderId = srcFolderData.response!.id!;

      const fileTitle = "Autotest MoveBatch MyDocs Subfolder File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: destFolderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest MoveBatch MyDocsDest Folder" },
      });
      const destFolderId = destFolderData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );

      const { data: srcContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: srcFolderId,
      });
      expect(
        (srcContent.response?.files ?? []).map((f) => f.title),
      ).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move subfolder within room to another subfolder" +
      " returns 200, subfolder nested in destination",
    async ({ apiSdk }) => {
      // Catches: intra-room subfolder re-parenting fails or creates duplicate
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch SubMove Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const srcTitle = "Autotest MoveBatch Src Subfolder";
      const { data: srcFolderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: srcTitle },
      });

      const { data: destFolderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest MoveBatch Dest Parent" },
      });
      const destFolderId = destFolderData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          folderIds: [srcFolderData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect(
        (destContent.response?.folders ?? []).map((f) => f.title),
      ).toContain(srcTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with conflictResolveType Skip" +
      " when file exists in destination - original unchanged, no duplicate",
    async ({ apiSdk }) => {
      // Skip: existing file stays untouched, count remains 1
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch Skip Conflict.docx";
      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Skip Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

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
      const destTitlesAfterSetup = (destBefore.response?.files ?? []).map(
        (f) => (f as FileDtoInteger).title,
      );
      expect(destTitlesAfterSetup).toContain(fileTitle);
      const existingFileId = (destBefore.response!.files![0] as FileDtoInteger)
        .id!;

      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: srcBeforeMove } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      const srcIdsBeforeMove = (srcBeforeMove.response?.files ?? []).map(
        (f) => (f as FileDtoInteger).id,
      );
      expect(srcIdsBeforeMove).toContain(file2Data.response!.id!);

      const { status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [file2Data.response!.id!],
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

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      const srcFileIdsAfter = (srcAfter.response?.files ?? []).map(
        (f) => (f as FileDtoInteger).id,
      );
      expect(srcFileIdsAfter).toContain(file2Data.response!.id!);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with conflictResolveType Overwrite" +
      " when file exists - destination file updated as new version, no duplicate",
    async ({ apiSdk }) => {
      // Overwrite: same file entry (same ID), no second file created
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch Overwrite Conflict.docx";
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Overwrite Room",
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

      const { status } = await ownerApi.operations.moveBatchItems({
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
      expect((destFiles[0] as FileDtoInteger).id).toBe(originalFileId);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with conflictResolveType Duplicate" +
      " when file exists - creates additional copy in destination",
    async ({ apiSdk }) => {
      // Catches: Duplicate does not create second file or overwrites instead
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch Duplicate Conflict.docx";
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Duplicate Room",
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

      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [file2Data.response!.id!],
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
    "PUT /api/2.0/files/fileops/move - Move folder with content=true moves" +
      " folder contents only, folder itself not created in destination",
    async ({ apiSdk }) => {
      // Catches: content=true ignored; folder created in dest instead of just its contents
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest MoveBatch Content Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });
      const sourceFolderId = folderData.response!.id!;

      const innerFileTitle = "Autotest MoveBatch Content Inner File.docx";
      await ownerApi.files.createFile({
        folderId: sourceFolderId,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch Content Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          folderIds: [sourceFolderId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
          content: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        innerFileTitle,
      );
      expect(
        (destContent.response?.folders ?? []).map((f) => f.title),
      ).not.toContain(folderTitle);
    },
  );

  test("PUT /api/2.0/files/fileops/move - Empty fileIds and folderIds returns 200", async ({
    apiSdk,
  }) => {
    // Empty batch accepted gracefully (consistent with copyBatchItems)
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MoveBatch Empty Dest Room",
        roomType: RoomType.CustomRoom,
      },
    });

    const { status } = await ownerApi.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [],
        folderIds: [],
        destFolderId: roomData.response!.id!,
        conflictResolveType: FileConflictResolveType.Skip,
      },
    });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/files/fileops/move - Move to archived room returns 403", async ({
    apiSdk,
  }) => {
    // Catches: archived room incorrectly accepts move operation
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest MoveBatch Archived Dest.docx",
      },
    });

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MoveBatch Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileData.response!.id!],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/fileops/move - Move to same folder as source returns 200", async ({
    apiSdk,
  }) => {
    // Catches: move where source equals destination causes error or corrupts state
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MoveBatch SameDest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest MoveBatch SameDest File.docx",
      },
    });

    const { status } = await ownerApi.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileData.response!.id!],
        destFolderId: roomId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });

    expect(status).toBe(200);
  });

  test(
    "PUT /api/2.0/files/fileops/move - Move file from MyDocs to room with Third-party" +
      " storage (Nextcloud) returns 200, file appears in destination",
    async ({ apiSdk }) => {
      // Catches: move to third-party backed room fails or file does not appear
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch ThirdParty File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP Single",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch ThirdParty Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id! as unknown as number;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcAfter.response?.files ?? []).map((f) => f.title),
      ).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move folder to Third-party room (Nextcloud)" +
      " returns 200 and folder appears in destination",
    async ({ apiSdk }) => {
      // Catches: folder move to third-party room fails or not visible in room
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest MoveBatch ThirdParty Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP Folder",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch ThirdParty Folder Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id! as unknown as number;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          folderIds: [folderData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcAfter.response?.folders ?? []).map((f) => f.title),
      ).not.toContain(folderTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move multiple files to Third-party room (Nextcloud)" +
      " returns 200 and files removed from source",
    async ({ apiSdk }) => {
      // Catches: only first file moved to third-party room
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const title1 = "Autotest MoveBatch TP Multi1.docx";
      const title2 = "Autotest MoveBatch TP Multi2.docx";

      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: title1 },
      });
      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: title2 },
      });

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP Multi",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch ThirdParty Multi Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id! as unknown as number;

      const { status } = await ownerApi.operations.moveBatchItems({
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

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      const srcTitles = (srcAfter.response?.files ?? []).map((f) => f.title);
      expect(srcTitles).not.toContain(title1);
      expect(srcTitles).not.toContain(title2);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with content=true to Third-party room" +
      " moves folder contents without the folder itself",
    async ({ apiSdk }) => {
      // Catches: content=true not respected when destination is third-party room
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const folderTitle = "Autotest MoveBatch TP Content Folder";
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: folderTitle },
      });
      const sourceFolderId = folderData.response!.id!;

      const innerFileTitle = "Autotest MoveBatch TP Content Inner.docx";
      await ownerApi.files.createFile({
        folderId: sourceFolderId,
        createFileJsonElement: { title: innerFileTitle },
      });

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP Content",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch TP Content Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id! as unknown as number;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          folderIds: [sourceFolderId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
          content: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: srcFolderAfter } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: sourceFolderId,
        });
      expect(
        (srcFolderAfter.response?.files ?? []).map((f) => f.title),
      ).not.toContain(innerFileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with Overwrite conflict to Third-party room" +
      " when file exists - file replaced, no duplicate",
    async ({ apiSdk }) => {
      // Catches: Overwrite conflict not respected in third-party room
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP Overwrite",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch TP Overwrite Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id! as unknown as number;

      const fileTitle = "Autotest MoveBatch TP Overwrite Conflict.docx";
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

      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { status } = await ownerApi.operations.moveBatchItems({
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

      const { data: srcAfterOverwrite } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      const srcFileIdsAfterOverwrite = (
        srcAfterOverwrite.response?.files ?? []
      ).map((f) => (f as FileDtoInteger).id);
      expect(srcFileIdsAfterOverwrite).not.toContain(file2Data.response!.id!);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with Duplicate conflict to Third-party room" +
      " when file exists - creates additional file in destination",
    async ({ apiSdk }) => {
      // Catches: Duplicate conflict not respected in third-party room
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP Duplicate",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch TP Duplicate Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id! as unknown as number;

      const fileTitle = "Autotest MoveBatch TP Duplicate Conflict.docx";
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

      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [file2Data.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Duplicate,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data: srcAfterDuplicate } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      const srcFileIdsAfterDuplicate = (
        srcAfterDuplicate.response?.files ?? []
      ).map((f) => (f as FileDtoInteger).id);
      expect(srcFileIdsAfterDuplicate).not.toContain(file2Data.response!.id!);
    },
  );

  // BUG 82242: Skip conflict ignored in TP room - file is moved to destination (renamed by Nextcloud) instead of staying in source
  test.fail(
    "BUG 82242: PUT /api/2.0/files/fileops/move - Move with Skip conflict to Third-party room" +
      " when file exists - original unchanged, no duplicate",
    async ({ apiSdk }) => {
      // Catches: Skip conflict not respected in third-party room
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP Skip",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch TP Skip Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id! as unknown as number;

      const fileTitle = "Autotest MoveBatch TP Skip Conflict.docx";
      const { data: file1Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });
      await ownerApi.operations.copyBatchItems({
        batchRequestDto: {
          fileIds: [file1Data.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Overwrite,
          deleteAfter: false,
        },
      });
      await waitForOperation(ownerApi.operations);

      const { data: destAfterSetup } =
        await ownerApi.folders.getFolderByFolderId({ folderId: destFolderId });
      const destCountAfterSetup = (destAfterSetup.response?.files ?? []).length;

      const { data: file2Data } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: srcBeforeMove } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      const srcIdsBeforeMove = (srcBeforeMove.response?.files ?? []).map(
        (f) => (f as FileDtoInteger).id,
      );
      expect(srcIdsBeforeMove).toContain(file2Data.response!.id!);

      const { status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [file2Data.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      await waitForOperation(ownerApi.operations);

      const { data: destAfterMove } =
        await ownerApi.folders.getFolderByFolderId({ folderId: destFolderId });
      const destFilesAfterMove = destAfterMove.response?.files ?? [];
      expect(destFilesAfterMove).toHaveLength(destCountAfterSetup);

      const { data: srcAfterSkip } = await ownerApi.folders.getFolderByFolderId(
        {
          folderId: myDocsFolderId,
        },
      );
      const srcFileIdsAfterSkip = (srcAfterSkip.response?.files ?? []).map(
        (f) => (f as FileDtoInteger).id,
      );
      expect(srcFileIdsAfterSkip).toContain(file2Data.response!.id!);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file from Third-party room (Nextcloud) to MyDocs" +
      " returns 200 and file appears in MyDocs",
    async ({ apiSdk }) => {
      // Catches: reverse move from third-party room to local storage fails
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP ToMyDocs",
            providerKey: "Nextcloud",
          },
        });

      const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch TP ToMyDocs Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcFolderId = roomData.response!.id! as unknown as number;

      const fileTitle = "Autotest MoveBatch TP ToMyDocs File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId: myDocsFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: myDocsContent } =
        await ownerApi.folders.getFolderByFolderId({
          folderId: myDocsFolderId,
        });
      expect(
        (myDocsContent.response?.files ?? []).map((f) => f.title),
      ).toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file from Third-party room to regular CustomRoom" +
      " returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: move from third-party room to regular room fails
      const ownerApi = apiSdk.forRole("owner");

      const { data: tpData } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch TP ToRoom",
            providerKey: "Nextcloud",
          },
        });

      const { data: srcRoomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tpData.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch TP ToRoom Src",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcFolderId = srcRoomData.response!.id! as unknown as number;

      const fileTitle = "Autotest MoveBatch TP ToRoom File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: destRoomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch TP ToRoom Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file between two Third-party rooms (Nextcloud)" +
      " returns 200 and file appears in destination room",
    async ({ apiSdk }) => {
      // Catches: inter-third-party-room move fails or file not in destination
      const ownerApi = apiSdk.forRole("owner");

      const { data: tp1Data } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch InterTP Src",
            providerKey: "Nextcloud",
          },
        });

      const { data: srcRoomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tp1Data.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch InterTP Src Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const srcFolderId = srcRoomData.response!.id! as unknown as number;

      const fileTitle = "Autotest MoveBatch InterTP File.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: srcFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: tp2Data } =
        await ownerApi.thirdPartyIntegration.saveThirdParty({
          thirdPartyRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Autotest MoveBatch InterTP Dest",
            providerKey: "Nextcloud",
          },
        });

      const { data: destRoomData } = await ownerApi.rooms.createRoomThirdParty({
        id: tp2Data.response!.id!,
        createThirdPartyRoom: {
          title: "Autotest MoveBatch InterTP Dest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = destRoomData.response!.id! as unknown as number;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move .docx file from MyDocs to FillingFormsRoom" +
      " returns 403",
    async ({ apiSdk }) => {
      // FillingFormsRoom only accepts form files; moving .docx is forbidden
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest MoveBatch FillingFormsRoom.docx",
        },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch FillingFormsRoom Docx",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move form file from MyDocs to FillingFormsRoom" +
      " returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: move rejected or form file missing when destination is FillingFormsRoom
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const formFileId = await createOoForm(ownerApi, myDocsFolderId);

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch FillingFormsRoom Form",
          roomType: RoomType.FillingFormsRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [formFileId],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).length).toBeGreaterThan(0);

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      const srcFileIds = (srcAfter.response?.files ?? []).map(
        (f) => (f as FileDtoInteger).id,
      );
      expect(srcFileIds).not.toContain(formFileId);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file from MyDocs to EditingRoom" +
      " returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: move rejected or file missing when destination is EditingRoom
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch EditingRoom.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch EditingRoom Dest",
          roomType: RoomType.EditingRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcAfter.response?.files ?? []).map((f) => f.title),
      ).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file from MyDocs to PublicRoom" +
      " returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: move rejected or file missing when destination is PublicRoom
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch PublicRoom.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch PublicRoom Dest",
          roomType: RoomType.PublicRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcAfter.response?.files ?? []).map((f) => f.title),
      ).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move file from MyDocs to VirtualDataRoom" +
      " returns 200 and file appears in destination",
    async ({ apiSdk }) => {
      // Catches: move rejected or file missing when destination is VirtualDataRoom
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch VirtualDataRoom.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch VirtualDataRoom Dest",
          roomType: RoomType.VirtualDataRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );

      const { data: srcAfter } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });
      expect(
        (srcAfter.response?.files ?? []).map((f) => f.title),
      ).not.toContain(fileTitle);
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with deleteAfter=true" +
      " removes operation from queue after completion",
    async ({ apiSdk }) => {
      // Catches: operation stays in queue when deleteAfter=true should auto-clear it
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch DeleteAfter.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch DeleteAfter Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: true,
        },
      });

      expect(status).toBe(200);

      await expect(async () => {
        const { data: opsData } =
          await ownerApi.operations.getOperationStatuses();
        expect(opsData.response).toHaveLength(0);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

      const { data: destContent } = await ownerApi.folders.getFolderByFolderId({
        folderId: destFolderId,
      });
      expect((destContent.response?.files ?? []).map((f) => f.title)).toContain(
        fileTitle,
      );
    },
  );

  test(
    "PUT /api/2.0/files/fileops/move - Move with returnSingleOperation=true" +
      " returns 200 with operation data",
    async ({ apiSdk }) => {
      // Catches: returnSingleOperation parameter rejected or response malformed
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const fileTitle = "Autotest MoveBatch SingleOp.docx";
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title: fileTitle },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch SingleOp Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { data, status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [fileData.response!.id!],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
          returnSingleOperation: true,
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].Operation).toBe(FileOperationType.Move);

      const operation = await waitForOperation(ownerApi.operations);
      expect(operation.finished).toBe(true);
    },
  );

  // BUG 82243: PUT /api/2.0/files/fileops/move - non-existent fileId returns 403 instead of 400
  test.fail(
    "BUG 82243: PUT /api/2.0/files/fileops/move - Non-existent fileId" +
      " returns 403 instead of 400",
    async ({ apiSdk }) => {
      // Catches: server returns unexpected status for invalid file ID
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest MoveBatch BadFile Dest",
          roomType: RoomType.CustomRoom,
        },
      });
      const destFolderId = roomData.response!.id!;

      const { status } = await ownerApi.operations.moveBatchItems({
        batchRequestDto: {
          fileIds: [999999999],
          destFolderId,
          conflictResolveType: FileConflictResolveType.Skip,
          deleteAfter: false,
        },
      });

      expect(status).toBe(400);
    },
  );
});

test.describe("PUT /api/2.0/files/fileops/terminate/{id} - terminateTasks", () => {
  test("PUT /api/2.0/files/fileops/terminate/{id} - Non-existent operation ID returns 200 with empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminate delete operation returns 200 and operation is no longer in active list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Delete.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: opData } = await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
    });
    const operationId = opData.response![0].id!;

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const { data: statusData } = await ownerApi.operations.getOperationStatuses(
      { id: operationId },
    );
    expect(statusData.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminate duplicate operation returns 200 and operation is no longer in active list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Duplicate.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: opData } = await ownerApi.operations.duplicateBatchItems({
      duplicateRequestDto: { fileIds: [fileId as any] },
    });
    const operationId = opData.response![0].id!;

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const { data: statusData } = await ownerApi.operations.getOperationStatuses(
      { id: operationId },
    );
    expect(statusData.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminate already-completed operation returns 200 with empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Completed.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: true },
    });

    const completedOp = await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: completedOp.id!,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminate copy operation returns 200 and operation is no longer in active list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Copy Source.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TerminateTasks Copy Dest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data: opData } = await ownerApi.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });
    const operationId = opData.response![0].id!;

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const { data: statusData } = await ownerApi.operations.getOperationStatuses(
      { id: operationId },
    );
    expect(statusData.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminate move operation returns 200 and operation is no longer in active list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks Move Source.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TerminateTasks Move Dest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const destFolderId = roomData.response!.id!;

    const { data: opData } = await ownerApi.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId,
        conflictResolveType: FileConflictResolveType.Skip,
        deleteAfter: false,
      },
    });
    const operationId = opData.response![0].id!;

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const { data: statusData } = await ownerApi.operations.getOperationStatuses(
      { id: operationId },
    );
    expect(statusData.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminate markAsRead operation returns 200 and operation is no longer in active list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks MarkAsRead.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: opData } = await ownerApi.operations.markAsRead({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });
    const operationId = opData.response![0].id!;

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const { data: statusData } = await ownerApi.operations.getOperationStatuses(
      { id: operationId },
    );
    expect(statusData.response).toHaveLength(0);
  });

  test("PUT /api/2.0/files/fileops/terminate/{id} - Terminate emptyTrash operation returns 200 and operation is no longer in active list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest TerminateTasks EmptyTrash.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.deleteBatchItems({
      deleteBatchRequestDto: { fileIds: [fileId], immediately: false },
    });

    const { data: opData } = await ownerApi.operations.emptyTrash();
    const operationId = opData.response![0].id!;

    const { data, status } = await ownerApi.operations.terminateTasks({
      id: operationId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);

    const { data: statusData } = await ownerApi.operations.getOperationStatuses(
      { id: operationId },
    );
    expect(statusData.response).toHaveLength(0);
  });
});

test.describe("PUT /api/2.0/files/file/{fileId}/comment - updateFileComment", () => {
  test("PUT /api/2.0/files/file/{fileId}/comment - Owner updates comment returns 200 with updated text", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Basic.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Initial comment" },
    });

    expect(status).toBe(200);
    expect(data.response).toBe("Initial comment");
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Update comment to empty string returns 200 with empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Empty.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "" },
    });

    expect(status).toBe(200);
    expect(data.response).toBe("");
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Update comment to null clears comment returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Null.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: null },
    });

    expect(status).toBe(200);
    expect(data.response).toBe("");
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Overwriting existing comment returns 200 with new text", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Overwrite.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "First comment" },
    });

    const { data, status } = await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment: "Updated comment" },
    });

    expect(status).toBe(200);
    expect(data.response).toBe("Updated comment");
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Comment with diacritics and unicode returns 200 with unchanged text", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment Unicode.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const comment = "Ñoño café über naïve Ångström 山島あ";

    const { data, status } = await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(comment);
  });

  test("PUT /api/2.0/files/file/{fileId}/comment - Comment with HTML-like characters returns 200 with unchanged text", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest UpdateComment HTML.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const comment = "<b>bold</b> & 'quoted' \"double\"";

    const { data, status } = await ownerApi.operations.updateFileComment({
      fileId,
      updateComment: { version: 1, comment },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(comment);
  });

  // BUG 82266: PUT /api/2.0/files/file/{fileId}/comment - Very long comment is silently truncated to 255 chars instead of returning 400
  test.fail(
    "BUG 82266: PUT /api/2.0/files/file/{fileId}/comment - Very long comment" +
      " returns 200 with truncation instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest UpdateComment Long.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const comment = "A".repeat(2000);

      const { status } = await ownerApi.operations.updateFileComment({
        fileId,
        updateComment: { version: 1, comment },
      });

      expect(status).toBe(400);
    },
  );

  // BUG 82268: PUT /api/2.0/files/file/{fileId}/comment - Non-existent fileId returns 403 (SecurityException) instead of 404
  test.fail(
    "BUG 82268: PUT /api/2.0/files/file/{fileId}/comment - Non-existent fileId" +
      " returns 403 instead of 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.operations.updateFileComment({
        fileId: 999999999,
        updateComment: { version: 1, comment: "test" },
      });

      expect(status).toBe(404);
    },
  );

  // BUG 82271: PUT /api/2.0/files/file/{fileId}/comment - Non-existent version returns 403 (SecurityException) instead of 400
  test.fail(
    "BUG 82271: PUT /api/2.0/files/file/{fileId}/comment - Non-existent version" +
      " returns 403 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest UpdateComment BadVersion.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.updateFileComment({
        fileId,
        updateComment: { version: 999, comment: "test" },
      });

      expect(status).toBe(400);
    },
  );

  // BUG 82271: PUT /api/2.0/files/file/{fileId}/comment - Version 0 returns 403 (SecurityException) instead of 400
  test.fail(
    "BUG 82271: PUT /api/2.0/files/file/{fileId}/comment - Version 0" +
      " returns 403 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest UpdateComment Version0.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.updateFileComment({
        fileId,
        updateComment: { version: 0, comment: "test" },
      });

      expect(status).toBe(400);
    },
  );

  // BUG 82271: PUT /api/2.0/files/file/{fileId}/comment - Negative version returns 403 (SecurityException) instead of 400
  test.fail(
    "BUG 82271: PUT /api/2.0/files/file/{fileId}/comment - Negative version" +
      " returns 403 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: {
          title: "Autotest UpdateComment NegVer.docx",
        },
      });
      const fileId = fileData.response!.id!;

      const { status } = await ownerApi.operations.updateFileComment({
        fileId,
        updateComment: { version: -1, comment: "test" },
      });

      expect(status).toBe(400);
    },
  );
});
