import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import config from "@/config";

const QUOTA_MINIMAL_BYTES = 104857600; // 100 MB
const DEFAULT_QUOTA_ROOM_BYTES = 524288000; // 500 MB

async function enableRoomQuota(apiSdk: any) {
  await apiSdk.forRole("owner").settingsQuota.saveRoomQuotaSettings({
    quotaSettingsRequestsDto: {
      enableQuota: true,
      defaultQuota: DEFAULT_QUOTA_ROOM_BYTES,
    },
  });
}

test.describe("PUT /api/2.0/files/rooms/roomquota - Change room quota", () => {
  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota for a room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });

  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota for multiple rooms", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: room1Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Room 1",
        roomType: RoomType.CustomRoom,
      },
    });
    const room1Id = room1Data.response!.id!;

    const { data: room2Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Room 2",
        roomType: RoomType.CustomRoom,
      },
    });
    const room2Id = room2Data.response!.id!;

    const { data, status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [room1Id, room2Id] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
    expect((data.response as any)[1].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[1].isCustomQuota).toBe(true);
  });

  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota with empty roomIds", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const { data, status } = await apiSdk
      .forRole("owner")
      .roomQuota.updateRoomsQuota({
        updateRoomsQuotaRequestDtoInteger: {
          roomIds: [] as any,
          quota: QUOTA_MINIMAL_BYTES,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect((data.response as any[]).length).toBe(0);
  });

  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota = 0 sets unlimited quota for a room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Zero Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: 0,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(0);
  });

  // BUG 82293: PUT /api/2.0/files/rooms/roomquota - Returns 200 instead of 403 when room quota feature is disabled
  test.fail(
    "BUG 82293: PUT /api/2.0/files/rooms/roomquota - Owner cannot set quota when room quota feature is disabled",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();

      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Quota Room Feature Disabled",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.roomQuota.updateRoomsQuota({
        updateRoomsQuotaRequestDtoInteger: {
          roomIds: [roomId] as any,
          quota: QUOTA_MINIMAL_BYTES,
        },
      });

      expect(status).toBe(403);
    },
  );

  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota for an archived room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Archived Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota for a PublicRoom", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Public Room",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });

  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota for a FillingFormsRoom", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota FillingForms Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });

  test("PUT /api/2.0/files/rooms/roomquota - Owner sets quota for a VirtualDataRoom", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota VirtualData Room",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });

  test("PUT /api/2.0/files/rooms/roomquota - Quota is not applied for a Third-Party room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: tpData } =
      await ownerApi.thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Autotest Quota TP",
          providerKey: "Nextcloud",
        },
      });
    const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
      id: tpData.response!.id!,
      createThirdPartyRoom: {
        title: "Autotest TP Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);

    const { data: roomInfo } = await ownerApi.rooms.getRoomInfo({
      id: roomId as any,
    });
    expect((roomInfo.response as any).quotaLimit).toBe(0);
  });
});

test.describe("PUT /api/2.0/files/rooms/resetquota - Reset room quota", () => {
  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota for a room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(DEFAULT_QUOTA_ROOM_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota for multiple rooms", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: room1Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Room 1",
        roomType: RoomType.CustomRoom,
      },
    });
    const room1Id = room1Data.response!.id!;

    const { data: room2Data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Room 2",
        roomType: RoomType.CustomRoom,
      },
    });
    const room2Id = room2Data.response!.id!;

    await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [room1Id, room2Id] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [room1Id, room2Id] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(DEFAULT_QUOTA_ROOM_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(false);
    expect((data.response as any)[1].quotaLimit).toBe(DEFAULT_QUOTA_ROOM_BYTES);
    expect((data.response as any)[1].isCustomQuota).toBe(false);
  });

  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota for a room without custom quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "No Custom Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota with empty roomIds", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const { data, status } = await apiSdk
      .forRole("owner")
      .roomQuota.resetRoomQuota({
        updateRoomsRoomIdsRequestDtoInteger: {
          roomIds: [] as any,
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect((data.response as any[]).length).toBe(0);
  });

  // BUG 82293: PUT /api/2.0/files/rooms/resetquota - Returns 200 instead of 403 when room quota feature is disabled
  test.fail(
    "BUG 82293: PUT /api/2.0/files/rooms/resetquota - Owner cannot reset quota when room quota feature is disabled",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();

      const ownerApi = apiSdk.forRole("owner");
      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Reset Quota Room Feature Disabled",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { status } = await ownerApi.roomQuota.resetRoomQuota({
        updateRoomsRoomIdsRequestDtoInteger: {
          roomIds: [roomId] as any,
        },
      });

      expect(status).toBe(403);
    },
  );

  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota for an archived room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Archived Reset Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota for a PublicRoom", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Public Room",
        roomType: RoomType.PublicRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(DEFAULT_QUOTA_ROOM_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota for a FillingFormsRoom", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota FillingForms Room",
        roomType: RoomType.FillingFormsRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(DEFAULT_QUOTA_ROOM_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test("PUT /api/2.0/files/rooms/resetquota - Owner resets quota for a VirtualDataRoom", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota VirtualData Room",
        roomType: RoomType.VirtualDataRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(DEFAULT_QUOTA_ROOM_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test("PUT /api/2.0/files/rooms/resetquota - Quota is not applied for a Third-Party room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: tpData } =
      await ownerApi.thirdPartyIntegration.saveThirdParty({
        thirdPartyRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Autotest Reset Quota TP",
          providerKey: "Nextcloud",
        },
      });
    const { data: roomData } = await ownerApi.rooms.createRoomThirdParty({
      id: tpData.response!.id!,
      createThirdPartyRoom: {
        title: "Autotest TP Reset Quota Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(200);

    const { data: roomInfo } = await ownerApi.rooms.getRoomInfo({
      id: roomId as any,
    });
    expect((roomInfo.response as any).quotaLimit).toBe(0);
  });
});
