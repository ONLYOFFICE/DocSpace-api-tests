import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { BackupStorageType, RoomType } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

test.describe("POST /portal/backup/start - Start backup", () => {
  test("Owner creates backup to Temporary storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("DocSpaceAdmin creates backup to Temporary storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("Owner creates backup to Backup room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Backup Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.Documents,
      storageParams: [{ key: "folderId", value: String(roomId) }],
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("DocSpaceAdmin creates backup to Backup room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: roomData } = await adminApi.rooms.createRoom({
      title: "Autotest Backup Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await adminApi.backup.startBackup({
      storageType: BackupStorageType.Documents,
      storageParams: [{ key: "folderId", value: String(roomId) }],
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("Owner creates backup to Third-party resource", async ({
    // TODO: Add Box and Nextcloud credentials to .env file
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const saveResult =
      await ownerApi.thirdPartyIntegration.saveThirdPartyBackup({
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Nextcloud Backup",
        providerKey: "Nextcloud",
      });
    const folderId = saveResult.data.response!.id!;

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.ThridpartyDocuments,
      storageParams: [{ key: "folderId", value: String(folderId) }],
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("DocSpaceAdmin creates backup to Third-party resource", async ({
    // TODO: Add Box and Nextcloud credentials to .env file
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const saveResult =
      await ownerApi.thirdPartyIntegration.saveThirdPartyBackup({
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Nextcloud Backup",
        providerKey: "Nextcloud",
      });
    const folderId = saveResult.data.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.backup.startBackup({
      storageType: BackupStorageType.ThridpartyDocuments,
      storageParams: [{ key: "folderId", value: String(folderId) }],
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("Owner creates backup to Third-party storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.ThirdPartyConsumer,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("DocSpaceAdmin creates backup to Third-party storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.backup.startBackup({
      storageType: BackupStorageType.ThirdPartyConsumer,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test.skip("Owner creates backup to Custom cloud storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Requires cloud storage credentials (e.g. AWS S3, Azure Blob, GCS) configured in the environment
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      storageType: BackupStorageType.CustomCloud,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test.skip("DocSpaceAdmin creates backup to Custom cloud storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Requires cloud storage credentials (e.g. AWS S3, Azure Blob, GCS) configured in the environment
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.backup.startBackup({
      storageType: BackupStorageType.CustomCloud,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });
});
