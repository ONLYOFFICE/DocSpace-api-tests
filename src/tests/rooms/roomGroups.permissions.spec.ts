import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("API room groups permissions", () => {
  test.describe("POST /files/group - access control", () => {
    test("DocSpaceAdmin can create a room group", async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await adminApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Admin Group",
          icon: "star",
          rooms: [roomId],
        },
      });

      expect(status).toBe(200);
    });

    test("RoomAdmin cannot create a room group", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "RoomAdmin Group",
          icon: "star",
          rooms: [roomId],
        },
      });

      expect(status).toBe(403);
    });

    test("User cannot create a room group", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "User Group",
          icon: "star",
          rooms: [roomId],
        },
      });

      expect(status).toBe(403);
    });

    test("Guest cannot create a room group", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Guest Group",
          icon: "star",
          rooms: [roomId],
        },
      });

      expect(status).toBe(403);
    });
  });

  test.describe("GET /files/group/{id} - access control", () => {
    test("DocSpaceAdmin can get room group info", async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await adminApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group to Get",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { status } = await adminApi.groups.getRoomGroupInfo({
        id: groupId,
      });

      expect(status).toBe(200);
    });

    test("RoomAdmin gets 404 for another user's room group", async ({
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

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.groups.getRoomGroupInfo({
        id: groupId,
      });

      expect(status).toBe(404);
    });

    test("User gets 404 for another user's room group", async ({ apiSdk }) => {
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

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.groups.getRoomGroupInfo({
        id: groupId,
      });

      expect(status).toBe(404);
    });

    test("Guest gets 404 for another user's room group", async ({ apiSdk }) => {
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

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.groups.getRoomGroupInfo({
        id: groupId,
      });

      expect(status).toBe(404);
    });
  });

  test.describe("PUT /files/group/{id} - access control", () => {
    test("DocSpaceAdmin can update a room group", async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await adminApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group to Update",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { status } = await adminApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: { groupName: "Updated by Admin" },
      });

      expect(status).toBe(200);
    });

    test("RoomAdmin gets 404 updating another user's room group", async ({
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
          name: "Group to Update",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: { groupName: "Hacked" },
      });

      expect(status).toBe(404);
    });

    test("User gets 404 updating another user's room group", async ({
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
          name: "Group to Update",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: { groupName: "Hacked" },
      });

      expect(status).toBe(404);
    });

    test("Guest gets 404 updating another user's room group", async ({
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
          name: "Group to Update",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: { groupName: "Hacked" },
      });

      expect(status).toBe(404);
    });
  });

  test.describe("POST /files/group/{id}/icon - access control", () => {
    test("DocSpaceAdmin can change room group icon", async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await adminApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group for Icon",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { status } = await adminApi.groups.changeRoomGroupIcon({
        id: groupId,
        iconRequest: { icon: "heart" },
      });

      expect(status).toBe(200);
    });

    test.fail(
      "BUG: POST /files/group/:id/icon - RoomAdmin gets 500 changing icon on another user's group",
      async ({ apiSdk }) => {
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

        const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "RoomAdmin",
        );

        const { status } = await roomAdminApi.groups.changeRoomGroupIcon({
          id: groupId,
          iconRequest: { icon: "heart" },
        });

        expect(status).toBe(404);
      },
    );

    test.fail(
      "BUG: POST /files/group/:id/icon - User gets 500 changing icon on another user's group",
      async ({ apiSdk }) => {
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

        const { api: userApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "User",
        );

        const { status } = await userApi.groups.changeRoomGroupIcon({
          id: groupId,
          iconRequest: { icon: "heart" },
        });

        expect(status).toBe(404);
      },
    );

    test.fail(
      "BUG: POST /files/group/:id/icon - Guest gets 500 changing icon on another user's group",
      async ({ apiSdk }) => {
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

        const { api: guestApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          "Guest",
        );

        const { status } = await guestApi.groups.changeRoomGroupIcon({
          id: groupId,
          iconRequest: { icon: "heart" },
        });

        expect(status).toBe(404);
      },
    );
  });

  test.describe("GET /files/group - access control", () => {
    test("DocSpaceAdmin can get list of room groups", async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { status } = await adminApi.groups.getRoomGroups({ id: 0 });

      expect(status).toBe(200);
    });

    test("RoomAdmin can get list of room groups", async ({ apiSdk }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.groups.getRoomGroups({ id: 0 });

      expect(status).toBe(200);
    });

    test("User can get list of room groups", async ({ apiSdk }) => {
      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.groups.getRoomGroups({ id: 0 });

      expect(status).toBe(200);
    });

    test("Guest can get list of room groups", async ({ apiSdk }) => {
      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.groups.getRoomGroups({ id: 0 });

      expect(status).toBe(200);
    });
  });

  test.describe("DELETE /files/group/{id} - access control", () => {
    test("DocSpaceAdmin can delete a room group", async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: roomData } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await adminApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group to Delete",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { status } = await adminApi.groups.deleteRoomGroup({
        id: groupId,
      });

      expect(status).toBe(200);

      const { status: getStatus } = await adminApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(getStatus).toBe(404);
    });

    test("RoomAdmin DELETE on another user's group returns 200 but does not delete", async ({
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

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.groups.deleteRoomGroup({
        id: groupId,
      });
      expect(status).toBe(200);

      const { status: getStatus } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(getStatus).toBe(200);
    });

    test("User DELETE on another user's group returns 200 but does not delete", async ({
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

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.groups.deleteRoomGroup({
        id: groupId,
      });
      expect(status).toBe(200);

      const { status: getStatus } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(getStatus).toBe(200);
    });

    test("Guest DELETE on another user's group returns 200 but does not delete", async ({
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

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.groups.deleteRoomGroup({
        id: groupId,
      });
      expect(status).toBe(200);

      const { status: getStatus } = await ownerApi.groups.getRoomGroupInfo({
        id: groupId,
      });
      expect(getStatus).toBe(200);
    });
  });

  test.describe("Anonymous access control", () => {
    test("Anonymous cannot create a room group", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const anonApi = apiSdk.forAnonymous();

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await anonApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Anon Group",
          icon: "star",
          rooms: [roomId],
        },
      });

      expect(status).toBe(401);
    });

    test("Anonymous cannot get room group info", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const anonApi = apiSdk.forAnonymous();

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

      const { status } = await anonApi.groups.getRoomGroupInfo({
        id: groupId,
      });

      expect(status).toBe(401);
    });

    test("Anonymous cannot update a room group", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const anonApi = apiSdk.forAnonymous();

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Room for Group",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: created } = await ownerApi.groups.addRoomGroup({
        roomGroupRequestDto: {
          name: "Group to Update",
          icon: "star",
          rooms: [roomId],
        },
      });
      const groupId = created.response!.id!;

      const { status } = await anonApi.groups.updateRoomGroup({
        id: groupId,
        updateRoomGroupRequest: { groupName: "Hacked" },
      });

      expect(status).toBe(401);
    });

    test("Anonymous cannot change room group icon", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const anonApi = apiSdk.forAnonymous();

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

      const { status } = await anonApi.groups.changeRoomGroupIcon({
        id: groupId,
        iconRequest: { icon: "heart" },
      });

      expect(status).toBe(401);
    });

    test("Anonymous cannot get list of room groups", async ({ apiSdk }) => {
      const anonApi = apiSdk.forAnonymous();

      const { status } = await anonApi.groups.getRoomGroups({ id: 0 });

      expect(status).toBe(401);
    });

    test("Anonymous cannot delete a room group", async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const anonApi = apiSdk.forAnonymous();

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

      const { status } = await anonApi.groups.deleteRoomGroup({
        id: groupId,
      });

      expect(status).toBe(401);
    });
  });
});
