import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FileShare,
  SubjectType,
  FileEntryType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { createOoForm } from "@/src/helpers/files";
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
  test("BUG 80495: External file share link response does not expose room creator and link creator data", async ({
    apiSdk,
  }) => {
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

    const response = await fetch(docEditorUrl);
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
  });
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

test.describe("POST /api/2.0/files/{fileId}/edit_session - access control", () => {
  test("POST /api/2.0/files/{fileId}/edit_session - Owner can create edit session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Owner File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - DocSpaceAdmin can create edit session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Chunked Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .files.createEditSession({ fileId, fileSize: 1024 });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - RoomAdmin (RoomManager) can create edit session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Chunked RoomAdmin File" },
    });
    const fileId = fileData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .files.createEditSession({ fileId, fileSize: 1024 });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - User with Edit access can create edit session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Editor Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Chunked Editor File" },
    });
    const fileId = fileData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await apiSdk
      .forRole("user")
      .files.createEditSession({ fileId, fileSize: 1024 });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - User with Read access cannot create edit session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Reader Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Chunked Reader File" },
    });
    const fileId = fileData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("user")
      .files.createEditSession({ fileId, fileSize: 1024 });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Guest cannot create edit session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Guest File" },
    });
    const fileId = fileData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .files.createEditSession({ fileId, fileSize: 1024 });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Unauthenticated user cannot create edit session", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Anon File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.createEditSession({ fileId, fileSize: 1024 });

    expect(status).toBe(401);
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

test.describe("POST /files/file/:fileId/restoreversion - access control", () => {
  test("POST /files/file/:fileId/restoreversion - Owner can restore file version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Restore Perm Owner" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await ownerApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("POST /files/file/:fileId/restoreversion - DocSpaceAdmin can restore version in own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore DSA Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Restore DSA File" },
    });
    const fileId = fileData.response!.id!;

    await adminApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await adminApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("POST /files/file/:fileId/restoreversion - RoomAdmin can restore version in own room", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore RoomAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Restore RoomAdmin File" },
    });
    const fileId = fileData.response!.id!;

    await roomAdminApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { data, status } = await roomAdminApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("POST /files/file/:fileId/restoreversion - User with Editing access cannot restore version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore User Editing Room",
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
      createFileJsonElement: { title: "Autotest Restore Editing File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await userApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(403);
  });

  test("POST /files/file/:fileId/restoreversion - User with Read access cannot restore version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore User Read Room",
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
      createFileJsonElement: { title: "Autotest Restore Read File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await userApi.files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(403);
  });

  test("POST /files/file/:fileId/restoreversion - Guest cannot restore version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore Guest Room",
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
      createFileJsonElement: { title: "Autotest Restore Guest File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await apiSdk.forRole("guest").files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(403);
  });

  test("POST /files/file/:fileId/restoreversion - Unauthenticated user cannot restore version", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Restore Anon" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.updateFile({
      fileId,
      updateFile: { lastVersion: 2 },
    });

    const { status } = await apiSdk.forAnonymous().files.restoreFileVersion({
      fileId,
      version: 1,
    });

    expect(status).toBe(403);
  });
});

test.describe("POST /files/file/referencedata - Get reference data permissions", () => {
  test("POST /files/file/referencedata - DocSpaceAdmin can get reference data for file in owner room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const ownerApi = apiSdk.forRole("owner");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RefData Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest RefData Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data: openData } = await ownerApi.files.openEditFile({ fileId });
    const fileKey = openData.response!.document!.referenceData!.fileKey!;
    const instanceId = openData.response!.document!.referenceData!.instanceId!;

    const { data, status } = await adminApi.files.getReferenceData({
      getReferenceDataDtoInteger: { fileKey, instanceId },
    });

    expect(status).toBe(200);
    expect(data.response!.url).toBeTruthy();
    expect(data.response!.referenceData).toBeDefined();
  });

  test("POST /files/file/referencedata - RoomAdmin with access can get reference data", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest RefData RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest RefData RoomAdmin File" },
    });
    const fileId = fileData.response!.id!;

    const { data: openData } = await ownerApi.files.openEditFile({ fileId });
    const fileKey = openData.response!.document!.referenceData!.fileKey!;
    const instanceId = openData.response!.document!.referenceData!.instanceId!;

    const { data, status } = await roomAdminApi.files.getReferenceData({
      getReferenceDataDtoInteger: { fileKey, instanceId },
    });

    expect(status).toBe(200);
    expect(data.response!.url).toBeTruthy();
    expect(data.response!.referenceData).toBeDefined();
  });
});

test.describe("GET /files/file/:fileId/log - Get file history permissions", () => {
  test.fail(
    "BUG 81093: GET /files/file/:fileId/log - Guest sees owner email in profileUrl field of file history response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: {
          title: "Autotest File History Guest Test",
        },
      });
      const fileId = fileData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: guestId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await guestApi.files.getFileHistory({ fileId });

      expect(status).toBe(200);

      const historyEntries = data.response ?? [];
      for (const entry of historyEntries) {
        expect(entry.initiator?.profileUrl).toBeFalsy();
      }
    },
  );

  test("GET /files/file/:fileId/log - DocSpaceAdmin can get file history in owner room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const ownerApi = apiSdk.forRole("owner");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0].initiator?.displayName).toBeTruthy();
  });

  test("GET /files/file/:fileId/log - RoomAdmin can get file history in their room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History RoomAdmin File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.getFileHistory({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /files/file/:fileId/log - User with room access can get file history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History User Room",
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
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest History User File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getFileHistory({ fileId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /files/file/:fileId/log - User without room access cannot get file history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History NoAccess Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History NoAccess File",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forRole("user")
      .files.getFileHistory({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/log - Guest without access cannot get file history", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History Guest File",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forRole("guest")
      .files.getFileHistory({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/log - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest History Unauth Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest History Unauth File",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.getFileHistory({ fileId });

    expect(status).toBe(401);
  });
});

test.describe("POST /files/file/:fileId/startedit - Start file editing permissions", () => {
  test("BUG 81168: POST /files/file/:fileId/startedit - Unauthenticated user gets 403 instead of 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartEdit Unauth Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest StartEdit Unauth File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.startEditFile({ fileId, startEdit: { editingAlone: true } });

    expect(status).toBe(401);
  });

  test("POST /files/file/:fileId/startedit - Guest with Read access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartEdit Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest StartEdit Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const userId = memberData.response!.id!;
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: false },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });

  test("POST /files/file/:fileId/startedit - User with Read-only access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartEdit Read Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest StartEdit Read File" },
    });
    const fileId = fileData.response!.id!;

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

    const { data, status } = await userApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: false },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe(
      "You do not have enough permissions to edit the file",
    );
  });

  test("POST /files/file/:fileId/startedit - User with RoomManager access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest StartEdit User RoomManager Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest StartEdit User RoomManager File",
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

    const { data, status } = await userApi.files.startEditFile({
      fileId,
      startEdit: { editingAlone: true },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /files/order - Set files order in bulk permissions", () => {
  // Catches: Anonymous user receives 403 instead of 401 (auth middleware skipped for this endpoint)
  test("PUT /files/order - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Anon Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Anon File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk.forAnonymous().files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 1 }],
      },
    });

    expect(status).toBe(401);
  });

  // Catches: Guest with Read access silently allowed to reorder files in a room
  test("PUT /files/order - Guest with Read access cannot set order on a room file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: guestApi, data: guestMemberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Guest Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: guestMemberData.response!.id!, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await guestApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 1 }],
      },
    });

    expect(status).toBe(403);
  });

  // Catches: Room-level role (RoomManager) silently allowed when portal-level access is required
  // setFilesOrder requires portal-level access (owner/docSpaceAdmin); room roles are not sufficient
  test("PUT /files/order - User with RoomManager access cannot set order on a room file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi, data: userMemberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder User Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          {
            id: userMemberData.response!.id!,
            access: FileShare.RoomManager,
          },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await userApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder User File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 2 }],
      },
    });

    expect(status).toBe(403);
  });

  // Catches: User with Read-only access silently allowed to reorder files in a room
  test("PUT /files/order - User with Read access cannot set order on a room file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: userApi, data: userReadMemberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder User Read Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: userReadMemberData.response!.id!, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest BulkOrder User Read File",
      },
    });
    const fileId = fileData.response!.id!;

    const { status } = await userApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 1 }],
      },
    });

    expect(status).toBe(403);
  });

  // Catches: DocSpaceAdmin cannot set order on room files despite elevated portal role
  test("PUT /files/order - DocSpaceAdmin can set order on a file in their own VDR room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest BulkOrder Admin Room",
        roomType: RoomType.VirtualDataRoom,
        indexing: true,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest BulkOrder Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.setFilesOrder({
      ordersRequestDtoInteger: {
        items: [{ entryId: fileId, entryType: FileEntryType.File, order: 3 }],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].id).toBe(fileId);
  });
});

test.describe("GET /files/file/:fileId/trackeditfile - Track file editing permissions", () => {
  // Catches: unauthenticated user should not be able to track editing
  test("BUG 81231: GET /files/file/:fileId/trackeditfile - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Anon File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.trackEditFile({ fileId });

    expect(status).toBe(401);
  });

  // Catches: Guest with Read access should not be able to track editing
  test("BUG 81224: GET /files/file/:fileId/trackeditfile - Guest with Read access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await guestApi.files.trackEditFile({ fileId });

    expect(status).toBe(403);
  });

  // Catches: User with RoomManager access should not be able to track editing (no edit rights)
  test("GET /files/file/:fileId/trackeditfile - User with RoomManager access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Manager Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Manager File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.trackEditFile({ fileId });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
  });

  // Catches: User with Read access should not be able to track editing
  test("BUG 81225: GET /files/file/:fileId/trackeditfile - User with Read access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Read Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Read File" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { status } = await userApi.files.trackEditFile({ fileId });

    expect(status).toBe(403);
  });

  // Catches: DocSpaceAdmin silently blocked from tracking editing on their own room file
  test("GET /files/file/:fileId/trackeditfile - DocSpaceAdmin can track editing", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TrackEdit Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest TrackEdit Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data: editData } = await adminApi.files.openEditFile({ fileId });
    const docKeyForTrack = editData.response!.document!.key!;

    const { data, status } = await adminApi.files.trackEditFile({
      fileId,
      docKeyForTrack,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response!.key).toBe("boolean");
  });
});

test.describe("POST /files/thumbnails - Create thumbnails permissions", () => {
  // Catches: unauthenticated user should not be able to create thumbnails
  test("BUG 81268: POST /files/thumbnails - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Anon File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.createThumbnails({ baseBatchRequestDto: { fileIds: [fileId] } });

    expect(status).toBe(401);
  });

  // Catches: Guest with Read access silently blocked from creating thumbnails
  test("POST /files/thumbnails - Guest with Read access can create thumbnails", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { api: guestApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(fileId);
  });

  // Catches: User with Read access silently blocked from creating thumbnails
  test("POST /files/thumbnails - User with Read access can create thumbnails", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Read Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Read File" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(fileId);
  });

  // Catches: User with RoomManager access silently blocked from creating thumbnails
  test("POST /files/thumbnails - User with RoomManager access can create thumbnails", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Manager Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: memberData.response!.id!, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Manager File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] },
    });
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(fileId);
  });

  // Catches: DocSpaceAdmin silently blocked from creating thumbnails
  test("POST /files/thumbnails - DocSpaceAdmin can create thumbnails", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Thumbnails Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Thumbnails Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.createThumbnails({
      baseBatchRequestDto: { fileIds: [fileId] },
    });
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toContain(fileId);
  });
});

test.describe("GET /files/file/:fileId/edit/diff permissions", () => {
  test("GET /files/file/:fileId/edit/diff - Owner can get diff URL of their file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit Diff Perm Owner" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
  });

  test("GET /files/file/:fileId/edit/diff - DocSpaceAdmin with RoomManager role can get diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff DocSpaceAdmin Room",
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
        title: "Autotest Edit Diff DocSpaceAdmin File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
  });

  test("GET /files/file/:fileId/edit/diff - User with Editing role can get diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff User Editing Room",
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
      createFileJsonElement: { title: "Autotest Edit Diff Editing File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
  });

  test("GET /files/file/:fileId/edit/diff - User with Comment role cannot get diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff User Comment Room",
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
      createFileJsonElement: { title: "Autotest Edit Diff Comment File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the file",
    );
  });

  test("GET /files/file/:fileId/edit/diff - User with Read access cannot get diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff User Read Room",
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
      createFileJsonElement: { title: "Autotest Edit Diff Read File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the file",
    );
  });

  test("GET /files/file/:fileId/edit/diff - User without room access cannot get diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff No Access Room",
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
      createFileJsonElement: { title: "Autotest Edit Diff No Access File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await userApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the file",
    );
  });

  test("GET /files/file/:fileId/edit/diff - Unauthenticated user cannot get diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Edit Diff Anon" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await apiSdk
      .forAnonymous()
      .files.getEditDiffUrl({ fileId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the file",
    );
  });

  test("GET /files/file/:fileId/edit/diff - Guest with Read access cannot get diff URL", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff Guest Room",
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
      createFileJsonElement: { title: "Autotest Edit Diff Guest File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await apiSdk
      .forRole("guest")
      .files.getEditDiffUrl({ fileId });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the file",
    );
  });

  test("GET /files/file/:fileId/edit/diff - DocSpaceAdmin can get diff URL in own room", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff DocSpaceAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Edit Diff DocSpaceAdmin Own File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.getEditDiffUrl({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
  });

  test("GET /files/file/:fileId/edit/diff - RoomAdmin can get diff URL in own room", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Edit Diff RoomAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Edit Diff RoomAdmin Own File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.files.getEditDiffUrl({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.key).toBeTruthy();
    expect(data.response!.url).toBeTruthy();
  });
});

test.describe("POST /files/templates - Add templates permissions", () => {
  // Catches: unauthenticated user should not be able to add templates
  test("POST /files/templates - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .files.addTemplates({ templatesRequestDto: { fileIds: [1] } });

    expect(status).toBe(401);
  });

  // Catches: guest should not be able to add portal templates
  test("POST /files/templates - Guest gets 403", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .files.addTemplates({ templatesRequestDto: { fileIds: [1] } });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  // Catches: regular user silently blocked from adding templates
  test("POST /files/templates - User can add templates", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .files.addTemplates({ templatesRequestDto: { fileIds: [1] } });

    // templates are a personal (per-user) feature — available to all authenticated users
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  // Catches: DocSpaceAdmin silently blocked from adding templates
  test("POST /files/templates - DocSpaceAdmin can add templates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Templates Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Templates Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.files.addTemplates({
      templatesRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  // Catches: owner blocked from adding templates
  test("POST /files/templates - Owner can add templates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Templates Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Templates Owner File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.addTemplates({
      templatesRequestDto: { fileIds: [fileId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("DELETE /files/templates - Delete templates permissions", () => {
  // Catches: unauthenticated user should not be able to delete templates
  test("DELETE /files/templates - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .files.deleteTemplates({ requestBody: [1] });

    expect(status).toBe(401);
  });

  // Catches: guest should not be able to delete templates
  test("BUG 81274: DELETE /files/templates - Guest gets 403", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk
      .forRole("guest")
      .files.deleteTemplates({ requestBody: [1] });

    expect(status).toBe(403);
  });

  // Catches: regular user silently blocked from deleting templates
  test("DELETE /files/templates - User can delete templates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Templates User Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Delete Templates User File" },
    });
    const fileId = fileData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    await apiSdk
      .forRole("user")
      .files.addTemplates({ templatesRequestDto: { fileIds: [fileId] } });

    const { data, status } = await apiSdk
      .forRole("user")
      .files.deleteTemplates({ requestBody: [fileId] });

    // templates are a personal (per-user) feature — available to all authenticated users
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  // Catches: DocSpaceAdmin silently blocked from deleting templates
  test("DELETE /files/templates - DocSpaceAdmin can delete templates", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Templates Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await adminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Delete Templates Admin File" },
    });
    const fileId = fileData.response!.id!;

    await adminApi.files.addTemplates({
      templatesRequestDto: { fileIds: [fileId] },
    });

    const { data, status } = await adminApi.files.deleteTemplates({
      requestBody: [fileId],
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  // Catches: owner blocked from deleting templates
  test("DELETE /files/templates - Owner can delete templates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Delete Templates Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Delete Templates Owner File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.addTemplates({
      templatesRequestDto: { fileIds: [fileId] },
    });

    const { data, status } = await ownerApi.files.deleteTemplates({
      requestBody: [fileId],
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("GET /files/file/:fileId/isformpdf - isFormPDF permissions", () => {
  test("GET /files/file/:fileId/isformpdf - Owner can check their file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest IsFormPDF Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest IsFormPDF Owner File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.isFormPDF({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("GET /files/file/:fileId/isformpdf - DocSpace admin can check any file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest IsFormPDF Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest IsFormPDF Admin File" },
    });
    const fileId = fileData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.files.isFormPDF({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /files/file/:fileId/isformpdf - User with Read access can check", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest IsFormPDF Read Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest IsFormPDF Read File" },
    });
    const fileId = fileData.response!.id!;

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

    const { data, status } = await userApi.files.isFormPDF({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /files/file/:fileId/isformpdf - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest IsFormPDF Unauth Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest IsFormPDF Unauth File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk.forAnonymous().files.isFormPDF({ fileId });

    expect(status).toBe(401);
  });

  test("GET /files/file/:fileId/isformpdf - User without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest IsFormPDF No Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest IsFormPDF No Access File" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.files.isFormPDF({ fileId });

    expect(status).toBe(403);
  });
});

test.describe("GET /files/file/:fileId/formroles - getAllFormRoles permissions", () => {
  test("GET /files/file/:fileId/formroles - Owner can get form roles", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetAllFormRoles Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileId = await createOoForm(ownerApi, roomId);

    const { data, status } = await ownerApi.files.getAllFormRoles({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /files/file/:fileId/formroles - DocSpace admin can get form roles", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetAllFormRoles Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileId = await createOoForm(ownerApi, roomId);

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.files.getAllFormRoles({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /files/file/:fileId/formroles - User with Read access can get form roles", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetAllFormRoles Read Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const fileId = await createOoForm(ownerApi, roomId);

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

    const { data, status } = await userApi.files.getAllFormRoles({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /files/file/:fileId/formroles - Unauthenticated user gets 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetAllFormRoles Unauth Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest GetAllFormRoles Unauth File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .files.getAllFormRoles({ fileId });

    expect(status).toBe(401);
  });

  test("GET /files/file/:fileId/formroles - User without room access gets 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetAllFormRoles No Access Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest GetAllFormRoles No Access File",
      },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.files.getAllFormRoles({ fileId });

    expect(status).toBe(403);
  });

  test("GET /files/file/:fileId/formroles - RoomAdmin can get form roles", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetAllFormRoles RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const pdfFormId = await createOoForm(ownerApi, roomId);

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

    const { data, status } = await roomAdminApi.files.getAllFormRoles({
      fileId: pdfFormId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /files/file/:fileId/formroles - ContentCreator can get form roles", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest GetAllFormRoles ContentCreator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const pdfFormId = await createOoForm(ownerApi, roomId);

    const { api: creatorApi, data: memberData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });

    const { data, status } = await creatorApi.files.getAllFormRoles({
      fileId: pdfFormId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test.fail(
    "BUG XXXXX: GET /files/file/:fileId/formroles - Guest without room access gets 200 instead of 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest GetAllFormRoles Guest Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const pdfFormId = await createOoForm(ownerApi, roomId);

      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { status } = await apiSdk
        .forRole("guest")
        .files.getAllFormRoles({ fileId: pdfFormId });

      expect(status).toBe(403);
    },
  );
});
