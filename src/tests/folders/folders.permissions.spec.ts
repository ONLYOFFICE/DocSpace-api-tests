import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  Configuration,
  FileShare,
  FoldersApi,
  RoomType,
  SubjectType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { uploadFileToFolder } from "@/src/helpers/upload-file";

test.describe("GET /api/2.0/files/folder/:folderId/path - access control", () => {
  test("GET /api/2.0/files/folder/:folderId/path - Owner can get path of their own folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Path Owner" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Folder Path Owner");
  });

  test("GET /api/2.0/files/folder/:folderId/path - anonymous user cannot get folder path", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Path Anon" },
    });
    const folderId = folderData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.getFolderPath({ folderId });

    expect(status).toBe(401);
  });

  test("BUG 78928: GET /api/2.0/files/folder/:folderId/path - User without access cannot get path of owner's My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Path User No Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.folders.getFolderPath({ folderId });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain(
      "You don't have enough permission to view the folder content",
    );
  });

  test("BUG 78928: GET /api/2.0/files/folder/:folderId/path - Guest without access cannot get path of owner's My Documents folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Path Guest No Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.folders.getFolderPath({ folderId });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain(
      "You don't have enough permission to view the folder content",
    );
  });

  test("GET /api/2.0/files/folder/:folderId/path - User with Read access gets 200 and path contains folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Path User Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Path User Read" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Folder Path User Read");
  });

  test("GET /api/2.0/files/folder/:folderId/path - Guest with Read access gets 200 and path contains folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Path Guest Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Path Guest Read" },
    });
    const folderId = folderData.response!.id!;

    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Folder Path Guest Read");
  });

  test("GET /api/2.0/files/folder/:folderId/path - DocSpaceAdmin gets 200 and path contains folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Path DocSpaceAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Path DocSpaceAdmin" },
    });
    const folderId = folderData.response!.id!;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await adminApi.folders.getFolderPath({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    const titles = data.response!.map((e) => e.title);
    expect(titles).toContain("Autotest Folder Path DocSpaceAdmin");
  });
});

test.describe("DELETE /api/2.0/files/folder/:folderId - access control", () => {
  test("DELETE /api/2.0/files/folder/:folderId - anonymous cannot delete folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Anon Delete" },
    });
    const folderId = folderData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(401);
  });

  test("BUG 79459: DELETE /api/2.0/files/folder/:folderId - RoomAdmin cannot delete owner's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For RoomAdmin Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder RoomAdmin Delete" },
    });
    const folderId = folderData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 79459: DELETE /api/2.0/files/folder/:folderId - User cannot delete owner's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For User Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder User Delete" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/files/folder/:folderId - DocSpaceAdmin can delete owner's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For DocSpaceAdmin Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder DocSpaceAdmin Delete" },
    });
    const folderId = folderData.response!.id!;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    // Invite DocSpaceAdmin to the room with RoomManager access (9)
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: 9 }],
        notify: false,
      },
    });

    await test.step("DocSpaceAdmin deletes owner's folder  -  operation is created", async () => {
      const { data, status } = await adminApi.folders.deleteFolder({
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

    await test.step("DocSpaceAdmin deletes owner's folder  -  folder no longer accessible", async () => {
      await expect(async () => {
        const { status } = await adminApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - ContentCreator can delete their own folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For ContentCreator Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;

    // Invite as ContentCreator (11)
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: 11 }],
        notify: false,
      },
    });

    const { data: folderData } = await userApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder By ContentCreator" },
    });
    const folderId = folderData.response!.id!;

    await test.step("ContentCreator deletes own folder  -  operation is created", async () => {
      const { data, status } = await userApi.folders.deleteFolder({
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

    await test.step("ContentCreator deletes own folder  -  folder no longer accessible", async () => {
      await expect(async () => {
        const { status } = await userApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - RoomAdmin can delete their own folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For RoomAdmin Own Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    // Invite as RoomManager (9)
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: 9 }],
        notify: false,
      },
    });

    const { data: folderData } = await roomAdminApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder By RoomAdmin" },
    });
    const folderId = folderData.response!.id!;

    await test.step("RoomAdmin deletes own folder  -  operation is created", async () => {
      const { data, status } = await roomAdminApi.folders.deleteFolder({
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

    await test.step("RoomAdmin deletes own folder  -  folder no longer accessible", async () => {
      await expect(async () => {
        const { status } = await roomAdminApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("DELETE /api/2.0/files/folder/:folderId - Owner can delete RoomAdmin's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Owner Deletes RoomAdmin Folder",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    // Invite as ContentCreator (11) so RoomAdmin can create folders
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: 11 }],
        notify: false,
      },
    });

    const { data: folderData } = await roomAdminApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder By RoomAdmin For Owner Delete" },
    });
    const folderId = folderData.response!.id!;

    await test.step("Owner deletes RoomAdmin's folder  -  operation is created", async () => {
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

    await test.step("Owner deletes RoomAdmin's folder  -  folder no longer accessible", async () => {
      await expect(async () => {
        const { status } = await ownerApi.folders.getFolderByFolderId({
          folderId,
        });
        expect(status).not.toBe(200);
      }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
    });
  });

  test("BUG 79459: DELETE /api/2.0/files/folder/:folderId - Read-only room member cannot delete owner's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Read Member Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Read Member Delete" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;

    // Invite as Read (2)
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: 2 }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 79459: DELETE /api/2.0/files/folder/:folderId - ContentCreator cannot delete another user's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For ContentCreator Delete Other",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder ContentCreator Delete Other" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;

    // Invite as ContentCreator (11)
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: 11 }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 79459: DELETE /api/2.0/files/folder/:folderId - Guest cannot delete owner's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Guest Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Guest Delete" },
    });
    const folderId = folderData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /files/{folderId}/upload/check - access control", () => {
  // Catches: unauthenticated users can bypass auth and check folder contents
  test("POST /files/{folderId}/upload/check - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Auth",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["Some File.docx"] },
    });

    expect(status).toBe(401);
  });

  // Catches: guests with Read access can check uploads despite having no upload permissions
  test("POST /files/{folderId}/upload/check - Guest with Read access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Guest",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: folderId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await guestApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["Some File.docx"] },
    });

    expect(status).toBe(403);
  });

  // Read-only access does not grant upload rights
  test("POST /files/{folderId}/upload/check - User with Read access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check User Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: folderId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await userApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["Some File.docx"] },
    });

    expect(status).toBe(403);
  });

  // Editing access = edit existing files only, does not grant upload/create rights
  test("POST /files/{folderId}/upload/check - User with Editing access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check User Editing",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: folderId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { status } = await userApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["New File.docx"] },
    });

    expect(status).toBe(403);
  });

  // Catches: RoomAdmin is blocked from checking uploads in their own room
  test("POST /files/{folderId}/upload/check - RoomAdmin gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: folderId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["New File.docx"] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // DocSpaceAdmin needs explicit RoomManager invitation to write into owner's rooms
  test("POST /files/{folderId}/upload/check - DocSpaceAdmin gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check DocSpaceAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: folderId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await adminApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["New File.docx"] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // Catches: Owner is unexpectedly blocked from checking uploads in their own room
  test("POST /files/{folderId}/upload/check - Owner gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Owner",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["New File.docx"] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // ContentCreator has upload rights in the room - checkUpload should be allowed
  test("POST /files/{folderId}/upload/check - ContentCreator gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check ContentCreator",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: folderId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["New File.docx"] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // Archived room is read-only - upload check should be denied
  test("POST /files/{folderId}/upload/check - Archived room returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Upload Check Archived",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    await ownerApi.rooms.archiveRoom({
      id: folderId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.folders.checkUpload({
      folderId,
      checkUploadRequest: { filesTitle: ["New File.docx"] },
    });

    expect(status).toBe(403);
  });
});

test.describe("GET /files/:folderId/formfilter - access control", () => {
  test("GET /files/:folderId/formfilter - User with Read access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Filter Read Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Filter Read" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolder({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/:folderId/formfilter - Owner gets form filter for another user's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Owner Filter Other User",
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

    const { data: folderData } = await userApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder By User For Owner Filter" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolder({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("GET /api/2.0/files/folder/:folderId - access control", () => {
  test("BUG 81460: GET /api/2.0/files/folder/:folderId - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Info Auth",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Info Anon" },
    });
    const folderId = folderData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/folder/:folderId - User without access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Info User No Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/folder/:folderId - User with Read access gets 200 and correct access field", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Info Read Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Info Read" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.response!.access).toBe(FileShare.Read);
  });

  test("GET /api/2.0/files/folder/:folderId - Guest without access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Info Guest No Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/folder/:folderId - Owner gets folder info for another user's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Owner Info Other User",
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

    const { data: folderData } = await userApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder By User For Owner Info" },
    });
    const folderId = folderData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderInfo({ folderId });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(folderId);
  });
});

test.describe("GET /api/2.0/files/:folderId/subfolders - access control", () => {
  test("GET /api/2.0/files/:folderId/subfolders - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Subfolders Auth",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder Anon Auth" },
    });

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.getFolders({ folderId: roomId });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User without access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Subfolders No Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.folders.getFolders({ folderId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User with Read access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Subfolders Read Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder Read Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Guest without access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Subfolders Guest No Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.folders.getFolders({ folderId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Owner gets subfolders of another user's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Owner Gets Other User Subfolders",
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

    const { data: folderData } = await userApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder By User For Owner" },
    });
    const folderId = folderData.response!.id!;
    await userApi.folders.createFolder({
      folderId,
      createFolder: { title: "Autotest Nested Subfolder By User" },
    });

    const { data, status } = await ownerApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User without room membership gets 403 for Public Room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Public Room For Non-member Subfolders",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In Public Room Non-member" },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/:folderId/subfolders - Guest with Read access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Guest Read Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder Guest Read" },
    });
    const folderId = folderData.response!.id!;

    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.folders.getFolders({ folderId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - DocSpaceAdmin with room access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For DocSpaceAdmin Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder For Admin" },
    });

    const { data, status } = await adminApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  // BUG 81463: GET /api/2.0/files/:folderId/subfolders returns 403 for RoomManager access
  // while lower roles (ContentCreator, Review, Comment) return 200.
  // Actual response: { "error": { "message": "You don't have enough permission to view the folder content",
  // "type": "System.InvalidOperationException", "hresult": -2146233079 }, "status": 1, "statusCode": 403 }
  test.fail(
    "BUG 81463: GET /api/2.0/files/:folderId/subfolders - User with RoomManager access gets 200",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room For RoomManager Subfolders",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;
      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: "Autotest Subfolder RoomManager" },
      });

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      const { data, status } = await userApi.folders.getFolders({
        folderId: roomId,
      });

      expect(status).toBe(200);
      expect(Array.isArray(data.response)).toBe(true);
    },
  );

  test("GET /api/2.0/files/:folderId/subfolders - User with ContentCreator access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For ContentCreator Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder ContentCreator" },
    });

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

    const { data, status } = await userApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User with Review access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Review Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder Review" },
    });

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Review }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User with Comment access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Comment Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder Comment" },
    });

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Comment }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User with FillForms access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For FillForms Subfolders",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder FillForms" },
    });

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.FillForms }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User with Restrict access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Restrict Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder Restrict" },
    });

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Restrict }],
        notify: false,
      },
    });

    const { status } = await userApi.folders.getFolders({ folderId: roomId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/:folderId/subfolders - DocSpaceAdmin without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;
    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder DocSpaceAdmin No Access" },
    });
    const folderId = folderData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.folders.getFolders({ folderId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/:folderId/subfolders - User with Read access in archived room gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Archived Room For User Subfolders",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Subfolder In Archived Room" },
    });

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await userApi.folders.getFolders({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("GET /api/2.0/files/@root - access control", () => {
  test("GET /api/2.0/files/@root - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.folders.getRootFolders({});

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/@root - Owner gets 200 and sees non-empty sections", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .folders.getRootFolders({});

    expect(status).toBe(200);
    const ownerTitles = data.response!.map((s) => s.current?.title);
    expect(ownerTitles).toContain("My documents");
    expect(ownerTitles).toContain("Rooms");
    expect(ownerTitles).toContain("Trash");
  });

  test("GET /api/2.0/files/@root - Regular User gets 200 and sees own sections", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.folders.getRootFolders({});

    expect(status).toBe(200);
    const userTitles = data.response!.map((s) => s.current?.title);
    expect(userTitles).toContain("My documents");
    expect(userTitles).toContain("Rooms");
    expect(userTitles).toContain("Trash");
  });

  test("GET /api/2.0/files/@root - Guest gets 200 and does not see My documents", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.folders.getRootFolders({});

    expect(status).toBe(200);
    const guestTitles = data.response!.map((s) => s.current?.title);
    expect(guestTitles).not.toContain("My documents");
    expect(guestTitles).toContain("Rooms");
    expect(guestTitles).toContain("Trash");
  });

  test("GET /api/2.0/files/@root - DocSpaceAdmin gets 200 and sees own sections", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.folders.getRootFolders({});

    expect(status).toBe(200);
    const adminTitles = data.response!.map((s) => s.current?.title);
    expect(adminTitles).toContain("My documents");
    expect(adminTitles).toContain("Rooms");
    expect(adminTitles).toContain("Trash");
  });

  test("GET /api/2.0/files/@root - Room member sees their room in sections", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomTitle = "Autotest Room For Root Member Access";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: roomTitle,
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
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getRootFolders({});

    const allFolders = data.response!.flatMap((s) => s.folders ?? []);

    expect(status).toBe(200);
    const titles = allFolders.map((f) => f.title);
    expect(titles).toContain(roomTitle);
  });
});

test.describe("GET /api/2.0/files/@favorites - access control", () => {
  test("GET /api/2.0/files/@favorites - Anonymous user gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.folders.getFavoritesFolder({});

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/@favorites - Guest user can access own empty favorites", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    expect(data.response?.files).toEqual([]);
    expect(data.response?.total).toBe(0);
  });

  test("GET /api/2.0/files/@favorites - DocSpaceAdmin favorites are isolated from Owner favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Fav Isolation DocSpaceAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Owner Only Favorite.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { data: adminFav, status: adminStatus } =
      await adminApi.folders.getFavoritesFolder({});

    expect(adminStatus).toBe(200);
    const adminFileTitles = adminFav.response?.files?.map((f) => f.title) ?? [];
    expect(adminFileTitles).not.toContain("Autotest Owner Only Favorite.docx");
  });

  test("GET /api/2.0/files/@favorites - RoomAdmin favorites are isolated from Owner favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Fav Isolation RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Owner Only Favorite.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { data: roomAdminFav, status: roomAdminStatus } =
      await roomAdminApi.folders.getFavoritesFolder({});

    expect(roomAdminStatus).toBe(200);
    const roomAdminFileTitles =
      roomAdminFav.response?.files?.map((f) => f.title) ?? [];
    expect(roomAdminFileTitles).not.toContain(
      "Autotest Owner Only Favorite.docx",
    );
  });

  test("GET /api/2.0/files/@favorites - User favorites are isolated from Owner favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Fav Isolation User",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Owner Only Favorite.docx" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.operations.addFavorites({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    const { data: userFav, status: userStatus } =
      await userApi.folders.getFavoritesFolder({});

    expect(userStatus).toBe(200);
    const userFileTitles = userFav.response?.files?.map((f) => f.title) ?? [];
    expect(userFileTitles).not.toContain("Autotest Owner Only Favorite.docx");
  });

  test("GET /api/2.0/files/@favorites - File from room does not appear in favorites after user loses room access", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Favorites Access Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Favorites Access File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.files.toggleFileFavorite({ fileId, favorite: true });

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    const titles = (data.response!.files ?? []).map((f) => f.title);
    expect(titles).not.toContain("Autotest Favorites Access File.docx");
  });

  test("GET /api/2.0/files/@favorites - File favorited by User is not visible in Owner favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Favorites Isolation Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Favorites Isolation File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await userApi.files.toggleFileFavorite({ fileId, favorite: true });

    const { data: ownerFav, status } =
      await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    const ownerTitles = (ownerFav.response!.files ?? []).map((f) => f.title);
    expect(ownerTitles).not.toContain("Autotest Favorites Isolation File.docx");
  });

  test("GET /api/2.0/files/@favorites - File from archived room remains in favorites", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Favorites Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Favorites Archived Room File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.toggleFileFavorite({ fileId, favorite: true });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.folders.getFavoritesFolder({});

    expect(status).toBe(200);
    const titles = (data.response!.files ?? []).map((f) => f.title);
    expect(titles).toContain("Autotest Favorites Archived Room File.docx");
  });
});

test.describe("PUT /api/2.0/files/folder/:folderId - access control", () => {
  test("PUT /api/2.0/files/folder/:folderId - anonymous user cannot rename folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Anon Rename" },
    });
    const folderId = folderData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Folder Anon Renamed" },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/folder/:folderId - Guest cannot rename folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: "Autotest Folder Guest Rename" },
    });
    const folderId = folderData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { status } = await guestApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Folder Guest Renamed" },
    });

    expect(status).toBe(403);
  });

  test(
    "PUT /api/2.0/files/folder/:folderId - User cannot rename another user's My Documents" +
      " subfolder",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: myDocsData } = await ownerApi.folders.getMyFolder();
      const myDocsFolderId = myDocsData.response!.current!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: myDocsFolderId,
        createFolder: { title: "Autotest Owner Folder User Cannot Rename" },
      });
      const folderId = folderData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const { status } = await userApi.folders.renameFolder({
        folderId,
        createFolder: { title: "Autotest Owner Folder Renamed By User" },
      });

      expect(status).toBe(403);
    },
  );

  test("PUT /api/2.0/files/folder/:folderId - User with Read access in room cannot rename folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Folder Rename Read Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Read Access Rename" },
    });
    const folderId = folderData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await userApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Folder Renamed By Reader" },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/folder/:folderId - RoomAdmin not member of room cannot rename folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Folder Rename No RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder RoomAdmin Not Member Rename" },
    });
    const folderId = folderData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.folders.renameFolder({
      folderId,
      createFolder: {
        title: "Autotest Folder Renamed By Non-Member RoomAdmin",
      },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/folder/:folderId - User with Editing access cannot rename folder in room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Folder Rename Editing Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Folder Editing Access Rename" },
    });
    const folderId = folderData.response!.id!;

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

    const { status } = await userApi.folders.renameFolder({
      folderId,
      createFolder: { title: "Autotest Folder Renamed By Editing User" },
    });

    expect(status).toBe(403);
  });

  test(
    "PUT /api/2.0/files/folder/:folderId - DocSpaceAdmin with ContentCreator access cannot rename" +
      " folder in room",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room Folder Rename DocSpaceAdmin ContentCreator",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: {
          title: "Autotest Folder DocSpaceAdmin ContentCreator Rename",
        },
      });
      const folderId = folderData.response!.id!;

      const { api: adminApi, data: adminData } =
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminId = adminData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: adminId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { status } = await adminApi.folders.renameFolder({
        folderId,
        createFolder: { title: "Autotest Folder Renamed By DocSpaceAdmin" },
      });

      expect(status).toBe(403);
    },
  );

  test(
    "PUT /api/2.0/files/folder/:folderId - RoomAdmin with ContentCreator access cannot rename" +
      " folder in room",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room Folder Rename RoomAdmin ContentCreator",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: folderData } = await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: {
          title: "Autotest Folder RoomAdmin ContentCreator Rename",
        },
      });
      const folderId = folderData.response!.id!;

      const { api: roomAdminApi, data: roomAdminData } =
        await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminId = roomAdminData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: roomAdminId, access: FileShare.ContentCreator }],
          notify: false,
        },
      });

      const { status } = await roomAdminApi.folders.renameFolder({
        folderId,
        createFolder: { title: "Autotest Folder Renamed By RoomAdmin" },
      });

      expect(status).toBe(403);
    },
  );
});

test.describe("GET /api/2.0/files/:folderId/news - access control", () => {
  test("GET /api/2.0/files/:folderId/news - anonymous user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Anon",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/:folderId/news - guest without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Guest No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/:folderId/news - user without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/:folderId/news - user with Read access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News User Read",
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
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/news - guest with Read access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News Guest Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/news - DocSpaceAdmin gets 200 for any room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News DocSpaceAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/news - RoomAdmin gets 200 for their room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/:folderId/news - RoomAdmin not member of room gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room News RoomAdmin No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { status } = await roomAdminApi.folders.getNewFolderItems({
      folderId: roomId,
    });

    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/files/{folderId}/upload - access control", () => {
  test("POST /api/2.0/files/{folderId}/upload - Anonymous user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Anon",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await uploadFileToFolder(
      apiSdk,
      null,
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-anon.txt",
    );

    expect(status).toBe(401);
  });

  test("POST /api/2.0/files/{folderId}/upload - User without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload User No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await uploadFileToFolder(
      apiSdk,
      "user",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-no-access.txt",
    );

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/{folderId}/upload - Guest without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Guest No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await uploadFileToFolder(
      apiSdk,
      "guest",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-guest-no-access.txt",
    );

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/{folderId}/upload - User with Editing access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload User Editing",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { status } = await uploadFileToFolder(
      apiSdk,
      "user",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-editing.txt",
    );

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/{folderId}/upload - User with Read access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload User Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await uploadFileToFolder(
      apiSdk,
      "user",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-read-only.txt",
    );

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/{folderId}/upload - Guest with Read access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload Guest Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestId = guestData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await uploadFileToFolder(
      apiSdk,
      "guest",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-guest-read.txt",
    );

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/{folderId}/upload - DocSpaceAdmin with RoomManager access gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload DocSpaceAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: adminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "docSpaceAdmin",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-admin.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/{folderId}/upload - RoomAdmin gets 200 for their room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "roomAdmin",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-roomadmin.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/{folderId}/upload - RoomAdmin not member of room gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Upload RoomAdmin No Access",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await uploadFileToFolder(
      apiSdk,
      "roomAdmin",
      roomId,
      Buffer.from("Autotest file content"),
      "autotest-roomadmin-noaccess.txt",
    );

    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/files/@my/upload - access control", () => {
  test("POST /api/2.0/files/@my/upload - Owner uploads to My Documents", async ({
    apiSdk,
  }) => {
    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "owner",
      "@my",
      Buffer.from("Autotest file content"),
      "autotest-my-owner.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - DocSpaceAdmin uploads to their My Documents", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "docSpaceAdmin",
      "@my",
      Buffer.from("Autotest file content"),
      "autotest-my-dsadmin.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - RoomAdmin uploads to their My Documents", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "roomAdmin",
      "@my",
      Buffer.from("Autotest file content"),
      "autotest-my-roomadmin.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - User uploads to their My Documents", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await uploadFileToFolder(
      apiSdk,
      "user",
      "@my",
      Buffer.from("Autotest file content"),
      "autotest-my-user.txt",
    );

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/upload - Guest gets 404 (no My Documents)", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await uploadFileToFolder(
      apiSdk,
      "guest",
      "@my",
      Buffer.from("Autotest file content"),
      "autotest-my-guest.txt",
    );

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/@my/upload - Anonymous request gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await uploadFileToFolder(
      apiSdk,
      null,
      "@my",
      Buffer.from("Autotest file content"),
      "autotest-my-anon.txt",
    );

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/files/@my/insert - access control", () => {
  test("POST /api/2.0/files/@my/insert - Owner can insert a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const file = new File(
      [new Uint8Array(Buffer.from("Autotest file content"))],
      "autotest-insert-my-owner.txt",
      { type: "text/plain" },
    );

    const { data, status } = await ownerApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-owner.txt",
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/insert - DocSpaceAdmin inserts to their My Documents", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const adminApi = apiSdk.forRole("docSpaceAdmin");
    const file = new File(
      [new Uint8Array(Buffer.from("Autotest file content"))],
      "autotest-insert-my-dsadmin.txt",
      { type: "text/plain" },
    );

    const { data, status } = await adminApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-dsadmin.txt",
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/insert - RoomAdmin inserts to their My Documents", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const file = new File(
      [new Uint8Array(Buffer.from("Autotest file content"))],
      "autotest-insert-my-roomadmin.txt",
      { type: "text/plain" },
    );

    const { data, status } = await roomAdminApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-roomadmin.txt",
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/insert - User inserts to their My Documents", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const userApi = apiSdk.forRole("user");
    const file = new File(
      [new Uint8Array(Buffer.from("Autotest file content"))],
      "autotest-insert-my-user.txt",
      { type: "text/plain" },
    );

    const { data, status } = await userApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-user.txt",
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/@my/insert - Guest gets 404 (no My Documents)", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const guestApi = apiSdk.forRole("guest");
    const file = new File(
      [new Uint8Array(Buffer.from("Autotest file content"))],
      "autotest-insert-my-guest.txt",
      { type: "text/plain" },
    );

    const { status } = await guestApi.folders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-guest.txt",
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/@my/insert - Anonymous request gets 401", async ({
    apiSdk,
  }) => {
    const anonFolders = new FoldersApi(
      new Configuration({
        basePath: apiSdk.tokenStore.portalBaseUrl,
        baseOptions: {
          headers: { Origin: `http://${apiSdk.tokenStore.newTenantDomain}` },
        },
      }),
      undefined,
      apiSdk.createAxiosInstance(),
    );

    const file = new File(
      [new Uint8Array(Buffer.from("Autotest file content"))],
      "autotest-insert-my-anon.txt",
      { type: "text/plain" },
    );

    const { status } = await anonFolders.insertFileToMyFromBody({
      file,
      title: "autotest-insert-my-anon.txt",
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/files/folder/:id/link - Create folder primary external link - access control", () => {
  test("POST /api/2.0/files/folder/:id/link - Owner can create primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Owner Perm",
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
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
    expect(data.response!.isLocked).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.canEditAccess).toBe(false);
    expect(data.response!.canEditInternal).toBe(true);
    expect(data.response!.canEditDenyDownload).toBe(true);
    expect(data.response!.canEditExpirationDate).toBe(true);
    expect(data.response!.canRevoke).toBe(false);
  });

  test("POST /api/2.0/files/folder/:id/link - DocSpaceAdmin with RoomManager access can create primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Admin Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: adminData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data, status } =
      await adminApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
    expect(data.response!.isLocked).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.canEditAccess).toBe(false);
    expect(data.response!.canEditInternal).toBe(true);
    expect(data.response!.canEditDenyDownload).toBe(true);
    expect(data.response!.canEditExpirationDate).toBe(true);
    expect(data.response!.canRevoke).toBe(false);
  });

  test("POST /api/2.0/files/folder/:id/link - RoomAdmin with RoomManager access can create primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link RoomAdmin Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data, status } =
      await roomAdminApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
    expect(data.response!.isLocked).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.canEditAccess).toBe(false);
    expect(data.response!.canEditInternal).toBe(true);
    expect(data.response!.canEditDenyDownload).toBe(true);
    expect(data.response!.canEditExpirationDate).toBe(true);
    expect(data.response!.canRevoke).toBe(false);
  });

  // BUG 81575: User with Read access should get 403 but server returns 200 with count:0
  test.fail(
    "BUG 81575: POST /api/2.0/files/folder/:id/link - User with Read access gets 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder Link User Read Perm",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
          notify: false,
        },
      });

      const { status } = await userApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

      expect(status).toBe(403);
    },
  );

  // BUG 81575: DocSpaceAdmin without room access should get 403 but server returns 200 with count:0
  test.fail(
    "BUG 81575: POST /api/2.0/files/folder/:id/link - DocSpaceAdmin without room access gets 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder Link Admin No Access Perm",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { status } = await adminApi.folders.createFolderPrimaryExternalLink(
        { id: roomId, folderLinkRequest: { access: FileShare.Read } },
      );

      expect(status).toBe(403);
    },
  );

  // BUG 81575: User with ContentCreator access should get 403 but server returns 200 with count:0
  test.fail(
    "BUG 81575: POST /api/2.0/files/folder/:id/link - User with ContentCreator access gets 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder Link User Perm",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi, data: userData } =
        await apiSdk.addAuthenticatedMember("owner", "User");
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: userData.response!.id!, access: FileShare.ContentCreator },
          ],
          notify: false,
        },
      });

      const { status } = await userApi.folders.createFolderPrimaryExternalLink({
        id: roomId,
        folderLinkRequest: { access: FileShare.Read },
      });

      expect(status).toBe(403);
    },
  );

  // BUG 81575: Guest without room access should get 403 but server returns 200 with count:0
  test.fail(
    "BUG 81575: POST /api/2.0/files/folder/:id/link - Guest without room access gets 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Folder Link Guest Perm",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.folders.createFolderPrimaryExternalLink(
        {
          id: roomId,
          folderLinkRequest: { access: FileShare.Read },
        },
      );

      expect(status).toBe(403);
    },
  );

  test("POST /api/2.0/files/folder/:id/link - Anonymous request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Link Anon Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/files/folder/{folderId}/log - Get folder history permissions", () => {
  test("GET /api/2.0/files/folder/{folderId}/log - Owner can get room history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FolderLog Owner Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0].initiator?.displayName).toBeTruthy();
  });

  test("GET /api/2.0/files/folder/{folderId}/log - DocSpaceAdmin can get room history", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const ownerApi = apiSdk.forRole("owner");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FolderLog Admin Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await adminApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - User with RoomManager access can get room history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FolderLog RoomManager Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - User with Read access can get room history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FolderLog User Read Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolderHistory({
      folderId: roomId,
    });
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - User without room access cannot get room history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FolderLog NoAccess Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk
      .forRole("user")
      .folders.getFolderHistory({ folderId: roomId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - Guest without room access cannot get room history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FolderLog Guest Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .folders.getFolderHistory({ folderId: roomId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/folder/{folderId}/log - Anonymous request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest FolderLog Anon Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .folders.getFolderHistory({ folderId: roomId });

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/files/folder/{folderId}/log/report - Create report of folder history permissions", () => {
  test("POST /api/2.0/files/folder/{folderId}/log/report - Owner can generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Owner Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(typeof data.response).toBe("string");
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - DocSpaceAdmin can generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const ownerApi = apiSdk.forRole("owner");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Admin Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await adminApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - RoomAdmin with RoomManager access can generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report RoomManager Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data, status } =
      await roomAdminApi.folders.createReportFolderHistory({
        folderId: roomId,
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - User with Read access can generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report User Read Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - User without room access cannot generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report User No Access Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk
      .forRole("user")
      .folders.createReportFolderHistory({ folderId: roomId });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Guest without room access cannot generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Guest Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk
      .forRole("guest")
      .folders.createReportFolderHistory({ folderId: roomId });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - Anonymous request returns 401", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Anon Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .folders.createReportFolderHistory({ folderId: roomId });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - RoomAdmin with Editing access can generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Editing Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminData.response!.id!, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data, status } =
      await roomAdminApi.folders.createReportFolderHistory({
        folderId: roomId,
      });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/folder/{folderId}/log/report - User with Comment access can generate report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Report Comment Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: userData.response!.id!, access: FileShare.Comment },
        ],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.createReportFolderHistory({
      folderId: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  // BUG 81592: Guest with room Read access should get 403 but gets 404 (DirectoryNotFoundException)
  // because the server attempts to upload the CSV report before checking permissions
  test.fail(
    "BUG 81592:POST /api/2.0/files/folder/{folderId}/log/report - Guest with room Read access cannot generate report",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Report Guest Read Perm",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: guestApi, data: guestData } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [
            { id: guestData.response!.id!, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      const { status } = await guestApi.folders.createReportFolderHistory({
        folderId: roomId,
      });

      expect(status).toBe(403);
    },
  );
});

test.describe("GET /api/2.0/files/filesusedspace - Get files used space permissions", () => {
  // Catches: if DocSpace Admin is incorrectly blocked from viewing storage statistics
  test("GET /api/2.0/files/filesusedspace - DocSpace Admin gets used space statistics returns 200", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Admin UsedSpace Init" },
    });

    const { data, status } = await adminApi.folders.getFilesUsedSpace();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.myDocumentsUsedSpace).toBeDefined();
    expect(
      data.response!.myDocumentsUsedSpace!.usedSpace,
    ).toBeGreaterThanOrEqual(0);
  });

  // Catches: if Room Admin is incorrectly granted access to storage statistics
  test("GET /api/2.0/files/filesusedspace - Room Admin cannot get used space statistics returns 403", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.folders.getFilesUsedSpace();

    expect(status).toBe(403);
  });

  // Catches: if regular User is incorrectly granted access to storage statistics
  test("GET /api/2.0/files/filesusedspace - User cannot get used space statistics returns 403", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.folders.getFilesUsedSpace();

    expect(status).toBe(403);
  });

  // Catches: if Guest is incorrectly granted access to storage statistics
  test("GET /api/2.0/files/filesusedspace - Guest cannot get used space statistics returns 403", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.folders.getFilesUsedSpace();

    expect(status).toBe(403);
  });

  // Catches: if unauthenticated request returns 200 or 403 instead of 401
  test("GET /api/2.0/files/filesusedspace - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.folders.getFilesUsedSpace();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/files/folder/{id}/links - Get folder links - access control", () => {
  test("GET /api/2.0/files/folder/{id}/links - Owner can get folder links returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Owner Perm",
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
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/folder/{id}/links - DocSpaceAdmin with RoomManager access can get folder links returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Admin Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: adminData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data, status } = await adminApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/files/folder/{id}/links - RoomAdmin with RoomManager access can get folder links returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links RoomAdmin Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { api: roomAdminApi, data: roomAdminData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/files/folder/{id}/links - User with Read access gets 200 with empty links list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links User Read Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/folder/{id}/links - User without room access gets 200 with empty links list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links User No Access Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/folder/{id}/links - Guest without room access gets 200 with empty links list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Guest Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.folders.createFolderPrimaryExternalLink({
      id: roomId,
      folderLinkRequest: { access: FileShare.Read },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.folders.getFolderLinks({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(0);
  });

  test("GET /api/2.0/files/folder/{id}/links - Anonymous request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Get Folder Links Anon Perm",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.folders.getFolderLinks({ id: roomId });

    expect(status).toBe(401);
  });
});
