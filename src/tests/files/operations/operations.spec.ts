import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileOperationType, RoomType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { createOoForm } from "@/src/helpers/files";

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

    const { status } = await ownerApi.operations.startFileConversion({
      fileId,
      checkConversionRequestDtoInteger: {
        startConvert: true,
        outputType: "pdf",
      },
    });

    expect(status).toBe(200);
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
  });

  test("GET /api/2.0/files/file/{fileId}/checkconversion - Non-existent fileId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.operations.checkConversionStatus({
      fileId: 999999999,
    });

    expect(status).toBe(404);
  });
});
