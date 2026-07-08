import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

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

test.describe("PUT /api/2.0/files/rooms/roomquota - Change room quota - access control", () => {
  test("PUT /api/2.0/files/rooms/roomquota - Unauthenticated user cannot set room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Room Anon",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/rooms/roomquota - DocSpaceAdmin cannot set room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Room DocSpaceAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("PUT /api/2.0/files/rooms/roomquota - RoomAdmin cannot set room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Room RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("PUT /api/2.0/files/rooms/roomquota - User cannot set room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Quota Room User",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.roomQuota.updateRoomsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [roomId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(data.statusCode).toBe(403);
  });
});

test.describe("PUT /api/2.0/files/rooms/resetquota - Reset room quota - access control", () => {
  test("PUT /api/2.0/files/rooms/resetquota - Unauthenticated user cannot reset room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Room Anon",
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

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/rooms/resetquota - DocSpaceAdmin cannot reset room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Room DocSpaceAdmin",
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

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("PUT /api/2.0/files/rooms/resetquota - RoomAdmin cannot reset room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Room RoomAdmin",
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

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(data.statusCode).toBe(403);
  });

  test("PUT /api/2.0/files/rooms/resetquota - User cannot reset room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await enableRoomQuota(apiSdk);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Reset Quota Room User",
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

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.roomQuota.resetRoomQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [roomId] as any,
      },
    });

    expect(data.statusCode).toBe(403);
  });
});
