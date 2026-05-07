import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  FilterType,
  FoldersApi,
  RoomType,
  SortOrder,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

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

    await test.step("DELETE folder (immediately: true) — operation is created", async () => {
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

    await test.step("DELETE folder — folder no longer accessible after deletion", async () => {
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

    await test.step("DELETE folder (immediately: false) — operation is created", async () => {
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

    await test.step("DELETE folder — folder appears in trash, not permanently deleted", async () => {
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

    await test.step("Owner deletes DocSpaceAdmin's folder — operation is created", async () => {
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

    await test.step("Owner deletes DocSpaceAdmin's folder — folder no longer accessible", async () => {
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

    await test.step("DELETE folder in room — operation is created", async () => {
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

    await test.step("DELETE folder in room — folder no longer accessible", async () => {
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

    await test.step("DELETE parent folder — operation is created", async () => {
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

    await test.step("DELETE parent folder — parent and child both inaccessible", async () => {
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

    await test.step("DELETE folder with files — operation is created", async () => {
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

    await test.step("DELETE folder with files — folder no longer accessible", async () => {
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

    console.log(
      "sections:",
      data.response?.map((s) => ({
        id: s.current?.id,
        title: s.current?.title,
        total: s.total,
        files: s.files?.length,
        folders: s.folders?.length,
      })),
    );

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

    console.log("first section:", JSON.stringify(data.response?.[0], null, 2));

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

    console.log(
      "sections withoutTrash:true:",
      data.response?.map((s) => ({
        id: s.current?.id,
        title: s.current?.title,
      })),
    );

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

    console.log(
      "sections default:",
      data.response?.map((s) => ({
        id: s.current?.id,
        title: s.current?.title,
      })),
    );

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
    console.log("FoldersOnly My Docs section:", {
      files: myDocsSection?.files,
      folders: myDocsSection?.folders?.map((f) => f.title),
    });

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
    console.log("FilesOnly My Docs section:", {
      files: myDocsSection?.files?.map((f) => f.title),
      folders: myDocsSection?.folders,
    });

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
    console.log(
      "CustomRooms filter folders:",
      allFolders.map((f) => f.title),
    );

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
    console.log(
      "FillingFormsRooms filter folders:",
      allFolders.map((f) => f.title),
    );

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
    console.log(
      "PublicRooms filter folders:",
      allFolders.map((f) => f.title),
    );

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

    console.log(
      "count:1 sections:",
      data.response?.map((s) => ({
        title: s.current?.title,
        files: s.files?.length,
        folders: s.folders?.length,
      })),
    );

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
    console.log(
      "filterValue result files:",
      allFiles.map((f) => f.title),
    );

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

    console.log(
      "no-match totals:",
      data.response?.map((s) => ({
        title: s.current?.title,
        total: s.total,
      })),
    );

    expect(status).toBe(200);
    const totalItems = data.response!.reduce(
      (sum, s) => sum + (s.total ?? 0),
      0,
    );
    expect(totalItems).toBe(0);
  });
});
