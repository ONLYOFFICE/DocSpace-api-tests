import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /files/rooms/covers - access control", () => {
  test("GET /files/rooms/covers - Owner can get covers list", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rooms.getRoomCovers();
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /files/rooms/covers - DocSpaceAdmin can get covers list", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.getRoomCovers();
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /files/rooms/covers - RoomAdmin can get covers list", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .rooms.getRoomCovers();
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /files/rooms/covers - User can get covers list", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const { data, status } = await apiSdk.forRole("user").rooms.getRoomCovers();
    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test.fail(
    "BUG 81012: GET /files/rooms/covers - Guest cannot get covers list",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");
      const { status } = await apiSdk.forRole("guest").rooms.getRoomCovers();
      expect(status).toBe(403);
    },
  );

  test("GET /files/rooms/covers - Unauthenticated user cannot get covers list", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().rooms.getRoomCovers();
    expect(status).toBe(401);
  });
});

test.describe("PUT /files/rooms/:id/cover - access control", () => {
  test("PUT /files/rooms/:id/cover - Owner can change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Owner Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });
    expect(status).toBe(200);
  });

  test("PUT /files/rooms/:id/cover - DocSpaceAdmin cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Admin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.changeRoomCover({
        id: roomId,
        coverRequestDto: { color: "112233", cover: coverId },
      });
    expect(status).toBe(403);
  });

  test("PUT /files/rooms/:id/cover - RoomAdmin cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover RoomAdmin Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { status } = await apiSdk.forRole("roomAdmin").rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF0000", cover: coverId },
    });
    expect(status).toBe(403);
  });

  test("PUT /files/rooms/:id/cover - User cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover User Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status } = await apiSdk.forRole("user").rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF0000", cover: coverId },
    });
    expect(status).toBe(403);
  });

  test("PUT /files/rooms/:id/cover - Guest cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { status } = await apiSdk.forRole("guest").rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF0000", cover: coverId },
    });
    expect(status).toBe(403);
  });

  test("PUT /files/rooms/:id/cover - Unauthenticated user cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover Anon Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk.forAnonymous().rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF0000" },
    });
    expect(status).toBe(401);
  });

  test("PUT /files/rooms/:id/cover - DocSpaceAdmin with RoomManager access can change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover DocSpaceAdmin RoomManager",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .rooms.changeRoomCover({
        id: roomId,
        coverRequestDto: { color: "FF5733", cover: coverId },
      });
    expect(status).toBe(200);
  });

  test("PUT /files/rooms/:id/cover - RoomAdmin with RoomManager access can change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover RoomAdmin RoomManager",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

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

    const { status } = await apiSdk.forRole("roomAdmin").rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });
    expect(status).toBe(200);
  });

  test("PUT /files/rooms/:id/cover - User with Viewer access cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover User Viewer Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

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

    const { status } = await apiSdk.forRole("user").rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });
    expect(status).toBe(403);
  });

  test("PUT /files/rooms/:id/cover - User with Editor access cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover User Editor Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

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

    const { status } = await apiSdk.forRole("user").rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });
    expect(status).toBe(403);
  });

  test("PUT /files/rooms/:id/cover - User with Content Creator access cannot change room cover", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: coversData } = await ownerApi.rooms.getRoomCovers();
    const coverId = coversData.response![0].id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Cover User Content Creator Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.FillForms }],
        notify: false,
      },
    });

    const { status } = await apiSdk.forRole("user").rooms.changeRoomCover({
      id: roomId,
      coverRequestDto: { color: "FF5733", cover: coverId },
    });
    expect(status).toBe(403);
  });
});
