import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

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

    await test.step("DocSpaceAdmin deletes owner's folder — operation is created", async () => {
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

    await test.step("DocSpaceAdmin deletes owner's folder — folder no longer accessible", async () => {
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

    await test.step("ContentCreator deletes own folder — operation is created", async () => {
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

    await test.step("ContentCreator deletes own folder — folder no longer accessible", async () => {
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

    await test.step("RoomAdmin deletes own folder — operation is created", async () => {
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

    await test.step("RoomAdmin deletes own folder — folder no longer accessible", async () => {
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

    await test.step("Owner deletes RoomAdmin's folder — operation is created", async () => {
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

    await test.step("Owner deletes RoomAdmin's folder — folder no longer accessible", async () => {
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

  // ContentCreator has upload rights in the room — checkUpload should be allowed
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

  // Archived room is read-only — upload check should be denied
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
