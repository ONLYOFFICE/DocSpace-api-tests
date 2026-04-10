import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /files/rooms/covers - Get room covers", () => {
  test("GET /files/rooms/covers - Owner gets list of available covers", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rooms.getRoomCovers();
    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0].id).toBeDefined();
    expect(data.response![0].data).toBeDefined();
  });

  test("GET /files/rooms/covers - Response has correct structure (statusCode, count, response)", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rooms.getRoomCovers();
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBeGreaterThan(0);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /files/rooms/covers - Each cover has non-empty id and data fields", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk.forRole("owner").rooms.getRoomCovers();
    for (const cover of data.response!) {
      expect(cover.id).toBeDefined();
      expect(cover.id).not.toBe("");
      expect(cover.data).toBeDefined();
      expect(cover.data).not.toBe("");
    }
  });

  test("GET /files/rooms/covers - Cover ids are unique", async ({ apiSdk }) => {
    const { data } = await apiSdk.forRole("owner").rooms.getRoomCovers();
    const ids = data.response!.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

test.describe("PUT /files/rooms/:id/cover - Change room cover", () => {
  test("PUT /files/rooms/:id/cover - Owner changes room cover with cover and color", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.logo?.cover?.id).toBe(coverId);
    expect(data.response!.logo?.color).toBe("FF5733");
  });

  test("PUT /files/rooms/:id/cover - Response has correct room structure", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Structure Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "1A2B3C", cover: coverId },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBeDefined();
    expect(data.response!.logo).toBeDefined();
    expect(data.response!.logo!.cover).toBeDefined();
    expect(data.response!.logo!.cover!.id).toBe(coverId);
    expect(data.response!.logo!.cover!.data).toBeDefined();
  });

  test("PUT /files/rooms/:id/cover - Can change only color without cover name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Color Only Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "AABBCC" },
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.color).toBe("AABBCC");
  });

  test("PUT /files/rooms/:id/cover - Can change only cover without color", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover No Color Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { cover: coverId },
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.cover?.id).toBe(coverId);
  });

  test("PUT /files/rooms/:id/cover - Non-existent room returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").rooms.changeRoomCover({
      id: 999999999,
      coverRequestDto: { color: "FF0000" },
    });
    expect(status).toBe(404);
  });

  test("PUT /files/rooms/:id/cover - Cover reflects in getRoomInfo after change", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Verify Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "CC3300", cover: coverId },
    });

    const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.logo?.cover?.id).toBe(coverId);
    expect(data.response!.logo?.color).toBe("CC3300");
  });

  test("PUT /files/rooms/:id/cover - DocSpaceAdmin changes cover of their own room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");
    const { data: coversData } = await adminApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await adminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover DocSpaceAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await adminApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });
    expect(status).toBe(200);
  });

  test("PUT /files/rooms/:id/cover - RoomAdmin changes cover of their own room", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");
    const { data: coversData } = await apiSdk.forRole("owner").rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover RoomAdmin Own Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await roomAdminApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });
    expect(status).toBe(200);
  });
});
