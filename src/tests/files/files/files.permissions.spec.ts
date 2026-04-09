import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare, SubjectType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import config from "@/config";

test.describe("GET /files/file/:fileId - Get file info permissions", () => {
  test("GET /files/file/:fileId - DocSpace admin can get file info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Admin File Info",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Admin Get File Info" },
    });
    const fileId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.files.getFileInfo({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  test("GET /files/file/:fileId - Room admin can get info of a file in their room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For File Info Permissions",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileCreated } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room Admin File Info" },
    });
    const fileId = fileCreated.response!.id!;

    const { api: roomAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.files.getFileInfo({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.folderId).toBe(roomId);
  });

  test("GET /files/file/:fileId - Regular user can get info of a file in their room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For User File Info",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileCreated } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest User File Info" },
    });
    const fileId = fileCreated.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.getFileInfo({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  test("GET /files/file/:fileId - User without room access cannot get file info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Forbidden File Info",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileCreated } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Forbidden File Info" },
    });
    const fileId = fileCreated.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.files.getFileInfo({ fileId });

    expect(status).toBe(403);
  });

  test.fail(
    "BUG 80752: GET /files/file/:fileId - Unauthenticated user gets 403 instead of 401",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room For Unauthenticated File Info",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileCreated } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Unauthenticated File Info" },
      });
      const fileId = fileCreated.response!.id!;

      const { status } = await apiSdk
        .forAnonymous()
        .files.getFileInfo({ fileId });

      expect(status).toBe(401);
    },
  );
});

test.describe("PUT /files/file/:fileId - Update file permissions", () => {
  test("PUT /files/file/:fileId - DocSpace admin can update a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Admin Update File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Admin Update File" },
    });
    const fileId = created.response!.id!;

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

    const { data, status } = await adminApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest Admin Updated File" },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Admin Updated File.docx");
  });

  // Note: rename requires file ownership or DocSpace admin role - room-level access is not sufficient
  test("PUT /files/file/:fileId - Room admin with ReadWrite access cannot rename a file they don't own", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Room Admin Update File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room Admin Update File" },
    });
    const fileId = created.response!.id!;

    const { api: roomAdminApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest Room Admin Updated File" },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to rename the file",
    );
  });

  test("PUT /files/file/:fileId - Regular user with ReadWrite access cannot rename a file they don't own", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For User Update File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest User Update File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest User Updated File" },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to rename the file",
    );
  });

  test("PUT /files/file/:fileId - Regular user with read-only access cannot update a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Read-only Update File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Read-only Update File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest Read-only Renamed" },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to rename the file",
    );
  });

  test("PUT /files/file/:fileId - User without room access cannot update a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For No Access Update File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest No Access Update File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest No Access Renamed" },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to rename the file",
    );
  });

  test("PUT /files/file/:fileId - File owner can rename their own file in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For File Owner Rename",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data: fileCreated } = await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest User Own File" },
    });
    const fileId = fileCreated.response!.id!;

    const { data, status } = await userApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest User Own File Renamed" },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest User Own File Renamed.docx");
  });

  test("PUT /files/file/:fileId - Guest cannot rename a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Guest Rename",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileCreated } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Guest Rename File" },
    });
    const fileId = fileCreated.response!.id!;

    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest Guest Renamed" },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to rename the file",
    );
  });

  test("PUT /files/file/:fileId - DocSpace admin without room membership cannot rename a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Admin No Membership Rename",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileCreated } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Admin No Room File" },
    });
    const fileId = fileCreated.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.files.updateFile({
      fileId,
      updateFile: { title: "Autotest Admin No Room Renamed" },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to rename the file",
    );
  });

  test.fail(
    "BUG 80752: PUT /files/file/:fileId - Unauthenticated user gets 403 instead of 401",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Room For Unauthenticated Update File",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: {
          title: "Autotest Unauthenticated Update File",
        },
      });
      const fileId = created.response!.id!;

      const { status } = await apiSdk.forAnonymous().files.updateFile({
        fileId,
        updateFile: { title: "Autotest Anon Renamed" },
      });

      expect(status).toBe(401);
    },
  );
});

test.describe("DELETE /files/file/:fileId - Delete file permissions", () => {
  test("DELETE /files/file/:fileId - DocSpace admin can delete a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Admin Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Admin Delete File" },
    });
    const fileId = created.response!.id!;

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

    const { status } = await adminApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const operation = await waitForOperation(adminApi.operations);

    expect(status).toBe(200);
    expect(operation.Operation).toBe(2); // FileOperationType.Delete
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("1");
    expect(operation.error).toBeFalsy();
  });

  test("DELETE /files/file/:fileId - Room manager can delete a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Room Manager Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room Manager Delete File" },
    });
    const fileId = created.response!.id!;

    const { api: roomManagerApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await roomManagerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const operation = await waitForOperation(roomManagerApi.operations);

    expect(status).toBe(200);
    expect(operation.Operation).toBe(2); // FileOperationType.Delete
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("1");
    expect(operation.error).toBeFalsy();
  });

  test("DELETE /files/file/:fileId - File owner can delete their own file in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For File Owner Delete",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data: fileCreated } = await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest User Own Delete File" },
    });
    const fileId = fileCreated.response!.id!;

    const { status } = await userApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const operation = await waitForOperation(userApi.operations);

    expect(status).toBe(200);
    expect(operation.Operation).toBe(2); // FileOperationType.Delete
    expect(operation.finished).toBe(true);
    expect(operation.progress).toBe(100);
    expect(operation.processed).toBe("1");
    expect(operation.error).toBeFalsy();
  });

  test("DELETE /files/file/:fileId - Regular user with ReadWrite cannot delete a file they don't own", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For ReadWrite Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest ReadWrite Delete File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /files/file/:fileId - Regular user with read-only access cannot delete a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Read-only Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Read-only Delete File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /files/file/:fileId - User without room access cannot delete a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For No Access Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest No Access Delete File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /files/file/:fileId - Guest cannot delete a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Guest Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Guest Delete File" },
    });
    const fileId = created.response!.id!;

    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /files/file/:fileId - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Unauthenticated Delete File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Unauthenticated Delete File",
      },
    });
    const fileId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("Share link privacy - no user data leakage", () => {
  test.fail(
    "BUG 80495: External file share link response does not expose room creator and link creator data",
    async ({ apiSdk, request }) => {
      const ownerApi = apiSdk.forRole("owner");

      // Step 1: Owner creates a room and a file in it
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Share Link Privacy Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Share Link Privacy File" },
      });
      const fileId = fileData.response!.id!;

      // Step 2: Create a user (without authenticating) and invite to room as RoomManager
      // Important: addMember does NOT authenticate, so the owner's session stays clean
      const { data: memberData, userData: userInfo } = await apiSdk.addMember(
        "owner",
        "RoomAdmin",
      );
      const userId = memberData.response!.id!;

      const { status: securityStatus } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.RoomManager }],
          notify: false,
        },
      });

      expect(securityStatus).toBe(200);

      // Step 3: Authenticate the user and create an external share link
      const userApi = await apiSdk.authenticateMember(userInfo, "RoomAdmin");
      const portalDomain = apiSdk.tokenStore.portalDomain;

      // POST /api/2.0/files/file/:fileId/link
      const { data: linkData, status: linkStatus } =
        await userApi.files.createFilePrimaryExternalLink({
          id: fileId,
          fileLinkRequest: { access: FileShare.Read },
        });

      expect(linkStatus).toBe(200);
      expect(linkData.statusCode).toBe(200);
      expect(linkData.response).toBeDefined();
      expect(linkData.response!.sharedLink).toBeDefined();
      const requestToken = linkData.response!.sharedLink!.requestToken!;

      // Step 4: Open the share link anonymously (simulates incognito browser)
      // Short link /s/<hash> redirects to /doceditor?share=<requestToken>&fileId=<fileId>
      const docEditorUrl = `https://${portalDomain}/doceditor?share=${requestToken}&fileId=${fileId}`;

      const response = await request.get(docEditorUrl);
      const responseBody = await response.text();

      // Step 5: Verify that the response does not contain any user PII
      // Bug: doceditor?share= response leaks Display name and Email
      // of room creator and link creator; @ in emails is encoded as %40
      const ownerEmail = config.DOCSPACE_OWNER_EMAIL;
      const userEmail = userInfo.email;
      const ownerEmailEncoded = ownerEmail.replace("@", "%40");
      const userEmailEncoded = userEmail.replace("@", "%40");

      // Room creator (owner) data must not be exposed
      expect(responseBody).not.toContain(ownerEmail);
      expect(responseBody).not.toContain(ownerEmailEncoded);
      expect(responseBody).not.toContain("admin-zero"); // owner display name

      // Link creator (user) data must not be exposed
      expect(responseBody).not.toContain(userEmail);
      expect(responseBody).not.toContain(userEmailEncoded);
      expect(responseBody).not.toContain(userInfo.firstName);
      expect(responseBody).not.toContain(userInfo.lastName);
    },
  );
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
        createFileJsonElement: { title: "Autotest Version Access File.docx" },
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

      // Step 5: Viewer opens the file with version=1 - should be denied
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

test.describe("PUT /files/file/:fileId/lock - Lock file permissions", () => {
  test("PUT /files/file/:fileId/lock - DocSpace admin can lock a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Admin Lock File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Admin Lock File" },
    });
    const fileId = created.response!.id!;

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

    const { data, status } = await adminApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBe(true);
  });

  test("PUT /files/file/:fileId/lock - Room manager can lock a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Room Manager Lock File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Room Manager Lock File" },
    });
    const fileId = created.response!.id!;

    const { api: roomManagerApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomManagerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBe(true);
  });

  test("PUT /files/file/:fileId/lock - File owner can lock their own file in a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For File Owner Lock",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data: fileCreated } = await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest User Own Lock File" },
    });
    const fileId = fileCreated.response!.id!;

    const { data, status } = await userApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBe(true);
  });

  test("PUT /files/file/:fileId/lock - Regular user with ReadWrite cannot lock a file they don't own", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For ReadWrite Lock File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest ReadWrite Lock File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });

  test("PUT /files/file/:fileId/lock - Regular user with read-only access cannot lock a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Read-only Lock File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Read-only Lock File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });

  test("PUT /files/file/:fileId/lock - User without room access cannot lock a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For No Access Lock File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest No Access Lock File" },
    });
    const fileId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });

  test("PUT /files/file/:fileId/lock - Guest cannot lock a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Guest Lock File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Guest Lock File" },
    });
    const fileId = created.response!.id!;

    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });

  test("PUT /files/file/:fileId/lock - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Unauthenticated Lock File",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: created } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Unauthenticated Lock File",
      },
    });
    const fileId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    expect(status).toBe(401);
  });

  test("PUT /files/file/:fileId/lock - Room manager cannot unlock a file locked by another user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Cross-user Unlock",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const userBase = await apiSdk.addMember("owner", "User");
    const userId = userBase.data.response!.id!;
    const managerBase = await apiSdk.addMember("owner", "RoomAdmin");
    const managerId = managerBase.data.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: userId, access: FileShare.ReadWrite },
          { id: managerId, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const userApi = await apiSdk.authenticateMember(userBase.userData, "User");
    const roomManagerApi = await apiSdk.authenticateMember(
      managerBase.userData,
      "RoomAdmin",
    );

    const { data: fileCreated } = await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Cross-user Lock File" },
    });
    const fileId = fileCreated.response!.id!;

    await userApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    const { data, status } = await roomManagerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: false },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });

  test("PUT /files/file/:fileId/lock - File creator can unlock their own file locked by portal owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room For Creator Unlock",
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
        invitations: [{ id: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data: fileCreated } = await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Creator Unlock File" },
    });
    const fileId = fileCreated.response!.id!;

    await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    const { data, status } = await userApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(fileId);
    expect(data.response?.locked).toBeFalsy();
  });
});

test.describe("POST /files/@my/html - Create HTML file in My Documents permissions", () => {
  test("POST /files/@my/html - Owner can create an HTML file in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest HTML My Docs Owner",
        content: "<p>Owner content</p>",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest HTML My Docs Owner.html");
  });

  test("POST /files/@my/html - DocSpace admin can create an HTML file in their My Documents", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest HTML My Docs Admin",
        content: "<p>Admin content</p>",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest HTML My Docs Admin.html");
  });

  test("POST /files/@my/html - Room admin can create an HTML file in their My Documents", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Room Admin",
          content: "<p>Room admin content</p>",
          createNewIfExist: true,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest HTML My Docs Room Admin.html");
  });

  test("POST /files/@my/html - Regular user can create an HTML file in their My Documents", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest HTML My Docs User",
        content: "<p>User content</p>",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest HTML My Docs User.html");
  });

  test("POST /files/@my/html - Guest cannot create an HTML file in My Documents", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.files.createHtmlFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest HTML My Docs Guest",
        content: "<p>Guest content</p>",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(404);
  });

  test("POST /files/@my/html - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .files.createHtmlFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest HTML My Docs Anon",
          createNewIfExist: true,
        },
      });

    expect(status).toBe(401);
  });
});

test.describe("POST /files/@my/text permissions", () => {
  test("POST /files/@my/text - Owner can create a text file in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.files.createTextFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Text My Docs Owner",
        content: "Owner content",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest Text My Docs Owner.txt");
  });

  test("POST /files/@my/text - DocSpace admin can create a text file in their My Documents", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.files.createTextFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Text My Docs Admin",
        content: "Admin content",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest Text My Docs Admin.txt");
  });

  test("POST /files/@my/text - Room admin can create a text file in their My Documents", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Room Admin",
          content: "Room admin content",
          createNewIfExist: true,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest Text My Docs Room Admin.txt");
  });

  test("POST /files/@my/text - Regular user can create a text file in their My Documents", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.files.createTextFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Text My Docs User",
        content: "User content",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id!).toBeGreaterThan(0);
    expect(data.response!.title).toBe("Autotest Text My Docs User.txt");
  });

  test("POST /files/@my/text - Guest gets 404", async ({ apiSdk }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.files.createTextFileInMyDocuments({
      createTextOrHtmlFile: {
        title: "Autotest Text My Docs Guest",
        content: "Guest content",
        createNewIfExist: true,
      },
    });

    expect(status).toBe(404);
  });

  test("POST /files/@my/text - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .files.createTextFileInMyDocuments({
        createTextOrHtmlFile: {
          title: "Autotest Text My Docs Anon",
          createNewIfExist: true,
        },
      });

    expect(status).toBe(401);
  });
});

test.describe("PUT /files/:fileId/order permissions", () => {
  test("PUT /files/:fileId/order - Owner can set order on their own file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order Owner File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  test("PUT /files/:fileId/order - DocSpace admin can set order on their own file", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 2 },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  test("PUT /files/:fileId/order - Room admin can set order on their own file", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: fileData } = await roomAdminApi.files.createFileInMyDocuments(
      {
        createFileJsonElement: { title: "Autotest Order Room Admin File" },
      },
    );
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 3 },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  test("PUT /files/:fileId/order - Regular user can set order on their own file", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await userApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order User File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 4 },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
  });

  test("PUT /files/:fileId/order - User cannot set order on another user's private file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order Private File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });

  test("PUT /files/:fileId/order - Guest cannot set order on another user's file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await guestApi.files.setFileOrder({
      fileId,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });

  test("PUT /files/:fileId/order - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Order Anon File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk.forAnonymous().files.setFileOrder({
      fileId,
      orderRequestDto: { order: 1 },
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /files/file/:fileId/recent permissions", () => {
  test("POST /files/file/:fileId/recent - Owner can add their file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent Owner File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent Owner File.docx");
  });

  test("POST /files/file/:fileId/recent - DocSpace admin can add their file to recent", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent Admin File.docx");
  });

  test("POST /files/file/:fileId/recent - Room admin can add their file to recent", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: fileData } = await roomAdminApi.files.createFileInMyDocuments(
      {
        createFileJsonElement: { title: "Autotest Recent Room Admin File" },
      },
    );
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.addFileToRecent({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent Room Admin File.docx");
  });

  test("POST /files/file/:fileId/recent - Regular user can add their file to recent", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await userApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent User File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent User File.docx");
  });

  test("POST /files/file/:fileId/recent - User cannot add another user's private file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent Private File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.files.addFileToRecent({ fileId });

    expect(status).toBe(403);
  });

  test("POST /files/file/:fileId/recent - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Recent Anon File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.addFileToRecent({ fileId });

    expect(status).toBe(401);
  });
});

test.describe("POST /files/file/:fileId/recent - Room file: access by user type and room role", () => {
  test("POST /files/file/:fileId/recent - Owner (room owner, no invitation) adds room file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Recent Owner Room Role",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Recent Owner Room File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent Owner Room File.docx");
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.folderId).toBe(roomId);

    const { data: recentData } = await ownerApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(true);
  });

  test("POST /files/file/:fileId/recent - DocSpace admin with RoomManager role adds room file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Recent DocSpaceAdmin RoomManager",
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
      createFileJsonElement: { title: "Autotest Recent DocSpaceAdmin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe(
      "Autotest Recent DocSpaceAdmin File.docx",
    );
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.folderId).toBe(roomId);

    const { data: recentData } = await adminApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(true);
  });

  test("POST /files/file/:fileId/recent - RoomAdmin user with Editing role adds room file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Recent RoomAdmin Editing",
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
        invitations: [{ id: roomAdminId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Recent RoomAdmin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.addFileToRecent({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent RoomAdmin File.docx");
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.folderId).toBe(roomId);

    const { data: recentData } = await roomAdminApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(true);
  });

  test("POST /files/file/:fileId/recent - User with Comment role adds room file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Recent User Comment",
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
      createFileJsonElement: { title: "Autotest Recent User Comment File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent User Comment File.docx");
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.folderId).toBe(roomId);

    const { data: recentData } = await userApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(true);
  });

  test("POST /files/file/:fileId/recent - Guest with Read role adds room file to recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { api: guestApi, data: guestData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Recent Guest Read",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Recent Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await guestApi.files.addFileToRecent({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(fileId);
    expect(data.response!.title).toBe("Autotest Recent Guest File.docx");
    expect(data.response!.fileExst).toBe(".docx");
    expect(data.response!.folderId).toBe(roomId);

    const { data: recentData } = await guestApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(true);
  });
});

test.describe("DELETE /files/recent permissions", () => {
  test("DELETE /files/recent - Owner can delete their file from Recent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent Owner" },
    });
    const fileId = fileData.response!.id!;
    await ownerApi.files.addFileToRecent({ fileId });

    const { status } = await ownerApi.files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(204);

    const { data: recentData } = await ownerApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(false);
  });

  test("DELETE /files/recent - DocSpace admin can delete their file from Recent", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent Admin" },
    });
    const fileId = fileData.response!.id!;
    await adminApi.files.addFileToRecent({ fileId });

    const { status } = await adminApi.files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(204);

    const { data: recentData } = await adminApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(false);
  });

  test("DELETE /files/recent - Room admin can delete their file from Recent", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: fileData } = await roomAdminApi.files.createFileInMyDocuments(
      {
        createFileJsonElement: { title: "Autotest Delete Recent Room Admin" },
      },
    );
    const fileId = fileData.response!.id!;
    await roomAdminApi.files.addFileToRecent({ fileId });

    const { status } = await roomAdminApi.files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(204);

    const { data: recentData } = await roomAdminApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(false);
  });

  test("DELETE /files/recent - Regular user can delete their file from Recent", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await userApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent User" },
    });
    const fileId = fileData.response!.id!;
    await userApi.files.addFileToRecent({ fileId });

    const { status } = await userApi.files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(204);

    const { data: recentData } = await userApi.folders.getRecentFolder();
    const recentFiles = recentData.response?.files ?? [];
    const found = recentFiles.some((f: any) => f.id === fileId);
    expect(found).toBe(false);
  });

  test("DELETE /files/recent - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Delete Recent Anon" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk.forAnonymous().files.deleteRecent({
      baseBatchRequestDto: { fileIds: [fileId as any] },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /files/file/:id/links permissions", () => {
  test("PUT /files/file/:id/links - Owner can set external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set Link Owner" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Owner Link",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("PUT /files/file/:id/links - DocSpace admin can set external link for their own file", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set Link Admin" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Admin Link",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("PUT /files/file/:id/links - Room admin can set external link for their own file", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: fileData } = await roomAdminApi.files.createFileInMyDocuments(
      {
        createFileJsonElement: { title: "Autotest Set Link Room Admin" },
      },
    );
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Room Admin Link",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("PUT /files/file/:id/links - Regular user can set external link for their own file", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await userApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set Link User" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "User Link",
      },
    });

    expect(status).toBe(200);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("PUT /files/file/:id/links - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Set Link Anon" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk.forAnonymous().files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Anon Link",
      },
    });

    expect(status).toBe(401);
  });

  test("PUT /files/file/:id/links - User cannot set external link for another user's private file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Set Link Other User Private",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Other User Link",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });

  test("PUT /files/file/:id/links - DocSpace admin cannot set external link for another user's private file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Set Link Admin Other Private",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await adminApi.files.setFileExternalLink({
      id: fileId,
      fileLinkRequest: {
        primary: false,
        access: FileShare.Read,
        title: "Admin Other User Link",
      },
    });

    expect(status).toBe(403);
  });
});

test.describe("GET /files/file/:id/link permissions", () => {
  test("GET /files/file/:id/link - Owner can get primary external link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest External Link Owner" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("GET /files/file/:id/link - DocSpace admin can get primary external link for their own file", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest External Link Admin" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("GET /files/file/:id/link - Room admin can get primary external link for their own file", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: fileData } = await roomAdminApi.files.createFileInMyDocuments(
      {
        createFileJsonElement: { title: "Autotest External Link Room Admin" },
      },
    );
    const fileId = fileData.response!.id!;

    const { data, status } =
      await roomAdminApi.files.getFilePrimaryExternalLink({ id: fileId });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("GET /files/file/:id/link - Regular user can get primary external link for their own file", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await userApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest External Link User" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.subjectType).toBe(SubjectType.PrimaryExternalLink);
    expect(data.response!.sharedLink!.shareLink).toBeTruthy();
  });

  test("GET /files/file/:id/link - Unauthenticated user gets 200 with empty response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest External Link Anon" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await apiSdk
      .forAnonymous()
      .files.getFilePrimaryExternalLink({ id: fileId });

    expect(status).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toBeUndefined();
  });

  test("GET /files/file/:id/link - User gets 200 with empty response for another user's private file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest External Link Other User Private",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toBeUndefined();
  });
});

test.describe("GET /files/file/:id/links permissions", () => {
  test("GET /files/file/:id/links - Owner gets 200 with empty links for new file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Links Owner" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("GET /files/file/:id/links - DocSpace admin gets 200 with empty links for new file", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: fileData } = await adminApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Links Admin" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("GET /files/file/:id/links - Room admin gets 200 with empty links for new file", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: fileData } = await roomAdminApi.files.createFileInMyDocuments(
      {
        createFileJsonElement: { title: "Autotest File Links Room Admin" },
      },
    );
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.getFileLinks({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("GET /files/file/:id/links - Regular user gets 200 with empty links for new file", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await userApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Links User" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("GET /files/file/:id/links - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest File Links Anon" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.getFileLinks({ id: fileId });

    expect(status).toBe(401);
  });

  test("GET /files/file/:id/links - User gets 200 with empty array for another user's private file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest File Links Other User Private",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getFileLinks({ id: fileId });

    expect(status).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toEqual([]);
  });
});

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
        createFileJsonElement: { title: "Autotest Version History Room Admin" },
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
});

test.describe("POST /files/file/:fileId/sendeditornotify - access control", () => {
  test("BUG 80319: POST /files/file/:fileId/sendeditornotify - Viewer cannot send editor notify", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest VDR Room",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest File" },
    });
    const fileId = fileData.response!.id!;

    const { api: viewerApi, data: viewerData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const viewerId = viewerData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: viewerId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await viewerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: {
          action: { data: "nolimit", type: "comment" },
        },
        emails: [config.DOCSPACE_OWNER_EMAIL],
        message: "test",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });
});

test.describe("POST /files/file/:fileId/sendeditornotify - input validation", () => {
  test("BUG 80321: POST /files/file/:fileId/sendeditornotify - 'data' field has no character limit", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest VDR Room",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest File" },
    });
    const fileId = fileData.response!.id!;

    const { api: editorApi, data: editorData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const editorId = editorData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: editorId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await editorApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: {
          action: { data: "a".repeat(10000), type: "comment" },
        },
        emails: [editorData.response!.email!],
        message: "test",
      },
    });

    expect(status).toBe(400);
    expect(
      (data as any).response.errors["MentionMessage.ActionLink.Action.Data"][0],
    ).toBe("The field Data must be a string with a maximum length of 256.");
  });
});

test.describe("GET /files/file/:fileId/protectusers - access control", () => {
  test("BUG 79205: GET /files/file/:fileId/protectusers - Guest gets user data instead of 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Protect Users Guest",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Protected File" },
    });
    const fileId = fileData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.files.getProtectedFileUsers({
      fileId,
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /files/tags - access control", () => {
  test("PUT /files/tags - Owner can rename a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Owner Rename Tag" },
    });

    const { data, status } = await ownerApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Owner Rename Tag",
        newName: "Autotest Owner Rename Tag Updated",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe(
      "Autotest Owner Rename Tag Updated",
    );
  });

  test("PUT /files/tags - DocSpaceAdmin can rename a tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Admin Rename Tag" },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Admin Rename Tag",
        newName: "Autotest Admin Rename Tag Updated",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response as unknown as string).toBe(
      "Autotest Admin Rename Tag Updated",
    );
  });

  test("PUT /files/tags - RoomAdmin cannot rename a tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest RoomAdmin Rename Tag" },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest RoomAdmin Rename Tag",
        newName: "Autotest RoomAdmin Rename Tag Updated",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test("PUT /files/tags - User cannot rename a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest User Rename Tag" },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest User Rename Tag",
        newName: "Autotest User Rename Tag Updated",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test("PUT /files/tags - Guest cannot rename a tag", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Guest Rename Tag" },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Guest Rename Tag",
        newName: "Autotest Guest Rename Tag Updated",
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test("PUT /files/tags - Unauthenticated user cannot rename a tag", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.rooms.createRoomTag({
      createTagRequestDto: { name: "Autotest Anon Rename Tag" },
    });

    const { status } = await apiSdk.forAnonymous().rooms.updateRoomTag({
      updateTagRequestDto: {
        oldName: "Autotest Anon Rename Tag",
        newName: "Autotest Anon Rename Tag Updated",
      },
    });

    expect(status).toBe(401);
  });
});
