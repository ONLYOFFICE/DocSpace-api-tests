import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { notificationTypes } from "@/src/helpers/notification-types";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/settings/notification - Owner sets notification settings", () => {
  for (const type of notificationTypes) {
    test(`POST /api/2.0/settings/notification - Owner sets notification type ${type}`, async ({
      apiSdk,
    }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .notifications.setNotificationSettings({
          notificationSettingsRequestsDto: { type, isEnabled: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("POST /api/2.0/settings/notification - DocSpaceAdmin sets notification settings", () => {
  for (const type of notificationTypes) {
    test(`POST /api/2.0/settings/notification - DocSpaceAdmin sets notification type ${type}`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .notifications.setNotificationSettings({
          notificationSettingsRequestsDto: { type, isEnabled: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("POST /api/2.0/settings/notification - RoomAdmin sets notification settings", () => {
  for (const type of notificationTypes) {
    test(`POST /api/2.0/settings/notification - RoomAdmin sets notification type ${type}`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .notifications.setNotificationSettings({
          notificationSettingsRequestsDto: { type, isEnabled: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("POST /api/2.0/settings/notification - User sets notification settings", () => {
  for (const type of notificationTypes) {
    test(`POST /api/2.0/settings/notification - User sets notification type ${type}`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");

      const { data, status } = await apiSdk
        .forRole("user")
        .notifications.setNotificationSettings({
          notificationSettingsRequestsDto: { type, isEnabled: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("POST /api/2.0/settings/notification - Guest sets notification settings", () => {
  for (const type of notificationTypes) {
    test(`POST /api/2.0/settings/notification - Guest sets notification type ${type}`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { data, status } = await apiSdk
        .forRole("guest")
        .notifications.setNotificationSettings({
          notificationSettingsRequestsDto: { type, isEnabled: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("POST /api/2.0/settings/notification/rooms - Owner mutes room notifications", () => {
  test("POST /api/2.0/settings/notification/rooms - Owner mutes notifications for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.notifications.setRoomsNotificationStatus({
        roomsNotificationsSettingsRequestDto: {
          roomsId: roomId as unknown as any,
          mute: true,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("POST /api/2.0/settings/notification/rooms - DocSpaceAdmin mutes room notifications", () => {
  test("POST /api/2.0/settings/notification/rooms - DocSpaceAdmin mutes notifications for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } =
      await adminApi.notifications.setRoomsNotificationStatus({
        roomsNotificationsSettingsRequestDto: {
          roomsId: roomId as unknown as any,
          mute: true,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("POST /api/2.0/settings/notification/rooms - RoomAdmin mutes room notifications", () => {
  test("POST /api/2.0/settings/notification/rooms - RoomAdmin mutes notifications for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } =
      await roomAdminApi.notifications.setRoomsNotificationStatus({
        roomsNotificationsSettingsRequestDto: {
          roomsId: roomId as unknown as any,
          mute: true,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("POST /api/2.0/settings/notification/rooms - User mutes room notifications", () => {
  test("POST /api/2.0/settings/notification/rooms - User mutes notifications for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } =
      await userApi.notifications.setRoomsNotificationStatus({
        roomsNotificationsSettingsRequestDto: {
          roomsId: roomId as unknown as any,
          mute: true,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("POST /api/2.0/settings/notification/rooms - Guest mutes room notifications", () => {
  test("POST /api/2.0/settings/notification/rooms - Guest mutes notifications for a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const memberId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await guestApi.notifications.setRoomsNotificationStatus({
        roomsNotificationsSettingsRequestDto: {
          roomsId: roomId as unknown as any,
          mute: true,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("GET /api/2.0/settings/notification/rooms - Owner gets rooms notification settings", () => {
  test("GET /api/2.0/settings/notification/rooms - Owner gets rooms with muted notifications", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.notifications.setRoomsNotificationStatus({
      roomsNotificationsSettingsRequestDto: {
        roomsId: roomId as unknown as any,
        mute: true,
      },
    });

    const { data, status } =
      await ownerApi.notifications.getRoomsNotificationSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("GET /api/2.0/settings/notification/rooms - DocSpaceAdmin gets rooms notification settings", () => {
  test("GET /api/2.0/settings/notification/rooms - DocSpaceAdmin gets rooms with muted notifications", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    await adminApi.notifications.setRoomsNotificationStatus({
      roomsNotificationsSettingsRequestDto: {
        roomsId: roomId as unknown as any,
        mute: true,
      },
    });

    const { data, status } =
      await adminApi.notifications.getRoomsNotificationSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("GET /api/2.0/settings/notification/rooms - RoomAdmin gets rooms notification settings", () => {
  test("GET /api/2.0/settings/notification/rooms - RoomAdmin gets rooms with muted notifications", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    await roomAdminApi.notifications.setRoomsNotificationStatus({
      roomsNotificationsSettingsRequestDto: {
        roomsId: roomId as unknown as any,
        mute: true,
      },
    });

    const { data, status } =
      await roomAdminApi.notifications.getRoomsNotificationSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("GET /api/2.0/settings/notification/rooms - User gets rooms notification settings", () => {
  test("GET /api/2.0/settings/notification/rooms - User gets rooms with muted notifications", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Editing }],
        notify: false,
      },
    });

    await userApi.notifications.setRoomsNotificationStatus({
      roomsNotificationsSettingsRequestDto: {
        roomsId: roomId as unknown as any,
        mute: true,
      },
    });

    const { data, status } =
      await userApi.notifications.getRoomsNotificationSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("GET /api/2.0/settings/notification/rooms - Guest gets rooms notification settings", () => {
  test("GET /api/2.0/settings/notification/rooms - Guest gets rooms with muted notifications", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const memberId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    await guestApi.notifications.setRoomsNotificationStatus({
      roomsNotificationsSettingsRequestDto: {
        roomsId: roomId as unknown as any,
        mute: true,
      },
    });

    const { data, status } =
      await guestApi.notifications.getRoomsNotificationSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).disabledRooms)).toBe(true);
    expect((data.response as any).disabledRooms).toContain(String(roomId));
  });
});

test.describe("GET /api/2.0/settings/notification/{type} - Owner gets notification settings by type", () => {
  for (const type of notificationTypes) {
    test(`GET /api/2.0/settings/notification/{type} - Owner gets notification settings type ${type}`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.notifications.setNotificationSettings({
        notificationSettingsRequestsDto: { type, isEnabled: true },
      });

      const { data, status } =
        await ownerApi.notifications.getNotificationSettings({ type });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("GET /api/2.0/settings/notification/{type} - DocSpaceAdmin gets notification settings by type", () => {
  for (const type of notificationTypes) {
    test(`GET /api/2.0/settings/notification/{type} - DocSpaceAdmin gets notification settings type ${type}`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

      const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");

      await docSpaceAdminApi.notifications.setNotificationSettings({
        notificationSettingsRequestsDto: { type, isEnabled: true },
      });

      const { data, status } =
        await docSpaceAdminApi.notifications.getNotificationSettings({ type });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("GET /api/2.0/settings/notification/{type} - RoomAdmin gets notification settings by type", () => {
  for (const type of notificationTypes) {
    test(`GET /api/2.0/settings/notification/{type} - RoomAdmin gets notification settings type ${type}`, async ({
      apiSdk,
    }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      await roomAdminApi.notifications.setNotificationSettings({
        notificationSettingsRequestsDto: { type, isEnabled: true },
      });

      const { data, status } =
        await roomAdminApi.notifications.getNotificationSettings({ type });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("GET /api/2.0/settings/notification/{type} - User gets notification settings by type", () => {
  for (const type of notificationTypes) {
    test(`GET /api/2.0/settings/notification/{type} - User gets notification settings type ${type}`, async ({
      apiSdk,
    }) => {
      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      await userApi.notifications.setNotificationSettings({
        notificationSettingsRequestsDto: { type, isEnabled: true },
      });

      const { data, status } =
        await userApi.notifications.getNotificationSettings({ type });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("GET /api/2.0/settings/notification/{type} - Guest gets notification settings by type", () => {
  for (const type of notificationTypes) {
    test(`GET /api/2.0/settings/notification/{type} - Guest gets notification settings type ${type}`, async ({
      apiSdk,
    }) => {
      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      await guestApi.notifications.setNotificationSettings({
        notificationSettingsRequestsDto: { type, isEnabled: true },
      });

      const { data, status } =
        await guestApi.notifications.getNotificationSettings({ type });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response?.type).toBe(type);
      expect(data.response?.isEnabled).toBe(true);
    });
  }
});

test.describe("GET /api/2.0/settings/notification/channels - Owner gets notification channels", () => {
  test("GET /api/2.0/settings/notification/channels - Owner gets notification channels", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .notifications.getNotificationChannels();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).channels)).toBe(true);
    expect((data.response as any).channels.length).toBeGreaterThan(0);
    expect((data.response as any).channels[0].name).toBeDefined();
    expect(typeof (data.response as any).channels[0].isEnabled).toBe("boolean");
  });
});

test.describe("GET /api/2.0/settings/notification/channels - DocSpaceAdmin gets notification channels", () => {
  test("GET /api/2.0/settings/notification/channels - DocSpaceAdmin gets notification channels", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .notifications.getNotificationChannels();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).channels)).toBe(true);
    expect((data.response as any).channels.length).toBeGreaterThan(0);
    expect((data.response as any).channels[0].name).toBeDefined();
    expect(typeof (data.response as any).channels[0].isEnabled).toBe("boolean");
  });
});

test.describe("GET /api/2.0/settings/notification/channels - RoomAdmin gets notification channels", () => {
  test("GET /api/2.0/settings/notification/channels - RoomAdmin gets notification channels", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.notifications.getNotificationChannels();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).channels)).toBe(true);
    expect((data.response as any).channels.length).toBeGreaterThan(0);
    expect((data.response as any).channels[0].name).toBeDefined();
    expect(typeof (data.response as any).channels[0].isEnabled).toBe("boolean");
  });
});

test.describe("GET /api/2.0/settings/notification/channels - User gets notification channels", () => {
  test("GET /api/2.0/settings/notification/channels - User gets notification channels", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.notifications.getNotificationChannels();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).channels)).toBe(true);
    expect((data.response as any).channels.length).toBeGreaterThan(0);
    expect((data.response as any).channels[0].name).toBeDefined();
    expect(typeof (data.response as any).channels[0].isEnabled).toBe("boolean");
  });
});

test.describe("GET /api/2.0/settings/notification/channels - Guest gets notification channels", () => {
  test("GET /api/2.0/settings/notification/channels - Guest gets notification channels", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.notifications.getNotificationChannels();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray((data.response as any).channels)).toBe(true);
    expect((data.response as any).channels.length).toBeGreaterThan(0);
    expect((data.response as any).channels[0].name).toBeDefined();
    expect(typeof (data.response as any).channels[0].isEnabled).toBe("boolean");
  });
});
