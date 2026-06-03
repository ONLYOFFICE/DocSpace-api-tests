import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  EmployeeType,
  FileShare,
  FilterType,
  FoldersApi,
  LinkType,
  MessageAction,
  RoomDataLifetimePeriod,
  RoomType,
  SortOrder,
  SubjectType,
  WatermarkAdditions,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { uploadFileToFolder } from "@/src/helpers/upload-file";
import { createTestImageBuffer } from "@/src/utils/test-image";

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

  test("BUG 81459: GET /api/2.0/files/folder/:folderId - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getFolderInfo({
      folderId: 999999999,
    });

    expect(status).toBe(404);
  });

  test("BUG 81459: GET /api/2.0/files/folder/:folderId - Deleted folder returns 404", async ({
    apiSdk,
  }) => {
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
  });

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

  test("BUG 81464: GET /api/2.0/files/:folderId/subfolders - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getFolders({
      folderId: 999999999,
    });

    expect(status).toBe(404);
  });

  test("BUG 81464: GET /api/2.0/files/:folderId/subfolders - Deleted folder returns 404", async ({
    apiSdk,
  }) => {
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
  });

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

  test("BUG 81483: GET /api/2.0/files/folder/:folderId/path - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getFolderPath({
      folderId: 999999999,
    });

    expect(status).toBe(404);
  });
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
  // while in conversion queue. Fixed: total calculation corrected; add delay to let conversion finish.
  test("BUG 81481: GET /api/2.0/files/@favorites - HTML file added to favorites appears in response", async ({
    apiSdk,
  }) => {
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

    // Wait for conversion queue to finish before querying favorites
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    expect(Array.isArray(data.response!.files)).toBe(true);
    const titles = data.response!.files!.map((f) => f.title);
    expect(titles).toContain(storedTitle);
  });

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

      const specialTitle = "���� ����� & Folder (2024)";

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

  test("BUG 81508: PUT /api/2.0/files/folder/:folderId - non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const nonExistentFolderId = 999999999;

    const { status } = await ownerApi.folders.renameFolder({
      folderId: nonExistentFolderId,
      createFolder: { title: "Autotest Rename Non-Existent Folder" },
    });

    expect(status).toBe(404);
  });

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

  test("BUG 81508:PUT /api/2.0/files/folder/:folderId - folderId 0 returns 404 or 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.renameFolder({
      folderId: 0,
      createFolder: { title: "Autotest Rename FolderId Zero" },
    });

    expect(status).toBe(404);
  });
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

  test("GET /api/2.0/files/:folderId/news - File created by another user appears as new item", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News File Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData, userData: userCredentials } =
      await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    // owner visits the room to establish last-read baseline
    await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    // authenticate user only when needed � right before creating the file
    const userApi = await apiSdk.authenticateMember(userCredentials, "User");
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
  });

  test("GET /api/2.0/files/:folderId/news - Subfolder created by another user does not appear as new item", async ({
    apiSdk,
  }) => {
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
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
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
    // folders are intentionally not marked as new � only files are
    const titles = (data.response ?? []).map((e) => e.title);
    expect(titles).not.toContain("Autotest News Subfolder By User");
  });

  test("GET /api/2.0/files/:folderId/news - response contains all new items added after owner visit", async ({
    apiSdk,
  }) => {
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
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
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
  });

  test("GET /api/2.0/files/:folderId/news - each item has required fields title and fileEntryType", async ({
    apiSdk,
  }) => {
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
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
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
  });

  test("GET /api/2.0/files/:folderId/news - Items added by multiple different users all appear in news", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Multi User",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: user1Data, userData: user1Credentials } =
      await apiSdk.addMember("owner", "User");
    const user1Id = user1Data.response!.id!;

    const { data: user2Data, userData: user2Credentials } =
      await apiSdk.addMember("owner", "User");
    const user2Id = user2Data.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: user1Id, access: FileShare.ContentCreator },
          { id: user2Id, access: FileShare.ContentCreator },
        ],
        notify: false,
      },
    });

    await ownerApi.folders.getFolderByFolderId({ folderId: roomId });

    const user1Api = await apiSdk.authenticateMember(user1Credentials, "User");
    await user1Api.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest News File By User1.docx" },
    });

    const user2Api = await apiSdk.authenticateMember(user2Credentials, "User");
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
  });

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

    // owner visits � establishes baseline after file was already created
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

    // owner re-visits � marks all new items as read
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

  test("BUG 81519: GET /api/2.0/files/:folderId/news - non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getNewFolderItems({
      folderId: 999999999,
    });

    expect(status).toBe(404);
  });

  test("BUG 81519: GET /api/2.0/files/:folderId/news - folderId 0 returns 404 or 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getNewFolderItems({
      folderId: 0,
    });

    expect(status).toBe(404);
  });
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

    const fileName = "autotest ���� (special) file.txt";
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

  test("POST /api/2.0/files/{folderId}/upload - storeOriginalFile=true returns 200", async ({
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
      { storeOriginalFile: true },
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
  test("BUG 81547: POST /api/2.0/files/{folderId}/upload - No file in request body returns 403 instead of 400", async ({
    apiSdk,
  }) => {
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
  });

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

    expect(status).toBe(404);
  });
});

test.describe("POST /api/2.0/files/@my/upload - Upload file to My Documents", () => {
  test("POST /api/2.0/files/@my/upload - Owner uploads a file to My Documents", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("Autotest file content"),
      "autotest-my-upload.txt",
      { mimeType: "text/plain" },
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - Uploaded file appears in My Documents listing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fileName = "autotest-my-listing.txt";

    await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("listing check"),
      fileName,
      { mimeType: "text/plain" },
    );

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
    const content = Buffer.from("response fields check");
    const fileName = "autotest-my-fields.txt";

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      content,
      fileName,
      { mimeType: "text/plain" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.title).toBe(fileName);
    expect(response.fileExst).toBe(".txt");
    expect(response.pureContentLength).toBe(content.length);
  });

  test("POST /api/2.0/files/@my/upload - createNewIfExist=false overwrites existing file keeping same ID", async ({
    apiSdk,
  }) => {
    const fileName = "autotest-my-overwrite.txt";

    const { data: data1 } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("original content"),
      fileName,
      { mimeType: "text/plain" },
    );
    const firstId = (data1.response as any)?.[0]?.id;
    const firstVersion = (data1.response as any)?.[0]?.version;

    const { data: data2, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("updated content"),
      fileName,
      { mimeType: "text/plain", createNewIfExist: false },
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
    const fileName = "autotest-my-duplicate.txt";

    const { data: data1 } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("first content"),
      fileName,
      { mimeType: "text/plain" },
    );
    const firstId = (data1.response as any)?.[0]?.id;

    const { data: data2, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("second content"),
      fileName,
      { mimeType: "text/plain", createNewIfExist: true },
    );
    const secondId = (data2.response as any)?.[0]?.id;

    expect(status).toBe(200);
    expect(secondId).not.toBe(firstId);
  });

  test("POST /api/2.0/files/@my/upload - Filename with special characters is accepted", async ({
    apiSdk,
  }) => {
    const fileName = "autotest-my-test (special).txt";

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("special chars content"),
      fileName,
      { mimeType: "text/plain" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.title).toBe(fileName);
  });

  test("POST /api/2.0/files/@my/upload - Empty file (0 bytes) returns 200", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.alloc(0),
      "autotest-my-empty.txt",
      { mimeType: "text/plain" },
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("BUG 81549: POST /api/2.0/files/@my/upload - No file in request body returns 400", async ({
    apiSdk,
  }) => {
    const { status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      null,
      "",
    );

    expect(status).toBe(400);
  });

  test("POST /api/2.0/files/@my/upload - folderId in response matches My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myFolderData } = await ownerApi.folders.getMyFolder();
    const myFolderId = myFolderData.response!.current!.id!;

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("folder id check"),
      "autotest-my-folderid.txt",
      { mimeType: "text/plain" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.folderId).toBe(myFolderId);
  });

  test("POST /api/2.0/files/@my/upload - createNewIfExist=false with no existing file returns 200", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("first upload, no conflict"),
      "autotest-my-no-conflict.txt",
      { mimeType: "text/plain", createNewIfExist: false },
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - storeOriginalFile=true preserves original extension", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("fake docx content"),
      "autotest-my-store-flag.docx",
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storeOriginalFile: true,
      },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".docx");
  });

  test("POST /api/2.0/files/@my/upload - Upload .pdf file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("fake pdf content"),
      "autotest-my-format.pdf",
      { mimeType: "application/pdf" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".pdf");
  });

  test("POST /api/2.0/files/@my/upload - Upload .xlsx file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("fake xlsx content"),
      "autotest-my-format.xlsx",
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".xlsx");
  });

  test("POST /api/2.0/files/@my/upload - Upload .pptx file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("fake pptx content"),
      "autotest-my-format.pptx",
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".pptx");
  });

  test("POST /api/2.0/files/@my/upload - Upload .png file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("fake png content"),
      "autotest-my-format.png",
      { mimeType: "image/png" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".png");
  });

  test("POST /api/2.0/files/@my/upload - Upload .jpg file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("fake jpg content"),
      "autotest-my-format.jpg",
      { mimeType: "image/jpeg" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".jpg");
  });

  test("POST /api/2.0/files/@my/upload - Upload .zip file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("fake zip content"),
      "autotest-my-format.zip",
      { mimeType: "application/zip" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".zip");
  });

  test("POST /api/2.0/files/@my/upload - Upload .csv file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("id,name\n1,autotest"),
      "autotest-my-format.csv",
      { mimeType: "text/csv" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".csv");
  });

  test("POST /api/2.0/files/@my/upload - Upload .md file returns 200 and correct fileExst", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("# Autotest"),
      "autotest-my-format.md",
      { mimeType: "text/markdown" },
    );

    const response = (data.response as any)?.[0];

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".md");
  });
});

test.describe("POST /api/2.0/files/@my/insert - Insert file to My Documents", () => {
  test("POST /api/2.0/files/@my/insert - Owner inserts a file to My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const file = new File(
      [new Uint8Array(Buffer.from("Autotest insert content"))],
      "autotest-insert-my.txt",
      { type: "text/plain" },
    );

    const { data, status } = await ownerApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my.txt",
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/insert - folderId in response matches My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myFolderData } = await ownerApi.folders.getMyFolder();
    const myFolderId = myFolderData.response!.current!.id!;

    const file = new File(
      [new Uint8Array(Buffer.from("folder id check"))],
      "autotest-insert-my-folderid.txt",
      { type: "text/plain" },
    );

    const { data, status } = await ownerApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-folderid.txt",
    });

    const response = data.response as any;

    expect(status).toBe(200);
    expect(response.folderId).toBe(myFolderId);
  });

  test("POST /api/2.0/files/@my/insert - Response contains correct title, fileExst and pureContentLength", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const content = Buffer.from("response fields check");
    const fileName = "autotest-insert-my-fields.txt";
    const file = new File([new Uint8Array(content)], fileName, {
      type: "text/plain",
    });

    const { data, status } = await ownerApi.folders.insertFileToMyFromBody({
      file,
      title: fileName,
    });

    const response = data.response as any;

    expect(status).toBe(200);
    expect(response.title).toBe(fileName);
    expect(response.fileExst).toBe(".txt");
    expect(response.pureContentLength).toBe(content.length);
  });

  test("POST /api/2.0/files/@my/insert - Title parameter overrides filename", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const file = new File(
      [new Uint8Array(Buffer.from("title override check"))],
      "original-name.txt",
      { type: "text/plain" },
    );

    const { data, status } = await ownerApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-title-override.txt",
    });

    const response = data.response as any;

    expect(status).toBe(200);
    expect(response.title).toBe("autotest-insert-my-title-override.txt");
  });

  test("POST /api/2.0/files/@my/insert - Inserted file appears in My Documents listing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const fileName = "autotest-insert-my-listing.txt";
    const file = new File(
      [new Uint8Array(Buffer.from("listing check"))],
      fileName,
      { type: "text/plain" },
    );

    await ownerApi.folders.insertFileToMyFromBody({ file, title: fileName });

    const { data: myFolderData } = await ownerApi.folders.getMyFolder();
    const myFolderId = myFolderData.response!.current!.id!;
    const { data: folderData, status } =
      await ownerApi.folders.getFolderByFolderId({ folderId: myFolderId });

    const files = (folderData.response as any)?.files as any[];

    expect(status).toBe(200);
    expect(files.some((f: any) => f.title === fileName)).toBe(true);
  });

  test("POST /api/2.0/files/@my/insert - createNewIfExist=false overwrites existing file keeping same ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const fileName = "autotest-insert-my-overwrite.txt";

    const { data: data1 } = await ownerApi.folders.insertFileToMyFromBody({
      file: new File([new Uint8Array(Buffer.from("original"))], fileName, {
        type: "text/plain",
      }),
      title: fileName,
    });
    const firstId = (data1.response as any)?.id;
    const firstVersion = (data1.response as any)?.version;

    const { data: data2, status } =
      await ownerApi.folders.insertFileToMyFromBody({
        file: new File([new Uint8Array(Buffer.from("updated"))], fileName, {
          type: "text/plain",
        }),
        title: fileName,
        createNewIfExist: false,
      });
    const secondId = (data2.response as any)?.id;
    const secondVersion = (data2.response as any)?.version;

    expect(status).toBe(200);
    expect(secondId).toBe(firstId);
    expect(secondVersion).toBeGreaterThan(firstVersion);
  });

  test("POST /api/2.0/files/@my/insert - createNewIfExist=true creates a new file with different ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const fileName = "autotest-insert-my-duplicate.txt";

    const { data: data1 } = await ownerApi.folders.insertFileToMyFromBody({
      file: new File([new Uint8Array(Buffer.from("first"))], fileName, {
        type: "text/plain",
      }),
      title: fileName,
    });
    const firstId = (data1.response as any)?.id;

    const { data: data2, status } =
      await ownerApi.folders.insertFileToMyFromBody({
        file: new File([new Uint8Array(Buffer.from("second"))], fileName, {
          type: "text/plain",
        }),
        title: fileName,
        createNewIfExist: true,
      });
    const secondId = (data2.response as any)?.id;

    expect(status).toBe(200);
    expect(secondId).not.toBe(firstId);
  });

  test("POST /api/2.0/files/@my/insert - Empty file (0 bytes) returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const file = new File(
      [new Uint8Array(Buffer.alloc(0))],
      "autotest-insert-my-empty.txt",
      { type: "text/plain" },
    );

    const { data, status } = await ownerApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-empty.txt",
    });

    const response = data.response as any;

    expect(status).toBe(200);
    expect(response.contentLength).toBe("0 bytes");
  });

  test("POST /api/2.0/files/@my/insert - No file in request body returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.insertFileToMyFromBody({});

    expect(status).toBe(400);
  });

  test("POST /api/2.0/files/@my/insert - Insert .docx file returns correct fileExst", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const file = new File(
      [new Uint8Array(Buffer.from("docx content"))],
      "autotest-insert-my-format.docx",
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    );

    const { data, status } = await ownerApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-format.docx",
    });

    const response = data.response as any;

    expect(status).toBe(200);
    expect(response.fileExst).toBe(".docx");
  });
});

test.describe("POST /api/2.0/files/folder/:id/link - Create folder primary external link", () => {
  test("POST /api/2.0/files/folder/:id/link - Owner creates primary external link for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink).toBeDefined();
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
    expect(data.response!.isLocked).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.canEditAccess).toBe(false);
    expect(data.response!.canEditInternal).toBe(true);
    expect(data.response!.canEditDenyDownload).toBe(true);
    expect(data.response!.canEditExpirationDate).toBe(true);
    expect(data.response!.canRevoke).toBe(false);
  });

  test("POST /api/2.0/files/folder/:id/link - Response access matches requested access", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response!.access).toBe(FileShare.Read);
  });

  test("POST /api/2.0/files/folder/:id/link - Response contains requestToken", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Token",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBeTruthy();
    expect(data.response!.sharedLink!.requestToken).toBeTruthy();
    expect(data.response!.sharedLink!.primary).toBe(true);
  });

  test("BUG 81573: POST /api/2.0/files/folder/:id/link - Title is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Title",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          access: FileShare.Read,
          title: "My Public Link",
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.title).toBe("My Public Link");
  });

  test("POST /api/2.0/files/folder/:id/link - denyDownload is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link DenyDownload",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read, denyDownload: true },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.denyDownload).toBe(true);
  });

  test("POST /api/2.0/files/folder/:id/link - Password-protected link is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Password",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read, password: "Secret123!" },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.password).toBeTruthy();
  });

  test("POST /api/2.0/files/folder/:id/link - Empty body (access: None) acts as delete of non-existent link returns 200 with no response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Empty Body",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {},
      });

    expect(status).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toBeUndefined();
  });

  test("POST /api/2.0/files/folder/:id/link - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.createFolderPrimaryExternalLink({
      id: 999999999,
      folderLinkRequest: { access: FileShare.Read },
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/folder/:id/link - folderId 0 returns 400 or 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.createFolderPrimaryExternalLink({
      id: 0,
      folderLinkRequest: { access: FileShare.Read },
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/folder/:id/link - Creates link for a subfolder in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Link My Docs Subfolder" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: folderId,
        folderLinkRequest: { access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/folder/:id/link - internal:true is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Internal",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read, internal: true },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.internal).toBe(true);
  });

  test("POST /api/2.0/files/folder/:id/link - expirationDate is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Expiration",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          access: FileShare.Read,
          expirationDate: "2030-01-01T00:00:00.000Z" as any,
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.isExpired).toBe(false);
    expect((data.response!.sharedLink! as any).expirationDate).toBeDefined();
  });

  test("POST /api/2.0/files/folder/:id/link - Calling twice returns the same link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Idempotent",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: first } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const { data: second } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

    expect(first.response!.sharedLink!.id).toBe(
      second.response!.sharedLink!.id,
    );
  });

  // BUG 81575: archived room should return 403 but server returns 200 with count:0
  test("BUG 81575: POST /api/2.0/files/folder/:id/link - Archived room returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Archived",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/files/folder/{id}/links - Get folder links", () => {
  test("GET /api/2.0/files/folder/{id}/links - Owner gets links for a room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Basic",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/folder/{id}/links - Room with no links returns empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Empty",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/folder/{id}/links - Returns primary external link after it is created", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links After Create",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: linkData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = linkData.response!.sharedLink!.id!;

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    const link = data.response!.find((l) => l.sharedLink?.id === linkId);
    expect(link).toBeDefined();
    expect(link!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(link!.sharedLink!.shareLink).toBeTruthy();
    expect(link!.sharedLink!.primary).toBe(true);
  });

  test("GET /api/2.0/files/folder/{id}/links - Returned link has correct access level", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    const link = data.response!.find(
      (l) => l.subjectType === SubjectType.PrimaryExternalLink,
    );
    expect(link).toBeDefined();
    expect(link!.access).toBe(FileShare.Read);
  });

  test("GET /api/2.0/files/folder/{id}/links - Returned link has correct permission flags for owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Flags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    const link = data.response!.find(
      (l) => l.subjectType === SubjectType.PrimaryExternalLink,
    );
    expect(link).toBeDefined();
    expect(link!.isLocked).toBe(false);
    expect(link!.isOwner).toBe(false);
    expect(link!.canEditAccess).toBe(false);
    expect(link!.canEditInternal).toBe(true);
    expect(link!.canEditDenyDownload).toBe(true);
    expect(link!.canEditExpirationDate).toBe(true);
    expect(link!.canRevoke).toBe(false);
  });

  test("GET /api/2.0/files/folder/{id}/links - denyDownload flag is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links DenyDownload",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read, denyDownload: true },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    const link = data.response!.find(
      (l) => l.subjectType === SubjectType.PrimaryExternalLink,
    );
    expect(link).toBeDefined();
    expect(link!.sharedLink!.denyDownload).toBe(true);
  });

  test("GET /api/2.0/files/folder/{id}/links - password field is present for password-protected link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Password",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read, password: "Secret123!" },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    const link = data.response!.find(
      (l) => l.subjectType === SubjectType.PrimaryExternalLink,
    );
    expect(link).toBeDefined();
    expect(link!.sharedLink!.password).toBeTruthy();
  });

  test("GET /api/2.0/files/folder/{id}/links - internal flag is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Internal",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read, internal: true },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    const link = data.response!.find(
      (l) => l.subjectType === SubjectType.PrimaryExternalLink,
    );
    expect(link).toBeDefined();
    expect(link!.sharedLink!.internal).toBe(true);
  });

  test("GET /api/2.0/files/folder/{id}/links - expirationDate is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Expiration",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: {
        access: FileShare.Read,
        expirationDate: "2030-01-01T00:00:00.000Z" as any,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    const link = data.response!.find(
      (l) => l.subjectType === SubjectType.PrimaryExternalLink,
    );
    expect(link).toBeDefined();
    expect(link!.sharedLink!.isExpired).toBe(false);
    expect((link!.sharedLink! as any).expirationDate).toBeDefined();
  });

  test("GET /api/2.0/files/folder/{id}/links - Link disappears after it is revoked", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Revoke",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: linkData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = linkData.response!.sharedLink!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });
    expect(beforeData.response!.some((l) => l.sharedLink?.id === linkId)).toBe(
      true,
    );

    await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { linkId, access: FileShare.None },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response!.some((l) => l.sharedLink?.id === linkId)).toBe(false);
  });

  test("GET /api/2.0/files/folder/{id}/links - Works for subfolder inside a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Subfolder",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder For Links" },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: folderId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { data, status } = await ownerApi.folders.getFolderLinks({
      id: folderId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(
      data.response!.find(
        (l) => l.subjectType === SubjectType.PrimaryExternalLink,
      ),
    ).toBeDefined();
  });

  test("GET /api/2.0/files/folder/{id}/links - Non-existent folder ID returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getFolderLinks({
      id: 999999999,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/folder/{id}/links - ID 0 returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getFolderLinks({ id: 0 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/folder/{id}/links - Negative ID returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.getFolderLinks({ id: -1 });

    expect(status).toBe(404);
  });
});

test.describe("POST /api/2.0/files/folder/{id}/link - Set folder primary external link", () => {
  test("POST /api/2.0/files/folder/{id}/link - Owner updates access of existing link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { linkId, access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.sharedLink!.id).toBe(linkId);
    expect(data.response!.access).toBe(FileShare.Read);
    expect(data.response!.sharedLink!.primary).toBe(true);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
  });

  test("POST /api/2.0/files/folder/{id}/link - Updated link has the same id as the original", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Same Id",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { linkId, access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBe(linkId);
  });

  test("POST /api/2.0/files/folder/{id}/link - Title update is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Title",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          title: "Updated Title",
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.title).toBe("Updated Title");
  });

  test("POST /api/2.0/files/folder/{id}/link - Password update is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Password",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          password: "Secret123!",
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.password).toBeTruthy();

    const { data: getData, status: getStatus } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(getStatus).toBe(200);
    expect(getData.response!.sharedLink!.id).toBe(linkId);
    expect(getData.response!.sharedLink!.password).toBeTruthy();
  });

  test("POST /api/2.0/files/folder/{id}/link - denyDownload update is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link DenyDownload",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          denyDownload: true,
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.denyDownload).toBe(true);
  });

  test("POST /api/2.0/files/folder/{id}/link - internal update is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Internal",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { linkId, access: FileShare.Read, internal: true },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.internal).toBe(true);

    const { data: getData, status: getStatus } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(getStatus).toBe(200);
    expect(getData.response!.sharedLink!.id).toBe(linkId);
    expect(getData.response!.sharedLink!.internal).toBe(true);
  });

  test("POST /api/2.0/files/folder/{id}/link - expirationDate update is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Expiration",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          expirationDate: "2030-01-01T00:00:00.000Z" as any,
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.isExpired).toBe(false);
    expect((data.response!.sharedLink! as any).expirationDate).toBeDefined();
  });

  test("POST /api/2.0/files/folder/{id}/link - access: None with linkId deletes the link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { linkId, access: FileShare.None },
      });

    expect(status).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toBeUndefined();

    const { data: linksData } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });
    const ids = (linksData.response ?? []).map((l) => l.sharedLink?.id);
    expect(ids).not.toContain(linkId);
  });

  // BUG 81807: GET /api/2.0/files/folder/{id}/link behaves as "get or create" for folders.
  // After a folder's primary link is explicitly deleted via PUT (access: None),
  // GET should return 404 but instead recreates a new link.
  test.fail(
    "BUG 81807: GET /api/2.0/files/folder/{id}/link - returns 404 after primary link of a folder is deleted",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder Link Delete Bug",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest Subfolder Link Delete" },
      });
      const folderId = folderData.response!.id!;

      const { data: createData } =
        await ownerApi.folders.createFolderPrimaryExternalLink({
          id: folderId,
          folderLinkRequest: { access: FileShare.Read },
        });
      const linkId = createData.response!.sharedLink!.id!;

      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: folderId,
        folderLinkRequest: { linkId, access: FileShare.None },
      });

      const { status } = await ownerApi.folders.getFolderPrimaryExternalLink({
        id: folderId,
      });

      expect(status).toBe(404);
    },
  );

  test("POST /api/2.0/files/folder/{id}/link - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.setFolderPrimaryExternalLink({
      id: 999999999,
      folderLinkRequest: { access: FileShare.Read },
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/folder/{id}/link - folderId 0 returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.setFolderPrimaryExternalLink({
      id: 0,
      folderLinkRequest: { access: FileShare.Read },
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/folder/{id}/link - access: ReadWrite is rejected returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link ReadWrite",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { status } = await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { linkId, access: FileShare.ReadWrite },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/folder/{id}/link - Multiple fields updated at once", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Multi",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          title: "Multi Update Title",
          password: "Pass123!",
          denyDownload: true,
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.title).toBe("Multi Update Title");
    expect(data.response!.sharedLink!.password).toBeTruthy();
    expect(data.response!.sharedLink!.denyDownload).toBe(true);
  });

  test("POST /api/2.0/files/folder/{id}/link - denyDownload toggled from true to false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link DenyDownload Toggle",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read, denyDownload: true },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          denyDownload: false,
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.denyDownload).toBe(false);
  });

  test("POST /api/2.0/files/folder/{id}/link - internal toggled from true to false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Internal Toggle",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read, internal: true },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { linkId, access: FileShare.Read, internal: false },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.internal).toBe(false);
  });

  test("POST /api/2.0/files/folder/{id}/link - Past expirationDate is silently ignored", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Past Expiry",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          expirationDate: "2020-01-01T00:00:00.000Z" as any,
        },
      });

    expect(status).toBe(200);
    expect((data.response!.sharedLink! as any).expirationDate).toBeUndefined();
    expect(data.response!.sharedLink!.isExpired).toBe(false);
  });

  test("POST /api/2.0/files/folder/{id}/link - Non-existent linkId creates link with that id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Bad LinkId",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fakeLinkId = "00000000-0000-0000-0000-000000000001";

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: {
          linkId: fakeLinkId,
          access: FileShare.Read,
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBe(fakeLinkId);
  });

  test("POST /api/2.0/files/folder/{id}/link - Update persists after set", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Persist",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: {
        linkId,
        access: FileShare.Read,
        title: "Persisted Title",
      },
    });

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBe(linkId);
    expect(data.response!.sharedLink!.title).toBe("Persisted Title");
  });

  test("POST /api/2.0/files/folder/{id}/link - Update link on subfolder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Set Folder Link Subfolder",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder Set Link" },
    });
    const folderId = folderData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: folderId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.setFolderPrimaryExternalLink({
        id: folderId,
        folderLinkRequest: {
          linkId,
          access: FileShare.Read,
          title: "Subfolder Link Title",
        },
      });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBe(linkId);
    expect(data.response!.sharedLink!.title).toBe("Subfolder Link Title");
  });

  test("POST /api/2.0/files/folder/{id}/link - Negative folderId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.folders.setFolderPrimaryExternalLink({
      id: -1,
      folderLinkRequest: { access: FileShare.Read },
    });

    expect(status).toBe(404);
  });
});

test.describe("GET /api/2.0/files/folder/{id}/link - Get folder primary external link", () => {
  test("GET /api/2.0/files/folder/{id}/link - Owner gets primary external link for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
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

  test("GET /api/2.0/files/folder/{id}/link - Subfolder inside a room also has a primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link Subfolder Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Get Folder Link Subfolder" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: folderId });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.access).toBe(FileShare.Read);
    expect(data.response!.sharedLink!.primary).toBe(true);
    expect(data.response!.sharedLink!.linkType).toBe(LinkType.External);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("GET /api/2.0/files/folder/{id}/link - Repeated calls return the same link ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link Idempotent",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: data1 } = await ownerApi.folders.getFolderPrimaryExternalLink(
      { id: roomId },
    );
    const { data: data2 } = await ownerApi.folders.getFolderPrimaryExternalLink(
      { id: roomId },
    );

    expect(data1.response!.sharedLink!.id).toBe(data2.response!.sharedLink!.id);
  });

  test("GET /api/2.0/files/folder/{id}/link - ID 0 returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .folders.getFolderPrimaryExternalLink({ id: 0 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/folder/{id}/link - Non-existent folder ID returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .folders.getFolderPrimaryExternalLink({ id: 99999999 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/folder/{id}/link - Negative folder ID returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .folders.getFolderPrimaryExternalLink({ id: -1 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/folder/{id}/link - count=0 returns 400 as invalid parameter", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link Count Zero",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.folders.getFolderPrimaryExternalLink({
      id: roomId,
      count: 0,
    });

    expect(status).toBe(400);
  });

  test("GET /api/2.0/files/folder/{id}/link - startIndex parameter does not affect the response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link StartIndex Param",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({
        id: roomId,
        startIndex: 999,
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.sharedLink!.primary).toBe(true);
  });

  test("GET /api/2.0/files/folder/{id}/link - Returned link ID is consistent with getFolderLinks", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link Consistency",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: primaryData } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });
    const { data: linksData } = await ownerApi.folders.getFolderLinks({
      id: roomId,
    });

    const primaryLinkId = primaryData.response!.sharedLink!.id;
    const primaryInList = linksData.response!.find(
      (link) => link.sharedLink!.primary === true,
    );
    expect(primaryInList).toBeDefined();
    expect(primaryInList!.sharedLink!.id).toBe(primaryLinkId);
  });

  test("GET /api/2.0/files/folder/{id}/link - After createFolderPrimaryExternalLink GET returns the created link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link After Create",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const createdLinkId = createData.response!.sharedLink!.id!;

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.id).toBe(createdLinkId);
    expect(data.response!.sharedLink!.primary).toBe(true);
    expect(data.response!.access).toBe(FileShare.Read);
  });

  test("GET /api/2.0/files/folder/{id}/link - After setFolderPrimaryExternalLink updates title, GET returns updated title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link After Set Title",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: {
        linkId,
        access: FileShare.Read,
        title: "Updated Link Title",
      },
    });

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.title).toBe("Updated Link Title");
    expect(data.response!.sharedLink!.id).toBe(linkId);
  });

  test("GET /api/2.0/files/folder/{id}/link - After setFolderPrimaryExternalLink updates denyDownload, GET returns updated denyDownload", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link After Set DenyDownload",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { linkId, access: FileShare.Read, denyDownload: true },
    });

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.denyDownload).toBe(true);
  });

  test("GET /api/2.0/files/folder/{id}/link - After setFolderPrimaryExternalLink updates internal flag, GET returns updated internal flag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link After Set Internal",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { linkId, access: FileShare.Read, internal: true },
    });

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.internal).toBe(true);
  });

  test("GET /api/2.0/files/folder/{id}/link - After setFolderPrimaryExternalLink sets password, GET reflects password is set", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link After Set Password",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: {
        linkId,
        access: FileShare.Read,
        password: "Qwerty1234!",
      },
    });

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.password).toBeDefined();
  });

  test("GET /api/2.0/files/folder/{id}/link - After setFolderPrimaryExternalLink sets expirationDate, GET reflects expirationDate", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Link After Set Expiration",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: createData } =
      await ownerApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });
    const linkId = createData.response!.sharedLink!.id!;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const expirationDate = futureDate.toISOString();

    await ownerApi.folders.setFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: {
        linkId,
        access: FileShare.Read,
        expirationDate: expirationDate as any,
      },
    });

    const { data, status } =
      await ownerApi.folders.getFolderPrimaryExternalLink({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.expirationDate).toBeDefined();
    expect(data.response!.sharedLink!.isExpired).toBe(false);
  });
});

test.describe("GET /api/2.0/files/folder/{folderId}/log - Get folder history", () => {
  test("GET /api/2.0/files/folder/{folderId}/log - Owner gets room history with correct structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History Structure",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    const entry = data.response![0];
    expect(entry.id).toBeDefined();
    expect(entry.action).toBeDefined();
    expect(entry.action.id).toBeDefined();
    expect(entry.initiator).toBeDefined();
    expect(entry.initiator.displayName).toBeTruthy();
    expect(entry.date).toBeDefined();
  });

  test("GET /api/2.0/files/folder/{folderId}/log - Newly created room has RoomCreated action in history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomCreated",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomCreated);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomRenamed after room is renamed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History Rename",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomRenamed,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { title: "Autotest Folder History Renamed" },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomCreated);
    expect(actionIds).toContain(MessageAction.RoomRenamed);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - count parameter limits number of returned entries", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History Count",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { title: "Autotest Folder History Count Renamed 1" },
    });
    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { title: "Autotest Folder History Count Renamed 2" },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
      count: 1,
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - startIndex shifts result set", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History StartIndex",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Autotest Folder History StartIndex Renamed",
      },
    });

    const { data: data0 } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
      startIndex: 0,
      count: 1,
    });
    const { data: data1, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
      startIndex: 1,
      count: 1,
    });
    expect(status).toBe(200);
    expect(data0.response![0].id).not.toBe(data1.response![0].id);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - startIndex beyond total entries returns empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History Beyond",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
      startIndex: 99999,
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBe(0);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - response count field matches array length", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History CountMatch",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Autotest Folder History CountMatch Renamed",
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.count).toBe(data.response!.length);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - fromDate and toDate filter history range", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const fromDate = new Date(Date.now() - 60000).toISOString();

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History DateFilter",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const toDate = new Date(Date.now() + 60000).toISOString();

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
      fromDate: { utcTime: fromDate },
      toDate: { utcTime: toDate },
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomCreated);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - Owner gets history of a subfolder in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: myDocsFolderId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderCreated,
    );

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder History MyDocs" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId,
    });
    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FolderCreated);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderCreated after subfolder is created in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderCreated In Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderCreated,
    );

    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "New Subfolder In Room" },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const folderEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.FolderCreated,
    );
    expect(folderEntry).toBeDefined();
    expect(folderEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - Non-existent folderId returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .folders.getFolderHistory({ folderId: 999999999 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - folderId 0 returns 400 or 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .folders.getFolderHistory({ folderId: 0 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - Owner can get history of archived room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History Archived",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomArchived,
    );

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomArchived);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomCreateUser after user is added to room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History AddUser",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomCreateUser,
    );

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomCreateUser);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomRemoveUser after user is removed from room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RemoveUser",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomRemoveUser,
    );

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomRemoveUser);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomUpdateAccessForUser after user role is changed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History ChangeRole",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomUpdateAccessForUser,
    );

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomUpdateAccessForUser);
  });

  // BUG 81641: UsersUpdatedType (4019) is not written to room history via REST API when user type is changed via updateUserType
  test.fail(
    "BUG 81641: GET /api/2.0/files/folder/{folderId}/log - History contains UsersUpdatedType after room member is promoted to DocSpace Admin",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: profileData } = await ownerApi.profiles.getSelfProfile();
      const ownerDisplayName = profileData.response!.displayName!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder History UsersUpdatedType",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data: beforeData } = await ownerApi.folders.getFolderHistory({
        folderId: roomId,
      });
      expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
        MessageAction.UsersUpdatedType,
      );

      await ownerApi.userType.updateUserType({
        type: EmployeeType.DocSpaceAdmin,
        updateMembersRequestDto: { userIds: [userId] },
      });

      const { data, status } = await ownerApi.folders.getFolderHistory({
        folderId: roomId,
      });
      expect(status).toBe(200);
      const actionIds = data.response!.map((e) => e.action?.id);
      expect(actionIds).toContain(MessageAction.UsersUpdatedType);
      const entry = data.response!.find(
        (e) => e.action?.id === MessageAction.UsersUpdatedType,
      );
      expect(entry).toBeDefined();
      expect(entry!.initiator.displayName).toBe(ownerDisplayName);
    },
  );

  test("GET /api/2.0/files/folder/{folderId}/log - History reflects correct sequence after invite, role change and removal", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History Sequence",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    const beforeActionIds = beforeData.response!.map((e) => e.action?.id);
    expect(beforeActionIds).not.toContain(MessageAction.RoomCreateUser);
    expect(beforeActionIds).not.toContain(
      MessageAction.RoomUpdateAccessForUser,
    );
    expect(beforeActionIds).not.toContain(MessageAction.RoomRemoveUser);

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomCreateUser);
    expect(actionIds).toContain(MessageAction.RoomUpdateAccessForUser);
    expect(actionIds).toContain(MessageAction.RoomRemoveUser);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderMovedToTrash after subfolder is deleted to trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderToTrash",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Subfolder To Trash" },
    });
    const subFolderId = folderData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderMovedToTrash,
    );

    await ownerApi.folders.deleteFolder({
      folderId: subFolderId,
      deleteFolder: { deleteAfter: false, immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FolderMovedToTrash);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderDeleted after subfolder is permanently deleted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderDeleted",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Subfolder Permanently Deleted" },
    });
    const subFolderId = folderData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderDeleted,
    );

    await ownerApi.folders.deleteFolder({
      folderId: subFolderId,
      deleteFolder: { deleteAfter: false, immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const folderEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.FolderDeleted,
    );
    expect(folderEntry).toBeDefined();
    expect(folderEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileMovedToTrash after file is deleted to trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileToTrash",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "File To Trash" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileMovedToTrash,
    );

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FileMovedToTrash);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderMoved after subfolder is moved to another room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: sourceRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderMoved Source",
        roomType: RoomType.CustomRoom,
      },
    });
    const sourceRoomId = sourceRoomData.response!.id!;

    const { data: destRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderMoved Dest",
        roomType: RoomType.CustomRoom,
      },
    });
    const destRoomId = destRoomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: sourceRoomId,
      createFolder: { title: "Subfolder To Move" },
    });
    const subFolderId = folderData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderMoved,
    );

    await ownerApi.operations.moveBatchItems({
      batchRequestDto: {
        folderIds: [subFolderId],
        destFolderId: destRoomId,
        deleteAfter: false,
      },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FolderMoved);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderCopied after subfolder is copied to another room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: sourceRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderCopied Source",
        roomType: RoomType.CustomRoom,
      },
    });
    const sourceRoomId = sourceRoomData.response!.id!;

    const { data: destRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderCopied Dest",
        roomType: RoomType.CustomRoom,
      },
    });
    const destRoomId = destRoomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: sourceRoomId,
      createFolder: { title: "Subfolder To Copy" },
    });
    const subFolderId = folderData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderCopied,
    );

    await ownerApi.operations.copyBatchItems({
      batchRequestDto: {
        folderIds: [subFolderId],
        destFolderId: destRoomId,
        deleteAfter: false,
      },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FolderCopied);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileMoved after file is moved to another room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: sourceRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileMoved Source",
        roomType: RoomType.CustomRoom,
      },
    });
    const sourceRoomId = sourceRoomData.response!.id!;

    const { data: destRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileMoved Dest",
        roomType: RoomType.CustomRoom,
      },
    });
    const destRoomId = destRoomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: sourceRoomId,
      createFileJsonElement: { title: "File To Move" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileMoved,
    );

    await ownerApi.operations.moveBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId: destRoomId,
        deleteAfter: false,
      },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FileMoved);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileCopied after file is copied to another room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: sourceRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileCopied Source",
        roomType: RoomType.CustomRoom,
      },
    });
    const sourceRoomId = sourceRoomData.response!.id!;

    const { data: destRoomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileCopied Dest",
        roomType: RoomType.CustomRoom,
      },
    });
    const destRoomId = destRoomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: sourceRoomId,
      createFileJsonElement: { title: "File To Copy" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileCopied,
    );

    await ownerApi.operations.copyBatchItems({
      batchRequestDto: {
        fileIds: [fileId],
        destFolderId: destRoomId,
        deleteAfter: false,
      },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: sourceRoomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FileCopied);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomChangeOwner after room owner is changed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomChangeOwner",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: newOwnerData } = await apiSdk.addMember("owner", "RoomAdmin");
    const newOwnerId = newOwnerData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomChangeOwner,
    );

    await ownerApi.sharing.changeFileOwner({
      changeOwnerRequestDto: {
        folderIds: [roomId],
        userId: newOwnerId,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomChangeOwner);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderRenamed after subfolder is renamed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderRenamed",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Subfolder Before Rename" },
    });
    const subFolderId = folderData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderRenamed,
    );

    await ownerApi.folders.renameFolder({
      folderId: subFolderId,
      createFolder: { title: "Subfolder After Rename" },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const folderEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.FolderRenamed,
    );
    expect(folderEntry).toBeDefined();
    expect(folderEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileCreated after file is created in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileCreated",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileCreated,
    );

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "New File In Room" },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FileCreated);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains AddedRoomTags after tag is added to room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History AddedRoomTags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "AutotestHistoryTag" },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.AddedRoomTags,
    );

    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["AutotestHistoryTag"] },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const tagEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.AddedRoomTags,
    );
    expect(tagEntry).toBeDefined();
    expect(tagEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains DeletedRoomTags after tag is removed from room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History DeletedRoomTags",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "AutotestHistoryTagDelete" },
    });
    await ownerApi.rooms.addRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["AutotestHistoryTagDelete"] },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.DeletedRoomTags,
    );

    await ownerApi.rooms.deleteRoomTags({
      id: roomId,
      batchTagsRequestDto: { names: ["AutotestHistoryTagDelete"] },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const tagEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.DeletedRoomTags,
    );
    expect(tagEntry).toBeDefined();
    expect(tagEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomLogoCreated after room logo is set", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomLogoCreated",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomLogoCreated,
    );

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const tmpFile = uploadResult.data.response.data as string;
    const { status: logoStatus } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile, x: 0, y: 0, width: 1, height: 1 },
    });
    expect(logoStatus).toBe(200);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const logoEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomLogoCreated,
    );
    expect(logoEntry).toBeDefined();
    expect(logoEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomLogoDeleted after room logo is removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomLogoDeleted",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const tmpFile = uploadResult.data.response.data as string;
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile, x: 0, y: 0, width: 1, height: 1 },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomLogoDeleted,
    );

    const { data: deleteData } = await ownerApi.rooms.deleteRoomLogo({
      id: roomId,
    });
    expect(deleteData.response!.logo?.original).toBeFalsy();

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const logoEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomLogoDeleted,
    );
    expect(logoEntry).toBeDefined();
    expect(logoEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomColorChanged after room icon color is changed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomColorChanged",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733" },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomColorChanged);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomColorChanged,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomCoverChanged after room cover is changed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomCoverChanged",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "1A2B3C", cover: coverId },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomCoverChanged);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomCoverChanged,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomGroupAdded after group is added to room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;
    const ownerId = profileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomGroupAdded",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomGroupAdded,
    );

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const groupEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomGroupAdded,
    );
    expect(groupEntry).toBeDefined();
    expect(groupEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomUpdateAccessForGroup after group role is changed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;
    const ownerId = profileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomUpdateAccessForGroup",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomUpdateAccessForGroup,
    );

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const groupEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomUpdateAccessForGroup,
    );
    expect(groupEntry).toBeDefined();
    expect(groupEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomGroupRemove after group is removed from room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;
    const ownerId = profileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomGroupRemove",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomGroupRemove,
    );

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const groupEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomGroupRemove,
    );
    expect(groupEntry).toBeDefined();
    expect(groupEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomUnarchived after room is restored from archive", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomUnarchived",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomUnarchived,
    );

    await ownerApi.rooms.unarchiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomUnarchived,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomInviteResend after invitations are resent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomInviteResend",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          {
            id: memberData.response!.id!,
            access: FileShare.Read,
          },
        ],
        notify: false,
      },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomInviteResend,
    );

    await ownerApi.rooms.resendEmailInvitations({
      id: roomId,
      userInvitation: { resendAll: true },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomInviteResend,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomLifeTimeSet after file lifetime is set for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomLifeTimeSet",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomLifeTimeSet,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        lifetime: {
          enabled: true,
          value: 30,
          period: RoomDataLifetimePeriod.Day,
          deletePermanently: false,
        },
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomLifeTimeSet,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomLifeTimeDisabled after file lifetime is disabled for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomLifeTimeDisabled",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        lifetime: {
          enabled: true,
          value: 30,
          period: RoomDataLifetimePeriod.Day,
          deletePermanently: false,
        },
      },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomLifeTimeDisabled,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { lifetime: { enabled: false } },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomLifeTimeDisabled,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomIndexingEnabled after file indexing is enabled in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomIndexingEnabled",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomIndexingEnabled,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { indexing: true },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomIndexingEnabled,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomIndexingDisabled after file indexing is disabled in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomIndexingDisabled",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { indexing: true },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomIndexingDisabled,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { indexing: false },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomIndexingDisabled,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderIndexReordered after room index is reordered", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderIndexReordered",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { indexing: true },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderIndexReordered,
    );

    await ownerApi.rooms.reorderRoom({ id: roomId });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.FolderIndexReordered,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  // BUG 81640: RoomIndexExportSaved event is not written to room history after index export completes via API
  test.fail(
    "BUG 81640: GET /api/2.0/files/folder/{folderId}/log - History contains RoomIndexExportSaved after room index export is completed",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: profileData } = await ownerApi.profiles.getSelfProfile();
      const ownerDisplayName = profileData.response!.displayName!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder History RoomIndexExportSaved",
          roomType: RoomType.VirtualDataRoom,
          indexing: true,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: beforeData } = await ownerApi.folders.getFolderHistory({
        folderId: roomId,
      });
      expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
        MessageAction.RoomIndexExportSaved,
      );

      const { status: exportStatus } =
        await ownerApi.rooms.startRoomIndexExport({ id: roomId });
      expect(exportStatus).toBe(200);

      await expect(async () => {
        const { data: exportData } = await ownerApi.rooms.getRoomIndexExport();
        expect(exportData.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 30_000 });

      let entry: any;
      await expect(async () => {
        const { data, status } = await ownerApi.folders.getFolderHistory({
          folderId: roomId,
        });
        expect(status).toBe(200);
        entry = data.response!.find(
          (e) => e.action?.id === MessageAction.RoomIndexExportSaved,
        );
        expect(entry).toBeDefined();
      }).toPass({ intervals: [2_000, 5_000, 10_000, 15_000], timeout: 60_000 });
      expect(entry!.initiator.displayName).toBe(ownerDisplayName);
    },
  );

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomWatermarkSet after watermark is enabled in room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomWatermarkSet",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomWatermarkSet,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        watermark: {
          enabled: true,
          additions: WatermarkAdditions.UserName,
        },
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomWatermarkSet,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomWatermarkDisabled after watermark is disabled in room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomWatermarkDisabled",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        watermark: {
          enabled: true,
          additions: WatermarkAdditions.UserName,
        },
      },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomWatermarkDisabled,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { watermark: { enabled: false } },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomWatermarkDisabled,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomDenyDownloadEnabled after downloading is restricted in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomDenyDownloadEnabled",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomDenyDownloadEnabled,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { denyDownload: true },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomDenyDownloadEnabled,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomDenyDownloadDisabled after downloading is unrestricted in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomDenyDownloadDisabled",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { denyDownload: true },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomDenyDownloadDisabled,
    );

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: { denyDownload: false },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomDenyDownloadDisabled,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileUploaded after file is uploaded to room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileUploaded",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileUploaded,
    );

    const fileContent = Buffer.from("test content");
    const { data: sessionData, status: sessionStatus } =
      await ownerApi.operations.createUploadSessionInFolder({
        folderId: roomId,
        sessionRequest: {
          fileName: "Uploaded File.docx",
          fileSize: fileContent.length,
          createNewIfExist: true,
        },
      });
    expect(sessionStatus).toBe(200);
    const sessionId = sessionData.response!.id!;

    const file = new File([fileContent], "Uploaded File.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const { status: uploadStatus } =
      await ownerApi.operations.uploadAsyncSession({
        folderId: roomId,
        sessionId,
        chunkNumber: 1,
        file,
      });
    expect(uploadStatus).toBe(200);

    const { status: finalizeStatus } =
      await ownerApi.operations.finalizeSession({
        folderId: roomId,
        sessionId,
      });
    expect(finalizeStatus).toBe(201);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const fileEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.FileUploaded,
    );
    expect(fileEntry).toBeDefined();
    expect(fileEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("BUG 81623: GET /api/2.0/files/folder/{folderId}/log - History contains FileUploaded after file is uploaded via POST /files/{folderId}/upload", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileUploaded Direct",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileUploaded,
    );

    const { status: uploadStatus } = await uploadFileToFolder(
      apiSdk,
      "owner",
      roomId,
      Buffer.from("test content"),
      "Uploaded File.docx",
      {
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        createNewIfExist: true,
      },
    );
    expect(uploadStatus).toBe(200);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const fileEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.FileUploaded,
    );
    expect(fileEntry).toBeDefined();
    expect(fileEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileRenamed after file is renamed in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileRenamed",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "File Before Rename" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileRenamed,
    );

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { title: "File After Rename" },
    });

    let fileEntry: any;
    await expect(async () => {
      const { data: historyData, status } =
        await ownerApi.folders.getFolderHistory({ folderId: roomId });
      expect(status).toBe(200);
      fileEntry = historyData.response!.find(
        (e) => e.action?.id === MessageAction.FileRenamed,
      );
      expect(fileEntry).toBeDefined();
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    expect(fileEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileDeleted after file is permanently deleted from room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileDeleted",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "File To Delete Permanently" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileDeleted,
    );

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const fileEntry = data.response!.find(
      (e) => e.action?.id === MessageAction.FileDeleted,
    );
    expect(fileEntry).toBeDefined();
    expect(fileEntry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileLocked after file is locked in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileLocked",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "File To Lock" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileLocked,
    );

    await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.FileLocked,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileUnlocked after file is unlocked in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileUnlocked",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "File To Unlock" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileUnlocked,
    );

    await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: false },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.FileUnlocked,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FileIndexChanged after file order is set via PUT /files/:fileId/order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FileIndexChanged",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "File To Reorder" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FileIndexChanged,
    );

    await ownerApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 5 },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.FileIndexChanged,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains FolderIndexChanged after folder order is set via PUT /files/:folderId/order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History FolderIndexChanged",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Subfolder To Reorder" },
    });
    const subfolderId = folderData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: subfolderId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.FolderIndexChanged,
    );

    await ownerApi.folders.setFolderOrder({
      folderId: subfolderId,
      orderRequestDto: { order: 5 },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: subfolderId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.FolderIndexChanged);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.FolderIndexChanged,
    );
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomExternalLinkCreated after room link is created", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomExternalLinkCreated",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomExternalLinkCreated,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomExternalLinkRenamed after room link is renamed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomExternalLinkRenamed",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: linkData } = await ownerApi.rooms.setRoomLink({
      id: roomId,
      roomLinkRequest: {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Original Link Title",
        denyDownload: false,
      },
    });
    const linkId = linkData.response!.sharedLink!.id!;

    const { data: beforeData } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(beforeData.response!.map((e) => e.action?.id)).not.toContain(
      MessageAction.RoomExternalLinkRenamed,
    );

    await ownerApi.rooms.setRoomLink({
      id: roomId,
      roomLinkRequest: {
        linkId,
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Renamed Link Title",
        denyDownload: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomExternalLinkRenamed,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomExternalLinkRevoked after room link is revoked", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomExternalLinkRevoked",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: primaryLinkData } =
      await ownerApi.rooms.getRoomsPrimaryExternalLink({ id: roomId });
    const primaryLinkId = primaryLinkData.response!.sharedLink!.id!;

    await ownerApi.rooms.setRoomLink({
      id: roomId,
      roomLinkRequest: {
        linkId: primaryLinkId,
        access: FileShare.None,
        linkType: LinkType.External,
        denyDownload: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const actionIds = data.response!.map((e) => e.action?.id);
    expect(actionIds).toContain(MessageAction.RoomExternalLinkRevoked);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomExternalLinkRevoked,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - History contains RoomExternalLinkDeleted after room link is deleted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: profileData } = await ownerApi.profiles.getSelfProfile();
    const ownerDisplayName = profileData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder History RoomExternalLinkDeleted",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: linkData } = await ownerApi.rooms.setRoomLink({
      id: roomId,
      roomLinkRequest: {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Link To Delete",
        denyDownload: false,
      },
    });
    const linkId = linkData.response!.sharedLink!.id!;

    await ownerApi.rooms.setRoomLink({
      id: roomId,
      roomLinkRequest: {
        linkId,
        access: FileShare.None,
        linkType: LinkType.External,
        title: "Link To Delete",
        denyDownload: false,
      },
    });

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    const entry = data.response!.find(
      (e) => e.action?.id === MessageAction.RoomExternalLinkDeleted,
    );
    expect(entry).toBeDefined();
    expect(entry!.initiator.displayName).toBe(ownerDisplayName);
  });
});

test.describe("POST /api/2.0/files/folder/{folderId}/log/report - Create report of folder history", () => {
  test("POST /api/2.0/files/folder/{folderId}/log/report - Owner generates report for a room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Folder History Owner",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(typeof data.response).toBe("string");
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response).toContain("/doceditor");
    expect(data.response).toContain("fileid=");
    expect(data.response).toContain(apiSdk.tokenStore.portalBaseUrl);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Response has correct structure", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Folder History Structure",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.status).toBeDefined();
    expect(data.statusCode).toBeDefined();
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Owner generates report for a room with rich history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Folder History Rich",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.updateRoom({
      id: roomId,
      updateRoomRequest: {
        title: "Autotest Report Folder History Rich Renamed",
      },
    });

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Report Rich History File" },
    });

    const { data, status } = await ownerApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Owner generates report for an archived room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Folder History Archived",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Non-existent folderId returns 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { status } = await apiSdk
      .forRole("owner")
      .folders.createReportFolderHistory({ folderId: 999999999 });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - folderId 0 returns 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { status } = await apiSdk
      .forRole("owner")
      .folders.createReportFolderHistory({ folderId: 0 });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Negative folderId returns 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { status } = await apiSdk
      .forRole("owner")
      .folders.createReportFolderHistory({ folderId: -1 });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Owner generates report for a subfolder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Subfolder",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Report Subfolder Child" },
    });
    const subFolderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.createReportFolderHistory({
      folderId: subFolderId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response).toContain("/doceditor");
    expect(data.response).toContain("fileid=");
  });
});

test.describe("POST /api/2.0/files/{folderId}/upload - Upload file via SDK", () => {
  test("BUG 81536: POST /api/2.0/files/{folderId}/upload - Owner uploads file via SDK returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Upload Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.uploadFile({
      folderId,
      file: new File(
        [Buffer.from("Autotest upload content")],
        "autotest-upload.txt",
        { type: "text/plain" },
      ),
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });
});

test.describe("POST /api/2.0/files/@my/upload - Upload file to My Documents via SDK", () => {
  test("BUG 81538: POST /api/2.0/files/@my/upload - Owner uploads file to My Documents via SDK returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.uploadFileToMy({
      file: new File(
        [Buffer.from("Autotest upload content")],
        "autotest-my-upload.txt",
        { type: "text/plain" },
      ),
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });
});

test.describe("GET /api/2.0/files/filesusedspace - Get files used space statistics", () => {
  // Catches: if the statistics endpoint fails for an authenticated owner (broken handler, wrong route)
  test("GET /api/2.0/files/filesusedspace - Owner gets used space statistics returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  // Catches: if any mandatory section (myDocuments, trash, archive, rooms) is missing from the response
  // or if the section model loses the title/usedSpace fields
  test("GET /api/2.0/files/filesusedspace - Response contains all required space sections with title and usedSpace fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("initialize space sections", async () => {
      await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Structure Init" },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Structure Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.archiveRoom({
        id: roomData.response!.id!,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);
    });

    const { data, status } = await ownerApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);
    expect(data.response!.myDocumentsUsedSpace).toBeDefined();
    // Catches: if section title is renamed or localisation key is broken
    expect(data.response!.myDocumentsUsedSpace!.title).toBe("My documents");
    expect(typeof data.response!.myDocumentsUsedSpace!.usedSpace).toBe(
      "number",
    );
    expect(data.response!.trashUsedSpace).toBeDefined();
    expect(data.response!.trashUsedSpace!.title).toBe("Trash");
    expect(typeof data.response!.trashUsedSpace!.usedSpace).toBe("number");
    expect(data.response!.archiveUsedSpace).toBeDefined();
    expect(data.response!.archiveUsedSpace!.title).toBeDefined();
    expect(typeof data.response!.archiveUsedSpace!.usedSpace).toBe("number");
    expect(data.response!.roomsUsedSpace).toBeDefined();
    expect(data.response!.roomsUsedSpace!.title).toBe("Rooms");
    expect(typeof data.response!.roomsUsedSpace!.usedSpace).toBe("number");
  });

  // Catches: if usedSpace counters return negative values due to integer underflow or serialization bug
  test("GET /api/2.0/files/filesusedspace - All usedSpace values are non-negative numbers", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("initialize space sections", async () => {
      await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest NonNeg Init" },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest NonNeg Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.archiveRoom({
        id: roomData.response!.id!,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);
    });

    const { data, status } = await ownerApi.folders.getFilesUsedSpace();
    const response = data.response!;

    expect(status).toBe(200);
    expect(response.myDocumentsUsedSpace!.usedSpace).toBeGreaterThanOrEqual(0);
    expect(response.trashUsedSpace!.usedSpace).toBeGreaterThanOrEqual(0);
    expect(response.archiveUsedSpace!.usedSpace).toBeGreaterThanOrEqual(0);
    expect(response.roomsUsedSpace!.usedSpace).toBeGreaterThanOrEqual(0);
  });

  // Catches: if myDocumentsUsedSpace is not recalculated after a file is added to My Documents
  // (counter is cached without invalidation, or the file size is not attributed to myDocuments)
  test("GET /api/2.0/files/filesusedspace - myDocumentsUsedSpace increases after file is created in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest UsedSpace Init" },
    });

    const { data: beforeData } = await ownerApi.folders.getFilesUsedSpace();
    const spaceBefore = beforeData.response!.myDocumentsUsedSpace!.usedSpace!;

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest UsedSpace Check" },
    });

    const { data: afterData, status } =
      await ownerApi.folders.getFilesUsedSpace();
    const spaceAfter = afterData.response!.myDocumentsUsedSpace!.usedSpace!;

    expect(status).toBe(200);
    expect(spaceAfter).toBeGreaterThan(spaceBefore);
  });

  // Catches: if trashUsedSpace is not recalculated after a file is moved to the trash
  // (counter is not updated on soft delete, or file size is removed from trash bucket immediately)
  test("GET /api/2.0/files/filesusedspace - trashUsedSpace increases after file is moved to trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Trash UsedSpace" },
    });
    const fileId = fileData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFilesUsedSpace();
    const trashBefore = beforeData.response!.trashUsedSpace!.usedSpace!;

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: afterData, status } =
      await ownerApi.folders.getFilesUsedSpace();
    const trashAfter = afterData.response!.trashUsedSpace!.usedSpace!;

    expect(status).toBe(200);
    // Catches: if trashUsedSpace is not recalculated after soft delete
    expect(trashAfter).toBeGreaterThan(trashBefore);
  });

  // Catches: if roomsUsedSpace is not recalculated after a file is added to a room
  // (counter is cached without invalidation, or file size is not attributed to rooms bucket)
  test("GET /api/2.0/files/filesusedspace - roomsUsedSpace increases after file is created in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms Space",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: beforeData } = await ownerApi.folders.getFilesUsedSpace();
    const roomsBefore = beforeData.response?.roomsUsedSpace?.usedSpace ?? 0;

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room Space File" },
    });

    const { data: afterData, status } =
      await ownerApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);
    // Catches: if roomsUsedSpace is not updated after file creation in a room
    expect(afterData.response!.roomsUsedSpace!.usedSpace).toBeGreaterThan(
      roomsBefore,
    );
  });

  // Catches: if archiveUsedSpace is not recalculated after a room with files is archived
  // (counter is not attributed to archive bucket after archiveRoom operation)
  test("GET /api/2.0/files/filesusedspace - archiveUsedSpace increases after room with file is archived", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Archive Space",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Archive Space File" },
    });

    const { data: beforeData } = await ownerApi.folders.getFilesUsedSpace();
    const archiveBefore = beforeData.response?.archiveUsedSpace?.usedSpace ?? 0;

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: afterData, status } =
      await ownerApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);
    // Catches: if archiveUsedSpace is not updated after room archival
    expect(afterData.response!.archiveUsedSpace!.usedSpace).toBeGreaterThan(
      archiveBefore,
    );
  });

  // Catches: if archiveUsedSpace section title is renamed or localisation key is broken
  test("GET /api/2.0/files/filesusedspace - archiveUsedSpace section has correct title", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Archive Title",
        roomType: RoomType.CustomRoom,
      },
    });
    await ownerApi.rooms.archiveRoom({
      id: roomData.response!.id!,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);
    expect(data.response!.archiveUsedSpace).toBeDefined();
    // Catches: if archive section title is renamed or localisation key is broken
    expect(data.response!.archiveUsedSpace!.title).toBe("Archive");
  });

  // Catches: if aiAgentsUsedSpace section loses title or usedSpace fields when it appears
  // Note: section only appears when AI Agents feature is active (paid/configured).
  // Creating an AiRoom alone does not trigger aiAgentsUsedSpace in the response.
  // This test verifies the section structure is correct whenever it is present.
  test("GET /api/2.0/files/filesusedspace - aiAgentsUsedSpace section has correct structure when present", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);

    if (data.response?.aiAgentsUsedSpace !== undefined) {
      // Catches: if aiAgentsUsedSpace title is missing or usedSpace is negative
      expect(data.response.aiAgentsUsedSpace.title).toBeDefined();
      expect(data.response.aiAgentsUsedSpace.usedSpace).toBeGreaterThanOrEqual(
        0,
      );
    }
  });

  // BUG 81648: sample files are injected as a side effect of delete operations, causing
  // myDocumentsUsedSpace to stay the same or increase instead of decreasing after hard delete.
  // Catches: if hard delete does not remove file size from myDocumentsUsedSpace
  test.fail(
    "BUG 81648: GET /api/2.0/files/filesusedspace - myDocumentsUsedSpace decreases after hard delete",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Hard Delete Warmup" },
      });

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Hard Delete Target" },
      });
      const fileId = fileData.response!.id!;

      const { data: beforeData } = await ownerApi.folders.getFilesUsedSpace();
      const spaceBefore = beforeData.response!.myDocumentsUsedSpace!.usedSpace!;

      await ownerApi.files.deleteFile({
        fileId,
        _delete: { immediately: true },
      });
      await waitForOperation(ownerApi.operations);

      const { data: afterData, status } =
        await ownerApi.folders.getFilesUsedSpace();

      expect(status).toBe(200);
      // Catches: if myDocumentsUsedSpace is not updated after hard delete
      expect(afterData.response!.myDocumentsUsedSpace!.usedSpace).toBeLessThan(
        spaceBefore,
      );
    },
  );

  // BUG 81648: getFileInfo triggers sample file injection, causing usedSpace to jump.
  // Catches: if GET requests (metadata read) incorrectly mutate usedSpace counters
  test.fail(
    "BUG 81648: GET /api/2.0/files/filesusedspace - usedSpace does not change after reading file metadata",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Metadata Read" },
      });
      const fileId = fileData.response!.id!;

      const { data: beforeData } = await ownerApi.folders.getFilesUsedSpace();
      const spaceBefore = beforeData.response!.myDocumentsUsedSpace!.usedSpace!;

      await ownerApi.files.getFileInfo({ fileId });
      await ownerApi.files.getFileInfo({ fileId });
      await ownerApi.files.getFileInfo({ fileId });

      const { data: afterData, status } =
        await ownerApi.folders.getFilesUsedSpace();

      expect(status).toBe(200);
      // Catches: if repeated metadata reads cause usedSpace to drift
      expect(afterData.response!.myDocumentsUsedSpace!.usedSpace).toBe(
        spaceBefore,
      );
    },
  );

  // Catches: if usedSpace is computed incorrectly when multiple files exist
  // (e.g. only last file counted, or space reset instead of accumulated)
  test("GET /api/2.0/files/filesusedspace - usedSpace increases cumulatively with each file created", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Multi Warmup" },
    });

    const { data: s0Data } = await ownerApi.folders.getFilesUsedSpace();
    const s0 = s0Data.response!.myDocumentsUsedSpace!.usedSpace!;

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Multi File 1" },
    });
    const { data: s1Data } = await ownerApi.folders.getFilesUsedSpace();
    const s1 = s1Data.response!.myDocumentsUsedSpace!.usedSpace!;

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Multi File 2" },
    });
    const { data: s2Data } = await ownerApi.folders.getFilesUsedSpace();
    const s2 = s2Data.response!.myDocumentsUsedSpace!.usedSpace!;

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Multi File 3" },
    });
    const { data: s3Data, status } = await ownerApi.folders.getFilesUsedSpace();
    const s3 = s3Data.response!.myDocumentsUsedSpace!.usedSpace!;

    expect(status).toBe(200);
    // Catches: if space does not grow monotonically with each file
    expect(s1).toBeGreaterThan(s0);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
    // Catches: if total increase does not equal sum of individual increments
    expect(s3 - s0).toBe(s1 - s0 + (s2 - s1) + (s3 - s2));
  });

  // BUG 81648: updateFile triggers sample file injection, causing usedSpace to jump.
  // Catches: if renaming a file (metadata-only update) incorrectly changes usedSpace
  // (title change has no effect on file size, counter must not drift)
  test.fail(
    "BUG 81648: GET /api/2.0/files/filesusedspace - usedSpace does not change after renaming a file",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Rename Before" },
      });
      const fileId = fileData.response!.id!;

      const { data: beforeData } = await ownerApi.folders.getFilesUsedSpace();
      const spaceBefore = beforeData.response!.myDocumentsUsedSpace!.usedSpace!;

      await ownerApi.files.updateFile({
        fileId,
        updateFile: { title: "Autotest Rename After" },
      });

      const { data: afterData, status } =
        await ownerApi.folders.getFilesUsedSpace();

      expect(status).toBe(200);
      // Catches: if metadata update (rename) incorrectly affects the storage counter
      expect(afterData.response!.myDocumentsUsedSpace!.usedSpace).toBe(
        spaceBefore,
      );
    },
  );

  // BUG 81648: skip instead of test.fail because the bug is non-deterministic.
  // test.fail requires the test to always fail; here the bug only reproduces ~60-80% of runs
  // depending on whether sample file injection completes between consecutive getFilesUsedSpace calls.
  test.skip("BUG 81648: GET /api/2.0/files/filesusedspace - returns consistent results on repeated calls without modifications", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Stable Init" },
    });

    const { data: call1 } = await ownerApi.folders.getFilesUsedSpace();
    const { data: call2 } = await ownerApi.folders.getFilesUsedSpace();
    const { data: call3, status } = await ownerApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);
    // Catches: if space counter is non-deterministic between consecutive reads
    expect(call1.response!.myDocumentsUsedSpace!.usedSpace).toBe(
      call2.response!.myDocumentsUsedSpace!.usedSpace,
    );
    expect(call2.response!.myDocumentsUsedSpace!.usedSpace).toBe(
      call3.response!.myDocumentsUsedSpace!.usedSpace,
    );
  });

  // Catches: if usedSpace or title fields have wrong types
  // (e.g. usedSpace returned as string "1024" instead of number 1024)
  test("GET /api/2.0/files/filesusedspace - all fields have correct data types", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("initialize all sections", async () => {
      await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Types Init" },
      });
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Types Room",
          roomType: RoomType.CustomRoom,
        },
      });
      await ownerApi.rooms.archiveRoom({
        id: roomData.response!.id!,
        archiveRoomRequest: { deleteAfter: false },
      });
      await waitForOperation(ownerApi.operations);
    });

    const { data, status } = await ownerApi.folders.getFilesUsedSpace();
    const r = data.response!;

    expect(status).toBe(200);

    for (const section of [
      r.myDocumentsUsedSpace,
      r.trashUsedSpace,
      r.archiveUsedSpace,
      r.roomsUsedSpace,
    ]) {
      // Catches: if usedSpace is returned as string instead of number
      expect(typeof section!.usedSpace).toBe("number");
      // Catches: if usedSpace is a float (fractional bytes are not valid)
      expect(Number.isInteger(section!.usedSpace)).toBe(true);
      // Catches: if title is returned as null or non-string
      expect(typeof section!.title).toBe("string");
      expect(section!.title!.length).toBeGreaterThan(0);
    }
  });
});

test.describe("GET /api/2.0/files/filesusedspace - Soft delete conservation check", () => {
  // Catches: if soft delete does not correctly move file size from My Documents to Trash.
  // Both create and delete operations trigger sample file injection on first call.
  // Warmup create + warmup delete before baseline ensures both injections fire before measuring,
  // so the actual target delete does not cause a false usedSpace increase.
  test("GET /api/2.0/files/filesusedspace - Soft delete decreases myDocumentsUsedSpace and increases trashUsedSpace by the same amount", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Conservation Warmup Create" },
    });

    const { data: warmupDeleteData } =
      await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: {
          title: "Autotest Conservation Warmup Delete",
        },
      });
    await ownerApi.files.deleteFile({
      fileId: warmupDeleteData.response!.id!,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Conservation Target" },
    });
    const fileId = fileData.response!.id!;

    const { data: withFileData } = await ownerApi.folders.getFilesUsedSpace();
    const myDocsBefore =
      withFileData.response!.myDocumentsUsedSpace!.usedSpace!;
    const trashBefore = withFileData.response?.trashUsedSpace?.usedSpace ?? 0;

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data: afterData, status } =
      await ownerApi.folders.getFilesUsedSpace();
    const myDocsAfter = afterData.response!.myDocumentsUsedSpace!.usedSpace!;
    const trashAfter = afterData.response!.trashUsedSpace!.usedSpace!;

    expect(status).toBe(200);
    // Catches: if myDocumentsUsedSpace does not decrease after soft delete
    expect(myDocsAfter).toBeLessThan(myDocsBefore);
    // Catches: if trashUsedSpace does not increase after soft delete
    expect(trashAfter).toBeGreaterThan(trashBefore);
    // Catches: if space is double-counted -- removed from myDocs must equal added to trash
    expect(trashAfter - trashBefore).toBe(myDocsBefore - myDocsAfter);
  });
});

test.describe("GET /api/2.0/files/filesusedspace - Reports zero space when files already exist in My Documents", () => {
  // BUG 81648: getFilesUsedSpace returns {} (no myDocumentsUsedSpace) even when files already
  // exist in My Documents. The method only starts counting space after a write operation
  // (e.g. createFileInMyDocuments) triggers a recalculation. Pre-existing files are ignored.
  test.fail(
    "BUG 81648: GET /api/2.0/files/filesusedspace - Returns myDocumentsUsedSpace when files already exist in My Documents",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      // Call getFilesUsedSpace FIRST (before any other folder API calls) to reproduce
      // the bug: pre-existing files are ignored until another folder API call warms up the index
      const { data: initData, status } =
        await ownerApi.folders.getFilesUsedSpace();

      // Confirm files actually exist in My Documents at the time of the call
      const { data: myFolderData } = await ownerApi.folders.getMyFolder();
      const filesInMyDocuments = myFolderData.response?.files ?? [];
      expect(filesInMyDocuments.length).toBeGreaterThan(0);

      expect(status).toBe(200);
      // Catches: method returns {} (myDocumentsUsedSpace absent) despite files existing in My Documents
      expect(initData.response?.myDocumentsUsedSpace).toBeDefined();
      expect(
        initData.response?.myDocumentsUsedSpace?.usedSpace,
      ).toBeGreaterThan(0);
    },
  );
});
