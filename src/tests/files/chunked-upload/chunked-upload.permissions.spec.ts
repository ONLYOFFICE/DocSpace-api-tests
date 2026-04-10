import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";

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

    const { data: memberData } = await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
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

    const { data: memberData } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
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

    const { data: memberData } = await apiSdk.addAuthenticatedMember("owner", "User");
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

    const { data: memberData } = await apiSdk.addAuthenticatedMember("owner", "User");
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
