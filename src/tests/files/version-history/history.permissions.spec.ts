import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /files/file/:fileId/history permissions", () => {
  test("GET /files/file/:fileId/history - Owner can get file version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Version History Owner" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(1);
    expect(data.response![0].version).toBe(1);
  });

  test("GET /files/file/:fileId/history - DocSpace admin can get version history for their own file", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Version History Admin" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /files/file/:fileId/history - Room admin can get version history for their own file", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: fileData } = await roomAdminApi.files.createFileInMyDocuments(
      {
        createFileJsonElement: {
          title: "Autotest Version History Room Admin",
        },
      },
    );
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /files/file/:fileId/history - Regular user can get version history for their own file", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await userApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Version History User" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /files/file/:fileId/history - Unauthenticated user gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Version History Anon" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.getFileVersionInfo({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/history - User gets 403 for another user's private file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Version History Other Private",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.files.getFileVersionInfo({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/history - DocSpace admin gets 403 for a file created by another user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Version History Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History Admin Cross-User",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.files.getFileVersionInfo({
      fileId,
    });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/history - Room manager gets 403 for a file created by another user in their room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room Version History Manager",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History Room File",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await userApi.files.getFileVersionInfo({ fileId });

    expect(status).toBe(403);
  });
});

test.describe("File version access - access control", () => {
  test.fail(
    "BUG 80683: GET /files/file/:id/openedit?version= - Viewer in room cannot open a specific file version",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      // Step 1: Owner creates a Custom room
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Version Access Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      // Step 2: Owner creates a file in the room
      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest Version Access File.docx",
        },
      });
      const fileId = fileData.response!.id!;

      // Step 3: Create a user and invite to the room as Viewer (FileShare.Read)
      const { data: memberData, userData } = await apiSdk.addMember(
        "owner",
        "User",
      );
      const viewerId = memberData.response!.id!;

      const { status: securityStatus } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: viewerId, access: FileShare.Read }],
          notify: false,
        },
      });
      expect(securityStatus).toBe(200);

      // Step 4: Authenticate the viewer
      const viewerApi = await apiSdk.authenticateMember(userData, "User");

      // Step 5: Viewer opens the file without version - should succeed
      const { status: currentStatus } = await viewerApi.files.openEditFile({
        fileId,
        view: true,
      });
      expect(currentStatus).toBe(200);

      // Step 6: Viewer opens the file with version=1 - should be denied
      // Bug: server returns 200 and serves the version content to Viewer
      const { status: versionStatus } = await viewerApi.files.openEditFile({
        fileId,
        version: 1,
        view: true,
      });
      expect(versionStatus).toBe(403);
    },
  );
});

test.describe("GET /files/file/:fileId/edit/history permissions", () => {
  test("GET /files/file/:fileId/edit/history - Owner can get edit history of their file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit History Perm Owner" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditHistory({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/file/:fileId/edit/history - DocSpace admin with RoomManager role can get edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History DocSpaceAdmin Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Edit History DocSpaceAdmin File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getEditHistory({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/file/:fileId/edit/history - User with Editing role can get edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History User Editing Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Edit History Editing File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getEditHistory({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/file/:fileId/edit/history - User with Comment role cannot get edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History User Comment Room",
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
        invitations: [{ id: userId, access: FileShare.Comment }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Edit History Comment File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.files.getEditHistory({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/edit/history - User without room access cannot get edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History No Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Edit History No Access File",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.files.getEditHistory({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/edit/history - Unauthenticated user cannot get edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit History Anon" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.getEditHistory({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/edit/history - Guest cannot get edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History Guest Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Edit History Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forRole("guest")
      .files.getEditHistory({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/edit/history - User with Read access cannot get edit history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History User Read Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Edit History Read File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.files.getEditHistory({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/edit/history - DocSpaceAdmin can get edit history in own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History DocSpaceAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Edit History DocSpaceAdmin Own File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getEditHistory({ fileId });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/file/:fileId/edit/history - RoomAdmin can get edit history in own room", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit History RoomAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Edit History RoomAdmin Own File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.getEditHistory({
      fileId,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("PUT /files/file/:fileId/history - access control", () => {
  test("PUT /files/file/:fileId/history - Owner can change version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Version History Perm Owner",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("PUT /files/file/:fileId/history - DocSpaceAdmin can change version history in own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History DocSpaceAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History DocSpaceAdmin File",
      },
    });
    const fileId = fileData.response!.id!;

    await adminApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await adminApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("PUT /files/file/:fileId/history - RoomAdmin can change version history in own room", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History RoomAdmin File",
      },
    });
    const fileId = fileData.response!.id!;

    await roomAdminApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await roomAdminApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("PUT /files/file/:fileId/history - DocSpaceAdmin with RoomManager access can change version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History DSA RoomManager Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History DSA RoomManager File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await adminApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("PUT /files/file/:fileId/history - User with Editing access cannot change version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History User Editing Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History Editing File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await userApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(403);
  });

  test("PUT /files/file/:fileId/history - User with Read access cannot change version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History User Read Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History Read File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await userApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(403);
  });

  test("PUT /files/file/:fileId/history - User without room access cannot change version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History No Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Version History No Access File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await userApi.files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(403);
  });

  test("PUT /files/file/:fileId/history - Guest cannot change version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Version History Guest Room",
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Version History Guest File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await apiSdk
      .forRole("guest")
      .files.changeVersionHistory({
        fileId,
        changeHistory: { version: 2, continueVersion: false },
      });

    expect(status).toBe(403);
  });

  test("PUT /files/file/:fileId/history - Unauthenticated user cannot change version history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Version History Anon",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await apiSdk.forAnonymous().files.changeVersionHistory({
      fileId,
      changeHistory: { version: 2, continueVersion: false },
    });

    expect(status).toBe(401);
  });
});
