import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/files/{fileId}/edit_session - Create Edit Session", () => {
  test("POST /api/2.0/files/{fileId}/edit_session - Owner creates edit session for a file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Upload Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Response success is true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Success Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Success File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 2048,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Response contains session ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked ID Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked ID File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.id).toBeTruthy();
    expect(typeof data.response!.data!.id).toBe("string");
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session has expiration date", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Expiry Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Expiry File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.expired).toBeTruthy();
    const expiryDate = new Date(data.response!.data!.expired!);
    expect(expiryDate.getTime()).toBeGreaterThan(Date.now());
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session has location", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Location Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Location File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.location).toBeTruthy();
  });

  test("POST /api/2.0/files/{fileId}/edit_session - bytes_total matches fileSize", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Bytes Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Bytes File" },
    });
    const fileId = fileData.response!.id!;

    const fileSize = 5120;
    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.bytes_total).toBe(fileSize);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session can be created without fileSize", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked No Size Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked No Size File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Session created field is returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Chunked Created Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const folderId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId,
      createFileJsonElement: { title: "Autotest Chunked Created File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.data!.created).toBeTruthy();
  });

  test("POST /api/2.0/files/{fileId}/edit_session - Non-existent file returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .files.createEditSession({ fileId: 999999999 });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/{fileId}/edit_session - File in My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Chunked MyDocs File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.files.createEditSession({
      fileId,
      fileSize: 1024,
    });

    expect(status).toBe(200);
    expect(data.response!.success).toBe(true);
    expect(data.response!.data!.id).toBeTruthy();
  });
});
