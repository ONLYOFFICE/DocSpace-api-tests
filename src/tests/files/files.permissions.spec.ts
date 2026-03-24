import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
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

  // Note: rename requires file ownership or DocSpace admin role — room-level access is not sufficient
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

    const { status } = await userApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const operation = await waitForOperation(userApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.processed).toBe("0");
    expect(operation.error).toBeTruthy();
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

    const { status } = await userApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const operation = await waitForOperation(userApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.processed).toBe("0");
    expect(operation.error).toBeTruthy();
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

    const { status } = await userApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const operation = await waitForOperation(userApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.processed).toBe("0");
    expect(operation.error).toBeTruthy();
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

    const { status } = await guestApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });

    const operation = await waitForOperation(guestApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.processed).toBe("0");
    expect(operation.error).toBeTruthy();
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
