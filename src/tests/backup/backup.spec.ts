import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  BackupPeriod,
  BackupProgressEnum,
  BackupStorageType,
  DistributedTaskStatus,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
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
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
  });
});

// Note: 402 is not covered — the SDK incorrectly describes this method as plan-restricted.
test.describe("GET /api/2.0/backup/getbackupschedule - Get backup schedule", () => {
  test("Owner gets backup schedule from Temporary storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST createbackupschedule - create schedule", async () => {
      await ownerApi.backup.createBackupSchedule({
        storageType: BackupStorageType.DataStore,
        backupsStored: 7,
        cronParams: { period: BackupPeriod.EveryWeek, hour: 5, day: 2 },
      });
    });

    await test.step("GET getbackupschedule - verify all schedule fields", async () => {
      const { data, status } = await ownerApi.backup.getBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.storageType).toBe(BackupStorageType.DataStore);
      expect(data.response!.backupsStored).toBe(7);
      expect(data.response!.cronParams.period).toBe(BackupPeriod.EveryWeek);
      expect(data.response!.cronParams.hour).toBe(5);
      expect(data.response!.cronParams.day).toBe(2);
    });
  });

  test("DocSpaceAdmin gets backup schedule from Temporary storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST createbackupschedule - create schedule", async () => {
      await adminApi.backup.createBackupSchedule({
        storageType: BackupStorageType.DataStore,
        backupsStored: 3,
        cronParams: { period: BackupPeriod.EveryMonth, hour: 1, day: 15 },
      });
    });

    await test.step("GET getbackupschedule - verify all schedule fields", async () => {
      const { data, status } = await adminApi.backup.getBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.storageType).toBe(BackupStorageType.DataStore);
      expect(data.response!.backupsStored).toBe(3);
      expect(data.response!.cronParams.period).toBe(BackupPeriod.EveryMonth);
      expect(data.response!.cronParams.hour).toBe(1);
      expect(data.response!.cronParams.day).toBe(15);
    });
  });

  test("Owner gets backup schedule from Backup room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Get Schedule Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    await test.step("POST createbackupschedule - create schedule with room", async () => {
      await ownerApi.backup.createBackupSchedule({
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "folderId", value: String(roomId) }],
        backupsStored: 4,
        cronParams: { period: BackupPeriod.EveryDay, hour: 0 },
      });
    });

    await test.step("GET getbackupschedule - verify storageType and storageParams", async () => {
      const { data, status } = await ownerApi.backup.getBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.storageType).toBe(BackupStorageType.Documents);
      expect(data.response!.backupsStored).toBe(4);
      expect(data.response!.cronParams.period).toBe(BackupPeriod.EveryDay);
      expect(data.response!.cronParams.hour).toBe(0);
      expect(data.response!.storageParams).toBeDefined();
    });
  });
});

test.describe("POST /api/2.0/backup/createbackupschedule - Create backup schedule", () => {
  test("Owner creates backup schedule to Temporary storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST createbackupschedule - create schedule", async () => {
      const { data, status } = await ownerApi.backup.createBackupSchedule({
        storageType: BackupStorageType.DataStore,
        backupsStored: 5,
        cronParams: { period: BackupPeriod.EveryDay, hour: 3 },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackupschedule - verify schedule fields", async () => {
      const { data, status } = await ownerApi.backup.getBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.storageType).toBe(BackupStorageType.DataStore);
      expect(data.response!.backupsStored).toBe(5);
      expect(data.response!.cronParams.period).toBe(BackupPeriod.EveryDay);
      expect(data.response!.cronParams.hour).toBe(3);
    });
  });

  test("Owner creates backup schedule to Backup room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Backup Schedule Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    await test.step("POST createbackupschedule - create schedule", async () => {
      const { data, status } = await ownerApi.backup.createBackupSchedule({
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "folderId", value: String(roomId) }],
        backupsStored: 3,
        cronParams: { period: BackupPeriod.EveryWeek, hour: 2, day: 1 },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackupschedule - verify schedule fields", async () => {
      const { data, status } = await ownerApi.backup.getBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.storageType).toBe(BackupStorageType.Documents);
      expect(data.response!.backupsStored).toBe(3);
      expect(data.response!.cronParams.period).toBe(BackupPeriod.EveryWeek);
      expect(data.response!.cronParams.hour).toBe(2);
      expect(data.response!.cronParams.day).toBe(1);
    });
  });

  test("DocSpaceAdmin creates backup schedule to Temporary storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST createbackupschedule - create schedule", async () => {
      const { data, status } = await adminApi.backup.createBackupSchedule({
        storageType: BackupStorageType.DataStore,
        backupsStored: 10,
        cronParams: { period: BackupPeriod.EveryMonth, hour: 0, day: 1 },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackupschedule - verify schedule fields", async () => {
      const { data, status } = await adminApi.backup.getBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.storageType).toBe(BackupStorageType.DataStore);
      expect(data.response!.backupsStored).toBe(10);
      expect(data.response!.cronParams.period).toBe(BackupPeriod.EveryMonth);
      expect(data.response!.cronParams.hour).toBe(0);
      expect(data.response!.cronParams.day).toBe(1);
    });
  });
});

test.describe("GET /api/2.0/backup/getbackupscount - Get backups count", () => {
  test("Owner gets backups count after starting a backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupscount - verify count is greater than 0", async () => {
      const { data, status } = await ownerApi.backup.getBackupsCount();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeGreaterThan(0);
    });
  });

  test("Owner gets backups count for an empty date range in the past", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.getBackupsCount(
      "2000-01-01",
      "2000-01-31",
    );

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(0);
  });

  test("DocSpaceAdmin gets backups count after starting a backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST startbackup - start backup", async () => {
      await adminApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupscount - verify count is greater than 0", async () => {
      const { data, status } = await adminApi.backup.getBackupsCount();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeGreaterThan(0);
    });
  });
});

// Note: 402 is not covered — the SDK incorrectly describes this method as plan-restricted.
test.describe("GET /api/2.0/backup/getbackupprogress - Get backup progress", () => {
  test("Owner gets backup progress when no backup has been started", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.getBackupProgress();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toBeUndefined();
  });

  test("Owner gets backup progress while backup is in progress", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.backup.startBackup({
      storageType: BackupStorageType.DataStore,
    });

    const { data, status } = await ownerApi.backup.getBackupProgress();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
    expect(data.response!.isCompleted).toBe(false);
    expect(data.response!.progress).toBeGreaterThanOrEqual(0);
    expect(data.response!.progress).toBeLessThanOrEqual(100);
    expect(data.response!.status).toBe(DistributedTaskStatus.Running);
    expect(data.response!.tenantId).toBeGreaterThan(0);
    expect(data.response!.taskId).toBeTruthy();
    expect(data.response!.error).toBeFalsy();
  });

  test("Owner gets backup progress after backup completes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify all progress fields", async () => {
      const { data, status } = await ownerApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.progress).toBe(100);
      expect(data.response!.status).toBe(DistributedTaskStatus.Completed);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });
  });

  test("DocSpaceAdmin gets backup progress after backup completes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST startbackup - start backup", async () => {
      await adminApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify all progress fields", async () => {
      const { data, status } = await adminApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.progress).toBe(100);
      expect(data.response!.status).toBe(DistributedTaskStatus.Completed);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });
  });
});

// Note: 402 is not covered — the SDK incorrectly describes this method as plan-restricted.
test.describe("GET /api/2.0/backup/getbackuphistory - Get backup history", () => {
  test("Owner gets empty backup history on a fresh portal", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.getBackupHistory();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("Owner gets backup history after backup completes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - verify history record fields", async () => {
      const { data, status } = await ownerApi.backup.getBackupHistory();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.length).toBeGreaterThan(0);

      const record = data.response![0];
      expect(record.id).toBeTruthy();
      expect(record.storageType).toBe(BackupStorageType.DataStore);
      expect(record.createdOn).toBeTruthy();
      expect(record.expiresOn).toBeTruthy();
    });
  });

  test("Owner backup history count increases after each backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let countAfterFirst: number;

    await test.step("POST startbackup - start first backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for first backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - get count after first backup", async () => {
      const { data } = await ownerApi.backup.getBackupHistory();
      countAfterFirst = data.count!;
      expect(countAfterFirst).toBeGreaterThan(0);
    });

    await test.step("POST startbackup - start second backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for second backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - verify count increased by 1", async () => {
      const { data, status } = await ownerApi.backup.getBackupHistory();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(countAfterFirst + 1);
    });
  });

  test("DocSpaceAdmin gets backup history after backup completes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST startbackup - start backup", async () => {
      await adminApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - verify history record fields", async () => {
      const { data, status } = await adminApi.backup.getBackupHistory();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.length).toBeGreaterThan(0);

      const record = data.response![0];
      expect(record.id).toBeTruthy();
      expect(record.storageType).toBe(BackupStorageType.DataStore);
      expect(record.createdOn).toBeTruthy();
      expect(record.expiresOn).toBeTruthy();
    });
  });
});

test.describe("DELETE /api/2.0/backup/deletebackupschedule - Delete backup schedule", () => {
  test("Owner deletes backup schedule", async ({ apiSdk, paymentsApi }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST createbackupschedule - create schedule", async () => {
      await ownerApi.backup.createBackupSchedule({
        storageType: BackupStorageType.DataStore,
        backupsStored: 5,
        cronParams: { period: BackupPeriod.EveryDay, hour: 3 },
      });
    });

    await test.step("DELETE deletebackupschedule - delete schedule", async () => {
      const { data, status } = await ownerApi.backup.deleteBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });
  });

  test("DocSpaceAdmin deletes backup schedule", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST createbackupschedule - create schedule", async () => {
      await adminApi.backup.createBackupSchedule({
        storageType: BackupStorageType.DataStore,
        backupsStored: 3,
        cronParams: { period: BackupPeriod.EveryWeek, hour: 1, day: 5 },
      });
    });

    await test.step("DELETE deletebackupschedule - delete schedule", async () => {
      const { data, status } = await adminApi.backup.deleteBackupSchedule();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });
  });
});

test.describe("DELETE /api/2.0/backup/deletebackup - Delete backup", () => {
  test("Owner deletes a backup", async ({ apiSdk, paymentsApi }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let backupId: string;

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - get backup ID", async () => {
      const { data } = await ownerApi.backup.getBackupHistory();
      backupId = data.response![0].id;
    });

    await test.step("DELETE deletebackup - delete backup by ID", async () => {
      const { data, status } = await ownerApi.backup.deleteBackup(backupId);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackuphistory - verify backup is removed", async () => {
      const { data } = await ownerApi.backup.getBackupHistory();
      const ids = data.response!.map((r) => r.id);
      expect(ids).not.toContain(backupId);
    });
  });

  test("DocSpaceAdmin deletes a backup", async ({ apiSdk, paymentsApi }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    let backupId: string;

    await test.step("POST startbackup - start backup", async () => {
      await adminApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - get backup ID", async () => {
      const { data } = await adminApi.backup.getBackupHistory();
      backupId = data.response![0].id;
    });

    await test.step("DELETE deletebackup - delete backup by ID", async () => {
      const { data, status } = await adminApi.backup.deleteBackup(backupId);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackuphistory - verify backup is removed", async () => {
      const { data } = await adminApi.backup.getBackupHistory();
      const ids = data.response!.map((r) => r.id);
      expect(ids).not.toContain(backupId);
    });
  });
});

test.describe("DELETE /api/2.0/backup/deletebackuphistory - Delete backup history", () => {
  test("Owner deletes backup history", async ({ apiSdk, paymentsApi }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - verify history is not empty before delete", async () => {
      const { data } = await ownerApi.backup.getBackupHistory();
      expect(data.response!.length).toBeGreaterThan(0);
    });

    await test.step("DELETE deletebackuphistory - delete all backup history", async () => {
      const { data, status } = await ownerApi.backup.deleteBackupHistory();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackuphistory - verify history is empty after delete", async () => {
      const { data, status } = await ownerApi.backup.getBackupHistory();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toEqual([]);
      expect(data.count).toBe(0);
    });
  });

  test("DocSpaceAdmin deletes backup history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST startbackup - start backup", async () => {
      await adminApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - verify history is not empty before delete", async () => {
      const { data } = await adminApi.backup.getBackupHistory();
      expect(data.response!.length).toBeGreaterThan(0);
    });

    await test.step("DELETE deletebackuphistory - delete all backup history", async () => {
      const { data, status } = await adminApi.backup.deleteBackupHistory();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackuphistory - verify history is empty after delete", async () => {
      const { data, status } = await adminApi.backup.getBackupHistory();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toEqual([]);
      expect(data.count).toBe(0);
    });
  });
});

test.describe("POST /api/2.0/backup/startrestore - Start backup restore", () => {
  test("Owner starts a backup restore", async ({ apiSdk, paymentsApi }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let backupId: string;

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - get backup ID", async () => {
      const { data } = await ownerApi.backup.getBackupHistory();
      backupId = data.response![0].id;
    });

    await test.step("POST startrestore - start restore and verify response", async () => {
      const { data, status } = await ownerApi.backup.startBackupRestore({
        backupId,
        storageType: BackupStorageType.DataStore,
        notify: false,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(
        BackupProgressEnum.Restore,
      );
      expect(data.response!.isCompleted).toBe(false);
      expect(data.response!.progress).toBeGreaterThanOrEqual(0);
      expect(data.response!.progress).toBeLessThanOrEqual(100);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });
  });

  test("DocSpaceAdmin starts a backup restore", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    let backupId: string;

    await test.step("POST startbackup - start backup", async () => {
      await adminApi.backup.startBackup({
        storageType: BackupStorageType.DataStore,
      });
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackuphistory - get backup ID", async () => {
      const { data } = await adminApi.backup.getBackupHistory();
      backupId = data.response![0].id;
    });

    await test.step("POST startrestore - start restore and verify response", async () => {
      const { data, status } = await adminApi.backup.startBackupRestore({
        backupId,
        storageType: BackupStorageType.DataStore,
        notify: false,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(
        BackupProgressEnum.Restore,
      );
      expect(data.response!.isCompleted).toBe(false);
      expect(data.response!.progress).toBeGreaterThanOrEqual(0);
      expect(data.response!.progress).toBeLessThanOrEqual(100);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });
  });
});

test.describe("GET /api/2.0/backup/getbackupsservicestate - Get backup service state", () => {
  test("Owner gets backup service state", async ({ apiSdk, paymentsApi }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.getBackupsServiceState();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response!.enabled).toBe("boolean");
  });

  test("DocSpaceAdmin gets backup service state", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.backup.getBackupsServiceState();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response!.enabled).toBe("boolean");
  });
});
