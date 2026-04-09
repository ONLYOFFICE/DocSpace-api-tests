import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { createTestImageBuffer } from "@/src/utils/test-image";

test.describe("POST /api/2.0/files/logos - Upload room logo image", () => {
  test("POST /api/2.0/files/logos - Owner uploads a valid PNG image", async ({
    apiSdk,
  }) => {
    const result = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    expect(result.status).toBe(200);
    expect(result.data.response.success).toBe(true);
  });

  test("POST /api/2.0/files/logos - Response contains tmpFile path as string", async ({
    apiSdk,
  }) => {
    const result = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    expect(result.data.response.data).toBeDefined();
    expect(typeof result.data.response.data).toBe("string");
    expect(result.data.response.data.length).toBeGreaterThan(0);
  });
});

test.describe("POST /files/rooms/:id/logo - Create room logo", () => {
  test("POST /files/rooms/:id/logo - Owner creates room logo from uploaded image", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Create Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const tmpFile = uploadResult.data.response.data as string;

    const { data, status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - Logo has original, large, medium, small URLs", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Sizes Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    expect(data.response!.logo?.original).toBeTruthy();
    expect(data.response!.logo?.large).toBeTruthy();
    expect(data.response!.logo?.medium).toBeTruthy();
    expect(data.response!.logo?.small).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - Logo can be created with crop parameters (x, y, width, height)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Crop Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { data, status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: {
        tmpFile: uploadResult.data.response.data as string,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeTruthy();
  });

  test("POST /files/rooms/:id/logo - Non-existent room returns 404", async ({
    apiSdk,
  }) => {
    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    const { status } = await apiSdk.forRole("owner").rooms.createRoomLogo({
      id: 999999999,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });
    expect(status).toBe(404);
  });

  test("POST /files/rooms/:id/logo - Invalid tmpFile returns error", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Invalid TmpFile Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: "/non/existent/path/fake.png" },
    });

    expect(status).not.toBe(200);
  });
});

test.describe("DELETE /files/rooms/:id/logo - Delete room logo", () => {
  test("DELETE /files/rooms/:id/logo - Owner deletes existing room logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Delete Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data, status } = await ownerApi.rooms.deleteRoomLogo({
      id: roomId,
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.id).toBe(roomId);
    expect(data.response!.logo?.original).toBeFalsy();
  });

  test("DELETE /files/rooms/:id/logo - Response has correct structure after deletion", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Delete Structure Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    const { data } = await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    expect(data.statusCode).toBe(200);
    expect(data.response!.title).toBeDefined();
    expect(data.response!.logo).toBeDefined();
  });

  test("DELETE /files/rooms/:id/logo - Deleting logo when room has no logo is accepted", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo No Logo Delete Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.deleteRoomLogo({
      id: roomId,
    });

    expect(status).toBe(200);
  });

  test.fail(
    "BUG XXXXX: DELETE /files/rooms/:id/logo - Non-existent room returns 500 instead of 404",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .rooms.deleteRoomLogo({ id: 999999999 });
      expect(status).toBe(404);
    },
  );

  test("DELETE /files/rooms/:id/logo - getRoomInfo after deletion shows empty logo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Logo Del Verify Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uploadResult = await apiSdk.uploadRoomLogo(
      "owner",
      createTestImageBuffer(),
    );
    await ownerApi.rooms.createRoomLogo({
      id: roomId,
      logoRequest: { tmpFile: uploadResult.data.response.data as string },
    });

    await ownerApi.rooms.deleteRoomLogo({ id: roomId });

    const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });

    expect(status).toBe(200);
    expect(data.response!.logo?.original).toBeFalsy();
  });
});
