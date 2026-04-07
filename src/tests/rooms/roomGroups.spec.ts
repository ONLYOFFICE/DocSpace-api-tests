import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { createAllRoomTypes } from "@/src/helpers/rooms";

test.describe("API room groups methods", () => {
  test.describe("POST /files/group", () => {
    test("POST /files/group - Owner creates a room group with all room types", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const rooms = await createAllRoomTypes(apiSdk, "owner");
      const roomIds = rooms.map((r) => r.id);

      const { data, status } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Autotest Group",
          icon: "star",
          rooms: roomIds,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.name).toBe("Autotest Group");
      expect(data.response!.id).toBeDefined();
      expect(data.response!.totalRooms).toBe(rooms.length);

      const { data: verify, status: getStatus } =
        await ownerApi.groups.getRoomGroupInfo({
          id: data.response!.id!,
        });
      expect(getStatus).toBe(200);
      expect(verify.response!.name).toBe("Autotest Group");
      expect(verify.response!.totalRooms).toBe(rooms.length);
    });

    test("POST /files/group - Owner creates a room group without rooms", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Empty Group",
          icon: "star",
          rooms: [],
        },
      });

      expect(status).toBe(403);
    });

    test(
      "BUG 80921: POST /files/group - Owner creates a room group with invalid icon value",
      async ({ apiSdk }) => {
        const ownerApi = apiSdk.forRole("owner");

        const { data: roomData } = await ownerApi.rooms.createRoom({
          createRoomRequestDto: {
            title: "Room for Invalid Icon Group",
            roomType: RoomType.CustomRoom,
          },
        });
        const roomId = roomData.response!.id!;

        const { data, status } = await ownerApi.groups.addRoomGroup({
          roomGroupRequestDto: {
            name: "Invalid Icon Group",
            icon: "none",
            rooms: [roomId],
          },
        });

        expect(status).toBe(400);
        expect((data as any).error.message).toBe(
        "Value does not fall within the expected range. (Parameter 'icon')",
        );
      },
    );
  });

  test.describe("GET /files/group/{id}", () => {
    test("GET /files/group/:id - Owner gets room group info", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group to Get",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { data, status } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(groupId);
      expect(data.response!.name).toBe("Group to Get");
    });
  });

  test.describe("PUT /files/group/{id}", () => {
    test("PUT /files/group/:id - Owner updates room group name", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Original Name",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { data, status } = await ownerApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: {
          groupName: "Updated Name",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.name).toBe("Updated Name");

      const { data: verify } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(verify.response!.name).toBe("Updated Name");
    });

    test("PUT /files/group/:id - Owner adds a room to a group", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData1 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Initial Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId1 = roomData1.response!.id!;

      const { data: roomData2 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room to Add",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId2 = roomData2.response!.id!;

      const { data: created } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group for Adding Rooms",
          icon: "star",
          rooms: [roomId1],
        },
      });
      const groupId = created.response!.id!;

      const { data, status } = await ownerApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: {
          roomsToAdd: [roomId2],
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.totalRooms).toBe(2);

      const { data: verify } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(verify.response!.totalRooms).toBe(2);
    });

    test("PUT /files/group/:id - Owner removes a room from a group", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData1 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room to Keep",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId1 = roomData1.response!.id!;

      const { data: roomData2 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room to Remove",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId2 = roomData2.response!.id!;

      const { data: created } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group for Removing Rooms",
          icon: "star",
          rooms: [roomId1, roomId2],
        },
      });
      const groupId = created.response!.id!;

      const { data, status } = await ownerApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: {
          roomsToRemove: [roomId2],
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.totalRooms).toBe(1);

      const { data: verify } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(verify.response!.totalRooms).toBe(1);
    });
  });

  test.describe("POST /files/group/{id}/icon", () => {
    test("POST /files/group/:id/icon - Owner changes room group icon", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group for Icon",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { data, status } = await ownerApi.groups.changeRoomGroupIcon({
        id: groupId,
        iconRequest: { icon: "heart" },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(groupId);

      const { data: verify } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(verify.response!.icon).toBeDefined();
    });

    test("BUG 80922: POST /files/group/:id/icon - Owner gets 500 changing icon on non-existent group", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.groups.changeRoomGroupIcon({
        id: 999999,
        iconRequest: { icon: "heart" },
      });

      expect(status).toBe(404);
    });
  });

  test.describe("GET /files/group", () => {
    test("GET /files/group - Owner gets list of room groups", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData1 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room A",
          roomType: RoomType.CustomRoom,
        },
      });

      const { data: roomData2 } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room B",
          roomType: RoomType.CustomRoom,
        },
      });

      await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group A",
          icon: "star",
          rooms: [roomData1.response!.id!],
        },
      });

      await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group B",
          icon: "star",
          rooms: [roomData2.response!.id!],
        },
      });

      const { data, status } = await ownerApi.groups.getRoomGroups({
        id: 0,
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.length).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe("DELETE /files/group/{id}", () => {
    test("DELETE /files/group/:id - Owner deletes a room group", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group to Delete",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { status } = await ownerApi.groups.deleteRoomGroup({
        id: groupId,
      });

      expect(status).toBe(200);

      const { status: getStatus } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(getStatus).toBe(404);
    });
  });
});
