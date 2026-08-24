import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { createPrivateRoom } from "@/src/helpers/rooms";
import { waitForRoomTemplate } from "@/src/helpers/wait-for-room-template";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

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

  test("GET /files/rooms/covers - Default 'schedule' cover is present in the list", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk.forRole("owner").rooms.getRoomCovers();
    const ids = data.response!.map((c) => c.id);
    expect(ids).toContain("schedule");
  });

  test("GET /files/rooms/covers - Each cover.data is a non-null non-empty string", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk.forRole("owner").rooms.getRoomCovers();
    for (const cover of data.response!) {
      expect(cover.data).not.toBeNull();
      expect(typeof cover.data).toBe("string");
      expect((cover.data as string).length).toBeGreaterThan(0);
    }
  });

  test("GET /files/rooms/covers - Owner, DocSpaceAdmin, RoomAdmin and User see the same cover ids", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    await apiSdk.addAuthenticatedMember("owner", "User");

    const [ownerRes, adminRes, roomAdminRes, userRes] = await Promise.all([
      apiSdk.forRole("owner").rooms.getRoomCovers(),
      apiSdk.forRole("docSpaceAdmin").rooms.getRoomCovers(),
      apiSdk.forRole("roomAdmin").rooms.getRoomCovers(),
      apiSdk.forRole("user").rooms.getRoomCovers(),
    ]);

    const sortedIds = (res: typeof ownerRes) =>
      res.data.response!.map((c) => c.id).sort();
    const ownerIds = sortedIds(ownerRes);

    expect(sortedIds(adminRes)).toEqual(ownerIds);
    expect(sortedIds(roomAdminRes)).toEqual(ownerIds);
    expect(sortedIds(userRes)).toEqual(ownerIds);
  });

  test("GET /files/rooms/covers - Accept-Language does not change the set of cover ids", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const [ru, en] = await Promise.all([
      ownerApi.rooms.getRoomCovers({
        headers: { "Accept-Language": "ru-RU" },
      }),
      ownerApi.rooms.getRoomCovers({
        headers: { "Accept-Language": "en-US" },
      }),
    ]);
    const idsRu = ru.data.response!.map((c) => c.id).sort();
    const idsEn = en.data.response!.map((c) => c.id).sort();
    expect(idsEn).toEqual(idsRu);
  });

  test("GET /files/rooms/covers - List does not depend on rooms existing on the portal", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: before } = await ownerApi.rooms.getRoomCovers();
    const idsBefore = before.response!.map((c) => c.id).sort();

    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Covers Portal-State Room",
        roomType: RoomType.CustomRoom,
      },
    });

    const { data: after } = await ownerApi.rooms.getRoomCovers();
    const idsAfter = after.response!.map((c) => c.id).sort();

    expect(idsAfter).toEqual(idsBefore);
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
    const { data: coversData } = await apiSdk
      .forRole("owner")
      .rooms.getRoomCovers();
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

  test("PUT /files/rooms/:id/cover - Owner can change cover for a room saved as template", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Template Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.createRoomTemplate({
      roomTemplateDto: { roomId, title: "Autotest Cover Template" },
    });

    const templateId = await waitForRoomTemplate(ownerApi.rooms);

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: templateId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.cover?.id).toBe(coverId);
    expect(data.response!.logo?.color).toBe("FF5733");
  });

  test("PUT /files/rooms/:id/cover - Response returns full updated room object", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Full Response Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "AB12CD", cover: coverId },
    });

    expect(status).toBe(200);
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.title).toBe("Autotest Cover Full Response Room");
    expect(data.response!.roomType).toBe(RoomType.CustomRoom);
    expect(data.response!.logo).toBeDefined();
    expect(data.response!.logo!.cover).toBeDefined();
    expect(data.response!.logo!.cover!.id).toBe(coverId);
    expect(data.response!.logo!.cover!.data).toBeDefined();
    expect(data.response!.logo!.color).toBe("AB12CD");
  });

  test("PUT /files/rooms/:id/cover - Cover can be changed multiple times", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const firstCoverId = coversData.response![0].id!;
    const secondCoverId = coversData.response![1].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Multiple Changes Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const first = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "111111", cover: firstCoverId },
    });
    expect(first.status).toBe(200);
    expect(first.data.response!.logo?.cover?.id).toBe(firstCoverId);
    expect(first.data.response!.logo?.color).toBe("111111");

    const second = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "222222", cover: secondCoverId },
    });
    expect(second.status).toBe(200);
    expect(second.data.response!.logo?.cover?.id).toBe(secondCoverId);
    expect(second.data.response!.logo?.color).toBe("222222");
  });

  test("PUT /files/rooms/:id/cover - Re-applying same cover and color is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Idempotent Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const payload = { color: "ABCDEF", cover: coverId };

    const first = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: payload,
    });
    expect(first.status).toBe(200);
    expect(first.data.response!.logo?.cover?.id).toBe(coverId);
    expect(first.data.response!.logo?.color).toBe("ABCDEF");

    const second = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: payload,
    });
    expect(second.status).toBe(200);
    expect(second.data.response!.logo?.cover?.id).toBe(coverId);
    expect(second.data.response!.logo?.color).toBe("ABCDEF");
  });

  test("PUT /files/rooms/:id/cover - Returned cover.data payload is non-empty", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Data Payload Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    expect(status).toBe(200);
    const coverData = data.response!.logo!.cover!.data!;
    expect(coverData).not.toBe("");
    expect(coverData.length).toBeGreaterThan(0);
  });

  test("PUT /files/rooms/:id/cover - Multiple available covers can be applied", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverIds = coversData
      .response!.slice(0, 3)
      .map((c) => c.id!)
      .filter((id) => !!id);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Multi Apply Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    for (const coverId of coverIds) {
      const { data, status } = await ownerApi.rooms.changeRoomCover({
        id: roomId,
        coverRequestDto: { cover: coverId },
      });
      expect(status).toBe(200);
      expect(data.response!.logo?.cover?.id).toBe(coverId);
    }
  });

  test("PUT /files/rooms/:id/cover - Deleted room cannot change cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Deleted Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF0000" },
    });
    expect(status).toBe(404);
  });

  test("PUT /files/rooms/:id/cover - Invalid cover id is ignored or returns error", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Invalid Cover Id Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { cover: "invalid-cover-id" },
    });
    expect(status).toBe(400);
  });

  test("PUT /files/rooms/:id/cover - Invalid hex color with # prefix returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Hash Hex Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "#FF5733" },
    });
    expect(status).toBe(400);
  });

  test("PUT /files/rooms/:id/cover - Invalid hex color with non-hex chars returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Non-Hex Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "ZZZZZZ" },
    });
    expect(status).toBe(400);
  });

  test("BUG 81558: PUT /files/rooms/:id/cover - Too short hex color returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Short Hex Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "123" },
    });
    expect(status).toBe(400);
  });

  test("PUT /files/rooms/:id/cover - Too long hex color returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Long Hex Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "1234567" },
    });
    expect(status).toBe(400);
  });

  test("PUT /files/rooms/:id/cover - Empty string color resets color to default", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Empty Color Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "ABCDEF" },
    });

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "" },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    const resetColor = data.response!.logo?.color;
    expect(resetColor).toBeDefined();
    expect(resetColor).not.toBe("");
    expect(resetColor).not.toBe("ABCDEF");
    expect(resetColor).toMatch(/^[0-9A-Fa-f]{6}$/);
  });

  test("PUT /files/rooms/:id/cover - Empty request body returns 200 and cover/color are unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Empty Body Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "ABCDEF", cover: coverId },
    });

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: {},
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(data.response!.logo?.color).toBe("ABCDEF");
    expect(data.response!.logo?.cover?.id).toBe(coverId);
  });

  test("PUT /files/rooms/:id/cover - Null color returns 200 and color is unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Null Color Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "ABCDEF" },
    });

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: null },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(data.response!.logo?.color).toBe("ABCDEF");
  });

  test("PUT /files/rooms/:id/cover - Null cover returns 200 and cover is unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Null Cover Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { cover: coverId },
    });

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { cover: null },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(data.response!.logo?.cover?.id).toBe(coverId);
  });

  test("PUT /files/rooms/:id/cover - Numeric color returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Numeric Color Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: 123456 as unknown as string },
    });
    expect(status).toBe(400);
  });

  test("PUT /files/rooms/:id/cover - Numeric cover returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Numeric Cover Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { cover: 123 as unknown as string },
    });
    expect(status).toBe(400);
  });

  test("PUT /files/rooms/:id/cover - Extra unknown fields are ignored", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Unknown Fields Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: {
        color: "FFFFFF",
        unknownField: "test",
      } as never,
    });
    expect(status).toBe(200);
    expect(data.response!.logo?.color).toBe("FFFFFF");
  });

  test("PUT /files/rooms/:id/cover - Archived room cover cannot be changed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "ABCDEF", cover: coverId },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF0000" },
    });
    expect(status).toBe(403);

    const { data: infoData } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(infoData.response!.logo?.cover?.id).toBe(coverId);
    expect(infoData.response!.logo?.color).toBe("ABCDEF");
  });

  test("PUT /files/rooms/:id/cover - Cover survives archive/unarchive cycle", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Archive Cycle Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "1A2B3C", cover: coverId },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    await ownerApi.rooms.unarchiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(data.response!.logo?.cover?.id).toBe(coverId);
    expect(data.response!.logo?.color).toBe("1A2B3C");
  });

  for (const { name, type } of [
    { name: "Collaboration room", type: RoomType.EditingRoom },
    { name: "Custom room", type: RoomType.CustomRoom },
    { name: "Public room", type: RoomType.PublicRoom },
    { name: "Form filling room", type: RoomType.FillingFormsRoom },
  ]) {
    test(`PUT /files/rooms/:id/cover - Works for ${name}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: coversData } = await ownerApi.rooms.getRoomCovers();
      const coverId = coversData.response![0].id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: `Autotest Cover ${name}`,
          roomType: type,
        },
      });
      const roomId = roomData.response!.id!;

      const { data, status } = await ownerApi.rooms.changeRoomCover({
        id: roomId,
        coverRequestDto: { color: "FF5733", cover: coverId },
      });

      expect(status).toBe(200);
      expect(data.response!.logo?.cover?.id).toBe(coverId);
      expect(data.response!.logo?.color).toBe("FF5733");
    });
  }

  test("PUT /files/rooms/:id/cover - Works for a private room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await createPrivateRoom(apiSdk, "owner", {
      title: "Autotest Cover Private Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });

    expect(status).toBe(200);
    expect(data.response!.private).toBe(true);
    expect(data.response!.logo?.cover?.id).toBe(coverId);
    expect(data.response!.logo?.color).toBe("FF5733");
  });

  test("PUT /files/rooms/:id/cover - Lowercase hex color is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Lowercase Hex Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "ff5733" },
    });
    expect(status).toBe(200);
    expect(data.response!.logo?.color?.toLowerCase()).toBe("ff5733");
  });

  test("PUT /files/rooms/:id/cover - Mixed-case hex color is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Mixed-case Hex Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "Ff5733" },
    });
    expect(status).toBe(200);
    expect(data.response!.logo?.color?.toLowerCase()).toBe("ff5733");
  });
});
