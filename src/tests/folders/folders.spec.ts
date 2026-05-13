import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FileShare,
  FilterType,
  FoldersApi,
  RoomType,
  SortOrder,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { uploadFileToFolder } from "@/src/helpers/upload-file";

function getFolderSortedByCustomOrder(folders: FoldersApi, folderId: number) {
  return folders.getFolderByFolderId({
    folderId,
    sortBy: "10", // sortBy: CustomOrder
    sortOrder: SortOrder.Ascending,
  });
}

test.describe("POST /files/folder/:folderId - Create folder", () => {
  test("POST /files/folder/:folderId - Owner creates a folder in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Folder Creation",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Folder");
    expect(data.response!.parentId).toBe(roomId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });

  test("POST /files/folder/:folderId - Owner creates a folder in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder In My Docs" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Folder In My Docs");
    expect(data.response!.parentId).toBe(myDocsFolderId);
    expect(data.response!.id!).toBeGreaterThan(0);
  });
});

test.describe("PUT /files/folder/:folderId/order - Set folder order", () => {
  test("PUT /files/folder/:folderId/order - Sets order for a folder in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder For Order" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.setFolderOrder({
      folderId,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });
});

test.describe("DELETE /api/2.0/files/folder/:folderId - Delete folder", () => {
  test("DELETE /api/2.0/files/folder/:folderId - Owner deletes folder immediately (immediately: true)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder To Delete Immediately" },
    });
    const folderId = folderData.response!.id!;

    await test.step("DELETE folder (immediately: true)  -  operation is created", async () => {
      const { data, status } = await ownerApi.folders.deleteFolder({
        folderId,
        deleteFolder: { deleteAfter: true, immediately: true },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.count).toBeGreaterThan(0);

      const operation = data.response![0];
      expect(operation.id).toBeDefined();
      expect(typeof operation.progress).toBe("number");
      expect(typeof operation.finished).toBe("boolean");
      expect(operation.error).toBeFalsy();
    });

    await test.step("DELETE folder  -  folder no longer accessible after deletion", async () => {
      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - Owner moves folder to trash (immediately: false)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const folderTitle = "Autotest Folder To Trash";
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: folderTitle },
    });
    const folderId = folderData.response!.id!;

    await test.step("DELETE folder (immediately: false)  -  operation is created", async () => {
      const { data, status } = await ownerApi.folders.deleteFolder({
        folderId,
        deleteFolder: { deleteAfter: true, immediately: false },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.count).toBeGreaterThan(0);

      const operation = data.response![0];
      expect(operation.id).toBeDefined();
      expect(typeof operation.progress).toBe("number");
      expect(typeof operation.finished).toBe("boolean");
      expect(operation.error).toBeFalsy();
    });

    await test.step("DELETE folder  -  folder appears in trash, not permanently deleted", async () => {
      await expect(async () => {
        const { data, status } = await ownerApi.folders.getTrashFolder();
        expect(status).toBe(200);
        const trashFolders = data.response?.folders ?? [];
        const found = trashFolders.some((f) => f.title === folderTitle);
        expect(found).toBe(true);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - Owner deletes folder created by DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Cross-User Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    // Invite DocSpaceAdmin to the room with ContentCreator access (11)
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: 11 }],
        notify: false,
      },
    });

    const { data: folderData } = await adminApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Created By DocSpaceAdmin" },
    });
    const folderId = folderData.response!.id!;

    await test.step("Owner deletes DocSpaceAdmin's folder  -  operation is created", async () => {
      const { data, status } = await ownerApi.folders.deleteFolder({
        folderId,
        deleteFolder: { deleteAfter: true, immediately: true },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.count).toBeGreaterThan(0);

      const operation = data.response![0];
      expect(operation.id).toBeDefined();
      expect(typeof operation.progress).toBe("number");
      expect(typeof operation.finished).toBe("boolean");
      expect(operation.error).toBeFalsy();
    });

    await test.step("Owner deletes DocSpaceAdmin's folder  -  folder no longer accessible", async () => {
      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - Owner deletes folder inside a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Folder Delete In Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder In Room" },
    });
    const folderId = folderData.response!.id!;

    await test.step("DELETE folder in room  -  operation is created", async () => {
      const { data, status } = await ownerApi.folders.deleteFolder({
        folderId,
        deleteFolder: { deleteAfter: true, immediately: true },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.count).toBeGreaterThan(0);

      const operation = data.response![0];
      expect(operation.id).toBeDefined();
      expect(typeof operation.progress).toBe("number");
      expect(typeof operation.finished).toBe("boolean");
      expect(operation.error).toBeFalsy();
    });

    await test.step("DELETE folder in room  -  folder no longer accessible", async () => {
      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - Owner deletes folder with nested subfolders", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: parentData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Parent Folder" },
    });
    const parentId = parentData.response!.id!;

    const { data: childData } = await ownerApi.folders.createFolder({
      folderId: parentId,
      createFolder: { title: "Autotest Child Folder" },
    });
    const childId = childData.response!.id!;

    await test.step("DELETE parent folder  -  operation is created", async () => {
      const { data, status } = await ownerApi.folders.deleteFolder({
        folderId: parentId,
        deleteFolder: { deleteAfter: true, immediately: true },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.count).toBeGreaterThan(0);

      const operation = data.response![0];
      expect(operation.id).toBeDefined();
      expect(typeof operation.progress).toBe("number");
      expect(typeof operation.finished).toBe("boolean");
      expect(operation.error).toBeFalsy();
    });

    await test.step("DELETE parent folder  -  parent and child both inaccessible", async () => {
      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId: parentId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

      const { status: childStatus } =
        await ownerApi.folders.getFolderByFolderId({ folderId: childId });
      expect(childStatus).not.toBe(200);
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - Owner deletes folder with files inside", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder With Files" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest File Inside Folder" },
    });

    await test.step("DELETE folder with files  -  operation is created", async () => {
      const { data, status } = await ownerApi.folders.deleteFolder({
        folderId,
        deleteFolder: { deleteAfter: true, immediately: true },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      expect(data.response!.length).toBeGreaterThan(0);
      expect(data.count).toBeGreaterThan(0);

      const operation = data.response![0];
      expect(operation.id).toBeDefined();
      expect(typeof operation.progress).toBe("number");
      expect(typeof operation.finished).toBe("boolean");
      expect(operation.error).toBeFalsy();
    });

    await test.step("DELETE folder with files  -  folder no longer accessible", async () => {
      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("BUG 79459: DELETE /api/2.0/files/folder/:folderId - Deleting already deleted folder returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder For Double Delete" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    await expect(async () => {
      const { status } = await ownerApi.folders.getFolderByFolderId({
        folderId,
      });
      expect(status).not.toBe(200);
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

    const { status } = await ownerApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(404);
  });

  test("BUG 79459: DELETE /api/2.0/files/folder/:folderId - Deleting non-existent folder returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const nonExistentFolderId = 999999999;

    const { status } = await ownerApi.folders.deleteFolder({
      folderId: nonExistentFolderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(404);
  });
});

test.describe("POST /files/{folderId}/upload/check - Check file uploads", () => {
  // Catches: API returns non-empty response or wrong status when none of the given titles exist in the folder
  test("POST /files/{folderId}/upload/check - New file titles return empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: {
        filesTitle: ["Brand New File.docx", "Another New File.xlsx"],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toEqual([]);
  });

  // Catches: API does not detect conflict when a file with the same title already exists in the folder
  test("POST /files/{folderId}/upload/check - Existing file title is returned as conflict", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Conflict",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Existing File.docx" },
    });
    const existingTitle = fileData.response!.title!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: [existingTitle] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(existingTitle);
    expect(data.count).toBe(1);
  });

  // Catches: API includes non-conflicting titles in the response or omits conflicting ones
  test("POST /files/{folderId}/upload/check - Mixed titles: only conflicting names are returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Mixed",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Conflicting File.docx" },
    });
    const existingTitle = fileData.response!.title!;
    const newTitle = "Brand New Non-Conflicting File.docx";

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: [existingTitle, newTitle] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(existingTitle);
    expect(data.response).not.toContain(newTitle);
    expect(data.response!.length).toBe(1);
    expect(data.count).toBe(1);
  });

  // Catches: API returns wrong count or misses some conflicts when multiple files already exist in the folder
  test("POST /files/{folderId}/upload/check - Multiple existing titles all returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Multiple",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: file1Data } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest File One.docx" },
    });
    const { data: file2Data } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest File Two.docx" },
    });
    const title1 = file1Data.response!.title!;
    const title2 = file2Data.response!.title!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: [title1, title2] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(title1);
    expect(data.response).toContain(title2);
    expect(data.response!.length).toBe(2);
    expect(data.count).toBe(2);
  });

  // Catches: API crashes or returns non-empty response for empty filesTitle array
  test("POST /files/{folderId}/upload/check - Empty filesTitle array returns empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Empty",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: [] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toEqual([]);
  });

  // Catches: API crashes or returns non-empty response when filesTitle is explicitly null
  test("POST /files/{folderId}/upload/check - filesTitle null returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Null",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: null },
    });

    expect(status).toBe(400);
    expect(data.statusCode).toBe(400);
  });

  // Catches: API does not detect conflict when checking a subfolder (not a room root)
  test("POST /files/{folderId}/upload/check - Conflict detected in subfolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Subfolder",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: subfolderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder For Check" },
    });
    const subfolderId = subfolderData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: subfolderId,
      createFileJsonElement: { title: "Autotest File In Subfolder.docx" },
    });
    const existingTitle = fileData.response!.title!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId: subfolderId,
      checkUploadRequest: { filesTitle: [existingTitle] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(existingTitle);
    expect(data.count).toBe(1);
  });

  // Catches: API returns duplicate entries when the same title appears multiple times in the request
  test("BUG 81365: POST /files/{folderId}/upload/check - Duplicate titles in request return single conflict", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolderData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Dup File.docx" },
    });
    const existingTitle = fileData.response!.title!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: [existingTitle, existingTitle] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(existingTitle);
    expect(data.response!.length).toBe(1);
    expect(data.count).toBe(1);
  });

  // Catches: API misses conflict when title casing differs from the stored file name
  test("POST /files/{folderId}/upload/check - Conflict check is case-insensitive", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Case",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Case File.docx" },
    });

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["autotest case file.docx"] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBe(1);
  });

  // Catches: API returns 500 or unexpected error instead of 404 for non-existent folderId
  test("BUG 81330: POST /files/{folderId}/upload/check - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId: 999999999,
      checkUploadRequest: { filesTitle: ["Some File.docx"] },
    });

    expect(status).toBe(404);
    expect(data.statusCode).toBe(404);
  });

  // Catches: API returns 500 or 200 with empty data instead of 400 when filesTitle is absent from request body
  test("BUG 81331: POST /files/{folderId}/upload/check - Request without filesTitle returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check No Body",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: {},
    });

    expect(status).toBe(400);
    expect(data.statusCode).toBe(400);
  });

  test("POST /files/{folderId}/upload/check - Conflict detected in My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myFolderData } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolderData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest My Docs File.docx" },
    });
    const existingTitle = fileData.response!.title!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: [existingTitle] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(existingTitle);
    expect(data.response!.length).toBe(1);
    expect(data.count).toBe(1);
  });
});

test.describe("GET /files/:folderId/formfilter - Get folder form filter", () => {
  test("GET /files/:folderId/formfilter - Owner gets form filter for empty folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Form Filter Empty",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Empty Folder For Filter" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolder({ folderId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toEqual([]);
  });

  test("GET /files/:folderId/formfilter - Folder with regular files (no forms) returns empty filter", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder With Uploaded Files" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Uploaded Doc" },
    });
    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Uploaded Doc 2" },
    });

    const { data, status } = await ownerApi.folders.getFolder({ folderId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response).toEqual([]);
  });

  test("GET /files/:folderId/formfilter - Folder with many files returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Busy Folder Filter",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Busy Folder" },
    });
    const folderId = folderData.response!.id!;

    for (let i = 1; i <= 10; i++) {
      await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: `Autotest File ${i}` },
      });
    }

    const { data, status } = await ownerApi.folders.getFolder({ folderId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/:folderId/formfilter - Non-existent folderId returns 200 with empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getFolder({
      folderId: 999999999,
    });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /files/:folderId/formfilter - Deleted folder returns 200 with empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder For Filter After Delete" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    await expect(async () => {
      const { status } = await ownerApi.folders.getFolderByFolderId({
        folderId,
      });
      expect(status).not.toBe(200);
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

    const { data, status } = await ownerApi.folders.getFolder({ folderId });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /files/:folderId/formfilter - Recent folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: recentData } = await ownerApi.folders.getRecentFolder({});
    const recentFolderId = recentData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolder({
      folderId: recentFolderId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/:folderId/formfilter - Favorites folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const favoritesFolderId = favData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolder({
      folderId: favoritesFolderId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("GET /api/2.0/files/folder/:folderId - Get folder information", () => {
  test("GET /api/2.0/files/folder/:folderId - Owner gets folder info with correct id and title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Folder Info",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder For Info" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(folderId);
    expect(data.response!.title).toBe("Autotest Folder For Info");
  });

  test("GET /api/2.0/files/folder/:folderId - parentId points to correct parent folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Parent Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Parent Check" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.response!.parentId).toBe(roomId);
  });

  test("GET /api/2.0/files/folder/:folderId - filesCount and foldersCount reflect actual contents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Count Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Count Check" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest File 1" },
    });
    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest File 2" },
    });
    await ownerApi.folders.createFolder({
      folderId,
      createFolder: { title: "Autotest Subfolder" },
    });

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.response!.filesCount).toBe(2);
    expect(data.response!.foldersCount).toBe(1);
  });

  test("GET /api/2.0/files/folder/:folderId - Empty folder returns filesCount 0 and foldersCount 0", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Empty Folder Info",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Empty Folder Info" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.response!.filesCount).toBe(0);
    expect(data.response!.foldersCount).toBe(0);
  });

  test("GET /api/2.0/files/folder/:folderId - Room returns correct roomType", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Type Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.roomType).toBe(RoomType.CustomRoom);
  });

  // BUG 81459: GET /api/2.0/files/folder/:folderId returns 403 instead of 404 when folder is not found
  // (non-existent or deleted). Actual response: { "error": { "message": "The required folder was not found",
  // "type": "System.InvalidOperationException" }, "statusCode": 403 }
  test.fail(
    "BUG 81459: GET /api/2.0/files/folder/:folderId - Non-existent folderId returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.folders.getFolderInfo({
        folderId: 999999999,
      });

      expect(status).toBe(404);
    },
  );

  test.fail(
    "BUG 81459: GET /api/2.0/files/folder/:folderId - Deleted folder returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest Folder For Info After Delete" },
      });
      const folderId = folderData.response!.id!;

      await ownerApi.folders.deleteFolder({
        folderId,
        deleteFolder: { deleteAfter: true, immediately: true },
      });

      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

      const { status } = await ownerApi.folders.getFolderInfo({ folderId });

      expect(status).toBe(404);
    },
  );

  test("GET /api/2.0/files/folder/:folderId - My Documents virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({
      folderId: myDocsFolderId,
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(myDocsFolderId);
  });

  test("GET /api/2.0/files/folder/:folderId - Trash virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: trashData } = await ownerApi.folders.getTrashFolder();
    const trashFolderId = trashData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({
      folderId: trashFolderId,
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(trashFolderId);
  });

  test("GET /api/2.0/files/folder/:folderId - Recent virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: recentData } = await ownerApi.folders.getRecentFolder({});
    const recentFolderId = recentData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({
      folderId: recentFolderId,
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(recentFolderId);
  });

  test("GET /api/2.0/files/folder/:folderId - Favorites virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const favoritesFolderId = favData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({
      folderId: favoritesFolderId,
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(favoritesFolderId);
  });

  test("GET /api/2.0/files/folder/:folderId - Folder with many files returns correct filesCount", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Many Files Info",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Many Files" },
    });
    const folderId = folderData.response!.id!;

    for (let i = 1; i <= 10; i++) {
      await ownerApi.files.createFile({
        folderId,
        createFileJsonElement: { title: `Autotest File ${i}` },
      });
    }

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.response!.filesCount).toBe(10);
  });

  test("GET /api/2.0/files/folder/:folderId - Folder with regular uploaded files returns 200 with correct fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Uploaded Files Info" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Uploaded Doc 1" },
    });
    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Uploaded Doc 2" },
    });

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.filesCount).toBe(2);
    expect(data.response!.createdBy).toBeDefined();
  });
});

test.describe("GET /api/2.0/files/:folderId/subfolders - Get subfolders", () => {
  test("GET /api/2.0/files/:folderId/subfolders - Returns subfolders with correct titles", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Subfolders Titles",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const title1 = "Autotest Subfolder Alpha";
    const title2 = "Autotest Subfolder Beta";
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: title1 },
    });
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: title2 },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    const titles = data.response!.map((f) => f.title);
    expect(titles).toContain(title1);
    expect(titles).toContain(title2);
  });

  test("GET /api/2.0/files/:folderId/subfolders - count matches response length", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Subfolders Count",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    for (let i = 1; i <= 3; i++) {
      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: `Autotest Subfolder Count ${i}` },
      });
    }

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(3);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Folder with only files returns empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Files Only Subfolders" },
    });
    const folderId = folderData.response!.id!;
    await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest File Only" },
    });

    const { data, status } = await ownerApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Returns all 10 subfolders", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For 10 Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    for (let i = 1; i <= 10; i++) {
      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: `Autotest Subfolder ${i}` },
      });
    }

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(10);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Returns only direct subfolders not nested ones", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Nested Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: directData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Direct Subfolder" },
    });
    const directId = directData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: directId,
      createFolder: { title: "Autotest Nested Subfolder" },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
    expect(data.response![0].title).toBe("Autotest Direct Subfolder");
  });

  test("GET /api/2.0/files/:folderId/subfolders - My Documents virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const folderId = myDocsData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Trash virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: trashData } = await ownerApi.folders.getTrashFolder();
    const folderId = trashData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Recent virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: recentData } = await ownerApi.folders.getRecentFolder({});
    const folderId = recentData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Favorites virtual folder returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const folderId = favData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // BUG : GET /api/2.0/files/:folderId/subfolders returns 403 instead of 404 when folder is not found
  // (non-existent or deleted). Actual response: { "error": { "message": "Object reference not set to an
  // instance of an object.", "type": "System.InvalidOperationException", "hresult": -2146233079 },
  // "status": 1, "statusCode": 403 }
  test.fail(
    "BUG 81464: GET /api/2.0/files/:folderId/subfolders - Non-existent folderId returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.folders.getFolders({
        folderId: 999999999,
      });

      expect(status).toBe(404);
    },
  );

  test.fail(
    "BUG 81464: GET /api/2.0/files/:folderId/subfolders - Deleted folder returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;
      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest Folder For Subfolders After Delete" },
      });
      const folderId = folderData.response!.id!;

      await ownerApi.folders.deleteFolder({
        folderId,
        deleteFolder: { deleteAfter: true, immediately: true },
      });
      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

      const { status } = await ownerApi.folders.getFolders({ folderId });

      expect(status).toBe(404);
    },
  );

  test("GET /api/2.0/files/:folderId/subfolders - Subfolder in Custom Room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Custom Room For Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In Custom Room" },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Subfolder in Filling Forms Room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Filling Forms Room For Subfolders",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In Filling Forms Room" },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Subfolder in Editing Room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Editing Room For Subfolders",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In Editing Room" },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Subfolder in Public Room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Public Room For Subfolders",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In Public Room" },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Subfolder in Virtual Data Room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest VDR For Subfolders",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In VDR" },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Subfolder in AI Room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest AI Room For Subfolders",
        roomType: RoomType.AiRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In AI Room" },
    });

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Owner gets subfolders of archived room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Archived Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In Archived Room" },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Returns all subfolders when count exceeds 25", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For 30 Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    for (let i = 1; i <= 30; i++) {
      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: `Autotest Subfolder Paged ${i}` },
      });
    }

    const { data, status } = await ownerApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(30);
  });
});

test.describe("GET /files/folder/:folderId/subfolders - Get folders list", () => {
  test("GET /files/folder/:folderId/subfolders - Folders are returned in set order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Order",
        roomType: RoomType.CustomRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderAData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder A" },
    });
    const folderA = folderAData.response!;

    const { data: folderBData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder B" },
    });
    const folderB = folderBData.response!;

    await ownerApi.folders.setFolderOrder({
      folderId: folderA.id!,
      orderRequestDto: { order: 2 },
    });
    await ownerApi.folders.setFolderOrder({
      folderId: folderB.id!,
      orderRequestDto: { order: 1 },
    });

    const { data } = await getFolderSortedByCustomOrder(
      ownerApi.folders,
      roomId,
    );

    const titles = data
      .response!.folders!.map((f) => f.title)
      .filter((t) => t === "Autotest Folder A" || t === "Autotest Folder B");

    expect(titles?.indexOf("Autotest Folder B")).toBeLessThan(
      titles!.indexOf("Autotest Folder A"),
    );
  });
});

test.describe("GET /api/2.0/files/@root - Get root folders", () => {
  test("GET /api/2.0/files/@root - Returns non-empty array of sections with structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getRootFolders({});

    expect(status).toBe(200);
    expect(data.response!.length).toBe(8);
    const titles = data.response!.map((s) => s.current?.title);
    expect(titles).toContain("My documents");
    expect(titles).toContain("Rooms");
    expect(titles).toContain("Trash");
    expect(titles).toContain("Favorites");
    expect(titles).toContain("Recent");
    expect(titles).toContain("Archive");
    expect(titles).toContain("Shared with me");
    expect(titles).toContain("AI agents");
  });

  test("GET /api/2.0/files/@root - Each section has current with id, files, folders, total", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getRootFolders({});

    expect(status).toBe(200);
    for (const section of data.response!) {
      expect(section.current!.id).toBeGreaterThan(0);
      expect(typeof section.current!.title).toBe("string");
      expect(section.current!.security!.Read).toBe(true);
      expect(section.files == null || Array.isArray(section.files)).toBe(true);
      expect(section.folders == null || Array.isArray(section.folders)).toBe(
        true,
      );
      expect(typeof section.total).toBe("number");
      expect(typeof section.startIndex).toBe("number");
    }
  });

  test("GET /api/2.0/files/@root - withoutTrash:true excludes Trash section", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: trashData } = await ownerApi.folders.getTrashFolder();
    const trashId = trashData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getRootFolders({
      withoutTrash: true,
    });

    expect(status).toBe(200);
    const sectionIds = data.response!.map((s) => s.current!.id);
    expect(sectionIds).not.toContain(trashId);
  });

  test("GET /api/2.0/files/@root - Default response includes Trash section", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: trashData } = await ownerApi.folders.getTrashFolder();
    const trashId = trashData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getRootFolders({});

    expect(status).toBe(200);
    const sectionIds = data.response!.map((s) => s.current!.id);
    expect(sectionIds).toContain(trashId);
  });

  test("GET /api/2.0/files/@root - filterType FoldersOnly hides files from My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsId = myDocsData.response!.current!.id!;

    await ownerApi.files.createFile({
      folderId: myDocsId,
      createFileJsonElement: { title: "Autotest File FoldersOnly Root" },
    });
    await ownerApi.folders.createFolder({
      folderId: myDocsId,
      createFolder: { title: "Autotest Subfolder FoldersOnly Root" },
    });

    const { data, status } = await ownerApi.folders.getRootFolders({
      filterType: FilterType.FoldersOnly,
    });

    const myDocsSection = data.response!.find(
      (s) => s.current!.id === myDocsId,
    );
    expect(status).toBe(200);
    expect(myDocsSection).toBeDefined();
    expect(myDocsSection!.files?.length ?? 0).toBe(0);
    const folderTitles = (myDocsSection!.folders ?? []).map((f) => f.title);
    expect(folderTitles).toContain("Autotest Subfolder FoldersOnly Root");
  });

  test("GET /api/2.0/files/@root - filterType FilesOnly hides folders from My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsId = myDocsData.response!.current!.id!;

    await ownerApi.files.createFile({
      folderId: myDocsId,
      createFileJsonElement: { title: "Autotest File FilesOnly Root" },
    });
    await ownerApi.folders.createFolder({
      folderId: myDocsId,
      createFolder: { title: "Autotest Subfolder FilesOnly Root" },
    });

    const { data, status } = await ownerApi.folders.getRootFolders({
      filterType: FilterType.FilesOnly,
    });

    const myDocsSection = data.response!.find(
      (s) => s.current!.id === myDocsId,
    );
    expect(status).toBe(200);
    expect(myDocsSection).toBeDefined();
    expect(myDocsSection!.folders?.length ?? 0).toBe(0);
    const fileTitles = (myDocsSection!.files ?? []).map((f) => f.title);
    expect(
      fileTitles.some((t) => t?.includes("Autotest File FilesOnly Root")),
    ).toBe(true);
  });

  test("GET /api/2.0/files/@root - filterType CustomRooms returns only Custom rooms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const customTitle = "Autotest Custom Room Root Filter";
    const fillingTitle = "Autotest Filling Room Root Filter";

    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: customTitle,
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: fillingTitle,
        roomType: RoomType.FillingFormsRoom,
      },
    });

    const { data, status } = await ownerApi.folders.getRootFolders({
      filterType: FilterType.CustomRooms,
    });

    const allFolders = data.response!.flatMap((s) => s.folders ?? []);

    expect(status).toBe(200);
    const titles = allFolders.map((f) => f.title);
    expect(titles).toContain(customTitle);
    expect(titles).not.toContain(fillingTitle);
  });

  test("GET /api/2.0/files/@root - filterType FillingFormsRooms returns only FillingForms rooms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const fillingTitle = "Autotest Filling Room Root FillingFilter";
    const customTitle = "Autotest Custom Room Root FillingFilter";

    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: fillingTitle,
        roomType: RoomType.FillingFormsRoom,
      },
    });
    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: customTitle,
        roomType: RoomType.CustomRoom,
      },
    });

    const { data, status } = await ownerApi.folders.getRootFolders({
      filterType: FilterType.FillingFormsRooms,
    });

    const allFolders = data.response!.flatMap((s) => s.folders ?? []);

    expect(status).toBe(200);
    const titles = allFolders.map((f) => f.title);
    expect(titles).toContain(fillingTitle);
    expect(titles).not.toContain(customTitle);
  });

  test("GET /api/2.0/files/@root - filterType PublicRooms returns only Public rooms", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const publicTitle = "Autotest Public Room Root PublicFilter";
    const customTitle = "Autotest Custom Room Root PublicFilter";

    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: publicTitle,
        roomType: RoomType.PublicRoom,
      },
    });
    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: customTitle,
        roomType: RoomType.CustomRoom,
      },
    });

    const { data, status } = await ownerApi.folders.getRootFolders({
      filterType: FilterType.PublicRooms,
    });

    const allFolders = data.response!.flatMap((s) => s.folders ?? []);

    expect(status).toBe(200);
    const titles = allFolders.map((f) => f.title);
    expect(titles).toContain(publicTitle);
    expect(titles).not.toContain(customTitle);
  });

  test("GET /api/2.0/files/@root - count:1 limits items per section", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsId = myDocsData.response!.current!.id!;

    for (let i = 1; i <= 3; i++) {
      await ownerApi.files.createFile({
        folderId: myDocsId,
        createFileJsonElement: { title: `Autotest File Root Count ${i}` },
      });
    }

    const { data, status } = await ownerApi.folders.getRootFolders({
      count: 1,
    });

    expect(status).toBe(200);
    for (const section of data.response!) {
      const itemCount =
        (section.files?.length ?? 0) + (section.folders?.length ?? 0);
      expect(itemCount).toBeLessThanOrEqual(1);
    }
    const myDocsSection = data.response!.find(
      (s) => s.current!.id === myDocsId,
    );
    // My documents has 4 files (3 created + 1 default) -- count:1 must limit to exactly 1
    expect(myDocsSection!.total).toBeGreaterThan(1);
    expect(
      (myDocsSection!.files?.length ?? 0) +
        (myDocsSection!.folders?.length ?? 0),
    ).toBe(1);
  });

  test("GET /api/2.0/files/@root - filterValue filters content by title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsId = myDocsData.response!.current!.id!;
    const uniqueTitle = "Autotest FilterValue Unique Root";

    await ownerApi.files.createFile({
      folderId: myDocsId,
      createFileJsonElement: { title: uniqueTitle },
    });
    await ownerApi.files.createFile({
      folderId: myDocsId,
      createFileJsonElement: { title: "Autotest FilterValue Other Root" },
    });

    const { data, status } = await ownerApi.folders.getRootFolders({
      filterValue: uniqueTitle,
    });

    const allFiles = data.response!.flatMap((s) => s.files ?? []);

    expect(status).toBe(200);
    const matchingFiles = allFiles.filter((f) =>
      f.title?.includes(uniqueTitle),
    );
    expect(matchingFiles.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/@root - filterValue with no matches returns zero total across all sections", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getRootFolders({
      filterValue: "zzz_no_match_autotest_xyz_99999",
    });

    expect(status).toBe(200);
    const totalItems = data.response!.reduce(
      (sum, s) => sum + (s.total ?? 0),
      0,
    );
    expect(totalItems).toBe(0);
  });
});

test.describe("GET /api/2.0/files/folder/:folderId/path - Get folder path", () => {
  test("GET /api/2.0/files/folder/:folderId/path - Returns breadcrumb path ending with target folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Path Breadcrumb",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder For Breadcrumb" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Folder For Breadcrumb");
    expect(titles).toContain("Autotest Room For Path Breadcrumb");
    const last = data.response![data.response!.length - 1];
    expect(last.title).toBe("Autotest Folder For Breadcrumb");
  });

  test("GET /api/2.0/files/folder/:folderId/path - Path elements are ordered from root to target", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Nested Path Order",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: parentData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Parent Folder Path Order" },
    });
    const parentId = parentData.response!.id!;

    const { data: childData } = await ownerApi.folders.createFolder({
      folderId: parentId,
      createFolder: { title: "Autotest Child Folder Path Order" },
    });
    const childId = childData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderPath({
      folderId: childId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(2);
    const titles = data.response!.map((e) => e.title);
    const parentIndex = titles.indexOf("Autotest Parent Folder Path Order");
    const childIndex = titles.indexOf("Autotest Child Folder Path Order");
    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(childIndex).toBeGreaterThanOrEqual(0);
    expect(parentIndex).toBeLessThan(childIndex);
  });

  test("GET /api/2.0/files/folder/:folderId/path - Each element has a non-empty title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Path Titles",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Path Titles Check" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);

    for (const element of data.response!) {
      expect(typeof element.title).toBe("string");
      expect(element.title!.length).toBeGreaterThan(0);
    }
  });

  test("GET /api/2.0/files/folder/:folderId/path - Room itself returns path containing the room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room As Path Target",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderPath({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Room As Path Target");
    const last = data.response![data.response!.length - 1];
    expect(last.title).toBe("Autotest Room As Path Target");
  });

  test("GET /api/2.0/files/folder/:folderId/path - Folder in My Documents path includes My documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder MyDocs Path Check" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Folder MyDocs Path Check");
    expect(titles).toContain("My documents");
    const myDocsIndex = titles.indexOf("My documents");
    const folderIndex = titles.indexOf("Autotest Folder MyDocs Path Check");
    expect(myDocsIndex).toBeLessThan(folderIndex);
  });

  test("GET /api/2.0/files/folder/:folderId/path - Folder in archived room returns 200 with path", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Archived Room For Path",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder In Archived Room Path" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Archived Room For Path");
    expect(titles).toContain("Autotest Folder In Archived Room Path");
    const roomIndex = titles.indexOf("Autotest Archived Room For Path");
    const folderIndex = titles.indexOf("Autotest Folder In Archived Room Path");
    expect(roomIndex).toBeLessThan(folderIndex);
  });

  test("GET /api/2.0/files/folder/:folderId/path - Trash virtual folder returns path containing Trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: trashData } = await ownerApi.folders.getTrashFolder();
    const trashFolderId = trashData.response!.current!.id!;
    const trashFolderTitle = trashData.response!.current!.title!;

    const { data, status } = await ownerApi.folders.getFolderPath({
      folderId: trashFolderId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain(trashFolderTitle);
  });

  test("GET /api/2.0/files/folder/:folderId/path - Favorites virtual folder returns path containing Favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: favData } = await ownerApi.folders.getFavoritesFolder({});
    const favoritesFolderId = favData.response!.current!.id!;
    const favoritesFolderTitle = favData.response!.current!.title!;

    const { data, status } = await ownerApi.folders.getFolderPath({
      folderId: favoritesFolderId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain(favoritesFolderTitle);
  });

  test("GET /api/2.0/files/folder/:folderId/path - Recent virtual folder returns path containing Recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: recentData } = await ownerApi.folders.getRecentFolder({});
    const recentFolderId = recentData.response!.current!.id!;
    const recentFolderTitle = recentData.response!.current!.title!;

    const { data, status } = await ownerApi.folders.getFolderPath({
      folderId: recentFolderId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain(recentFolderTitle);
  });

  // BUG 81483: GET /api/2.0/files/folder/:folderId/path returns 403 instead of 404 when folder is not found.
  // Actual response: { "statusCode": 403 }. Same pattern as BUG 81459 and BUG 81464.
  test.fail(
    "BUG 81483: GET /api/2.0/files/folder/:folderId/path - Non-existent folderId returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.folders.getFolderPath({
        folderId: 999999999,
      });

      expect(status).toBe(404);
    },
  );
});

test.describe("GET /api/2.0/files/@favorites - Get favorites folder by file type", () => {
  test("GET /api/2.0/files/@favorites - Text file added to favorites appears in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createTextFile({
      folderId: myDocsFolderId,
      createTextOrHtmlFile: {
        title: "Autotest Favorites Text File.txt",
        content: "hello",
        createNewIfExist: true,
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    expect(Array.isArray(data.response!.files)).toBe(true);
    const titles = data.response!.files!.map((f) => f.title);
    expect(titles).toContain("Autotest Favorites Text File.txt");
  });

  test("GET /api/2.0/files/@favorites - Document (.docx) added to favorites appears with filterType DocumentsOnly", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Favorites Document.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      filterType: FilterType.DocumentsOnly,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response!.files)).toBe(true);
    expect(data.response!.files!.length).toBeGreaterThan(0);
    const titles = data.response!.files!.map((f) => f.title);
    expect(titles).toContain("Autotest Favorites Document.docx");
    expect(data.response!.folders ?? []).toHaveLength(0);
  });

  // BUG 81481: HTML file is counted in response.total (total: 1) but not returned in response.files
  // (files: [], count: 0). toggleFileFavorite returns 200/true -- the file is stored as favorite,
  // but GET /api/2.0/files/@favorites excludes it from the result set. .txt and .docx files
  // are returned correctly. In the UI, HTML files do appear in favorites.
  test.fail(
    "BUG 81481: GET /api/2.0/files/@favorites - HTML file added to favorites appears in response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: fileData, status: createStatus } =
        await ownerApi.files.createHtmlFile({
          folderId: myDocsFolderId,
          createTextOrHtmlFile: {
            title: "Autotest Favorites HTML File.html",
            content: "<p>test</p>",
            createNewIfExist: true,
          },
        });
      expect(createStatus).toBe(200);
      const fileId = fileData.response!.id!;
      const storedTitle = fileData.response!.title!;

      const { data: toggleData, status: toggleStatus } =
        await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });
      expect(toggleStatus).toBe(200);
      expect(toggleData.response).toBe(true);

      const { data, status } = await ownerApi.folders.getFavoritesFolder({});

      expect(status).toBe(200);
      expect(Array.isArray(data.response!.files)).toBe(true);
      const titles = data.response!.files!.map((f) => f.title);
      expect(titles).toContain(storedTitle);
    },
  );

  test("GET /api/2.0/files/@favorites - filterType FilesOnly returns all favorited files regardless of type", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: txtData } = await ownerApi.files.createTextFile({
      folderId: myDocsFolderId,
      createTextOrHtmlFile: {
        title: "Autotest Favorites Mixed Text.txt",
        content: "a",
        createNewIfExist: true,
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: txtData.response!.id!,
      favorite: true,
    });

    const { data: docxData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Favorites Mixed Doc.docx" },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: docxData.response!.id!,
      favorite: true,
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      filterType: FilterType.FilesOnly,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response!.files)).toBe(true);
    expect(data.response!.files!.length).toBeGreaterThanOrEqual(2);
    const titles = data.response!.files!.map((f) => f.title);
    expect(titles).toContain("Autotest Favorites Mixed Text.txt");
    expect(titles).toContain("Autotest Favorites Mixed Doc.docx");
  });

  test("GET /api/2.0/files/@favorites - File removed from favorites does not appear in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Favorites Removed Doc.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });
    await ownerApi.files.toggleFileFavorite({ fileId, favorite: false });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    const titles = (data.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest Favorites Removed Doc.docx");
  });
});

test.describe("GET /api/2.0/files/@favorites - Get favorites folder", () => {
  test("GET /api/2.0/files/@favorites - Owner gets favorites folder metadata", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    expect(data.response!.current!.id).toBeDefined();
    expect(typeof data.response!.current!.id).toBe("number");
    expect(data.response!.current!.title).toBeTruthy();
    expect(data.response!.count).toBe(
      (data.response!.files?.length ?? 0) +
        (data.response!.folders?.length ?? 0),
    );
  });

  test("GET /api/2.0/files/@favorites - Empty favorites returns 200 with no files no folders and total 0", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    expect(data.response!.files).toEqual([]);
    expect(data.response!.folders).toEqual([]);
    expect(data.response!.total).toBe(0);
    expect(data.response!.count).toBe(0);
  });

  test("GET /api/2.0/files/@favorites - File added to favorites has isFavorite true in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest Favorites isFavorite Check.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    expect(Array.isArray(data.response!.files)).toBe(true);
    const file = data.response!.files!.find(
      (f) => f.title === "Autotest Favorites isFavorite Check.docx",
    );
    expect(file).toBeDefined();
    expect((file as any).isFavorite).toBe(true);
  });

  test("GET /api/2.0/files/@favorites - Folder added to favorites appears in response.folders", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Favorites Folder Target" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    expect(Array.isArray(data.response!.folders)).toBe(true);
    const folderTitles = data.response!.folders!.map((f) => f.title);
    expect(folderTitles).toContain("Autotest Favorites Folder Target");
  });

  test("GET /api/2.0/files/@favorites - filterType FoldersOnly returns only folders", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest Favorites FolderOnly File.docx",
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: fileData.response!.id!,
      favorite: true,
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Favorites FolderOnly Folder" },
    });
    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderData.response!.id!] },
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      filterType: FilterType.FoldersOnly,
    });

    expect(status).toBe(200);
    expect(data.response!.files ?? []).toHaveLength(0);
    const folderTitles = data.response!.folders!.map((f) => f.title);
    expect(folderTitles).toContain("Autotest Favorites FolderOnly Folder");
  });

  test("GET /api/2.0/files/@favorites - count=1 pagination returns exactly one file and correct startIndex", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    for (const title of [
      "Autotest Favorites Page File A.docx",
      "Autotest Favorites Page File B.docx",
    ]) {
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title },
      });
      await ownerApi.files.toggleFileFavorite({
        fileId: fileData.response!.id!,
        favorite: true,
      });
    }

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      count: 1,
      startIndex: 0,
    });

    expect(status).toBe(200);
    expect(data.response!.files!.length).toBe(1);
    expect(data.response!.count).toBe(1);
    expect(data.response!.startIndex).toBe(0);
  });

  test("GET /api/2.0/files/@favorites - sortOrder Descending returns files in reverse alphabetical order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    for (const title of [
      "Autotest Favorites Sort AAA.docx",
      "Autotest Favorites Sort MMM.docx",
      "Autotest Favorites Sort ZZZ.docx",
    ]) {
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: myDocsFolderId,
        createFileJsonElement: { title },
      });
      await ownerApi.files.toggleFileFavorite({
        fileId: fileData.response!.id!,
        favorite: true,
      });
    }

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      sortBy: "AZ",
      sortOrder: SortOrder.Descending,
    });

    expect(status).toBe(200);
    const titles = data.response!.files!.map((f) => f.title);
    const zzzIndex = titles.indexOf("Autotest Favorites Sort ZZZ.docx");
    const mmmIndex = titles.indexOf("Autotest Favorites Sort MMM.docx");
    const aaaIndex = titles.indexOf("Autotest Favorites Sort AAA.docx");
    expect(zzzIndex).toBeGreaterThanOrEqual(0);
    expect(mmmIndex).toBeGreaterThanOrEqual(0);
    expect(aaaIndex).toBeGreaterThanOrEqual(0);
    expect(zzzIndex).toBeLessThan(mmmIndex);
    expect(mmmIndex).toBeLessThan(aaaIndex);
  });

  test("GET /api/2.0/files/@favorites - filterValue returns only files matching the search term", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: matchFile } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest Favorites FilterVal UNIQUE.docx",
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: matchFile.response!.id!,
      favorite: true,
    });

    const { data: otherFile } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest Favorites FilterVal Other.docx",
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: otherFile.response!.id!,
      favorite: true,
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      filterValue: "UNIQUE",
    });

    expect(status).toBe(200);
    const titles = data.response!.files!.map((f) => f.title);
    expect(titles).toContain("Autotest Favorites FilterVal UNIQUE.docx");
    expect(titles).not.toContain("Autotest Favorites FilterVal Other.docx");
  });

  test("GET /api/2.0/files/@favorites - File deleted to trash does not appear in favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: "Autotest Favorites Deleted File.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    const titles = (data.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest Favorites Deleted File.docx");
  });

  test("GET /api/2.0/files/@favorites - count=0 returns 400 as invalid parameter", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getFavoritesFolder({
      count: 0,
    });

    expect(status).toBe(400);
  });

  test("GET /api/2.0/files/@favorites - startIndex beyond total returns empty files array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest Favorites StartIndex Beyond.docx",
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: fileData.response!.id!,
      favorite: true,
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      startIndex: 999999,
    });

    expect(status).toBe(200);
    expect(data.response!.files ?? []).toHaveLength(0);
    expect(data.response!.folders ?? []).toHaveLength(0);
    expect(data.response!.count).toBe(0);
  });

  test("GET /api/2.0/files/@favorites - File from room shows correct originRoomTitle in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Favorites Origin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Favorites Room File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    const file = data.response!.files!.find(
      (f) => f.title === "Autotest Favorites Room File.docx",
    );

    expect(status).toBe(200);
    expect(file).toBeDefined();
    expect((file as any).originRoomTitle).toBe(
      "Autotest Favorites Origin Room",
    );
    expect((file as any).isFavorite).toBe(true);
  });

  test("GET /api/2.0/files/@favorites - filterType DocumentsOnly includes .txt files as documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: docxData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest Favorites DocOnly Doc.docx",
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: docxData.response!.id!,
      favorite: true,
    });

    const { data: txtData } = await ownerApi.files.createTextFile({
      folderId: myDocsFolderId,
      createTextOrHtmlFile: {
        title: "Autotest Favorites DocOnly Text.txt",
        content: "test",
        createNewIfExist: true,
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: txtData.response!.id!,
      favorite: true,
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      filterType: FilterType.DocumentsOnly,
    });

    expect(status).toBe(200);
    const titles = data.response!.files!.map((f) => f.title);
    // .txt opens in Document Editor - classified as a document in DocSpace
    expect(titles).toContain("Autotest Favorites DocOnly Doc.docx");
    expect(titles).toContain("Autotest Favorites DocOnly Text.txt");
  });

  test("GET /api/2.0/files/@favorites - Folder in favorites has isFavorite true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Favorites isFavorite Folder" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    const folder = data.response!.folders!.find(
      (f) => f.title === "Autotest Favorites isFavorite Folder",
    );

    expect(status).toBe(200);
    expect(folder).toBeDefined();
    expect((folder as any).isFavorite).toBe(true);
  });

  test("GET /api/2.0/files/@favorites - Folder removed via deleteFavoritesFromBody does not appear in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Favorites Remove Folder" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    await ownerApi.operations.deleteFavoritesFromBody({
      baseBatchRequestDto: { folderIds: [folderId] },
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    const folderTitles = (data.response!.folders ?? []).map((f) => f.title);
    expect(folderTitles).not.toContain("Autotest Favorites Remove Folder");
  });

  test("GET /api/2.0/files/@favorites - filterValue with no matching files returns empty files array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: {
        title: "Autotest Favorites FilterVal NoMatch.docx",
      },
    });
    await ownerApi.files.toggleFileFavorite({
      fileId: fileData.response!.id!,
      favorite: true,
    });

    const { data, status } = await ownerApi.folders.getFavoritesFolder({
      filterValue: "XQZNONEXISTENTXQZ",
    });

    expect(status).toBe(200);
    expect(data.response!.files ?? []).toHaveLength(0);
    expect(data.response!.count).toBe(0);
  });
});

test.describe("PUT /api/2.0/files/folder/:folderId - Rename folder", () => {
  test("PUT /api/2.0/files/folder/:folderId - Owner renames own folder in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Before Rename" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Folder After Rename" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Folder After Rename");
    expect(data.response!.id).toBe(folderId);
    expect(data.response!.parentId).toBe(myDocsFolderId);
  });

  test("PUT /api/2.0/files/folder/:folderId - Owner renames folder inside a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Folder Rename",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Room Folder Before Rename" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Room Folder After Rename" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest Room Folder After Rename");
    expect(data.response!.id).toBe(folderId);
    expect(data.response!.parentId).toBe(roomId);
  });

  test("PUT /api/2.0/files/folder/:folderId - User renames own folder in My Documents", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myDocsData } = await userApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await userApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest User Folder Before Rename" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await userApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest User Folder After Rename" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBe("Autotest User Folder After Rename");
    expect(data.response!.id).toBe(folderId);
    expect(data.response!.parentId).toBe(myDocsFolderId);
  });

  test("PUT /api/2.0/files/folder/:folderId - parentId stays unchanged after rename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder ParentId Check" },
    });
    const folderId = folderData.response!.id!;
    const parentIdBefore = folderData.response!.parentId!;

    const { data, status } = await ownerApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Folder ParentId Check Renamed" },
    });

    expect(status).toBe(200);
    expect(data.response!.parentId).toBe(parentIdBefore);
    expect(data.response!.parentId).toBe(myDocsFolderId);
  });

  test("PUT /api/2.0/files/folder/:folderId - id in response matches requested folderId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Id Integrity Check" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Folder Id Integrity Renamed" },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(folderId);
  });

  test(
    "PUT /api/2.0/files/folder/:folderId - title with Cyrillic and special characters is" +
      " preserved",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest Folder Special Chars" },
      });
      const folderId = folderData.response!.id!;

      const specialTitle = "Тест Папка & Folder (2024)";

      const { data, status } = await ownerApi.folders.renameFolder({
        folderId,
        createFolder: { title: specialTitle },
      });

      expect(status).toBe(200);
      expect(data.response!.title).toBe(specialTitle);
    },
  );

  test("PUT /api/2.0/files/folder/:folderId - rename to same title returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const sameTitle = "Autotest Folder Same Title Rename";
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: sameTitle },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.renameFolder({
      folderId,
      createFolder: { title: sameTitle },
    });

    expect(status).toBe(200);
    expect(data.response!.title).toBe(sameTitle);
  });

  test("PUT /api/2.0/files/folder/:folderId - renamed title persists when retrieved via GET", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const oldTitle = "Autotest Folder Before Persist Check";
    const newTitle = "Autotest Folder After Persist Check";

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: oldTitle },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.folders.renameFolder({
      folderId,
      createFolder: { title: newTitle },
    });

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.response!.title).toBe(newTitle);
    expect(data.response!.id).toBe(folderId);
  });

  test(
    "PUT /api/2.0/files/folder/:folderId - renamed folder appears with new title in parent" +
      " listing and old title is absent",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const oldTitle = "Autotest Folder Before Listing Check";
      const newTitle = "Autotest Folder After Listing Check";

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: oldTitle },
      });
      const folderId = folderData.response!.id!;

      await ownerApi.folders.renameFolder({
        folderId,
        createFolder: { title: newTitle },
      });

      const { data, status } = await ownerApi.folders.getFolderByFolderId({
        folderId: myDocsFolderId,
      });

      const folderTitles = (data.response?.folders ?? []).map((f) => f.title);

      expect(status).toBe(200);
      expect(folderTitles).toContain(newTitle);
      expect(folderTitles).not.toContain(oldTitle);
    },
  );

  test(
    "PUT /api/2.0/files/folder/:folderId - rename preserves filesCount foldersCount type and" +
      " rootFolderType",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest Folder Fields Before Rename" },
      });
      const folderId = folderData.response!.id!;

      const before = {
        filesCount: folderData.response!.filesCount,
        foldersCount: folderData.response!.foldersCount,
        type: folderData.response!.type,
        rootFolderType: folderData.response!.rootFolderType,
      };

      const { data, status } = await ownerApi.folders.renameFolder({
        folderId,
        createFolder: { title: "Autotest Folder Fields After Rename" },
      });

      const after = {
        filesCount: data.response!.filesCount,
        foldersCount: data.response!.foldersCount,
        type: data.response!.type,
        rootFolderType: data.response!.rootFolderType,
      };

      expect(status).toBe(200);
      expect(after.filesCount).toBe(before.filesCount);
      expect(after.foldersCount).toBe(before.foldersCount);
      expect(after.type).toBe(before.type);
      expect(after.rootFolderType).toBe(before.rootFolderType);
    },
  );

  // BUG 81508: PUT /api/2.0/files/folder/:folderId - non-existent folderId returns 403 instead of 404
  test.fail(
    "BUG 81508: PUT /api/2.0/files/folder/:folderId - non-existent folderId returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const nonExistentFolderId = 999999999;

      const { status } = await ownerApi.folders.renameFolder({
        folderId: nonExistentFolderId,
        createFolder: { title: "Autotest Rename Non-Existent Folder" },
      });

      expect(status).toBe(404);
    },
  );

  // BUG 81507: PUT /api/2.0/files/folder/:folderId - empty string title accepted, returns 200 instead of 400
  test.fail(
    "BUG 81507:PUT /api/2.0/files/folder/:folderId - empty string title returns 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest Folder Empty Title Check" },
      });
      const folderId = folderData.response!.id!;

      const { status } = await ownerApi.folders.renameFolder({
        folderId,
        createFolder: { title: "" },
      });

      expect(status).toBe(400);
    },
  );

  // BUG 81508: PUT /api/2.0/files/folder/:folderId - folderId 0 returns 403 instead of 400 or 404
  test.fail(
    "BUG 81508:PUT /api/2.0/files/folder/:folderId - folderId 0 returns 404 or 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.folders.renameFolder({
        folderId: 0,
        createFolder: { title: "Autotest Rename FolderId Zero" },
      });

      expect([400, 404]).toContain(status);
    },
  );
});

test.describe("GET /api/2.0/files/:folderId/news - Get new folder items", () => {
  test("GET /api/2.0/files/:folderId/news - Owner gets 200 for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For News",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/news - Empty room returns empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Empty News",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  // BUG 81520: GET /api/2.0/files/:folderId/news - always returns empty response[] even when new items exist
  test.fail(
    "BUG 81520: GET /api/2.0/files/:folderId/news - File uploaded by another user appears as new item",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room News File Check",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      // owner visits the room to establish last-read baseline
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

      // another user adds a file after the owner's visit
      await userApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News File By User.docx" },
      });

      const { data, status } = await ownerApi.folders.getNewFolderItems({
        folderId: roomId,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      const titles = data.response!.map((e) => e.title);
      expect(titles).toContain("Autotest News File By User.docx");
    },
  );

  // BUG 81520: GET /api/2.0/files/:folderId/news - always returns empty response[] even when new items exist
  test.fail(
    "BUG 81520: GET /api/2.0/files/:folderId/news - Subfolder created by another user appears as new item",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room News Subfolder Check",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      // owner visits the room to establish last-read baseline
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

      await userApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest News Subfolder By User" },
      });

      const { data, status } = await ownerApi.folders.getNewFolderItems({
        folderId: roomId,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      const titles = data.response!.map((e) => e.title);
      expect(titles).toContain("Autotest News Subfolder By User");
    },
  );

  // BUG 81520: GET /api/2.0/files/:folderId/news - always returns empty response[] even when new items exist
  test.fail(
    "BUG 81520: GET /api/2.0/files/:folderId/news - response contains all new items added after owner visit",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room News Count Check",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      // owner visits the room to establish last-read baseline
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

      await userApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News Count File 1.docx" },
      });
      await userApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News Count File 2.docx" },
      });

      const { data, status } = await ownerApi.folders.getNewFolderItems({
        folderId: roomId,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
      const titles = data.response!.map((e) => e.title);
      expect(titles).toContain("Autotest News Count File 1.docx");
      expect(titles).toContain("Autotest News Count File 2.docx");
    },
  );

  // BUG 81520: GET /api/2.0/files/:folderId/news - always returns empty response[] even when new items exist
  test.fail(
    "BUG 81520: GET /api/2.0/files/:folderId/news - each item has required fields title and fileEntryType",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room News Fields Check",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      // owner visits the room to establish last-read baseline
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

      await userApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News Fields File.docx" },
      });

      const { data, status } = await ownerApi.folders.getNewFolderItems({
        folderId: roomId,
      });

      expect(status).toBe(200);
      expect(data.response!.length).toBeGreaterThan(0);
      for (const item of data.response!) {
        expect(item.title).toBeDefined();
        expect(item.title).not.toBe("");
        expect(item.fileEntryType).toBeDefined();
        expect(item.createdBy).toBeDefined();
        expect(item.updated).toBeDefined();
      }
    },
  );

  // BUG 81520: GET /api/2.0/files/:folderId/news - always returns empty response[] even when new items exist
  test.fail(
    "BUG 81520: GET /api/2.0/files/:folderId/news - Items added by multiple different users all appear in news",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room News Multi User",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: user1Api, data: user1Data } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const user1Id = user1Data.response!.id!;

      const { api: user2Api, data: user2Data } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const user2Id = user2Data.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: user1Id, access: FileShare.Editing },
            { id: user2Id, access: FileShare.Editing },
          ],
          notify: false,
        },
      });

      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

      await user1Api.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News File By User1.docx" },
      });
      await user2Api.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest News File By User2.docx" },
      });

      const { data, status } = await ownerApi.folders.getNewFolderItems({
        folderId: roomId,
      });

      expect(status).toBe(200);
      const titles = data.response!.map((e) => e.title);
      expect(titles).toContain("Autotest News File By User1.docx");
      expect(titles).toContain("Autotest News File By User2.docx");
    },
  );

  test("GET /api/2.0/files/:folderId/news - Items created before owner visit do not appear as new", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Pre-Visit",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    // user creates file BEFORE owner visits
    await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Pre-Visit File.docx" },
    });

    // owner visits — establishes baseline after file was already created
    await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    const { data, status } = await ownerApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    const titles = data.response!.map((e) => e.title);
    expect(titles).not.toContain("Autotest Pre-Visit File.docx");
  });

  test("GET /api/2.0/files/:folderId/news - After owner re-visits the folder news returns empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Re-Visit",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Re-Visit File.docx" },
    });

    // owner re-visits — marks all new items as read
    await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    const { data, status } = await ownerApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /api/2.0/files/:folderId/news - Owner's own newly created items do not appear in news", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Own Items",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Owner Own File.docx" },
    });

    const { data, status } = await ownerApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    const titles = data.response!.map((e) => e.title);
    expect(titles).not.toContain("Autotest Owner Own File.docx");
  });

  test("GET /api/2.0/files/:folderId/news - Owner gets 200 for My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data, status } = await ownerApi.folders.getNewFolderItems({
      folderId: myDocsFolderId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // BUG 81519: GET /api/2.0/files/:folderId/news - non-existent folderId returns 403 instead of 404
  test.fail(
    "BUG 81519: GET /api/2.0/files/:folderId/news - non-existent folderId returns 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.folders.getNewFolderItems({
        folderId: 999999999,
      });

      expect(status).toBe(404);
    },
  );

  // BUG 81519: GET /api/2.0/files/:folderId/news - folderId 0 returns 403 instead of 400 or 404
  test.fail(
    "BUG 81519: GET /api/2.0/files/:folderId/news - folderId 0 returns 404 or 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.folders.getNewFolderItems({
        folderId: 0,
      });

      expect([400, 404]).toContain(status);
    },
  );
});

test.describe("POST /api/2.0/files/{folderId}/upload - Upload file", () => {
  test("POST /api/2.0/files/{folderId}/upload - Owner uploads a file to a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-upload.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/{folderId}/upload - Uploaded file appears in folder listing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Listing Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileName = "autotest-listing-check.txt";

    await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Autotest file content for listing check"),
      fileName,
    );

    const { data: folderData, status: folderStatus } =
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    const files = (folderData.response as any)?.files as any[];

    expect(folderStatus).toBe(200);
    expect(files).toBeDefined();
    expect(files.some((f: any) => f.title === fileName)).toBe(true);
  });

  test("POST /api/2.0/files/{folderId}/upload - Response contains correct title folderId and createdBy", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Fields",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileName = "autotest-fields-check.txt";

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Autotest file content for fields check"),
      fileName,
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.id).toBeDefined();
    expect(response.title).toBe(fileName);
    expect(response.folderId).toBe(roomId);
    expect(response.createdBy).toBeDefined();
  });

  test("POST /api/2.0/files/{folderId}/upload - createNewIfExist=true creates a new file when name already exists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Create New",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileName = "autotest-create-new.txt";

    const { data: data1 } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("First content"),
      fileName,
    );
    const fileId1 = (data1.response as any)?.[0]?.id;

    const { data: data2, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Second content"),
      fileName,
      { createNewIfExist: true },
    );
    const fileId2 = (data2.response as any)?.[0]?.id;

    expect(status).toBe(200);
    expect(fileId2).toBeDefined();
    expect(fileId2).not.toBe(fileId1);
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload empty file (0 bytes) returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Empty File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.alloc(0),
      "autotest-empty.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/{folderId}/upload - Response pureContentLength matches uploaded file size", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Content Length",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const content = Buffer.from("Autotest content length check");
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      content,
      "autotest-content-length.txt",
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.pureContentLength).toBe(content.length);
  });

  test("POST /api/2.0/files/{folderId}/upload - Response fileExst matches uploaded file extension", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload File Ext",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("content"),
      "autotest-ext-check.txt",
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".txt");
  });

  test("POST /api/2.0/files/{folderId}/upload - createNewIfExist=false overwrites existing file keeping same ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Overwrite",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileName = "autotest-overwrite.txt";

    const { data: data1 } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("First content"),
      fileName,
    );
    const fileId1 = (data1.response as any)?.[0]?.id;
    const version1 = (data1.response as any)?.[0]?.version;

    const { data: data2, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Second content"),
      fileName,
    );
    const fileId2 = (data2.response as any)?.[0]?.id;
    const version2 = (data2.response as any)?.[0]?.version;

    expect(status).toBe(200);
    expect(fileId2).toBe(fileId1);
    expect(version2).toBeGreaterThan(version1);
  });

  test("POST /api/2.0/files/{folderId}/upload - Uploaded file retrievable in folder with correct size", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Round Trip",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const content = Buffer.from("Round trip content check");
    const fileName = "autotest-round-trip.txt";

    await uploadFileToFolder(apiSdk, "owner", roomId, content, fileName);

    const { data: folderData, status: folderStatus } =
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    const files = (folderData.response as any)?.files as any[];
    const uploaded = files?.find((f: any) => f.title === fileName);

    expect(folderStatus).toBe(200);
    expect(uploaded).toBeDefined();
    expect(uploaded.pureContentLength).toBe(content.length);
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload to subfolder inside room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Subfolder",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: subfolderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder" },
    });
    const subfolderId = subfolderData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      subfolderId,
      Buffer.from("Subfolder file content"),
      "autotest-subfolder-file.txt",
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.folderId).toBe(subfolderId);
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload to My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      myDocsFolderId,
      Buffer.from("My Documents file content"),
      "autotest-my-docs.txt",
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.folderId).toBe(myDocsFolderId);
  });

  test("POST /api/2.0/files/{folderId}/upload - Multiple files via files array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Multiple Files",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      null,
      "",
      {
        files: [
          {
            buffer: Buffer.from("File 1 content"),
            fileName: "autotest-multi-1.txt",
          },
          {
            buffer: Buffer.from("File 2 content"),
            fileName: "autotest-multi-2.txt",
          },
        ],
      },
    );

    const response = data.response as any;

    // endpoint processes only the first file from the files array - remaining entries are silently skipped
    expect(status).toBe(200);
    expect(Array.isArray(response)).toBe(true);
    expect(response.length).toBe(1);
    expect(response[0].title).toBe("autotest-multi-1.txt");
  });

  test("POST /api/2.0/files/{folderId}/upload - Filename with special characters is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Special Chars",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileName = "autotest тест (special) file.txt";
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Special chars content"),
      fileName,
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.title).toBe(fileName);
  });

  test("POST /api/2.0/files/{folderId}/upload - storeOriginalFileFlag=true returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Store Original",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Original format content"),
      "autotest-store-original.docx",
      { storeOriginalFileFlag: true },
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload to archived room returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Archived",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("Content for archived room"),
      "autotest-archived.txt",
    );

    expect(status).toBe(403);
  });

  // BUG 81547: POST /api/2.0/files/{folderId}/upload - No file in request body returns 403 instead of 400
  test.fail(
    "BUG 81547: POST /api/2.0/files/{folderId}/upload - No file in request body returns 403 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room Upload No File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await uploadFileToFolder(
        apiSdk,
        "owner",
        roomId,
        null,
        "",
      );

      expect(status).toBe(400);
    },
  );

  test("POST /api/2.0/files/{folderId}/upload - Upload .pdf file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload PDF",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("fake pdf content"),
      "autotest-format.pdf",
      { mimeType: "application/pdf" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".pdf");
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload .xlsx file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload XLSX",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("fake xlsx content"),
      "autotest-format.xlsx",
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".xlsx");
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload .pptx file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload PPTX",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("fake pptx content"),
      "autotest-format.pptx",
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".pptx");
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload .png file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload PNG",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("fake png content"),
      "autotest-format.png",
      { mimeType: "image/png" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".png");
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload .jpg file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload JPG",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("fake jpg content"),
      "autotest-format.jpg",
      { mimeType: "image/jpeg" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".jpg");
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload .zip file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload ZIP",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("fake zip content"),
      "autotest-format.zip",
      { mimeType: "application/zip" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".zip");
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload .csv file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload CSV",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("id,name\n1,autotest"),
      "autotest-format.csv",
      { mimeType: "text/csv" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".csv");
  });

  test("POST /api/2.0/files/{folderId}/upload - Upload .md file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload MD",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("# Autotest"),
      "autotest-format.md",
      { mimeType: "text/markdown" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".md");
  });

  test("POST /api/2.0/files/{folderId}/upload - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      999999999,
      Buffer.from("Autotest file content"),
      "autotest-nonexistent.txt",
    );

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/{folderId}/upload - folderId 0 returns 400 or 404", async ({
    apiSdk,
  }) => {
    const { status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      0,
      Buffer.from("Autotest file content"),
      "autotest-zero-folder.txt",
    );

    expect([400, 404]).toContain(status);
  });
});

test.describe("POST /api/2.0/files/@my/upload - Upload file to My Documents", () => {
  test("POST /api/2.0/files/@my/upload - Owner uploads a file to My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("Autotest file content"))], {
        type: "text/plain",
      }),
      "autotest-my-upload.txt",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - Uploaded file appears in My Documents listing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileName = "autotest-my-listing.txt";
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("listing check"))], {
        type: "text/plain",
      }),
      fileName,
    );

    await ownerApi.folders.uploadFileToMy(undefined, { data: formData });

    const { data: myFolderData } = await ownerApi.folders.getMyFolder();
    const myFolderId = myFolderData.response!.current!.id!;
    const { data: folderData, status: folderStatus } =
      await ownerApi.folders.getFolderByFolderId({ folderId: myFolderId });

    const files = (folderData.response as any)?.files as any[];

    expect(folderStatus).toBe(200);
    expect(files.some((f: any) => f.title === fileName)).toBe(true);
  });

  test("POST /api/2.0/files/@my/upload - Response contains correct title, fileExst and pureContentLength", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const content = Buffer.from("response fields check");
    const fileName = "autotest-my-fields.txt";
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(content)], { type: "text/plain" }),
      fileName,
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.title).toBe(fileName);
    expect(response.fileExst).toBe(".txt");
    expect(response.pureContentLength).toBe(content.length);
  });

  test("POST /api/2.0/files/@my/upload - createNewIfExist=false overwrites existing file keeping same ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileName = "autotest-my-overwrite.txt";

    const formData1 = new FormData();
    formData1.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("original content"))], {
        type: "text/plain",
      }),
      fileName,
    );
    const { data: data1 } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData1,
    });
    const firstId = (data1.response as any)?.[0]?.id;
    const firstVersion = (data1.response as any)?.[0]?.version;

    const formData2 = new FormData();
    formData2.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("updated content"))], {
        type: "text/plain",
      }),
      fileName,
    );
    formData2.append("createNewIfExist", "false");
    const { data: data2, status } = await ownerApi.folders.uploadFileToMy(
      undefined,
      { data: formData2 },
    );
    const secondId = (data2.response as any)?.[0]?.id;
    const secondVersion = (data2.response as any)?.[0]?.version;

    expect(status).toBe(200);
    expect(secondId).toBe(firstId);
    expect(secondVersion).toBeGreaterThan(firstVersion);
  });

  test("POST /api/2.0/files/@my/upload - createNewIfExist=true creates a new file with different ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileName = "autotest-my-duplicate.txt";

    const formData1 = new FormData();
    formData1.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("first content"))], {
        type: "text/plain",
      }),
      fileName,
    );
    const { data: data1 } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData1,
    });
    const firstId = (data1.response as any)?.[0]?.id;

    const formData2 = new FormData();
    formData2.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("second content"))], {
        type: "text/plain",
      }),
      fileName,
    );
    formData2.append("createNewIfExist", "true");
    const { data: data2, status } = await ownerApi.folders.uploadFileToMy(
      undefined,
      { data: formData2 },
    );
    const secondId = (data2.response as any)?.[0]?.id;

    expect(status).toBe(200);
    expect(secondId).not.toBe(firstId);
  });

  test("POST /api/2.0/files/@my/upload - Filename with special characters is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileName = "autotest-мой тест (special).txt";
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("special chars content"))], {
        type: "text/plain",
      }),
      fileName,
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.title).toBe(fileName);
  });

  test("POST /api/2.0/files/@my/upload - Empty file (0 bytes) returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.alloc(0))], { type: "text/plain" }),
      "autotest-my-empty.txt",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  // BUG 81549: POST /api/2.0/files/@my/upload - No file in request body returns 403 instead of 400
  test.fail(
    "BUG 81549: POST /api/2.0/files/@my/upload - No file in request body returns 403 instead of 400",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { status } = await ownerApi.folders.uploadFileToMy(undefined, {
        data: new FormData(),
      });

      expect(status).toBe(400);
    },
  );

  test("POST /api/2.0/files/@my/upload - folderId in response matches My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myFolderData } = await ownerApi.folders.getMyFolder();
    const myFolderId = myFolderData.response!.current!.id!;

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("folder id check"))], {
        type: "text/plain",
      }),
      "autotest-my-folderid.txt",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.folderId).toBe(myFolderId);
  });

  test("POST /api/2.0/files/@my/upload - createNewIfExist=false with no existing file returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("first upload, no conflict"))], {
        type: "text/plain",
      }),
      "autotest-my-no-conflict.txt",
    );
    formData.append("createNewIfExist", "false");

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - storeOriginalFileFlag=true preserves original extension", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("fake docx content"))], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "autotest-my-store-flag.docx",
    );
    formData.append("storeOriginalFileFlag", "true");

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".docx");
  });

  test("POST /api/2.0/files/@my/upload - Upload .pdf file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("fake pdf content"))], {
        type: "application/pdf",
      }),
      "autotest-my-format.pdf",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".pdf");
  });

  test("POST /api/2.0/files/@my/upload - Upload .xlsx file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("fake xlsx content"))], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "autotest-my-format.xlsx",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".xlsx");
  });

  test("POST /api/2.0/files/@my/upload - Upload .pptx file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("fake pptx content"))], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      "autotest-my-format.pptx",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".pptx");
  });

  test("POST /api/2.0/files/@my/upload - Upload .png file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("fake png content"))], {
        type: "image/png",
      }),
      "autotest-my-format.png",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".png");
  });

  test("POST /api/2.0/files/@my/upload - Upload .jpg file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("fake jpg content"))], {
        type: "image/jpeg",
      }),
      "autotest-my-format.jpg",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".jpg");
  });

  test("POST /api/2.0/files/@my/upload - Upload .zip file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("fake zip content"))], {
        type: "application/zip",
      }),
      "autotest-my-format.zip",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".zip");
  });

  test("POST /api/2.0/files/@my/upload - Upload .csv file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("id,name\n1,autotest"))], {
        type: "text/csv",
      }),
      "autotest-my-format.csv",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".csv");
  });

  test("POST /api/2.0/files/@my/upload - Upload .md file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(Buffer.from("# Autotest"))], {
        type: "text/markdown",
      }),
      "autotest-my-format.md",
    );

    const { data, status } = await ownerApi.folders.uploadFileToMy(undefined, {
      data: formData,
    });

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".md");
  });
});
