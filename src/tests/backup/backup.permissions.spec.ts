import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { BackupStorageType, RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /portal/backup/start - access control", () => {
  test("POST /portal/backup/start - Start backup without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(401);
  });

  test("POST /portal/backup/start - Start backup without paid plan", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(402);
    expect(data.statusCode).toBe(402);
  });

  test("POST /portal/backup/start - RoomAdmin starts backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
  });

  test("POST /portal/backup/start - User starts backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
  });

  test("POST /portal/backup/start - Guest starts backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
  });

  test("POST /portal/backup/start - Start backup with non-existent folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.Documents,
      storageParams: [{ key: "folderId", value: "99999999" }],
    });

    expect(status).toBe(404);
    expect(data.statusCode).toBe(404);
  });

  test("POST /portal/backup/start - Start backup with wrong folder type", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.ThridpartyDocuments,
      storageParams: [{ key: "folderId", value: String(roomId) }],
    });

    expect(status).toBe(400);
    expect(data.statusCode).toBe(400);
  });

  test("POST /portal/backup/start - Start backup as dump", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
      dump: true,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
  });
});
