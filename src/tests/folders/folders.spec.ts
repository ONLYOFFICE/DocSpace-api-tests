import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FoldersApi, RoomType, SortOrder } from "@onlyoffice/docspace-api-sdk";

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
  test.fail(
    "BUG 81365: POST /files/{folderId}/upload/check - Duplicate titles in request return single conflict",
    async ({ apiSdk }) => {
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
    },
  );

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
